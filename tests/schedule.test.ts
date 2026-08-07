import assert from "node:assert/strict";
import test from "node:test";
import { bondPeriodToBurnHeight, bondPeriodToRewardCycle } from "@stacks/bitcoin-staking";

const poxInfo = {
  firstBurnchainBlockHeight: 666050,
  rewardCycleLength: 2100,
  contractVersions: [{ contractId: "SP000000000000000000002Q6VF78.pox-5", activationBurnchainBlockHeight: 960000, firstRewardCycleId: 141 }],
} as any;

test("PoX-5 bond periods map 0 to Cycle 141, 1 to Cycle 143, and 2 to Cycle 145", () => {
  assert.deepEqual([0, 1, 2].map((bondIndex) => bondPeriodToRewardCycle({ bondIndex, poxInfo })), [141, 143, 145]);
  assert.equal([0, 1, 2].some((bondIndex) => bondPeriodToRewardCycle({ bondIndex, poxInfo }) === 142), false);
  assert.equal(bondPeriodToBurnHeight({ bondIndex: 1, poxInfo }), 666050 + 143 * 2100);
});
