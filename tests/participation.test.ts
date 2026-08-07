import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { BitcoinStakingService } from "../src/service.js";
import { StacksProvider } from "../src/providers/stacks.js";
import { CoinGeckoPriceProvider } from "../src/providers/coingecko.js";
import { ManifestStore } from "../src/providers/manifest-store.js";
import { CustodyStore } from "../src/providers/custody-store.js";
import { ServiceError } from "../src/core/errors.js";
import { assessRoute } from "../src/core/recommendation.js";
import { ParticipantProfileSchema } from "../src/core/schemas.js";

class OfflineProvider extends StacksProvider {
  override async getProtocolStatus(): Promise<any> { const verifiedAt = "2026-08-06T12:00:00.000Z"; return { network: this.networkName, chainId: this.chainId, contractId: "SP000000000000000000002Q6VF78.pox-5", pox5Active: true, currentBurnchainBlockHeight: 960000, dataStatus: "live", sources: [this.sourceRef(verifiedAt)], assumptions: ["Offline fixture."], verifiedAt }; }
  override async listProtocolBonds(): Promise<any> { const verifiedAt = "2026-08-06T12:00:00.000Z"; return { network: this.networkName, pox5Active: true, currentBurnchainBlockHeight: 960000, scannedBondIndices: [0, 1, 2], bonds: [], dataStatus: "live", sources: [this.sourceRef(verifiedAt)], assumptions: ["Offline fixture."], verifiedAt }; }
  override async getBondSchedule(bondIndex: number): Promise<any> { const verifiedAt = "2026-08-06T12:00:00.000Z"; return { network: this.networkName, bondIndex, startRewardCycle: 141 + bondIndex * 2, startBurnHeight: 968400, currentBurnchainBlockHeight: 960000, remainingBurnBlocks: 8400, estimatedStartAt: "2026-10-03T20:00:00.000Z", estimateStatus: "approximate", estimateBasis: "Fixture.", dataStatus: "derived", sources: [this.sourceRef(verifiedAt)], assumptions: ["Fixture."], verifiedAt }; }
}
class FailingCustodyStore extends CustodyStore {
  override async readWithMetadata(): Promise<never> { throw new ServiceError("REGISTRY_UNAVAILABLE", "Custody registry offline.", true); }
}

class CountingProvider extends OfflineProvider {
  statusCalls = 0;
  bondCalls = 0;
  override async getProtocolStatus(): Promise<any> { this.statusCalls += 1; return super.getProtocolStatus(); }
  override async listProtocolBonds(): Promise<any> { this.bondCalls += 1; return super.listProtocolBonds(); }
}

const now = () => new Date("2026-08-06T12:00:00.000Z");
function service(date = now) { return new BitcoinStakingService({ stacks: new OfflineProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" }), testnetStacks: new OfflineProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" }), prices: new CoinGeckoPriceProvider({ now: date, fetchFn: async () => new Response(JSON.stringify({ bitcoin: { usd: 64_415, last_updated_at: 1_786_048_080 }, blockstack: { usd: 0.129774, last_updated_at: 1_786_048_080 } }), { status: 200, headers: { "content-type": "application/json" } }) }), now: date }); }

test("Genesis exposes the two stable route types without hard-coded current operators", async () => {
  const routes = await service().listBondParticipationRoutes({ bondId: "genesis-bond" });
  assert.deepEqual(routes.routes.map((route) => route.routeType), ["native_l1_direct", "sbtc_pool"]);
  const pools = routes.routes.filter((route) => route.routeType === "sbtc_pool");
  assert.equal(pools.length, 1);
  assert.equal(pools[0]?.routeType === "sbtc_pool" ? pools[0].poolOperator.id : null, "registry-managed");
  assert.equal(pools[0]?.routeType === "sbtc_pool" ? pools[0].lst : null, undefined);
});

