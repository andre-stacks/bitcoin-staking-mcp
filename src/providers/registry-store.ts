import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ConciergeRegistrySnapshotSchema,
  currentRecordStatus,
  type CatalogFact,
  type ConciergeRegistrySnapshot,
  type IntegrationClaim,
  type SourceRef,
} from "../core/schemas.js";
import { ServiceError } from "../core/errors.js";
import { VersionedRegistryClient, type RegistryEnvelope } from "./versioned-registry.js";

const DEFAULT_REGISTRY_URL = "https://bitcoin-staking-registry.vercel.app/api/v1/registry";

function defaultPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return [resolve(here, "../../data/registry-snapshot.json"), resolve(here, "../data/registry-snapshot.json")]
    .find(existsSync) ?? resolve(here, "../../data/registry-snapshot.json");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

export function canonicalRegistryJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function registryContentHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalRegistryJson(value)).digest("hex")}`;
}

export interface RegistryStoreOptions {
  path?: string;
  remoteUrl?: string;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  remoteEnabled?: boolean;
  cacheTtlMs?: number;
}

export class RegistryStore {
  private readonly client: VersionedRegistryClient<ConciergeRegistrySnapshot>;
  private last?: RegistryEnvelope<ConciergeRegistrySnapshot>;

  constructor(options: RegistryStoreOptions = {}) {
    this.client = new VersionedRegistryClient({
      remoteUrl: options.remoteUrl ?? process.env.BITCOIN_STAKING_REGISTRY_URL ?? DEFAULT_REGISTRY_URL,
      fallbackPath: options.path ?? process.env.BITCOIN_STAKING_REGISTRY_PATH ?? defaultPath(),
      parse: (input) => {
        const snapshot = ConciergeRegistrySnapshotSchema.parse(input);
        const actualHash = registryContentHash(snapshot.content);
        if (snapshot.contentHash !== actualHash) {
          throw new ServiceError("INVALID_INPUT", `Registry content hash mismatch: expected ${snapshot.contentHash}, received ${actualHash}.`);
        }
        return snapshot;
      },
      cacheTtlMs: options.cacheTtlMs ?? Number(process.env.BITCOIN_STAKING_REGISTRY_CACHE_MS ?? 60_000),
      ...(options.now ? { now: options.now } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.remoteEnabled === undefined ? {} : { remoteEnabled: options.remoteEnabled }),
    });
  }

  async readWithMetadata() {
    const result = await this.client.read();
    this.last = result;
    return {
      snapshot: result.value,
      metadata: {
        ...result.metadata,
        registryVersion: result.value.revision,
        contentHash: result.value.contentHash,
      },
    };
  }

  async read(): Promise<ConciergeRegistrySnapshot> {
    return (await this.readWithMetadata()).snapshot;
  }

  metadata() {
    if (!this.last) return undefined;
    return { ...this.last.metadata, registryVersion: this.last.value.revision, contentHash: this.last.value.contentHash };
  }

  async resolveId(id: string): Promise<string> {
    const content = (await this.read()).content;
    for (const record of [...content.bonds, ...content.facts, ...content.integrations]) {
      if (record.id === id || record.aliases.includes(id)) return record.id;
    }
    return id;
  }

  async listSources(): Promise<SourceRef[]> {
    const content = (await this.read()).content;
    return [...new Map([
      ...content.sources,
      ...content.custody.sources,
      ...content.bonds.flatMap((bond) => bond.sources),
    ].map((source) => [source.id, source])).values()];
  }

  async search(input: { query?: string; category?: CatalogFact["category"]; status?: string; limit?: number } = {}) {
    const { snapshot, metadata } = await this.readWithMetadata();
    const now = new Date(metadata.fetchedAt);
    const query = input.query?.trim().toLocaleLowerCase();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const records: Array<{ kind: "fact" | "integration"; record: CatalogFact | IntegrationClaim }> = [
      ...snapshot.content.facts.map((record) => ({ kind: "fact" as const, record })),
      ...snapshot.content.integrations.map((record) => ({ kind: "integration" as const, record })),
    ];
    const matches = records.filter(({ kind, record }) => {
      if (currentRecordStatus(record, now) !== "current") return false;
      if (input.category && (kind !== "fact" || (record as CatalogFact).category !== input.category)) return false;
      if (input.status && record.status !== input.status) return false;
      if (!query) return true;
      const extra = kind === "integration"
        ? (() => { const item = record as IntegrationClaim; return [item.partnerId, item.productId, item.role, item.network ?? ""]; })()
        : [(record as CatalogFact).category];
      const haystack = [record.id, record.title, record.summary, ...record.aliases, ...record.tags, ...extra]
        .join(" ").toLocaleLowerCase();
      return haystack.includes(query);
    }).sort((left, right) => left.record.id.localeCompare(right.record.id)).slice(0, limit);
    const sourcesById = new Map((await this.listSources()).map((source) => [source.id, source]));
    const usedSources = [...new Map(matches.flatMap(({ record }) => record.sourceIds)
      .flatMap((id) => sourcesById.get(id) ? [sourcesById.get(id)!] : [])
      .map((source) => [source.id, source])).values()];
    return {
      query: input.query ?? null,
      category: input.category ?? null,
      status: input.status ?? null,
      results: matches.map(({ kind, record }) => ({
        kind,
        ...record,
        effectiveFreshness: currentRecordStatus(record, now),
        reviewDueAt: new Date(new Date(record.attestation.reviewedAt).getTime() + record.attestation.reviewCadenceDays * 86_400_000).toISOString(),
        sources: record.sourceIds.flatMap((id) => sourcesById.get(id) ? [sourcesById.get(id)!] : []),
      })),
      registryRevision: snapshot.revision,
      registryPublishedAt: snapshot.publishedAt,
      dataStatus: "published" as const,
      sources: usedSources,
      assumptions: ["Only records effective now and inside their owner-attestation review window are returned."],
      verifiedAt: now.toISOString(),
    };
  }
}
