import assert from "node:assert/strict";
import test from "node:test";
import { StacksProvider } from "../src/providers/stacks.js";

test(
  "live PoX smoke test",
  { skip: process.env.BITCOIN_STAKING_LIVE_TEST !== "1" },
  async () => {
    const result = await new StacksProvider().getProtocolStatus();
    assert.match(result.contractId, /\.pox-5$/);
    assert.equal(result.dataStatus, "live");
    assert.ok(result.currentBurnchainBlockHeight > 0);
    assert.ok(result.sources[0]?.url.endsWith("/v2/pox"));
  },
);
