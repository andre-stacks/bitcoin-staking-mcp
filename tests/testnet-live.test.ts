import assert from "node:assert/strict";
import test from "node:test";
import { StacksProvider } from "../src/providers/stacks.js";

test(
  "official PoX-5 testnet reports scheduled or active PoX-5 state",
  { skip: process.env.BITCOIN_STAKING_TESTNET_LIVE_TEST !== "1" },
  async () => {
    const provider = new StacksProvider({ network: "testnet" });
    const status = await provider.getProtocolStatus();
    const scan = await provider.listProtocolBonds();

    assert.equal(status.network, "testnet");
    assert.ok(status.pox5Active || status.pox5Scheduled);
    assert.ok(scan.pox5Active || scan.pox5Scheduled);
    if (scan.pox5Active) {
      assert.match(status.contractId, /\.pox-5$/);
      assert.ok(
        scan.bonds.every((bond) => bond.availability === "live_testnet_demo"),
      );
    } else {
      assert.ok(status.blocksUntilPox5Activation > 0);
      assert.equal(scan.bonds.length, 0);
    }
  },
);
