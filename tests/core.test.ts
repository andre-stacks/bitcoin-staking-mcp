import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ServiceError, withTimeout } from "../src/core/errors.js";
import { simulateYield } from "../src/core/economics.js";
import { BondManifestSchema, ParticipantProfileSchema, normalizeBondManifest, routeEffectiveAvailability, toJsonSafe } from "../src/core/schemas.js";
import { getSecurityGuidance } from "../src/security.js";

async function bondFile(name: string) { return BondManifestSchema.parse(JSON.parse(await readFile(resolve(`data/bonds/${name}`), "utf8"))); }

test("early-exit guidance leads with the supported mechanism without reflexive caveats", () => {
  const entry = getSecurityGuidance("early_exit").entries[0];
  assert.match(entry.answer, /^PoX-5 supports an optional early-exit path before maturity\./);
  assert.match(entry.answer, /Whether it is available for a specific bond requires current bond and route confirmation/i);
  assert.match(entry.answer, /For a bond that enables it/i);
  assert.match(entry.answer, /submit an early-exit transaction on Stacks and approve it in your wallet/i);
  assert.match(entry.answer, /approve a Bitcoin transaction in your wallet to return the BTC to your address/i);
  assert.match(entry.answer, /security approval required by the bond/i);
  assert.match(entry.answer, /keep rewards already received/i);
  assert.match(entry.answer, /rewards remaining in the bond are forfeited/i);
  assert.match(entry.answer, /paired STX stays locked until the original unlock date/i);
  assert.match(entry.answer, /Normal Stacks and Bitcoin network fees apply/i);
  assert.doesNotMatch(entry.answer, /coordinated signing|co-signed|reclaim transaction|unlock material|signer set|2-of-2/i);
  assert.doesNotMatch(entry.answer, /^Early exit is available/i);
  assert.doesNotMatch(entry.answer, /but it is cooperative rather than an instant withdrawal/i);
});

test("Genesis v2 publishes stable direct L1 and registry-managed pool route types", async () => {
  const bond = await bondFile("genesis-bond.json");
  assert.equal(bond.schemaVersion, 2);
  assert.equal(bond.economics.rewardAsset, "unknown");
  assert.deepEqual(bond.participationRoutes.map((route) => route.routeType), ["native_l1_direct", "sbtc_pool"]);
  const pool = bond.participationRoutes[1];
  assert.equal(pool?.routeType, "sbtc_pool");
  if (pool?.routeType === "sbtc_pool") {
    assert.equal(pool.poolOperator.id, "registry-managed");
    assert.equal(pool.investorInputs, "sbtc_only");
    assert.equal(pool.lst, undefined);
  }
  assert.equal(bond.participationRoutes.some((route) => (route.routeType as string) === "liquid_staking_token"), false);
  assert.equal(bond.participationRoutes[0]?.routeType, "native_l1_direct");
  if (bond.participationRoutes[0]?.routeType === "native_l1_direct") {
    assert.equal(bond.participationRoutes[0].earlyExit.status, "unknown");
  }
});

test("v1 manifests normalize to one unconfirmed native-L1 v2 route", () => {
  const old = {
    schemaVersion: 1, id: "legacy-bond", title: "Legacy", description: "Legacy fixture", network: "testnet", lifecycleStatus: "upcoming", participationPath: "native_l1_btc", dataStatus: "published",
    timing: {}, economics: { rewardAsset: "unknown", rewardModel: "unknown" }, capacity: {},
    requirements: { allowlistRequired: true, pairedStxRequired: true, pairedStxMinimumValueRatioBps: 500, btcLocation: "bitcoin_l1", keyControl: "unknown", borrowingAgainstPosition: "unknown", earlyExit: "unknown" },
    compatibility: [], notes: ["Legacy."], sources: [{ id: "legacy", title: "Legacy", url: "https://example.com/legacy", sourceType: "public_manifest", dataStatus: "published" }], verifiedAt: "2026-08-06T00:00:00.000Z",
  };
  const normalized = normalizeBondManifest(old);
  assert.equal(normalized.schemaVersion, 2);
  assert.equal(normalized.participationRoutes.length, 1);
  assert.equal(normalized.participationRoutes[0]?.routeType, "native_l1_direct");
  assert.equal(normalized.productStatus, "unconfirmed");
  assert.deepEqual(normalized.verification, []);
  assert.deepEqual(normalized.participationRoutes[0]?.verification, []);
});

