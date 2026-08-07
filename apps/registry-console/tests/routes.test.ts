import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { RegistryStore } from "bitcoin-staking-mcp";
import { GET as authorize } from "../app/api/auth/authorize/route";
import { GET as callback } from "../app/api/auth/callback/route";
import { GET as adminState } from "../app/api/admin/state/route";
import { GET as adminDiff } from "../app/api/admin/diff/route";
import { PUT as saveDraftRoute, DELETE as discardDraftRoute } from "../app/api/admin/draft/route";
import { POST as validateRoute } from "../app/api/admin/validate/route";
import { POST as publishRoute } from "../app/api/admin/publish/route";
import { POST as rollbackRoute } from "../app/api/admin/rollback/route";
import { GET as registryRoute } from "../app/api/v1/registry/route";
import { authConfig, createSession, readSession } from "../lib/auth";
import { seedSnapshot } from "../lib/seed";
import { setRegistryBackendForTests, type RegistryBackend, type RegistryState } from "../lib/store";

process.env.SESSION_SECRET = "test-secret-that-is-more-than-thirty-two-characters";
process.env.PUBLISHER_EMAILS = "publisher@stackslabs.com";
process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID = "cl_test";

class MemoryBackend implements RegistryBackend {
  state: RegistryState = { publishedSnapshot: structuredClone(seedSnapshot), draft: null, revisions: [] };
  blobs = new Map<string, typeof seedSnapshot>();
  async readState() { return structuredClone(this.state); }
  async writeItems(items: Record<string, unknown>) {
    this.state = {
      ...this.state,
      ...(items.publishedSnapshot === undefined ? {} : { publishedSnapshot: structuredClone(items.publishedSnapshot) }),
      ...(items.draft === undefined ? {} : { draft: structuredClone(items.draft) }),
      ...(items.revisionIndex === undefined ? {} : { revisions: structuredClone(items.revisionIndex) }),
    } as RegistryState;
  }
  async archive(snapshot: typeof seedSnapshot) {
    const pathname = `revisions/${snapshot.revision}.json`;
    if (this.blobs.has(pathname)) throw new Error(`immutable collision: ${pathname}`);
    this.blobs.set(pathname, structuredClone(snapshot));
    return pathname;
  }
  async readRevision(pathname: string) {
    const snapshot = this.blobs.get(pathname);
    if (!snapshot) throw new Error(`missing revision: ${pathname}`);
    return structuredClone(snapshot);
  }
}

function request(path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(`https://registry.example${path}`, init);
}

async function publisherHeaders() {
  const token = await createSession({ sub: "publisher-1", email: "publisher@stackslabs.com", name: "Publisher" });
  const session = (await readSession(token))!;
  return {
    session,
    headers: { origin: "https://registry.example", cookie: `${authConfig.sessionCookie}=${token}`, "content-type": "application/json", "x-registry-csrf": session.csrf },
  };
}

test("OAuth authorization uses PKCE and invalid callbacks fail closed", async () => {
  const response = await authorize(request("/api/auth/authorize"));
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.origin, "https://vercel.com");
  assert.equal(location.pathname, "/oauth/authorize");
  assert.equal(location.searchParams.get("scope"), "openid email profile");
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  assert.ok(location.searchParams.get("state"));
  assert.match(response.headers.get("set-cookie") ?? "", /oauth_state=.*HttpOnly/i);
  const denied = await callback(request("/api/auth/callback?state=wrong"));
  assert.equal(denied.status, 400);
  assert.deepEqual(await denied.json(), { error: "Invalid OAuth callback." });
});

test("admin routes deny anonymous and non-allowlisted sessions without exposing private state", async () => {
  const backend = new MemoryBackend();
  backend.state.draft = { content: structuredClone(seedSnapshot.content), savedAt: "2026-08-07T00:00:00.000Z", savedBy: "publisher@stackslabs.com" };
  setRegistryBackendForTests(backend);
  const anonymous = await adminState(request("/api/admin/state"));
  assert.equal(anonymous.status, 401);
  const readerToken = await createSession({ sub: "reader-1", email: "reader@example.com", name: "Reader" });
  const denied = await adminState(request("/api/admin/state", { headers: { cookie: `${authConfig.sessionCookie}=${readerToken}` } }));
  assert.equal(denied.status, 403);
  for (const response of [anonymous, denied]) {
    const body = JSON.stringify(await response.json());
    assert.doesNotMatch(body, /draft|savedBy|PUBLISHER_EMAILS|SESSION_SECRET|VERCEL_API_TOKEN/);
  }
  setRegistryBackendForTests(undefined);
});

