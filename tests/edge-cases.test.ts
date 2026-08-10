import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ServiceError } from "../src/core/errors.js";
import { simulateYield } from "../src/core/economics.js";
import { assessRoute } from "../src/core/recommendation.js";
import {
  BondManifestSchema,
  CustodyRegistrySchema,
  ParticipantProfileSchema,
  btcAmountToSats,
  normalizeParticipantProfileAmount,
  routeEffectiveAvailability,
} from "../src/core/schemas.js";

async function genesis(): Promise<any> {
  return BondManifestSchema.parse(JSON.parse(await readFile(resolve("data/bonds/genesis-bond.json"), "utf8")));
}

async function custody(): Promise<any[]> {
  return CustodyRegistrySchema.parse(JSON.parse(await readFile(resolve("data/custody-paths.json"), "utf8"))).paths;
}

function expectsCode(code: string) {
  return (error: unknown) => error instanceof ServiceError && error.code === code;
}

test("natural BTC and sBTC amounts convert exactly and conflicting representations are rejected", () => {
  assert.equal(btcAmountToSats("1 BTC"), "100000000");
  assert.equal(btcAmountToSats("0.00000001 sBTC"), "1");
  assert.throws(() => btcAmountToSats("1.123456789"), /at most eight fractional digits/);
  const normalized = normalizeParticipantProfileAmount(ParticipantProfileSchema.parse({
    goal: "compare_options", liquidityNeed: "unknown", bitcoinPathPreference: "compare_both",
    keyControlPreference: "either", amountBtc: "12.34567890 BTC",
  }));
  assert.equal(normalized.amountSats, "1234567890");
  assert.throws(() => ParticipantProfileSchema.parse({ goal: "compare_options", liquidityNeed: "unknown", bitcoinPathPreference: "compare_both", keyControlPreference: "either", amountBtc: "1 BTC", amountSats: "2" }));
  assert.throws(() => ParticipantProfileSchema.parse({ goal: "compare_options", liquidityNeed: "unknown", bitcoinPathPreference: "compare_both", keyControlPreference: "either", amountBtc: "0.000000001 BTC" }));
});

test("bond schema rejects duplicate evidence, invalid attestation sources, and impossible timing", async () => {
  const duplicate = await genesis();
  duplicate.sources.push(structuredClone(duplicate.sources[0]));
  assert.equal(BondManifestSchema.safeParse(duplicate).success, false);

  const badAttestation = await genesis();
  badAttestation.attestation.sourceIds = ["sip-045"];
  assert.equal(BondManifestSchema.safeParse(badAttestation).success, false);

  const timing = await genesis();
  timing.timing.opensAt = "2026-08-20T00:00:00.000Z";
  timing.timing.closesAt = "2026-08-19T00:00:00.000Z";
  assert.equal(BondManifestSchema.safeParse(timing).success, false);
});

test("bond schema rejects invalid limits, paired-STX terms, reward fields, and contract networks", async () => {
  const directLimits = await genesis();
  Object.assign(directLimits.participationRoutes[0], { minimumSats: "200", maximumSats: "100" });
  assert.equal(BondManifestSchema.safeParse(directLimits).success, false);

  const paired = await genesis();
  paired.participationRoutes[0].pairedStx.required = true;
  delete paired.participationRoutes[0].pairedStx.minimumValueRatioBps;
  assert.equal(BondManifestSchema.safeParse(paired).success, false);

  const fixed = await genesis();
  fixed.economics.rewardModel = "fixed_reward_units";
  delete fixed.economics.fixedRewardUnits;
  assert.equal(BondManifestSchema.safeParse(fixed).success, false);

  const duplicateRewardOptions = await genesis();
  duplicateRewardOptions.economics.rewardAssetOptions = ["sBTC", "sBTC"];
  assert.equal(BondManifestSchema.safeParse(duplicateRewardOptions).success, false);

  const mismatchedRewardAsset = await genesis();
  mismatchedRewardAsset.economics.rewardAsset = "sBTC";
  mismatchedRewardAsset.economics.rewardAssetOptions = ["BTC"];
  assert.equal(BondManifestSchema.safeParse(mismatchedRewardAsset).success, false);

  const contract = await genesis();
  contract.participationRoutes[1].contracts = [{ role: "pool", contractId: "ST000000000000000000002AMW42H.pool", network: "devnet" }];
  assert.equal(BondManifestSchema.safeParse(contract).success, false);
});

test("open routes cannot omit usability-critical enrollment and pool evidence", async () => {
  const direct = await genesis();
  Object.assign(direct.participationRoutes[0], { productStatus: "production", enrollmentStatus: "open" });
  delete direct.participationRoutes[0].enrollment.url;
  assert.equal(BondManifestSchema.safeParse(direct).success, false, "open direct route needs an enrollment URL");

  const pool = await genesis();
  Object.assign(pool.participationRoutes[1], { productStatus: "production", enrollmentStatus: "open" });
  assert.equal(BondManifestSchema.safeParse(pool).success, false, "open pool needs contracts, fee, verified accounting/withdrawal, and enrollment URL");

  const plannedLst = await genesis();
  const plannedPool = plannedLst.participationRoutes[1];
  assert.equal(plannedPool.routeType, "sbtc_pool");
  if (plannedPool.routeType === "sbtc_pool") assert.equal(plannedPool.lst?.productStatus, "in_progress", "planned LST claims must remain distinct from live integrations");
});

