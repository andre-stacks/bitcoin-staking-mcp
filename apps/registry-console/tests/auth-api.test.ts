import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { assertMutationRequest, authConfig, createSession, readSession, requirePublisher } from "../lib/auth";
import { GET as registryGet } from "../app/api/v1/registry/route";
import { GET as healthGet } from "../app/api/v1/health/route";
import { seedSnapshot } from "../lib/seed";
import { setRegistryBackendForTests, type RegistryBackend, type RegistryState } from "../lib/store";

process.env.SESSION_SECRET = "test-secret-that-is-more-than-thirty-two-characters";
process.env.PUBLISHER_EMAILS = "publisher@stackslabs.com";

test("allowlist grants publisher access and all other Vercel users remain read-only", async () => {
  const allowedToken = await createSession({ sub: "1", email: "Publisher@Stackslabs.com", name: "Publisher" });
  const allowed = await readSession(allowedToken);
  const denied = await readSession(await createSession({ sub: "2", email: "reader@example.com", name: "Reader" }));
  assert.equal(allowed?.publisher, true);
  assert.equal(denied?.publisher, false);
  process.env.PUBLISHER_EMAILS = "";
  await assert.rejects(requirePublisher(new NextRequest("https://registry.example/api/admin/state", { headers: { cookie: `${authConfig.sessionCookie}=${allowedToken}` } })), /read-only access/);
  process.env.PUBLISHER_EMAILS = "publisher@stackslabs.com";
});

test("mutation guard enforces same origin and CSRF", async () => {
  const session = (await readSession(await createSession({ sub: "1", email: "publisher@stackslabs.com", name: "Publisher" })))!;
  const valid = new NextRequest("https://registry.example/api/admin/draft", { method: "PUT", headers: { origin: "https://registry.example", "x-registry-csrf": session.csrf } });
  assert.doesNotThrow(() => assertMutationRequest(valid, session));
  assert.throws(() => assertMutationRequest(new NextRequest(valid.url, { method: "PUT", headers: { origin: "https://evil.example", "x-registry-csrf": session.csrf } }), session), /Cross-origin/);
  assert.throws(() => assertMutationRequest(new NextRequest(valid.url, { method: "PUT", headers: { origin: "https://registry.example", "x-registry-csrf": "wrong" } }), session), /CSRF/);
});

test("public registry is anonymous, supports ETag 304, and excludes draft state", async () => {
  const legacySnapshot = structuredClone(seedSnapshot);
  legacySnapshot.publishedBy = "personal.publisher@stackslabs.com";
  const state: RegistryState = { publishedSnapshot: legacySnapshot, draft: { content: { ...seedSnapshot.content, facts: [] }, savedAt: "2026-08-07T00:00:00.000Z", savedBy: "publisher@stackslabs.com" }, revisions: [] };
  const backend: RegistryBackend = { readState: async () => state, writeItems: async () => {}, archive: async () => "", readRevision: async () => seedSnapshot };
  setRegistryBackendForTests(backend);
  const first = await registryGet(new NextRequest("https://registry.example/api/v1/registry"));
  assert.equal(first.status, 200); assert.match(first.headers.get("cache-control") ?? "", /s-maxage=60/);
  const body = await first.json(); assert.equal("draft" in body, false); assert.equal("publisherEmails" in body, false); assert.equal(body.publishedBy, "Stacks Labs registry team"); assert.doesNotMatch(body.publishedBy, /@/);
  const second = await registryGet(new NextRequest("https://registry.example/api/v1/registry", { headers: { "if-none-match": first.headers.get("etag")! } }));
  assert.equal(second.status, 304);
  const weak = await registryGet(new NextRequest("https://registry.example/api/v1/registry", { headers: { "if-none-match": `"other", W/${first.headers.get("etag")!}` } }));
  assert.equal(weak.status, 304);
  const wildcard = await registryGet(new NextRequest("https://registry.example/api/v1/registry", { headers: { "if-none-match": "*" } }));
  assert.equal(wildcard.status, 304);
  const health = await healthGet();
  assert.ok(health.status === 200 || health.status === 503);
  const healthBody = await health.json();
  assert.equal(healthBody.revision, seedSnapshot.revision);
  assert.equal(healthBody.reviewDueAt, seedSnapshot.reviewDueAt);
  assert.equal("draft" in healthBody, false);
  assert.equal("publisherEmails" in healthBody, false);
  setRegistryBackendForTests(undefined);
});

test("health rejects a future-dated stored review even though the public payload remains schema-valid", async () => {
  const future = structuredClone(seedSnapshot);
  future.reviewedAt = "2099-01-01T00:00:00.000Z";
  future.reviewDueAt = "2099-01-08T00:00:00.000Z";
  future.content.reviewedAt = future.reviewedAt;
  const { registryContentHash } = await import("bitcoin-staking-mcp");
  future.contentHash = registryContentHash(future.content);
  const backend: RegistryBackend = { readState: async () => ({ publishedSnapshot: future, draft: null, revisions: [] }), writeItems: async () => {}, archive: async () => "", readRevision: async () => future };
  setRegistryBackendForTests(backend);
  const health = await healthGet();
  assert.equal(health.status, 503);
  assert.equal((await health.json()).status, "needs_review");
  setRegistryBackendForTests(undefined);
});

test("public registry and health fail closed on a stored content-hash mismatch", async () => {
  const tampered = structuredClone(seedSnapshot);
  tampered.content.facts[0]!.summary = "Tampered after hashing.";
  const state: RegistryState = { publishedSnapshot: tampered, draft: null, revisions: [] };
  const backend: RegistryBackend = { readState: async () => state, writeItems: async () => {}, archive: async () => "", readRevision: async () => tampered };
  setRegistryBackendForTests(backend);
  const registry = await registryGet(new NextRequest("https://registry.example/api/v1/registry"));
  assert.equal(registry.status, 503);
  assert.equal(registry.headers.get("cache-control"), "no-store");
  assert.deepEqual(await registry.json(), { error: "Published registry is unavailable or invalid." });
  const health = await healthGet();
  assert.equal(health.status, 503);
  assert.deepEqual(await health.json(), { status: "unavailable", reason: "Published registry is invalid." });
  setRegistryBackendForTests(undefined);
});
