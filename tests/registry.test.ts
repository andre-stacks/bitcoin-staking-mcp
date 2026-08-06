import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { VersionedRegistryClient } from "../src/providers/versioned-registry.js";
import { ManifestStore } from "../src/providers/manifest-store.js";
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
  const currentResult = await current.read();
  assert.equal(currentResult.metadata.sourceMode, "bundled_snapshot");
  assert.match(currentResult.metadata.fallbackReason ?? "", /offline/);
  const stale = new VersionedRegistryClient({ remoteUrl: "https://example.com", fallbackPath: fallback, parse, now: () => new Date("2026-08-14T00:00:00.000Z"), fetchImpl: failingFetch, remoteEnabled: true });
  await assert.rejects(stale.read(), (error: unknown) => error instanceof ServiceError && error.code === "REGISTRY_UNAVAILABLE" && error.retryable && /offline/.test(error.message));
});

test("hung registry reads time out, expose the reason, and use only a current fallback", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "btc-registry-timeout-")); context.after(() => rm(directory, { recursive: true, force: true }));
  const fallback = join(directory, "fallback.json");
  await writeFile(fallback, JSON.stringify({ registryVersion: "fallback", reviewedAt: "2026-08-06T00:00:00.000Z", reviewCadenceDays: 7, value: "fallback" }));
  const hungFetch: typeof fetch = async () => new Promise<Response>(() => {});
  const client = new VersionedRegistryClient({ remoteUrl: "https://example.com", fallbackPath: fallback, parse, now: () => new Date("2026-08-10T00:00:00.000Z"), fetchImpl: hungFetch, remoteEnabled: true, timeoutMs: 5 });
  const result = await client.read();
  assert.equal(result.metadata.sourceMode, "bundled_snapshot");
  assert.match(result.metadata.fallbackReason ?? "", /timed out after 5ms/);
});

test("registry timeout covers a stalled response body and aborts the request", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "btc-registry-body-timeout-")); context.after(() => rm(directory, { recursive: true, force: true }));
  const fallback = join(directory, "fallback.json");
  await writeFile(fallback, JSON.stringify({ registryVersion: "fallback", reviewedAt: "2026-08-06T00:00:00.000Z", reviewCadenceDays: 7, value: "fallback" }));
  let signal: AbortSignal | null = null;
  const fetchImpl: typeof fetch = async (_url, init) => {
    signal = init?.signal ?? null;
    return new Response(new ReadableStream({ start() {} }), { status: 200 });
  };
  const client = new VersionedRegistryClient({ remoteUrl: "https://example.com", fallbackPath: fallback, parse, now: () => new Date("2026-08-10T00:00:00.000Z"), fetchImpl, remoteEnabled: true, timeoutMs: 5 });
  const result = await client.read();
  assert.equal(result.metadata.sourceMode, "bundled_snapshot");
  assert.match(result.metadata.fallbackReason ?? "", /timed out after 5ms/);
  assert.equal(signal?.aborted, true);
});

test("cache revalidation occurs at the exact 15-minute boundary", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "btc-registry-boundary-")); context.after(() => rm(directory, { recursive: true, force: true }));
  const fallback = join(directory, "fallback.json"); await writeFile(fallback, JSON.stringify({ registryVersion: "fallback", reviewedAt: "2026-08-06T00:00:00.000Z", reviewCadenceDays: 7, value: "fallback" }));
  let now = new Date("2026-08-06T01:00:00.000Z"); let requests = 0;
  const fetchImpl: typeof fetch = async () => { requests += 1; return requests === 1
    ? new Response(JSON.stringify({ registryVersion: "remote", reviewedAt: "2026-08-06T00:00:00.000Z", reviewCadenceDays: 7, value: "remote" }), { status: 200, headers: { etag: '"v1"' } })
    : new Response(null, { status: 304 }); };
  const client = new VersionedRegistryClient({ remoteUrl: "https://example.com/registry.json", fallbackPath: fallback, parse, now: () => now, fetchImpl, remoteEnabled: true });
  await client.read();
  now = new Date("2026-08-06T01:14:59.999Z"); await client.read(); assert.equal(requests, 1);
  now = new Date("2026-08-06T01:15:00.000Z"); const result = await client.read(); assert.equal(requests, 2); assert.equal(result.metadata.sourceMode, "runtime_cache");
});