test("bundled Genesis distinguishes planned stBTC use from live borrowing integrations", async () => {
  const bond = await genesis();
  const pool = bond.participationRoutes[1];
  assert.equal(pool.routeType, "sbtc_pool");
  if (pool.routeType !== "sbtc_pool") return;
  assert.equal(pool.lst?.tokenSymbol, "stBTC");
  assert.equal(pool.lst?.productStatus, "in_progress");
  assert.deepEqual(pool.lst?.supportedMarkets, ["Zest Protocol (planned)"]);
  assert.deepEqual(pool.lst?.verifiedDefiIntegrations, []);
});

test("availability dimensions handle exact freshness boundary and every terminal state", async () => {
  const bond = await genesis();
  const route = bond.participationRoutes[0];
  const due = new Date("2026-08-16T00:00:00.000Z");
  assert.equal(routeEffectiveAvailability(route, due), "scheduled");
  assert.equal(routeEffectiveAvailability(route, new Date(due.getTime() + 1)), "needs_review");
  assert.equal(routeEffectiveAvailability(route, due, true), "conflict");
  assert.equal(routeEffectiveAvailability({ ...route, productStatus: "blocked" }, due), "unavailable");
  assert.equal(routeEffectiveAvailability({ ...route, productStatus: "production", enrollmentStatus: "open" }, due), "available");
  assert.equal(routeEffectiveAvailability({ ...route, productStatus: "tested", enrollmentStatus: "unknown" }, due), "unknown");
});

test("yield requires rate and duration, while unknown fees leave net economics pending", async () => {
  const bond = await genesis();
  const direct = bond.participationRoutes[0];
  const pool = bond.participationRoutes[1];
  const poolWithoutFee = simulateYield(bond, pool, { principalSats: "100000000", durationDays: 365, annualRateBps: 300 });
  assert.ok(poolWithoutFee.grossRewardSats);
  assert.equal(poolWithoutFee.netRewardSats, undefined);
  assert.throws(() => simulateYield(bond, direct, { principalSats: "100000000", feeBps: 0, includeLst: true }), expectsCode("INVALID_INPUT"));
  const poolWithUnknownLstFee = simulateYield(bond, { ...pool, feeBps: 0 }, { principalSats: "100000000", durationDays: 365, annualRateBps: 300, includeLst: true });
  assert.equal(poolWithUnknownLstFee.netRewardSats, undefined);

  const noDuration = structuredClone(bond);
  delete noDuration.economics.referenceModel;
  assert.throws(() => simulateYield(noDuration, noDuration.participationRoutes[0], { principalSats: "1", feeBps: 0 }), expectsCode("INSUFFICIENT_DATA"));

  const noRate = structuredClone(bond);
  delete noRate.economics.targetRateBps;
  delete noRate.economics.referenceModel;
  noRate.timing.lockDurationDays = 30;
  assert.throws(() => simulateYield(noRate, noRate.participationRoutes[0], { principalSats: "1", feeBps: 0 }), expectsCode("INSUFFICIENT_DATA"));
});

test("yield applies sequential fees deterministically across zero, full-fee, and maximum-supply principals", async () => {
  const bond = await genesis();
  const pool = { ...bond.participationRoutes[1], feeBps: 1_000, lst: { ...bond.participationRoutes[1].lst, feeBps: 500 } };
  const result = simulateYield(bond, pool, { principalBtc: "1 BTC", durationDays: 365, annualRateBps: 1_000, includeLst: true });
  assert.equal(result.grossRewardSats, "10000000");
  assert.equal(result.routeFeeSats, "1000000");
  assert.equal(result.lstFeeSats, "450000");
  assert.equal(result.netRewardSats, "8550000");

  const fullFee = simulateYield(bond, bond.participationRoutes[0], { principalSats: "100000000", durationDays: 365, annualRateBps: 1_000, feeBps: 10_000 });
  assert.equal(fullFee.netRewardSats, "0");
  const huge = simulateYield(bond, bond.participationRoutes[0], { principalSats: "2100000000000000", durationDays: 365, annualRateBps: 1, feeBps: 0 });
  assert.doesNotMatch(huge.grossRewardDisplay, /Infinity|NaN/);
  assert.throws(() => simulateYield(bond, bond.participationRoutes[0], { principalSats: "2100000000000001", durationDays: 365, annualRateBps: 1, feeBps: 0 }), expectsCode("INVALID_INPUT"));
});