test("v1 normalization remains compatible when the legacy source is not an owner manifest", () => {
  const old = {
    schemaVersion: 1, id: "legacy-doc-bond", title: "Legacy docs", description: "Legacy fixture", network: "testnet", lifecycleStatus: "upcoming", participationPath: "native_l1_btc", dataStatus: "published",
    timing: {}, economics: { rewardAsset: "unknown", rewardModel: "unknown" }, capacity: {},
    requirements: { allowlistRequired: false, pairedStxRequired: false, btcLocation: "bitcoin_l1", keyControl: "unknown", borrowingAgainstPosition: "unknown", earlyExit: "unknown" },
    compatibility: [], notes: ["Legacy."], sources: [{ id: "legacy-doc", title: "Legacy documentation", url: "https://example.com/docs", sourceType: "official_docs", dataStatus: "published" }], verifiedAt: "2026-08-06T00:00:00.000Z",
  };
  const normalized = normalizeBondManifest(old);
  assert.deepEqual(normalized.verification, []);
  assert.equal(routeEffectiveAvailability(normalized.participationRoutes[0]!, new Date("2026-08-06T12:00:00.000Z")), "unknown");
});

test("overdue owner attestation is needs_review and never available", async () => {
  const bond = await bondFile("genesis-bond.json");
  assert.equal(routeEffectiveAvailability(bond.participationRoutes[0]!, new Date("2026-08-10T00:00:00.000Z")), "scheduled");
  assert.equal(routeEffectiveAvailability(bond.participationRoutes[0]!, new Date("2026-08-14T00:00:00.000Z")), "needs_review");
  assert.equal(routeEffectiveAvailability(bond.participationRoutes[0]!, new Date("2026-08-10T00:00:00.000Z"), true), "conflict");
});

test("demo route yield is deterministic and includes sourced zero fee", async () => {
  const bond = await bondFile("demo-native-bitcoin-bond.json");
  const route = bond.participationRoutes[0]!;
  const result = simulateYield(bond, route, { principalSats: "100000000", btcPriceUsd: 100_000 });
  assert.equal(result.grossRewardSats, "2465753");
  assert.equal(result.feeSats, "0");
  assert.equal(result.netRewardSats, "2465753");
  assert.equal(result.dataStatus, "demo");
});

test("pool and optional LST fees are applied sequentially", async () => {
  const bond = await bondFile("genesis-bond.json");
  const route = bond.participationRoutes.find((item) => item.routeType === "sbtc_pool")!;
  assert.equal(route.routeType, "sbtc_pool");
  if (route.routeType !== "sbtc_pool" || !route.lst) return;
  const complete = { ...route, feeBps: 1000, lst: { ...route.lst, feeBps: 500 } };
  const result = simulateYield({ ...bond, timing: { ...bond.timing, lockDurationDays: 365 } }, complete, { principalSats: "100000000", includeLst: true });
  assert.equal(result.grossRewardSats, "3000000");
  assert.equal(result.routeFeeSats, "300000");
  assert.equal(result.lstFeeSats, "135000");
  assert.equal(result.netRewardSats, "2565000");
});

test("unknown pool fee preserves gross economics while leaving net reward pending", async () => {
  const bond = await bondFile("genesis-bond.json");
  const pool = bond.participationRoutes.find((route) => route.routeType === "sbtc_pool")!;
  const result = simulateYield(bond, pool, { principalSats: "100000000", durationDays: 365, annualRateBps: 300 });
  assert.ok(result.grossRewardSats);
  assert.equal(result.routeFeeBps, null);
  assert.equal(result.netRewardSats, undefined);
  assert.match(result.netRewardDisplay, /pending applicable fees/i);
});

test("Genesis yield requires explicitly sourced terms instead of bundled current economics", async () => {
  const bond = await bondFile("genesis-bond.json");
  const direct = bond.participationRoutes.find((route) => route.routeType === "native_l1_direct")!;
  const result = simulateYield(bond, direct, {
    principalSats: "2500000000",
    durationDays: 365,
    annualRateBps: 300,
    feeBps: 0,
    btcPriceUsd: 100_000,
    stxPriceScenariosUsd: [1, 2.5],
  });
  assert.equal(result.projectionPeriod, "specified_duration");
  assert.equal(result.durationDays, 365);
  assert.equal(result.annualRateBps, 300);
  assert.equal(result.grossRewardBtc, "0.750");
  assert.equal(result.grossRewardBtcExact, "0.75");
  assert.equal(result.grossRewardDisplay, "0.750 BTC");
  assert.equal(result.netRewardSats, result.grossRewardSats);
  assert.equal(result.pairedStxRequirement, null);
  assert.equal(result.modelContext, null);
  assert.ok(result.assumptions.some((item) => /explicitly supplied/i.test(item)));
});

test("participant amount must be positive", () => {
  assert.throws(() => ParticipantProfileSchema.parse({ goal: "earn_yield", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "self_controlled", amountSats: "0" }));
});

test("bigints serialize as decimal strings", () => { assert.deepEqual(toJsonSafe({ value: 2n }), { value: "2" }); });
test("timeout errors are typed and retryable", async () => { await assert.rejects(withTimeout(new Promise(() => undefined), 5, "fixture"), (error: unknown) => error instanceof ServiceError && error.code === "UPSTREAM_TIMEOUT" && error.retryable); });
