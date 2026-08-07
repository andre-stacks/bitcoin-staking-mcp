import assert from "node:assert/strict";
import test from "node:test";
import {
  BOND_END_OFFSET_PERIODS,
  bondPeriodToBurnHeight,
  bondPeriodToRewardCycle,
  computeBondUnlockHeight,
} from "@stacks/bitcoin-staking";
import { POX5_BOND_LENGTH_CYCLES } from "../src/providers/stacks.js";

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

test("PoX-5 fixes each bond term at 12 reward cycles", () => {
  assert.equal(POX5_BOND_LENGTH_CYCLES, 12);
  assert.equal(BOND_END_OFFSET_PERIODS, 6);

  const bondIndex = 1;
  const startHeight = bondPeriodToBurnHeight({ bondIndex, poxInfo });
  const endHeight = bondPeriodToBurnHeight({
    bondIndex: bondIndex + BOND_END_OFFSET_PERIODS,
    poxInfo,
  });
  assert.equal(endHeight - startHeight, POX5_BOND_LENGTH_CYCLES * poxInfo.rewardCycleLength);
  assert.equal(
    computeBondUnlockHeight({ bondIndex, poxInfo }),
    endHeight - Math.floor(poxInfo.rewardCycleLength / 2),
  );
});
