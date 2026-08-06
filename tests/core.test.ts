import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ServiceError, withTimeout } from "../src/core/errors.js";
import { simulateYield } from "../src/core/economics.js";
import { buildInstitutionalDiligence } from "../src/core/diligence.js";
import {
  BondManifestSchema,
  ParticipantProfileSchema,
  toJsonSafe,
} from "../src/core/schemas.js";
import {
  buildParticipationPlan,
  checkCompatibility,
  compareStakingPaths,
} from "../src/core/recommendation.js";

async function demoBond() {
  const raw = await readFile(resolve("data/bonds/demo-native-bitcoin-bond.json"), "utf8");
  return BondManifestSchema.parse(JSON.parse(raw));
}

test("manifest validates and demo status is explicit", async () => {
  const bond = await demoBond();
  assert.equal(bond.dataStatus, "demo");
  assert.match(bond.notes[0] ?? "", /DEMO ONLY/);
  assert.equal(bond.onChainBondIndex, undefined);
});

test("demo manifest without a demo source is rejected", async () => {
  const bond = await demoBond();
  assert.throws(() =>
    BondManifestSchema.parse({
      ...bond,
      sources: bond.sources.filter((source) => source.dataStatus !== "demo"),
    }),
  );
});

test("manifest compatibility claims cannot cite missing sources", async () => {
  const bond = await demoBond();
  assert.throws(() =>
    BondManifestSchema.parse({
      ...bond,
      compatibility: [
        {
          kind: "wallet",
          name: "Imaginary Wallet",
          status: "supported",
          evidence: "Unsupported assertion",
          sourceIds: ["source-that-does-not-exist"],
        },
      ],
    }),
  );
});

test("yield calculation is deterministic and rounds down", async () => {
  const bond = await demoBond();
  assert.equal(bond.economics.rewardAsset, "sBTC");
  const result = simulateYield(bond, {
    principalSats: "100000000",
    btcPriceUsd: 100_000,
    stxPriceScenariosUsd: [0.5, 1],
  });
  assert.equal(result.grossRewardSats, "2465753");
  assert.equal(result.feeSats, "0");
  assert.equal(result.netRewardSats, "2465753");
  assert.equal(result.dataStatus, "demo");
  assert.equal(result.inputDataStatus, "demo");
  assert.equal(result.availability, "demo_only_not_investable");
  assert.ok(result.assumptions.some((assumption) => /illustrative demo data/i.test(assumption)));
  assert.equal(result.priceScenarios.length, 2);
  assert.equal(result.priceScenarios[0]?.estimatedRewardValueUsd, 2465.753);
  assert.match(result.priceScenarios[1]?.note ?? "", /does not change sBTC-denominated/);
});

test("zero-rate scenario is valid and returns zero rewards", async () => {
  const bond = await demoBond();
  const result = simulateYield(bond, {
    principalSats: "100000000",
    annualRateBps: 0,
  });
  assert.equal(result.grossRewardSats, "0");
  assert.equal(result.netRewardSats, "0");
});

test("participant amount must be positive", () => {
  assert.throws(() =>
    ParticipantProfileSchema.parse({
      goal: "earn_yield",
      liquidityNeed: "lock_until_maturity",
      bitcoinPathPreference: "bitcoin_l1_only",
      keyControlPreference: "self_controlled",
      amountSats: "0",
    }),
  );
});

test("explicit fee assumption reduces net reward", async () => {
  const bond = await demoBond();
  const result = simulateYield(bond, { principalSats: "100000000", feeBps: 1000 });
  assert.equal(result.grossRewardSats, "2465753");
  assert.equal(result.feeSats, "246575");
  assert.equal(result.netRewardSats, "2219178");
});

test("unknown reward model refuses to calculate", async () => {
  const bond = await demoBond();
  assert.throws(
    () => simulateYield({ ...bond, economics: { ...bond.economics, rewardModel: "unknown" } }, { principalSats: "1" }),
    (error: unknown) => error instanceof ServiceError && error.code === "INSUFFICIENT_DATA",
  );
});

test("unknown compatibility remains unknown", async () => {
  const bond = await demoBond();
  const result = checkCompatibility(bond, "New Wallet", "self_controlled");
  assert.equal(result.status, "unknown");
  assert.match(result.evidence, /Unknown is not evidence/);
});

test("borrowing plus L1-only is not presented as a native bond fit", async () => {
  const bond = await demoBond();
  const profile = ParticipantProfileSchema.parse({
    goal: "borrow_without_selling",
    liquidityNeed: "access_anytime",
    bitcoinPathPreference: "bitcoin_l1_only",
    keyControlPreference: "self_controlled",
    amountSats: "100000000",
  });
  const comparison = compareStakingPaths(profile, bond.sources);
  assert.equal(comparison.paths[0]?.fit, "weak");
  assert.equal(comparison.paths[1]?.fit, "excluded_by_preference");
  const plan = buildParticipationPlan(bond, profile);
  assert.equal(plan.fit, "no_match");
  assert.ok(plan.unsupportedRequirements.some((item) => item.includes("Borrowing")));
});

test("long-term native yield profile receives a strong demo fit", async () => {
  const bond = await demoBond();
  const profile = ParticipantProfileSchema.parse({
    goal: "earn_yield",
    liquidityNeed: "lock_until_maturity",
    bitcoinPathPreference: "bitcoin_l1_only",
    keyControlPreference: "self_controlled",
    amountSats: "100000000",
    timeHorizonDays: 180,
  });
  const plan = buildParticipationPlan(bond, profile);
  assert.equal(plan.fit, "strong");
  assert.equal(plan.dataStatus, "demo");
});

