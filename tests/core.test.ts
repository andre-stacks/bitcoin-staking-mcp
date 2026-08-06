import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ServiceError, withTimeout } from "../src/core/errors.js";
import { simulateYield } from "../src/core/economics.js";
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

test("yield calculation is deterministic and rounds down", async () => {
  const bond = await demoBond();
  const result = simulateYield(bond, {
    principalSats: "100000000",
    btcPriceUsd: 100_000,
    stxPriceScenariosUsd: [0.5, 1],
  });
  assert.equal(result.grossRewardSats, "2465753");
  assert.equal(result.feeSats, "0");
  assert.equal(result.netRewardSats, "2465753");
  assert.equal(result.priceScenarios.length, 2);
  assert.equal(result.priceScenarios[0]?.estimatedRewardValueUsd, 2465.753);
  assert.match(result.priceScenarios[1]?.note ?? "", /does not change BTC-denominated/);
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
