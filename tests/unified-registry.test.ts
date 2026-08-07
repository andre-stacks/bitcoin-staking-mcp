import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ServiceError } from "../src/core/errors.js";
import { RegistryStore } from "../src/providers/registry-store.js";

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
