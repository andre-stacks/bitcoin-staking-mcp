import { z } from "zod";
import { ServiceError, withTimeout } from "../core/errors.js";
import type { SourceRef } from "../core/schemas.js";

const DEFAULT_PUBLIC_API_BASE = "https://api.coingecko.com/api/v3";
const DEFAULT_PRO_API_BASE = "https://pro-api.coingecko.com/api/v3";

const PriceResponseSchema = z.object({
  bitcoin: z.object({
    usd: z.number().positive(),
    last_updated_at: z.number().int().positive(),
  }),
  blockstack: z.object({
    usd: z.number().positive(),
    last_updated_at: z.number().int().positive(),
  }),
}).strict();

export interface CoinGeckoPriceProviderOptions {
  apiBaseUrl?: string;
  apiKey?: string;
  apiPlan?: "public" | "demo" | "pro";
  timeoutMs?: number;
  cacheMs?: number;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

export interface CurrentUsdPrices {
  provider: "CoinGecko";
  btcUsd: number;
  stxUsd: number;
  coinIds: { btc: "bitcoin"; stx: "blockstack" };
  marketUpdatedAt: { btc: string; stx: string };
  dataStatus: "live";
  sources: SourceRef[];
  assumptions: string[];
  verifiedAt: string;
}

export class CoinGeckoPriceProvider {
  readonly apiBaseUrl: string;
  readonly apiPlan: "public" | "demo" | "pro";
  readonly timeoutMs: number;
  readonly cacheMs: number;
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;
  private cached?: { expiresAt: number; value: CurrentUsdPrices };

  constructor(options: CoinGeckoPriceProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.COINGECKO_API_KEY;
    const configuredPlan = options.apiPlan ?? process.env.COINGECKO_API_PLAN ?? (this.apiKey ? "demo" : "public");
    if (!(["public", "demo", "pro"] as const).includes(configuredPlan as "public" | "demo" | "pro")) {
      throw new ServiceError("INVALID_INPUT", "COINGECKO_API_PLAN must be public, demo, or pro.");
    }
    this.apiPlan = configuredPlan as "public" | "demo" | "pro";
    this.apiBaseUrl = (options.apiBaseUrl ?? process.env.COINGECKO_API_BASE_URL ?? (this.apiPlan === "pro" ? DEFAULT_PRO_API_BASE : DEFAULT_PUBLIC_API_BASE)).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? Number(process.env.BITCOIN_STAKING_UPSTREAM_TIMEOUT_MS ?? "8000");
    this.cacheMs = options.cacheMs ?? Number(process.env.BITCOIN_STAKING_PRICE_CACHE_MS ?? "60000");
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? (() => new Date());
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || !Number.isFinite(this.cacheMs) || this.cacheMs < 0) {
      throw new ServiceError("INVALID_INPUT", "CoinGecko timeout and cache durations must be valid positive millisecond values.");
    }
    if (this.apiPlan === "pro" && !this.apiKey) {
      throw new ServiceError("INVALID_INPUT", "COINGECKO_API_KEY is required when COINGECKO_API_PLAN=pro.");
    }
  }

  sourceRef(retrievedAt = this.now().toISOString()): SourceRef {
    return {
      id: "coingecko-simple-price",
      title: "CoinGecko BTC and STX USD prices",
      url: `${this.apiBaseUrl}/simple/price?ids=bitcoin%2Cblockstack&vs_currencies=usd&include_last_updated_at=true`,
      sourceType: "market_data_api",
      dataStatus: "live",
      retrievedAt,
    };
  }

  async getCurrentUsdPrices(): Promise<CurrentUsdPrices> {
    const now = this.now();
    if (this.cached && now.getTime() < this.cached.expiresAt) return this.cached.value;

    const url = new URL(`${this.apiBaseUrl}/simple/price`);
    url.searchParams.set("ids", "bitcoin,blockstack");
    url.searchParams.set("vs_currencies", "usd");
    url.searchParams.set("include_last_updated_at", "true");
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.apiKey) headers[this.apiPlan === "pro" ? "x-cg-pro-api-key" : "x-cg-demo-api-key"] = this.apiKey;

    try {
      const response = await withTimeout(this.fetchFn(url, { headers }), this.timeoutMs, "CoinGecko price API");
      if (!response.ok) {
        throw new ServiceError("UPSTREAM_ERROR", `CoinGecko price API returned HTTP ${response.status}.`, response.status >= 500 || response.status === 429);
      }
      const parsed = PriceResponseSchema.parse(await response.json());
      const verifiedAt = now.toISOString();
      const value: CurrentUsdPrices = {
        provider: "CoinGecko",
        btcUsd: parsed.bitcoin.usd,
        stxUsd: parsed.blockstack.usd,
        coinIds: { btc: "bitcoin", stx: "blockstack" },
        marketUpdatedAt: {
          btc: new Date(parsed.bitcoin.last_updated_at * 1000).toISOString(),
          stx: new Date(parsed.blockstack.last_updated_at * 1000).toISOString(),
        },
        dataStatus: "live",
        sources: [this.sourceRef(verifiedAt)],
        assumptions: ["USD spot prices are CoinGecko Simple Price observations, not execution quotes or price forecasts."],
        verifiedAt,
      };
      this.cached = { expiresAt: now.getTime() + this.cacheMs, value };
      return value;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError("UPSTREAM_ERROR", `Unable to read CoinGecko prices: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }
}
