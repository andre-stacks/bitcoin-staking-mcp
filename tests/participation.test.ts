import assert from "node:assert/strict";
import test from "node:test";
import { BitcoinStakingService } from "../src/service.js";
import { StacksProvider } from "../src/providers/stacks.js";
import { CoinGeckoPriceProvider } from "../src/providers/coingecko.js";
import { assessRoute } from "../src/core/recommendation.js";
import { ParticipantProfileSchema } from "../src/core/schemas.js";

class OfflineProvider extends StacksProvider {
  override async getProtocolStatus(): Promise<any> { const verifiedAt = "2026-08-06T12:00:00.000Z"; return { network: this.networkName, chainId: this.chainId, contractId: "SP000000000000000000002Q6VF78.pox-5", pox5Active: true, currentBurnchainBlockHeight: 960000, dataStatus: "live", sources: [this.sourceRef(verifiedAt)], assumptions: ["Offline fixture."], verifiedAt }; }
  override async listProtocolBonds(): Promise<any> { const verifiedAt = "2026-08-06T12:00:00.000Z"; return { network: this.networkName, pox5Active: true, currentBurnchainBlockHeight: 960000, scannedBondIndices: [0, 1, 2], bonds: [], dataStatus: "live", sources: [this.sourceRef(verifiedAt)], assumptions: ["Offline fixture."], verifiedAt }; }
}

const now = () => new Date("2026-08-06T12:00:00.000Z");
function service(date = now) { return new BitcoinStakingService({ stacks: new OfflineProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" }), testnetStacks: new OfflineProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" }), prices: new CoinGeckoPriceProvider({ now: date, fetchFn: async () => new Response(JSON.stringify({ bitcoin: { usd: 64_415, last_updated_at: 1_786_048_080 }, blockstack: { usd: 0.129774, last_updated_at: 1_786_048_080 } }), { status: 200, headers: { "content-type": "application/json" } }) }), now: date }); }

test("Genesis exposes exactly the two approved routes and StackingDAO is the only pool", async () => {
  const routes = await service().listBondParticipationRoutes({ bondId: "genesis-bond-cycle-142" });
  assert.deepEqual(routes.routes.map((route) => route.routeType), ["native_l1_direct", "sbtc_pool"]);
  const pools = routes.routes.filter((route) => route.routeType === "sbtc_pool");
  assert.equal(pools.length, 1);
  assert.equal(pools[0]?.routeType === "sbtc_pool" ? pools[0].poolOperator.name : null, "StackingDAO");
  assert.equal(pools[0]?.routeType === "sbtc_pool" ? pools[0].lst?.tokenSymbol : null, "stBTC");
});

test("large allowlisted BTC holder with approved custody is routed to direct L1", async () => {
  const result = await service().compareStakingPaths({ goal: "earn_yield", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "approved", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", walletOrCustodian: "Fordefi", amountSats: "2500000000" });
  assert.equal(result.assessments[0]?.routeType, "native_l1_direct");
  assert.equal(result.assessments[0]?.fit, "conditional");
  assert.ok(result.assessments[0]?.reasons.some((reason) => /Fordefi/i.test(reason)));
});

test("unknown whitelist and stale custody evidence cannot be recommended as current", async () => {
  const svc = service(); const bond = await svc.manifests.get("genesis-bond-cycle-142"); const direct = bond.participationRoutes.find((route) => route.routeType === "native_l1_direct")!; const custody = (await svc.custody.list()).paths;
  const profile = ParticipantProfileSchema.parse({ goal: "earn_yield", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "unknown", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", walletOrCustodian: "Leather", amountSats: "2500000000" });
  const assessment = assessRoute(bond, direct, profile, custody, new Date("2026-08-15T00:00:00.000Z"));
  assert.equal(assessment.effectiveAvailability, "needs_review");
  assert.equal(assessment.fit, "not_assessable");
  assert.ok(assessment.missingEvidence.some((item) => /Allowlist/i.test(item)));
});

test("smaller sBTC holder is routed to StackingDAO while pool dependencies remain explicit", async () => {
  const result = await service().compareStakingPaths({ goal: "earn_yield", assetHeld: "sbtc", participantType: "individual", whitelistStatus: "not_approved", liquidityNeed: "unknown", bitcoinPathPreference: "open_to_sbtc", keyControlPreference: "self_controlled", amountSats: "1000000" });
  assert.equal(result.assessments[0]?.routeType, "sbtc_pool");
  assert.ok(result.assessments[0]?.missingEvidence.some((item) => /pool fee/i.test(item)));
  assert.ok(result.assessments[0]?.tradeoffs.some((item) => /pool operator/i.test(item)));
});

test("sBTC+STX input requirement changes the pool assessment", async () => {
  const svc = service(); const bond = await svc.manifests.get("genesis-bond-cycle-142"); const pool = bond.participationRoutes.find((route) => route.routeType === "sbtc_pool")!; const custody = (await svc.custody.list()).paths;
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

test("diligence report includes bond, protocol, route, freshness, fit, and one action", async () => {
  const report = await service().buildDiligenceReport({ bondId: "genesis-bond-cycle-142", profile: { goal: "earn_yield", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "approved", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", walletOrCustodian: "Leather", amountSats: "2500000000" } });
  assert.equal(report.bondAvailability.scheduled, "2026-08-26");
  assert.match(report.commonProtocolEconomics.coverageBoundary, /Stacks PoX-5/i);
  assert.equal(report.routeAssessments.length, 2);
  assert.ok(report.nextDiligenceAction.length > 10);
  assert.ok(report.sources.length > 0);
});
