import assert from "node:assert/strict";
import test from "node:test";
import { ServiceError } from "../src/core/errors.js";
import { CoinGeckoPriceProvider } from "../src/providers/coingecko.js";

test("CoinGecko provider fetches BTC and STX prices with provenance and a short cache", async () => {
  let calls = 0;
  let requestedUrl = "";
  let requestedHeaders: Headers | undefined;
  const provider = new CoinGeckoPriceProvider({
    apiKey: "demo-key",
    apiPlan: "demo",
    cacheMs: 60_000,
    now: () => new Date("2026-08-06T20:30:00.000Z"),
    fetchFn: async (input, init) => {
      calls += 1;
      requestedUrl = String(input);
      requestedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        bitcoin: { usd: 64_415, last_updated_at: 1_786_048_080 },
        blockstack: { usd: 0.129774, last_updated_at: 1_786_048_080 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const first = await provider.getCurrentUsdPrices();
  const second = await provider.getCurrentUsdPrices();
  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.equal(first.btcUsd, 64_415);
  assert.equal(first.stxUsd, 0.129774);
  assert.equal(first.coinIds.stx, "blockstack");
  assert.match(requestedUrl, /ids=bitcoin%2Cblockstack/);
  assert.match(requestedUrl, /include_last_updated_at=true/);
  assert.equal(requestedHeaders?.get("x-cg-demo-api-key"), "demo-key");
  assert.equal(first.sources[0]?.sourceType, "market_data_api");
});

test("CoinGecko provider returns a typed retryable upstream error", async () => {
  const provider = new CoinGeckoPriceProvider({
    fetchFn: async () => new Response("rate limited", { status: 429 }),
  });
  await assert.rejects(
    provider.getCurrentUsdPrices(),
    (error: unknown) => error instanceof ServiceError && error.code === "UPSTREAM_ERROR" && error.retryable,
  );
});
