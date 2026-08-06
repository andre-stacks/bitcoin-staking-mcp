import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ServiceError, withTimeout } from "../core/errors.js";
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
    fallbackReason?: string;
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
  timeoutMs?: number;
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
  private readonly timeoutMs: number;

  constructor(private readonly options: RegistryClientOptions<T>) {
    this.now = options.now ?? (() => new Date());
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cacheTtlMs = options.cacheTtlMs ?? 15 * 60 * 1_000;
    this.remoteEnabled = options.remoteEnabled ?? process.env.BITCOIN_STAKING_DISABLE_REMOTE_REGISTRY !== "1";
    this.timeoutMs = options.timeoutMs ?? Number(process.env.BITCOIN_STAKING_UPSTREAM_TIMEOUT_MS ?? 8_000);
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new ServiceError("INVALID_INPUT", "Registry timeout must be a positive number of milliseconds.");
  }

  async read(): Promise<RegistryEnvelope<T>> {
    const now = this.now();
    if (this.cached && isReviewCurrent(this.cached.value.reviewedAt, now, this.cached.value.reviewCadenceDays) && now.getTime() - this.cached.fetchedAt.getTime() < this.cacheTtlMs) {
      return this.envelope(this.cached.value, this.cached.raw, "runtime_cache", this.cached.fetchedAt);
    }

    let remoteFailure: string | undefined;
    if (this.remoteEnabled) {
      try {
        const response = await withTimeout(
          this.fetchImpl(
            this.options.remoteUrl,
            this.cached?.etag ? { headers: { "If-None-Match": this.cached.etag } } : {},
          ),
          this.timeoutMs,
          "Product registry fetch",
        );
        if (response.status === 304 && this.cached) {
          this.assertNotFutureDated(this.cached.value, now);
          if (!isReviewCurrent(this.cached.value.reviewedAt, now, this.cached.value.reviewCadenceDays)) throw new Error("Remote registry review is overdue.");
          this.cached.fetchedAt = now;
          return this.envelope(this.cached.value, this.cached.raw, "runtime_cache", now);
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = await response.text();
        const value = this.options.parse(JSON.parse(raw));
        this.assertNotFutureDated(value, now);
        if (!isReviewCurrent(value.reviewedAt, now, value.reviewCadenceDays)) throw new Error("Remote registry review is overdue.");
        const etag = response.headers.get("etag") ?? undefined;
        this.cached = { value, raw, fetchedAt: now, ...(etag ? { etag } : {}) };
        return this.envelope(value, raw, "live_registry", now);
      } catch (error) {
        remoteFailure = error instanceof Error ? error.message : String(error);
        // A current reviewed snapshot is the only permitted fallback.
      }
    } else {
      remoteFailure = "Remote registry reads are disabled.";
    }

    try {
      const raw = await readFile(this.options.fallbackPath, "utf8");
      const value = this.options.parse(JSON.parse(raw));
      this.assertNotFutureDated(value, now);
      if (!isReviewCurrent(value.reviewedAt, now, value.reviewCadenceDays)) {
        throw new ServiceError("REGISTRY_UNAVAILABLE", `Remote registry failed (${remoteFailure ?? "not attempted"}) and bundled registry expired at ${reviewDueAt(value.reviewedAt, value.reviewCadenceDays)}.`, true);
      }
      return this.envelope(value, raw, "bundled_snapshot", now, remoteFailure);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError("REGISTRY_UNAVAILABLE", `Remote registry failed (${remoteFailure ?? "not attempted"}) and bundled snapshot is unavailable: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }

  private assertNotFutureDated(value: T, now: Date): void {
    const reviewedAt = new Date(value.reviewedAt);
    if (Number.isNaN(reviewedAt.getTime()) || reviewedAt.getTime() > now.getTime()) {
      throw new Error(`Registry review timestamp is invalid or future-dated: ${value.reviewedAt}`);
    }
  }

  private envelope(value: T, raw: string, sourceMode: RegistryEnvelope<T>["metadata"]["sourceMode"], fetchedAt: Date, fallbackReason?: string): RegistryEnvelope<T> {
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
        ...(fallbackReason ? { fallbackReason } : {}),
      },
    };
  }
}

export function registryHash(content: string): string {
  return hash(content);
}