test("testnet snapshot reuses its live reads and route-only flows avoid a full snapshot", async () => {
  const mainnet = new CountingProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" });
  const testnet = new CountingProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" });
  const svc = new BitcoinStakingService({
    stacks: mainnet,
    testnetStacks: testnet,
    prices: new CoinGeckoPriceProvider({ now, fetchFn: async () => new Response(JSON.stringify({ bitcoin: { usd: 64_415, last_updated_at: 1_786_048_080 }, blockstack: { usd: 0.129774, last_updated_at: 1_786_048_080 } }), { status: 200 }) }),
    now,
  });
  await svc.getMarketSnapshot({ network: "testnet" });
  assert.equal(testnet.statusCalls, 1);
  assert.equal(testnet.bondCalls, 1);
  assert.equal(mainnet.statusCalls, 0);
  assert.equal(mainnet.bondCalls, 0);
  await svc.compareStakingPaths({ goal: "earn_yield", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "approved", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", walletOrCustodian: "Leather", amountSats: "2500000000" });
  assert.equal(mainnet.statusCalls, 0);
  assert.equal(mainnet.bondCalls, 1);
});

test("large allowlisted BTC holder with approved custody is routed to direct L1", async () => {
  const result = await service().compareStakingPaths({ goal: "earn_yield", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "approved", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", walletOrCustodian: "Fordefi", amountSats: "2500000000" });
  assert.equal(result.assessments[0]?.routeType, "native_l1_direct");
  assert.equal(result.assessments[0]?.fit, "conditional");
  assert.ok(result.assessments[0]?.reasons.some((reason) => /Fordefi/i.test(reason)));
});

test("unknown whitelist and stale custody evidence cannot be recommended as current", async () => {
  const svc = service(); const bond = await svc.manifests.get("genesis-bond"); const direct = bond.participationRoutes.find((route) => route.routeType === "native_l1_direct")!; const custody = (await svc.custody.list()).paths;
  const profile = ParticipantProfileSchema.parse({ goal: "earn_yield", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "unknown", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", walletOrCustodian: "Leather", amountSats: "2500000000" });
  const assessment = assessRoute(bond, direct, profile, custody, new Date("2026-08-15T00:00:00.000Z"));
  assert.equal(assessment.effectiveAvailability, "needs_review");
  assert.equal(assessment.fit, "not_assessable");
  assert.ok(assessment.missingEvidence.some((item) => /Allowlist/i.test(item)));
});

test("overdue bundled registries fail closed when no current remote registry is available", async () => {
  const staleService = service(() => new Date("2026-08-15T00:00:00.000Z"));
  await assert.rejects(staleService.listCustodyPaths(), (error: unknown) => error instanceof ServiceError && error.code === "REGISTRY_UNAVAILABLE");
  await assert.rejects(staleService.listBonds(), (error: unknown) => error instanceof ServiceError && error.code === "REGISTRY_UNAVAILABLE");
});

test("smaller sBTC holder is routed to a registry-published pool while pool dependencies remain explicit", async () => {
  const result = await service().compareStakingPaths({ goal: "earn_yield", assetHeld: "sbtc", participantType: "individual", whitelistStatus: "not_approved", liquidityNeed: "unknown", bitcoinPathPreference: "open_to_sbtc", keyControlPreference: "self_controlled", amountSats: "1000000" });
  assert.equal(result.assessments[0]?.routeType, "sbtc_pool");
  assert.ok(result.assessments[0]?.missingEvidence.some((item) => /pool fee/i.test(item)));
  assert.ok(result.assessments[0]?.tradeoffs.some((item) => /pool operator/i.test(item)));
});

test("pool diligence survives custody-registry failure while direct fit remains evidence-gated", async () => {
  const svc = new BitcoinStakingService({
    custody: new FailingCustodyStore(),
    stacks: new OfflineProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" }),
    testnetStacks: new OfflineProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" }),
    prices: new CoinGeckoPriceProvider({ now, fetchFn: async () => { throw new Error("prices offline"); } }),
    now,
  });
  const pool = await svc.buildDiligenceReport({ bondId: "genesis-bond", routeId: "genesis-sbtc-pool", profile: { goal: "earn_yield", assetHeld: "sbtc", participantType: "individual", whitelistStatus: "not_approved", liquidityNeed: "unknown", bitcoinPathPreference: "open_to_sbtc", keyControlPreference: "self_controlled", amountSats: "1000000" } });
  assert.equal(pool.routeAssessments[0]?.assessment.routeType, "sbtc_pool");
  assert.notEqual(pool.routeAssessments[0]?.assessment.fit, "not_assessable");
  const direct = await svc.buildDiligenceReport({ bondId: "genesis-bond", routeId: "genesis-native-l1-direct", profile: { goal: "earn_yield", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "approved", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", amountSats: "2500000000", stxAvailable: "yes" } });
  assert.equal(direct.routeAssessments[0]?.assessment.fit, "not_assessable");
  assert.ok(direct.routeAssessments[0]?.assessment.missingEvidence.some((item) => /custody path/i.test(item)));
});

test("sBTC+STX input requirement changes the pool assessment", async () => {
  const svc = service(); const bond = await svc.manifests.get("genesis-bond"); const pool = bond.participationRoutes.find((route) => route.routeType === "sbtc_pool")!; const custody = (await svc.custody.list()).paths;
  assert.equal(pool.routeType, "sbtc_pool"); if (pool.routeType !== "sbtc_pool") return;
  const profile = ParticipantProfileSchema.parse({ goal: "earn_yield", assetHeld: "sbtc", participantType: "individual", whitelistStatus: "not_approved", liquidityNeed: "unknown", bitcoinPathPreference: "open_to_sbtc", keyControlPreference: "self_controlled", amountSats: "1000000" });
  const sbtcOnly = assessRoute(bond, pool, profile, custody, now());
  const both = assessRoute(bond, { ...pool, investorInputs: "sbtc_and_stx" }, profile, custody, now());
  assert.ok(sbtcOnly.reasons.some((item) => /without.*STX/i.test(item)));
  assert.ok(both.tradeoffs.some((item) => /both sBTC and STX/i.test(item)));
});

test("liquidity-seeking user sees stBTC conditionally and borrowing is not inferred", async () => {
  const liquid = await service().compareStakingPaths({ goal: "retain_flexibility", assetHeld: "sbtc", participantType: "individual", whitelistStatus: "unknown", liquidityNeed: "access_anytime", bitcoinPathPreference: "open_to_sbtc", keyControlPreference: "self_controlled" });
  const pool = liquid.assessments.find((item) => item.routeType === "sbtc_pool")!;
  assert.equal(pool.fit, "conditional");
  assert.ok(pool.missingEvidence.some((item) => /redemption and market-liquidity/i.test(item)));
  const borrowing = await service().compareStakingPaths({ goal: "borrow_without_selling", assetHeld: "sbtc", participantType: "individual", whitelistStatus: "unknown", liquidityNeed: "access_anytime", bitcoinPathPreference: "open_to_sbtc", keyControlPreference: "self_controlled" });
  assert.ok(borrowing.assessments.every((item) => item.fit === "no_match"));
  assert.ok(borrowing.assessments.some((item) => item.unsupportedRequirements.some((reason) => /named live lender/i.test(reason))));
});

test("L1-only plus borrowing returns no match", async () => {
  const result = await service().compareStakingPaths({ goal: "borrow_without_selling", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "approved", liquidityNeed: "access_anytime", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", walletOrCustodian: "Fireblocks" });
  assert.equal(result.recommendedRouteId, null);
  assert.ok(result.assessments.every((item) => item.fit === "no_match"));
});

test("confirmed BitGo non-support is a no-match rather than missing evidence", async () => {
  const result = await service().compareStakingPaths({ goal: "earn_yield", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "approved", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", walletOrCustodian: "BitGo", amountSats: "2500000000" });
  const direct = result.assessments.find((item) => item.routeType === "native_l1_direct")!;
  assert.equal(direct.fit, "no_match");
  assert.ok(direct.unsupportedRequirements.some((item) => /BitGo.*unsupported/i.test(item)));
  assert.ok(direct.missingEvidence.every((item) => !/BitGo/i.test(item)));
});

test("diligence never substitutes a different bond for an explicit identifier", async () => {
  const profile = { goal: "earn_yield" as const, assetHeld: "btc_l1" as const, participantType: "institution" as const, whitelistStatus: "approved" as const, liquidityNeed: "lock_until_maturity" as const, bitcoinPathPreference: "bitcoin_l1_only" as const, keyControlPreference: "custodian" as const };
  await assert.rejects(service().buildDiligenceReport({ bondId: "demo-native-bitcoin-bond", profile }), (error: unknown) => error instanceof Error && "code" in error && error.code === "NOT_FOUND");
  await assert.rejects(service().buildDiligenceReport({ bondIndex: 99, profile }), (error: unknown) => error instanceof Error && "code" in error && error.code === "NOT_FOUND");
});

test("diligence report includes bond, protocol, route, freshness, fit, and one action", async () => {
  const report = await service().buildDiligenceReport({ bondId: "genesis-bond", profile: { goal: "earn_yield", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "approved", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", walletOrCustodian: "Leather", amountSats: "2500000000" } });
  assert.equal(report.bondAvailability.scheduled, null);
  assert.match(report.commonProtocolEconomics.coverageBoundary, /Stacks PoX-5/i);
  assert.equal(report.routeAssessments.length, 2);
  assert.ok(report.nextDiligenceAction.length > 10);
  assert.ok(report.sources.length > 0);
  assert.ok(report.sources.some((source) => source.id === "custody-registry"));
  assert.equal(report.economics.status, "incomplete_economics");
  assert.equal(report.economics.scenario, null);
});

test("service defaults to the native route and labels bond-specific economics from scenario provenance", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "btc-route-default-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const bond = JSON.parse(await readFile(resolve("data/bonds/genesis-bond.json"), "utf8"));
  bond.participationRoutes.reverse();
  bond.economics.termsStatus = "bond_specific";
  bond.economics.rewardModel = "target_principal_rate";
  bond.economics.rewardAsset = "sBTC";
  bond.economics.targetRateBps = 300;
  bond.economics.managerFeeBps = 0;
  delete bond.economics.referenceModel;
  bond.timing.lockDurationDays = 180;
  await writeFile(join(directory, "bond.json"), JSON.stringify(bond));
  const svc = new BitcoinStakingService({
    manifests: new ManifestStore(directory, { now }),
    stacks: new OfflineProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" }),
    testnetStacks: new OfflineProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" }),
    prices: new CoinGeckoPriceProvider({ now, fetchFn: async () => { throw new Error("prices should not be fetched"); } }),
    now,
  });
  const scenario = await svc.simulateYield({ bondId: bond.id, principalSats: "100000000", btcPriceUsd: 60_000, stxPriceScenariosUsd: [0.2] });
  assert.equal(scenario.routeId, "genesis-native-l1-direct");
  const report = await svc.buildDiligenceReport({ bondId: bond.id, routeId: "genesis-native-l1-direct", profile: { goal: "earn_yield", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "approved", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", walletOrCustodian: "Leather", amountSats: "100000000", stxAvailable: "yes" } });
  assert.equal(report.economics.status, "bond_specific_projection");
  assert.equal(report.economics.scenario?.availability, "published_terms_scenario");
});

test("compatibility returns custody-registry provenance instead of empty bond-source matches", async () => {
  const result = await service().checkCompatibility({ bondId: "genesis-bond", provider: "Leather", keyControlPreference: "custodian" });
  assert.equal(result.status, "supported");
  assert.ok(result.sources.some((source) => source.id === "custody-registry"));
  assert.ok(result.sources.some((source) => source.id === "stacks-q2-2026"));
});