test("yield rejects conflicting principal forms, zero principal, and out-of-range economics", async () => {
  const bond = await genesis();
  const direct = bond.participationRoutes[0];
  assert.throws(() => simulateYield(bond, direct, { principalSats: "1", principalBtc: "1 BTC", feeBps: 0 }), expectsCode("INVALID_INPUT"));
  assert.throws(() => simulateYield(bond, direct, { principalSats: "0", feeBps: 0 }), expectsCode("INVALID_INPUT"));
  assert.throws(() => simulateYield(bond, direct, { principalSats: "1", durationDays: 365, annualRateBps: 300, feeBps: 10_001 }), expectsCode("INVALID_INPUT"));
  assert.throws(() => simulateYield(bond, direct, { principalSats: "1", durationDays: 365, feeBps: 0, annualRateBps: 100_001 }), expectsCode("INVALID_INPUT"));
  assert.throws(() => simulateYield(bond, direct, { principalSats: "1", feeBps: 0, btcPriceUsd: Number.POSITIVE_INFINITY }), expectsCode("INVALID_INPUT"));
  assert.throws(() => simulateYield(bond, direct, { principalBtc: "1.123456789", feeBps: 0 }), expectsCode("INVALID_INPUT"));
});

test("direct-route fit enforces paired STX, amount boundaries, and a current custody path", async () => {
  const bond = await genesis();
  const route = { ...bond.participationRoutes[0], productStatus: "production", enrollmentStatus: "open", minimumSats: "100", maximumSats: "200", pairedStx: { required: true, minimumValueRatioBps: 500 } };
  const paths = await custody();
  const base = { goal: "earn_yield", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "approved", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", walletOrCustodian: "Leather" } as const;
  const noStx = assessRoute(bond, route, ParticipantProfileSchema.parse({ ...base, amountSats: "100", stxAvailable: "no" }), paths, new Date("2026-08-09T12:00:00.000Z"));
  assert.equal(noStx.fit, "no_match");
  const exactMax = assessRoute(bond, route, ParticipantProfileSchema.parse({ ...base, amountSats: "200", stxAvailable: "yes" }), paths, new Date("2026-08-09T12:00:00.000Z"));
  assert.notEqual(exactMax.fit, "no_match");
  assert.ok(exactMax.tradeoffs.includes("BTC is timelocked on L1 and paired STX is required."));
  assert.ok(exactMax.tradeoffs.every((tradeoff) => !/may be required/i.test(tradeoff)));
  const above = assessRoute(bond, route, ParticipantProfileSchema.parse({ ...base, amountSats: "201", stxAvailable: "yes" }), paths, new Date("2026-08-09T12:00:00.000Z"));
  assert.equal(above.fit, "no_match");
  const noCustody = assessRoute(bond, route, ParticipantProfileSchema.parse({ ...base, amountSats: "150", stxAvailable: "yes" }), [], new Date("2026-08-09T12:00:00.000Z"));
  assert.equal(noCustody.fit, "not_assessable");
  const sbtcOnly = assessRoute(bond, route, ParticipantProfileSchema.parse({ ...base, assetHeld: "sbtc", amountSats: "150", stxAvailable: "yes" }), paths, new Date("2026-08-09T12:00:00.000Z"));
  assert.equal(sbtcOnly.fit, "no_match");
  assert.ok(sbtcOnly.unsupportedRequirements.some((item) => /native BTC/.test(item)));
  assert.ok(sbtcOnly.reasons.every((item) => !/preserves/.test(item)));
});

test("sBTC+STX pools distinguish yes, no, and unknown STX availability", async () => {
  const bond = await genesis();
  const pool = { ...bond.participationRoutes[1], productStatus: "production", enrollmentStatus: "open", investorInputs: "sbtc_and_stx", feeBps: 0, contracts: [{ role: "pool", contractId: "SP000000000000000000002Q6VF78.pool", network: "mainnet" }], rewardAccounting: { ...bond.participationRoutes[1].rewardAccounting, status: "verified" }, withdrawalTerms: { ...bond.participationRoutes[1].withdrawalTerms, status: "verified" }, enrollmentUrl: "https://example.com/enroll" };
  const base = { goal: "earn_yield", assetHeld: "sbtc", participantType: "individual", whitelistStatus: "not_approved", liquidityNeed: "unknown", bitcoinPathPreference: "open_to_sbtc", keyControlPreference: "self_controlled", amountSats: "1000" } as const;
  const paths = await custody();
  assert.equal(assessRoute(bond, pool, ParticipantProfileSchema.parse({ ...base, stxAvailable: "no" }), paths, new Date("2026-08-09T12:00:00.000Z")).fit, "no_match");
  assert.equal(assessRoute(bond, pool, ParticipantProfileSchema.parse({ ...base, stxAvailable: "unknown" }), paths, new Date("2026-08-09T12:00:00.000Z")).fit, "conditional");
  assert.equal(assessRoute(bond, pool, ParticipantProfileSchema.parse({ ...base, stxAvailable: "yes" }), paths, new Date("2026-08-09T12:00:00.000Z")).fit, "strong");
});