test("bigints serialize as decimal strings", () => {
  assert.deepEqual(toJsonSafe({ amount: 42n }), { amount: "42" });
});

test("timeout errors are typed and retryable", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => undefined), 5, "test upstream"),
    (error: unknown) =>
      error instanceof ServiceError && error.code === "UPSTREAM_TIMEOUT" && error.retryable,
  );
});

const liveSource = {
  id: "testnet-live",
  title: "Testnet PoX API",
  url: "https://api.testnet-pox5.hiro.so/v2/pox",
  sourceType: "chain_api" as const,
  dataStatus: "live" as const,
};

const securityEntry = {
  topic: "audit_status",
  answer: "Published audit statement.",
  evidenceLevel: "published_security_statement",
  whatIsNotProven: ["Wallet integration is not proven."],
  verificationChecklist: ["Obtain the final report."],
};

test("diligence report refuses to infer a testnet bond before activation", () => {
  const profile = ParticipantProfileSchema.parse({
    goal: "earn_yield",
    liquidityNeed: "lock_until_maturity",
    bitcoinPathPreference: "bitcoin_l1_only",
    keyControlPreference: "self_controlled",
    amountSats: "100000000",
  });
  const result = buildInstitutionalDiligence({
    network: "testnet",
    profile,
    status: {
      network: "testnet",
      chainId: 2147483648,
      contractId: "ST000000000000000000002AMW42H.pox-4",
      pox5Active: false,
      pox5Scheduled: true,
      pox5ActivationBurnchainBlockHeight: 2702,
      blocksUntilPox5Activation: 80,
      firstPox5RewardCycle: 4,
      currentBurnchainBlockHeight: 2622,
      sources: [liveSource],
      assumptions: [],
      verifiedAt: "2026-08-06T18:00:00.000Z",
    },
    scan: {
      network: "testnet",
      pox5Active: false,
      pox5Scheduled: true,
      currentBurnchainBlockHeight: 2622,
      scannedBondIndices: [],
      bonds: [],
      sources: [liveSource],
      assumptions: ["No bond entries were inferred or synthesized."],
      verifiedAt: "2026-08-06T18:00:00.000Z",
    },
    securityEntries: [securityEntry],
    sources: [liveSource],
    verifiedAt: "2026-08-06T18:00:00.000Z",
  });

  assert.equal(result.assessmentStatus, "scheduled_activation");
  assert.equal(result.fit, "not_assessable");
  assert.equal(result.selectedBond, null);
  assert.match(result.bottomLine, /burn height 2702/);
});

test("configured protocol bond assessment uses exact target and paired-STX math", () => {
  const profile = ParticipantProfileSchema.parse({
    goal: "earn_yield",
    liquidityNeed: "lock_until_maturity",
    bitcoinPathPreference: "bitcoin_l1_only",
    keyControlPreference: "self_controlled",
    walletOrCustodian: "Leather",
    amountSats: "100000000",
  });
  const bond = {
    id: "protocol-testnet-bond-0",
    network: "testnet" as const,
    chainId: 2147483648,
    onChainBondIndex: 0,
    contractId: "ST000000000000000000002AMW42H.pox-5",
    protocolStatus: "open",
    registrationStatus: "open",
    startBurnHeight: 3600,
    blocksUntilStart: 900,
    startRewardCycle: 4,
    phases: [],
    targetRateBps: 500,
    stxValueRatio: "1000000",
    minUstxRatioBps: 8000,
    earlyUnlockBytes: "00",
    availability: "testnet_only_not_investable",
    sources: [liveSource],
    assumptions: [],
    verifiedAt: "2026-08-06T18:00:00.000Z",
  };
  const result = buildInstitutionalDiligence({
    network: "testnet",
    profile,
    status: {
      network: "testnet",
      chainId: 2147483648,
      contractId: "ST000000000000000000002AMW42H.pox-5",
      pox5Active: true,
      pox5Scheduled: false,
      pox5ActivationBurnchainBlockHeight: 2702,
      blocksUntilPox5Activation: 0,
      firstPox5RewardCycle: 4,
      currentBurnchainBlockHeight: 2710,
      sources: [liveSource],
      assumptions: [],
      verifiedAt: "2026-08-06T18:00:00.000Z",
    },
    scan: {
      network: "testnet",
      pox5Active: true,
      currentBurnchainBlockHeight: 2710,
      scannedBondIndices: [0],
      bonds: [bond],
      sources: [liveSource],
      assumptions: [],
      verifiedAt: "2026-08-06T18:00:00.000Z",
    },
    securityEntries: [securityEntry],
    sources: [liveSource],
    verifiedAt: "2026-08-06T18:00:00.000Z",
  });

  assert.equal(result.assessmentStatus, "configured_bond_assessed");
  assert.equal(result.fit, "conditional");
  assert.equal(result.economics.targetRewardPerCalculationSats, "100000");
  assert.equal(result.economics.annualizedTargetSats, "5000000");
  assert.equal(result.economics.pairedStxMinimumUstx, "800000000000");
  assert.equal(result.availability.investable, false);
  assert.ok(result.missingFacts.some((fact) => fact.includes("Leather")));
});
