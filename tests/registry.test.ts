import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { VersionedRegistryClient } from "../src/providers/versioned-registry.js";
import { ServiceError } from "../src/core/errors.js";

interface Fixture { registryVersion: string; reviewedAt: string; reviewCadenceDays: number; value: string }
const parse = (value: unknown) => value as Fixture;

test("remote registry uses ETag and a 15-minute runtime cache", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "btc-registry-")); context.after(() => rm(directory, { recursive: true, force: true }));
  const fallback = join(directory, "fallback.json"); await writeFile(fallback, JSON.stringify({ registryVersion: "fallback", reviewedAt: "2026-08-06T00:00:00.000Z", reviewCadenceDays: 7, value: "fallback" }));
  let now = new Date("2026-08-06T01:00:00.000Z"); let requests = 0; let ifNoneMatch: string | null = null;
  const fetchImpl: typeof fetch = async (_url, init) => { requests += 1; ifNoneMatch = new Headers(init?.headers).get("if-none-match"); if (requests === 1) return new Response(JSON.stringify({ registryVersion: "remote", reviewedAt: "2026-08-06T00:00:00.000Z", reviewCadenceDays: 7, value: "remote" }), { status: 200, headers: { etag: '"v1"' } }); return new Response(null, { status: 304 }); };
  const client = new VersionedRegistryClient({ remoteUrl: "https://example.com/registry.json", fallbackPath: fallback, parse, now: () => now, fetchImpl, remoteEnabled: true });
  const live = await client.read(); assert.equal(live.metadata.sourceMode, "live_registry"); assert.match(live.metadata.contentHash, /^sha256:/);
  const cached = await client.read(); assert.equal(cached.metadata.sourceMode, "runtime_cache"); assert.equal(requests, 1);
  now = new Date("2026-08-06T01:16:00.000Z"); const revalidated = await client.read(); assert.equal(revalidated.metadata.sourceMode, "runtime_cache"); assert.equal(ifNoneMatch, '"v1"');
});

test("current bundled fallback is labeled and stale fallback is refused", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "btc-registry-")); context.after(() => rm(directory, { recursive: true, force: true }));
  const fallback = join(directory, "fallback.json"); await writeFile(fallback, JSON.stringify({ registryVersion: "fallback", reviewedAt: "2026-08-06T00:00:00.000Z", reviewCadenceDays: 7, value: "fallback" }));
  const failingFetch: typeof fetch = async () => { throw new Error("offline"); };
  const current = new VersionedRegistryClient({ remoteUrl: "https://example.com", fallbackPath: fallback, parse, now: () => new Date("2026-08-10T00:00:00.000Z"), fetchImpl: failingFetch, remoteEnabled: true });
  assert.equal((await current.read()).metadata.sourceMode, "bundled_snapshot");
  const stale = new VersionedRegistryClient({ remoteUrl: "https://example.com", fallbackPath: fallback, parse, now: () => new Date("2026-08-14T00:00:00.000Z"), fetchImpl: failingFetch, remoteEnabled: true });
  await assert.rejects(stale.read(), (error: unknown) => error instanceof ServiceError && error.code === "REGISTRY_UNAVAILABLE" && error.retryable);
});