test("stale remote 304 and future-dated remote content fall back only to a current bundled snapshot", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "btc-registry-stale-")); context.after(() => rm(directory, { recursive: true, force: true }));
  const fallback = join(directory, "fallback.json");
  await writeFile(fallback, JSON.stringify({ registryVersion: "fallback-current", reviewedAt: "2026-08-14T00:00:00.000Z", reviewCadenceDays: 7, value: "fallback" }));
  let now = new Date("2026-08-06T01:00:00.000Z"); let requests = 0;
  const fetchImpl: typeof fetch = async () => { requests += 1; return requests === 1
    ? new Response(JSON.stringify({ registryVersion: "remote", reviewedAt: "2026-08-06T00:00:00.000Z", reviewCadenceDays: 7, value: "remote" }), { status: 200, headers: { etag: '"v1"' } })
    : new Response(null, { status: 304 }); };
  const client = new VersionedRegistryClient({ remoteUrl: "https://example.com/registry.json", fallbackPath: fallback, parse, now: () => now, fetchImpl, remoteEnabled: true });
  assert.equal((await client.read()).metadata.sourceMode, "live_registry");
  now = new Date("2026-08-14T01:00:00.000Z");
  const fallbackResult = await client.read();
  assert.equal(fallbackResult.metadata.sourceMode, "bundled_snapshot");
  assert.equal(fallbackResult.value.registryVersion, "fallback-current");

  const futureFetch: typeof fetch = async () => new Response(JSON.stringify({ registryVersion: "future", reviewedAt: "2026-08-20T00:00:00.000Z", reviewCadenceDays: 7, value: "future" }), { status: 200 });
  const future = new VersionedRegistryClient({ remoteUrl: "https://example.com/registry.json", fallbackPath: fallback, parse, now: () => now, fetchImpl: futureFetch, remoteEnabled: true });
  assert.equal((await future.read()).metadata.sourceMode, "bundled_snapshot");
});

test("manifest registry content hash changes when a referenced manifest changes", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "btc-manifest-hash-")); context.after(() => rm(directory, { recursive: true, force: true }));
  const manifestPath = join(directory, "bond.json");
  const original = JSON.parse(await readFile(resolve("data/bonds/demo-native-bitcoin-bond.json"), "utf8"));
  await writeFile(manifestPath, JSON.stringify(original));
  const store = new ManifestStore(directory, { now: () => new Date("2026-08-06T12:00:00.000Z") });
  const first = await store.listWithMetadata();
  original.notes.push("Hash-changing reviewed note.");
  await writeFile(manifestPath, JSON.stringify(original));
  const second = await store.listWithMetadata();
  assert.notEqual(first.metadata.contentHash, second.metadata.contentHash);
  assert.match(second.metadata.contentHash, /^sha256:/);
});

test("remote manifest failure falls back to the current bundled registry and labels the source honestly", async () => {
  const index = JSON.parse(await readFile(resolve("data/bond-registry.json"), "utf8"));
  let requests = 0;
  const fetchImpl: typeof fetch = async () => {
    requests += 1;
    if (requests === 1) return new Response(JSON.stringify(index), { status: 200, headers: { etag: '"registry"' } });
    return new Response("missing remote manifest", { status: 503 });
  };
  const store = new ManifestStore(undefined, {
    now: () => new Date("2026-08-06T12:00:00.000Z"), fetchImpl, remoteEnabled: true,
    remoteRegistryUrl: "https://example.com/data/bond-registry.json",
  });
  const result = await store.listWithMetadata();
  assert.equal(result.metadata.sourceMode, "bundled_snapshot");
  assert.equal(result.bonds.length, 2);
  assert.match(result.metadata.contentHash, /^sha256:/);
  assert.match(result.metadata.fallbackReason ?? "", /HTTP 503/);
});

test("hung remote manifest reads time out and preserve the fallback reason", async () => {
  const index = JSON.parse(await readFile(resolve("data/bond-registry.json"), "utf8"));
  let requests = 0;
  const fetchImpl: typeof fetch = async () => {
    requests += 1;
    if (requests === 1) return new Response(JSON.stringify(index), { status: 200 });
    return new Promise<Response>(() => {});
  };
  const store = new ManifestStore(undefined, {
    now: () => new Date("2026-08-06T12:00:00.000Z"), fetchImpl, remoteEnabled: true, timeoutMs: 5,
    remoteRegistryUrl: "https://example.com/data/bond-registry.json",
  });
  const result = await store.listWithMetadata();
  assert.equal(result.metadata.sourceMode, "bundled_snapshot");
  assert.match(result.metadata.fallbackReason ?? "", /Bond manifest .* timed out after 5ms/);
});

test("manifest timeout covers a stalled response body and aborts the request", async () => {
  const index = JSON.parse(await readFile(resolve("data/bond-registry.json"), "utf8"));
  let requests = 0;
  let manifestSignal: AbortSignal | null = null;
  const fetchImpl: typeof fetch = async (_url, init) => {
    requests += 1;
    if (requests === 1) return new Response(JSON.stringify(index), { status: 200 });
    manifestSignal = init?.signal ?? null;
    return new Response(new ReadableStream({ start() {} }), { status: 200 });
  };
  const store = new ManifestStore(undefined, {
    now: () => new Date("2026-08-06T12:00:00.000Z"), fetchImpl, remoteEnabled: true, timeoutMs: 5,
    remoteRegistryUrl: "https://example.com/data/bond-registry.json",
  });
  const result = await store.listWithMetadata();
  assert.equal(result.metadata.sourceMode, "bundled_snapshot");
  assert.match(result.metadata.fallbackReason ?? "", /Bond manifest .* timed out after 5ms/);
  assert.equal(manifestSignal?.aborted, true);
});
