import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { assertMutationRequest, createSession, readSession } from "../lib/auth";
import { GET as registryGet } from "../app/api/v1/registry/route";
import { GET as healthGet } from "../app/api/v1/health/route";
import { seedSnapshot } from "../lib/seed";
import { setRegistryBackendForTests, type RegistryBackend, type RegistryState } from "../lib/store";

process.env.SESSION_SECRET = "test-secret-that-is-more-than-thirty-two-characters";
process.env.PUBLISHER_EMAILS = "publisher@stackslabs.com";

test("allowlist grants publisher access and all other Vercel users remain read-only", async () => {
  const allowed = await readSession(await createSession({ sub: "1", email: "Publisher@Stackslabs.com", name: "Publisher" }));
  const denied = await readSession(await createSession({ sub: "2", email: "reader@example.com", name: "Reader" }));
  assert.equal(allowed?.publisher, true);
  assert.equal(denied?.publisher, false);
});

test("mutation guard enforces same origin and CSRF", async () => {
  const session = (await readSession(await createSession({ sub: "1", email: "publisher@stackslabs.com", name: "Publisher" })))!;
  const valid = new NextRequest("https://registry.example/api/admin/draft", { method: "PUT", headers: { origin: "https://registry.example", "x-registry-csrf": session.csrf } });
  assert.doesNotThrow(() => assertMutationRequest(valid, session));
  assert.throws(() => assertMutationRequest(new NextRequest(valid.url, { method: "PUT", headers: { origin: "https://evil.example", "x-registry-csrf": session.csrf } }), session), /Cross-origin/);
  assert.throws(() => assertMutationRequest(new NextRequest(valid.url, { method: "PUT", headers: { origin: "https://registry.example", "x-registry-csrf": "wrong" } }), session), /CSRF/);
});

test("public registry is anonymous, supports ETag 304, and excludes draft state", async () => {
  const state: RegistryState = { publishedSnapshot: seedSnapshot, draft: { content: { ...seedSnapshot.content, facts: [] }, savedAt: "2026-08-07T00:00:00.000Z", savedBy: "publisher@stackslabs.com" }, revisions: [] };
  const backend: RegistryBackend = { readState: async () => state, writeItems: async () => {}, archive: async () => "", readRevision: async () => seedSnapshot };
  setRegistryBackendForTests(backend);
  const first = await registryGet(new NextRequest("https://registry.example/api/v1/registry"));
  assert.equal(first.status, 200); assert.match(first.headers.get("cache-control") ?? "", /s-maxage=60/);
  const body = await first.json(); assert.equal("draft" in body, false); assert.equal("publisherEmails" in body, false);
  const second = await registryGet(new NextRequest("https://registry.example/api/v1/registry", { headers: { "if-none-match": first.headers.get("etag")! } }));
  assert.equal(second.status, 304);
  const health = await healthGet();
  assert.ok(health.status === 200 || health.status === 503);
  const healthBody = await health.json();
  assert.equal(healthBody.revision, seedSnapshot.revision);
  assert.equal(healthBody.reviewDueAt, seedSnapshot.reviewDueAt);
  assert.equal("draft" in healthBody, false);
  assert.equal("publisherEmails" in healthBody, false);
  setRegistryBackendForTests(undefined);
});
