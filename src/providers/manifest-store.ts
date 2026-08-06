import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BondManifestSchema, BondRegistrySchema, isReviewCurrent, reviewDueAt, type BondManifest, type SourceRef } from "../core/schemas.js";
import { ServiceError } from "../core/errors.js";
import { VersionedRegistryClient, registryHash, type RegistryEnvelope } from "./versioned-registry.js";

function dataRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return [resolve(here, "../../data"), resolve(here, "../data")].find(existsSync) ?? resolve(here, "../../data");
}

export class ManifestStore {
  private readonly directory: string;
  private readonly registry?: VersionedRegistryClient<ReturnType<typeof BondRegistrySchema.parse>>;
  private lastMetadata?: RegistryEnvelope<unknown>["metadata"];
  private readonly remoteManifestCache = new Map<string, BondManifest>();
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly remoteEnabled: boolean;
  private readonly remoteRegistryUrl: string;

  constructor(directory?: string, options: { now?: () => Date; fetchImpl?: typeof fetch; remoteEnabled?: boolean; remoteRegistryUrl?: string } = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.remoteEnabled = options.remoteEnabled ?? process.env.BITCOIN_STAKING_DISABLE_REMOTE_REGISTRY !== "1";
    this.remoteRegistryUrl = options.remoteRegistryUrl ?? process.env.BITCOIN_STAKING_BOND_REGISTRY_URL ?? "https://raw.githubusercontent.com/andre-stacks/bitcoin-staking-mcp/main/data/bond-registry.json";
    this.directory = directory ?? process.env.BITCOIN_STAKING_DATA_DIR ?? resolve(dataRoot(), "bonds");
    if (!directory && !process.env.BITCOIN_STAKING_DATA_DIR) {
      this.registry = new VersionedRegistryClient({
        remoteUrl: this.remoteRegistryUrl,
        fallbackPath: resolve(dataRoot(), "bond-registry.json"),
        parse: (value) => BondRegistrySchema.parse(value),
        ...(options.now ? { now: options.now } : {}), ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        remoteEnabled: this.remoteEnabled,
      });
    }
  }

  async listWithMetadata() {
    if (!this.registry) {
      const bonds = await this.readDirectory();
      const now = this.now();
      const raw = JSON.stringify(bonds);
      return { bonds, metadata: { sourceMode: "bundled_snapshot" as const, registryVersion: "local-directory", contentHash: registryHash(raw), fetchedAt: now.toISOString(), reviewedAt: now.toISOString(), reviewDueAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(), reviewStatus: "current" as const } };
    }
    const registry = await this.registry.read();
    let bonds: BondManifest[];
    let metadata = registry.metadata;
    try {
      bonds = await Promise.all(registry.value.bondFiles.map((name) => this.readManifest(name, registry.metadata.sourceMode)));
    } catch (error) {
      if (registry.metadata.sourceMode === "bundled_snapshot") throw error;
      const fallbackRaw = await readFile(resolve(dataRoot(), "bond-registry.json"), "utf8").catch((reason: unknown) => { throw new ServiceError("REGISTRY_UNAVAILABLE", `Remote manifests and bundled registry are unavailable: ${reason instanceof Error ? reason.message : String(reason)}`, true); });
      const fallback = BondRegistrySchema.parse(JSON.parse(fallbackRaw));
      const now = this.now();
      if (!isReviewCurrent(fallback.reviewedAt, now, fallback.reviewCadenceDays)) throw new ServiceError("REGISTRY_UNAVAILABLE", `Remote manifests failed and bundled registry expired at ${reviewDueAt(fallback.reviewedAt, fallback.reviewCadenceDays)}.`, true);
      bonds = await Promise.all(fallback.bondFiles.map((name) => this.readManifest(name, "bundled_snapshot")));
      metadata = { sourceMode: "bundled_snapshot", registryVersion: fallback.registryVersion, contentHash: registryHash(JSON.stringify(bonds)), fetchedAt: now.toISOString(), reviewedAt: fallback.reviewedAt, reviewDueAt: reviewDueAt(fallback.reviewedAt, fallback.reviewCadenceDays), reviewStatus: "current" };
    }
    this.assertUnique(bonds);
    metadata = { ...metadata, contentHash: registryHash(JSON.stringify(bonds)) };
    this.lastMetadata = metadata;
    return { bonds, metadata };
  }

  async list(): Promise<BondManifest[]> { return (await this.listWithMetadata()).bonds; }
  async get(id: string): Promise<BondManifest> { const bond = (await this.list()).find((item) => item.id === id); if (!bond) throw new ServiceError("NOT_FOUND", `Bond not found: ${id}`); return bond; }
  async sources(): Promise<SourceRef[]> { return [...new Map((await this.list()).flatMap((bond) => bond.sources).map((source) => [source.id, source])).values()]; }
  metadata() { return this.lastMetadata; }

  private async readDirectory() {
    try {
      const names = (await readdir(this.directory)).filter((name) => name.endsWith(".json")).sort();
      const bonds = await Promise.all(names.map((name) => this.readManifest(name, "bundled_snapshot")));
      this.assertUnique(bonds); return bonds;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError("REGISTRY_UNAVAILABLE", `Bond manifest directory is unavailable: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }

  private async readManifest(name: string, sourceMode: "live_registry" | "runtime_cache" | "bundled_snapshot") {
    try {
      let raw: string;
      if (sourceMode === "runtime_cache" && this.remoteManifestCache.has(name)) {
        return this.remoteManifestCache.get(name)!;
      }
      if (sourceMode === "live_registry" && this.remoteEnabled) {
        const base = this.remoteRegistryUrl.replace(/\/[^/]+$/, "/");
        const response = await this.fetchImpl(`${base}bonds/${name}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        raw = await response.text();
      } else raw = await readFile(resolve(this.directory, name), "utf8");
      const manifest = BondManifestSchema.parse(JSON.parse(raw));
      if (sourceMode === "live_registry") this.remoteManifestCache.set(name, manifest);
      return manifest;
    } catch (error) {
      throw new ServiceError("REGISTRY_UNAVAILABLE", `Bond manifest ${name} is unavailable or invalid: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }

  private assertUnique(bonds: BondManifest[]) { const ids = bonds.map((bond) => bond.id); if (new Set(ids).size !== ids.length) throw new ServiceError("INVALID_INPUT", "Duplicate bond manifest ID."); }
}