test("draft, validation, diff, publish, discard, and rollback routes enforce auth, origin, and CSRF", async () => {
  const backend = new MemoryBackend();
  setRegistryBackendForTests(backend);
  const { headers } = await publisherHeaders();
  const invalid = structuredClone(seedSnapshot.content);
  invalid.facts[0]!.sourceIds = ["source-still-being-added"];

  const crossOrigin = await saveDraftRoute(request("/api/admin/draft", { method: "PUT", headers: { ...headers, origin: "https://evil.example" }, body: JSON.stringify({ content: invalid }) }));
  assert.equal(crossOrigin.status, 403);
  const wrongCsrf = await saveDraftRoute(request("/api/admin/draft", { method: "PUT", headers: { ...headers, "x-registry-csrf": "wrong" }, body: JSON.stringify({ content: invalid }) }));
  assert.equal(wrongCsrf.status, 403);

  const savedInvalid = await saveDraftRoute(request("/api/admin/draft", { method: "PUT", headers, body: JSON.stringify({ content: invalid }) }));
  assert.equal(savedInvalid.status, 200);
  const invalidValidation = await validateRoute(request("/api/admin/validate", { method: "POST", headers, body: JSON.stringify({ content: invalid }) }));
  assert.equal(invalidValidation.status, 400);
  const invalidPublish = await publishRoute(request("/api/admin/publish", { method: "POST", headers }));
  assert.equal(invalidPublish.status, 400);
  assert.equal(backend.state.publishedSnapshot?.revision, seedSnapshot.revision);
  assert.notEqual(backend.state.draft, null);

  const changed = structuredClone(seedSnapshot.content);
  changed.facts[0]!.summary = "Published through the authenticated editor routes.";
  assert.equal((await saveDraftRoute(request("/api/admin/draft", { method: "PUT", headers, body: JSON.stringify({ content: changed }) }))).status, 200);
  assert.equal((await validateRoute(request("/api/admin/validate", { method: "POST", headers, body: JSON.stringify({ content: changed }) }))).status, 200);
  const diff = await adminDiff(request("/api/admin/diff", { headers }));
  assert.equal(diff.status, 200);
  assert.equal((await diff.json()).changed, true);
  const published = await publishRoute(request("/api/admin/publish", { method: "POST", headers }));
  assert.equal(published.status, 200);
  const publishedBody = await published.json();
  assert.notEqual(publishedBody.snapshot.revision, seedSnapshot.revision);
  assert.equal(backend.state.revisions.some((entry) => entry.revision === seedSnapshot.revision), true);
  assert.equal(backend.blobs.size, 2);

  const rolledBack = await rollbackRoute(request("/api/admin/rollback", { method: "POST", headers, body: JSON.stringify({ revision: seedSnapshot.revision }) }));
  assert.equal(rolledBack.status, 200);
  const rolledBackBody = await rolledBack.json();
  assert.notEqual(rolledBackBody.snapshot.revision, seedSnapshot.revision);
  assert.equal(backend.state.publishedSnapshot?.content.facts[0]?.summary, seedSnapshot.content.facts[0]?.summary);

  await saveDraftRoute(request("/api/admin/draft", { method: "PUT", headers, body: JSON.stringify({ content: changed }) }));
  assert.equal((await discardDraftRoute(request("/api/admin/draft", { method: "DELETE", headers }))).status, 200);
  assert.equal(backend.state.draft, null);
  setRegistryBackendForTests(undefined);
});

test("a published integration reaches Scout after ETag revalidation and rollback removes it in a new revision", async () => {
  const backend = new MemoryBackend();
  setRegistryBackendForTests(backend);
  const { headers } = await publisherHeaders();
  let now = new Date("2026-08-07T12:00:00.000Z");
  const store = new RegistryStore({
    path: "unused-in-this-test.json",
    remoteUrl: "https://registry.example/api/v1/registry",
    remoteEnabled: true,
    now: () => now,
    cacheTtlMs: 60_000,
    fetchImpl: async (_url, init) => registryRoute(request("/api/v1/registry", { headers: init?.headers })),
  });
  assert.equal((await store.search({ query: "Partner A" })).results.length, 0);

  const changed = structuredClone(seedSnapshot.content);
  changed.integrations.push({
    id: "partner-a-genesis-custody-mainnet",
    title: "Partner A custody integration",
    summary: "Partner A provides a reviewed Genesis custody integration.",
    aliases: [], tags: ["partner-a", "custody"], relatedIds: ["genesis-bond"],
    effectiveAt: "2026-08-07T00:00:00.000Z",
    sourceIds: ["genesis-bond-owner-attestation"],
    attestation: { scope: "Partner A Genesis custody integration", ownerOrganization: "Stacks Labs", reviewedAt: "2026-08-07T00:00:00.000Z", reviewCadenceDays: 7, sourceIds: ["genesis-bond-owner-attestation"] },
    partnerId: "partner-a", productId: "genesis-bond", role: "custody", network: "mainnet", status: "available",
  });
  assert.equal((await saveDraftRoute(request("/api/admin/draft", { method: "PUT", headers, body: JSON.stringify({ content: changed }) }))).status, 200);
  const publication = await publishRoute(request("/api/admin/publish", { method: "POST", headers }));
  assert.equal(publication.status, 200);
  const publicationBody = await publication.json();

  now = new Date(now.getTime() + 59_999);
  assert.equal((await store.search({ query: "Partner A" })).results.length, 0);
  now = new Date(now.getTime() + 1);
  const afterPublish = await store.search({ query: "Partner A" });
  assert.deepEqual(afterPublish.results.map((result) => result.id), ["partner-a-genesis-custody-mainnet"]);
  assert.equal(afterPublish.registryRevision, publicationBody.snapshot.revision);

  const rollback = await rollbackRoute(request("/api/admin/rollback", { method: "POST", headers, body: JSON.stringify({ revision: seedSnapshot.revision }) }));
  assert.equal(rollback.status, 200);
  const rollbackBody = await rollback.json();
  assert.notEqual(rollbackBody.snapshot.revision, seedSnapshot.revision);
  assert.notEqual(rollbackBody.snapshot.revision, publicationBody.snapshot.revision);
  now = new Date(now.getTime() + 60_000);
  assert.equal((await store.search({ query: "Partner A" })).results.length, 0);
  assert.equal((await store.read()).revision, rollbackBody.snapshot.revision);
  setRegistryBackendForTests(undefined);
});
