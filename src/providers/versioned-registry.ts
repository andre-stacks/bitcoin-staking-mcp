import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ServiceError } from "../core/errors.js";
import { isReviewCurrent, reviewDueAt } from "../core/schemas.js";

export interface RegistryEnvelope<T> {
  value: T;
  metadata: {
    sourceMode: "live_registry" | "runtime_cache" | "bundled_snapshot";
    registryVersion: string;
    contentHash: string;
    fetchedAt: string;
    reviewedAt: string;
    reviewDueAt: string;
    reviewStatus: "current" | "needs_review";
  };
}

interface VersionedValue {
  registryVersion: string;
  reviewedAt: string;
  reviewCadenceDays: number;
}

interface RegistryClientOptions<T extends VersionedValue> {
  remoteUrl: string;
  fallbackPath: string;
  parse: (value: unknown) => T;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  cacheTtlMs?: number;
  remoteEnabled?: boolean;
}

function hash(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export class VersionedRegistryClient<T extends VersionedValue> {
  private cached?: { value: T; raw: string; etag?: string; fetchedAt: Date };
  private readonly now: () => Date;
  private readonly fetchImpl: typeof fetch;
  private readonly cacheTtlMs: number;
  private readonly remoteEnabled: boolean;

  constructor(private readonly options: RegistryClientOptions<T>) {
    this.now = options.now ?? (() => new Date());
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cacheTtlMs = options.cacheTtlMs ?? 15 * 60 * 1_000;
    this.remoteEnabled = options.remoteEnabled ?? process.env.BITCOIN_STAKING_DISABLE_REMOTE_REGISTRY !== "1";
  }

  async read(): Promise<RegistryEnvelope<T>> {
    const now = this.now();
    if (this.cached && isReviewCurrent(this.cached.value.reviewedAt, now, this.cached.value.reviewCadenceDays) && now.getTime() - this.cached.fetchedAt.getTime() < this.cacheTtlMs) {
      return this.envelope(this.cached.value, this.cached.raw, "runtime_cache", this.cached.fetchedAt);
    }

    if (this.remoteEnabled) {
      try {
        const response = await this.fetchImpl(
          this.options.remoteUrl,
          this.cached?.etag ? { headers: { "If-None-Match": this.cached.etag } } : {},
        );
        if (response.status === 304 && this.cached) {
          this.assertNotFutureDated(this.cached.value, now);
          this.cached.fetchedAt = now;
          return this.envelope(this.cached.value, this.cached.raw, "runtime_cache", now);
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = await response.text();
        const value = this.options.parse(JSON.parse(raw));
        this.assertNotFutureDated(value, now);
        const etag = response.headers.get("etag") ?? undefined;
        this.cached = { value, raw, fetchedAt: now, ...(etag ? { etag } : {}) };
        return this.envelope(value, raw, "live_registry", now);
      } catch {
        // Fall back to the bundled snapshot; freshness is preserved in metadata.
      }
    }

    try {
      const raw = await readFile(this.options.fallbackPath, "utf8");
      const value = this.options.parse(JSON.parse(raw));
      this.assertNotFutureDated(value, now);
      return this.envelope(value, raw, "bundled_snapshot", now);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError("REGISTRY_UNAVAILABLE", `Remote registry and bundled snapshot are unavailable: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }

  private assertNotFutureDated(value: T, now: Date): void {
    const reviewedAt = new Date(value.reviewedAt);
    if (Number.isNaN(reviewedAt.getTime()) || reviewedAt.getTime() > now.getTime()) {
      throw new Error(`Registry review timestamp is invalid or future-dated: ${value.reviewedAt}`);
    }
  }

  private envelope(value: T, raw: string, sourceMode: RegistryEnvelope<T>["metadata"]["sourceMode"], fetchedAt: Date): RegistryEnvelope<T> {
    const current = isReviewCurrent(value.reviewedAt, this.now(), value.reviewCadenceDays);
    return {
      value,
      metadata: {
        sourceMode,
        registryVersion: value.registryVersion,
        contentHash: hash(raw),
        fetchedAt: fetchedAt.toISOString(),
        reviewedAt: value.reviewedAt,
        reviewDueAt: reviewDueAt(value.reviewedAt, value.reviewCadenceDays),
        reviewStatus: current ? "current" : "needs_review",
      },
    };
  }
}

export function registryHash(content: string): string {
  return hash(content);
}
