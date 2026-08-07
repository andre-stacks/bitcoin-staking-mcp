import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ServiceError } from "../src/core/errors.js";
import { RegistryStore, registryContentHash } from "../src/providers/registry-store.js";

const path = resolve("data/registry-snapshot.json");
const raw = await readFile(path, "utf8");

test("unified registry revalidates with ETags at the 60-second boundary", async () => {
  let now = new Date("2026-08-06T01:00:00.000Z"); let calls = 0; let conditional: string | null = null;
  const store = new RegistryStore({ path, remoteUrl: "https://registry.example/api/v1/registry", remoteEnabled: true, now: () => now, cacheTtlMs: 60_000, fetchImpl: async (_url, init) => { calls += 1; conditional = new Headers(init?.headers).get("if-none-match"); return calls === 1 ? new Response(raw, { status: 200, headers: { etag: '"seed"' } }) : new Response(null, { status: 304 }); } });
  assert.equal((await store.readWithMetadata()).metadata.sourceMode, "live_registry");
  now = new Date(now.getTime() + 59_999); assert.equal((await store.readWithMetadata()).metadata.sourceMode, "runtime_cache"); assert.equal(calls, 1);
  now = new Date(now.getTime() + 1); assert.equal((await store.readWithMetadata()).metadata.sourceMode, "runtime_cache"); assert.equal(calls, 2); assert.equal(conditional, '"seed"');
});

test("malformed upstream content uses only the current hash-verified bundled snapshot", async () => {
  const store = new RegistryStore({ path, remoteUrl: "https://registry.example/api/v1/registry", remoteEnabled: true, now: () => new Date("2026-08-06T02:00:00.000Z"), fetchImpl: async () => new Response(JSON.stringify({ registryVersion: "broken" })) });
  const result = await store.readWithMetadata();
  assert.equal(result.metadata.sourceMode, "bundled_snapshot");
  assert.match(result.metadata.fallbackReason ?? "", /validation|invalid|expected|undefined/i);
});

test("stale bundled registry fails closed after an upstream outage", async () => {
  const store = new RegistryStore({ path, remoteUrl: "https://registry.example/api/v1/registry", remoteEnabled: true, now: () => new Date("2026-08-14T00:00:00.001Z"), fetchImpl: async () => { throw new Error("offline"); } });
  await assert.rejects(store.read(), (error: unknown) => error instanceof ServiceError && error.code === "REGISTRY_UNAVAILABLE");
});

test("legacy bond aliases and catalog search resolve from the same atomic snapshot", async () => {
  const store = new RegistryStore({ path, remoteEnabled: false, now: () => new Date("2026-08-06T12:00:00.000Z") });
  assert.equal(await store.resolveId("genesis-bond-cycle-142"), "genesis-bond");
  const catalog = await store.search({ category: "product", query: "Genesis", limit: 5 });
  assert.equal(catalog.registryRevision.startsWith("rev-"), true);
  assert.deepEqual(catalog.results.map((result) => result.id), ["genesis-bond-product"]);
  assert.equal(catalog.results[0]?.effectiveFreshness, "current");
});

test("catalog search excludes scheduled, expired, and overdue records from current answers", async () => {
  const snapshot = JSON.parse(raw);
  const base = snapshot.content.facts[0];
  snapshot.content.facts.push(
    { ...base, id: "scheduled-product", title: "Scheduled Product", relatedIds: ["genesis-bond"], effectiveAt: "2026-08-08T00:00:00.000Z" },
    { ...base, id: "expired-notice", title: "Expired Notice", category: "announcement", relatedIds: ["genesis-bond"], effectiveAt: "2026-08-01T00:00:00.000Z", expiresAt: "2026-08-07T11:59:59.000Z" },
    { ...base, id: "overdue-product", title: "Overdue Product", relatedIds: ["genesis-bond"], attestation: { ...base.attestation, reviewedAt: "2026-07-01T00:00:00.000Z" } },
  );
  snapshot.contentHash = registryContentHash(snapshot.content);
  const store = new RegistryStore({
    path,
    remoteUrl: "https://registry.example/api/v1/registry",
    remoteEnabled: true,
    now: () => new Date("2026-08-07T12:00:00.000Z"),
    fetchImpl: async () => new Response(JSON.stringify(snapshot), { status: 200, headers: { etag: '"filtered"' } }),
  });
  const result = await store.search();
  assert.deepEqual(result.results.map((item) => item.id), ["genesis-bond-product", "stackingdao-stbtc", "zest-stbtc-borrowing"]);
});

test("catalog search exposes Zest as a planned stBTC integration without live terms", async () => {
  const store = new RegistryStore({ path, remoteEnabled: false, now: () => new Date("2026-08-06T12:00:00.000Z") });
  const result = await store.search({ query: "Zest" });
  assert.deepEqual(result.results.map((item) => item.id), ["zest-stbtc-borrowing"]);
  assert.equal(result.results[0]?.kind, "integration");
  assert.equal(result.results[0]?.status, "planned");
  assert.match(result.results[0]?.summary ?? "", /rates.*eligibility.*LTV.*not yet published/i);
});
