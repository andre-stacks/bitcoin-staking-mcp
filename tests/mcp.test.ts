import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { ServiceError } from "../src/core/errors.js";
import { CONTRACT_VERSION, EXPECTED_TOOL_NAMES, SERVER_VERSION, SKILL_VERSION, createBitcoinStakingMcpServer } from "../src/mcp/server.js";
import { StacksProvider } from "../src/providers/stacks.js";
import { CoinGeckoPriceProvider } from "../src/providers/coingecko.js";
import { ManifestStore } from "../src/providers/manifest-store.js";
import { BitcoinStakingService } from "../src/service.js";
import { SuccessfulToolOutputSchemas, YieldOutputSchema } from "../src/mcp/output-schemas.js";

async function connectedClient(service?: BitcoinStakingService) { const server = createBitcoinStakingMcpServer(service); const client = new Client({ name: "tests", version: "0.1.0" }, { capabilities: {}, versionNegotiation: { mode: "legacy" } }); const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair(); await server.connect(serverTransport); await client.connect(clientTransport); return { client, server }; }

class OfflineProvider extends StacksProvider {
  statusReads = 0;
  bondScanReads = 0;
  override async getProtocolStatus(): Promise<any> { this.statusReads += 1; const verifiedAt = "2026-08-06T19:00:00.000Z"; return { network: this.networkName, chainId: this.chainId, contractId: this.networkName === "mainnet" ? "SP000000000000000000002Q6VF78.pox-5" : "ST000000000000000000002AMW42H.pox-5", pox5Active: true, pox5Scheduled: false, currentBurnchainBlockHeight: 10, dataStatus: "live", sources: [this.sourceRef(verifiedAt)], assumptions: ["Offline fixture."], verifiedAt }; }
  override async listProtocolBonds(): Promise<any> { this.bondScanReads += 1; const verifiedAt = "2026-08-06T19:00:00.000Z"; return { network: this.networkName, pox5Active: true, currentBurnchainBlockHeight: 10, scannedBondIndices: [0, 1, 2], bonds: [], dataStatus: "live", sources: [this.sourceRef(verifiedAt)], assumptions: ["Offline fixture."], verifiedAt }; }
  override async getOnChainBond(): Promise<any> { return undefined; }
  override async getBondSchedule(bondIndex: number): Promise<any> { const verifiedAt = "2026-08-06T19:00:00.000Z"; return { network: this.networkName, bondIndex, startRewardCycle: 141 + bondIndex * 2, startBurnHeight: 100 + bondIndex * 4200, currentBurnchainBlockHeight: 10, remainingBurnBlocks: 4290, estimatedStartAt: "2026-09-05T14:00:00.000Z", estimateStatus: "approximate", estimateBasis: "Fixture using Bitcoin's ten-minute target.", dataStatus: "derived", sources: [this.sourceRef(verifiedAt)], assumptions: ["Fixture."], verifiedAt }; }
  override async getParticipantStatus(address: string): Promise<any> { const verifiedAt = "2026-08-06T19:00:00.000Z"; return { address, network: this.networkName, accountStatus: null, stakerInfo: null, bondMembership: null, bondAllowanceSats: null, requestedBondId: null, requestedBondDataStatus: null, dataStatus: "live", sources: [this.sourceRef(verifiedAt)], assumptions: ["Offline fixture."], verifiedAt }; }
}
class FailingProvider extends OfflineProvider { override async getProtocolStatus(): Promise<any> { throw new ServiceError("UPSTREAM_ERROR", "Live network unavailable.", true); } }
const offlineNow = () => new Date("2026-08-06T19:00:00.000Z");
function offlinePrices() { return new CoinGeckoPriceProvider({ now: offlineNow, fetchFn: async () => new Response(JSON.stringify({ bitcoin: { usd: 64_415, last_updated_at: 1_786_048_080 }, blockstack: { usd: 0.129774, last_updated_at: 1_786_048_080 } }), { status: 200, headers: { "content-type": "application/json" } }) }); }
function offlineService(provider: StacksProvider = new OfflineProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" })) { return new BitcoinStakingService({ stacks: provider, testnetStacks: new OfflineProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" }), prices: offlinePrices(), now: offlineNow }); }
const profile = { goal: "earn_yield", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "approved", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", walletOrCustodian: "Leather", amountSats: "100000000" } as const;

test("MCP exposes the complete 15-tool read-only production contract", async (context) => {
  const { client, server } = await connectedClient(offlineService()); context.after(async () => { await client.close(); await server.close(); });
  const { tools } = await client.listTools(); assert.deepEqual(tools.map((tool) => tool.name), [...EXPECTED_TOOL_NAMES]);
  for (const tool of tools) { assert.equal(tool.annotations?.readOnlyHint, true); assert.equal(tool.annotations?.destructiveHint, false); assert.ok(tool.outputSchema); }
  const liveRegistryReads = new Set(["get_market_snapshot", "get_protocol_status", "list_protocol_bonds", "build_diligence_report", "list_bonds", "list_custody_paths", "list_bond_participation_routes", "get_bond", "check_participant_status", "check_compatibility", "simulate_yield", "compare_staking_paths", "build_participation_plan", "search_current_facts"]);
  for (const tool of tools) assert.equal(tool.annotations?.openWorldHint, liveRegistryReads.has(tool.name), `${tool.name} openWorldHint`);
});

test("catalog search rejects unknown status filters before querying the registry", async (context) => {
  const { client, server } = await connectedClient(offlineService()); context.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: "search_current_facts", arguments: { status: "definitely-not-a-status" } });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /status|invalid/i);
});

test("market snapshot grounds the first turn in two routes", async (context) => {
  const { client, server } = await connectedClient(offlineService()); context.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: "get_market_snapshot", arguments: { network: "mainnet" } });
  assert.equal(result.isError, undefined); const content = result.structuredContent as any;
  assert.deepEqual(content.routes.map((route: any) => route.routeType), ["native_l1_direct", "sbtc_pool"]);
  assert.equal(content.bonds[0].protocolSchedule.startRewardCycle, 143);
  assert.match(content.precedence, /on-chain.*outranks owner/i);
  assert.ok(content.sources.some((source: any) => source.id === "custody-registry"));
});

test("testnet diligence returns a protocol-only preview through MCP without duplicate chain reads", async (context) => {
  const testnet = new OfflineProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" });
  const service = new BitcoinStakingService({
    stacks: new OfflineProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" }),
    testnetStacks: testnet,
    prices: offlinePrices(),
    now: offlineNow,
  });
  const { client, server } = await connectedClient(service); context.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: "build_diligence_report", arguments: { network: "testnet", profile } });
  assert.equal(result.isError, undefined, JSON.stringify(result.content));
  const content = SuccessfulToolOutputSchemas.build_diligence_report.parse(result.structuredContent);
  assert.equal(content.assessmentStatus, "network_protocol_preview");
  assert.equal(content.economics.status, "not_available");
  assert.equal(content.operationalFit, "not_assessable");
  assert.deepEqual(content.routeAssessments, []);
  assert.match(content.bondAvailability.coverageBoundary, /does not establish product availability/i);
  assert.equal(testnet.statusReads, 1);
  assert.equal(testnet.bondScanReads, 1);
});

test("every tool validates structured output and exposes no transaction fields", async (context) => {
  const { client, server } = await connectedClient(offlineService()); context.after(async () => { await client.close(); await server.close(); });
  const calls = [
    { name: "get_market_snapshot", arguments: { network: "mainnet" } }, { name: "get_protocol_status", arguments: { network: "mainnet" } }, { name: "list_protocol_bonds", arguments: { network: "testnet" } },
    { name: "get_security_guidance", arguments: { topic: "audit_status" } }, { name: "build_diligence_report", arguments: { bondId: "genesis-bond", profile } },
    { name: "list_bonds", arguments: { includeDemo: true } }, { name: "list_custody_paths", arguments: {} }, { name: "list_bond_participation_routes", arguments: { bondId: "genesis-bond" } },
    { name: "get_bond", arguments: { bondId: "genesis-bond" } }, { name: "check_participant_status", arguments: { address: "SP000000000000000000002Q6VF78" } },
    { name: "check_compatibility", arguments: { bondId: "genesis-bond", provider: "Leather", keyControlPreference: "custodian" } },
    { name: "simulate_yield", arguments: { bondId: "genesis-bond", routeId: "genesis-native-l1-direct", principalSats: "100000000", durationDays: 365, annualRateBps: 300, feeBps: 0 } },
    { name: "compare_staking_paths", arguments: profile }, { name: "build_participation_plan", arguments: { bondId: "genesis-bond", profile } },
    { name: "search_current_facts", arguments: { category: "product", limit: 10 } },
  ];
  for (const call of calls) { const result = await client.callTool(call); assert.equal(result.isError, undefined, `${call.name}: ${JSON.stringify(result.content)}`); SuccessfulToolOutputSchemas[call.name as keyof typeof SuccessfulToolOutputSchemas].parse(result.structuredContent); const serialized = JSON.stringify(result.structuredContent); assert.doesNotMatch(serialized, /"(?:psbt|rawTransaction|signedTransaction|signature|broadcastPayload)"\s*:/i); }
});

test("yield uses live CoinGecko prices and three-decimal quantity displays", async (context) => {
  const { client, server } = await connectedClient(offlineService()); context.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: "simulate_yield", arguments: { bondId: "genesis-bond", routeId: "genesis-native-l1-direct", principalSats: "2500000000", durationDays: 365, annualRateBps: 300 } });
  assert.equal(result.isError, undefined);
  const content = result.structuredContent as any;
  assert.equal(content.priceSnapshot.provider, "CoinGecko");
  assert.equal(content.priceSnapshot.btcUsd, 64_415);
  assert.equal(content.priceSnapshot.stxUsd, 0.129774);
  assert.equal(content.priceSnapshot.display.stxUsd, "$0.130");
  assert.equal(content.pairedStxRequirement, null);
  assert.equal(content.grossRewardDisplay, "0.750 BTC");
  assert.equal(content.netRewardSats, undefined);
  assert.ok(content.assumptions.some((assumption: string) => /CoinGecko Simple Price observations/i.test(assumption)));
  assert.ok(content.assumptions.every((assumption: string) => !/price enrichment was unavailable/i.test(assumption)));
  assert.ok(content.sources.some((source: any) => source.id === "coingecko-simple-price"));
});

test("yield returns gross economics when fees and optional price enrichment are unavailable", async (context) => {
  let priceRequests = 0;
  const prices = new CoinGeckoPriceProvider({ now: offlineNow, fetchFn: async () => { priceRequests += 1; throw new Error("prices offline"); } });
  const service = new BitcoinStakingService({ stacks: new OfflineProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" }), testnetStacks: new OfflineProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" }), prices, now: offlineNow });
  const { client, server } = await connectedClient(service); context.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: "simulate_yield", arguments: { bondId: "genesis-bond", routeId: "genesis-sbtc-pool", principalBtc: "1 sBTC", durationDays: 365, annualRateBps: 300 } });
  assert.equal(result.isError, undefined);
  const content = result.structuredContent as any;
  assert.ok(content.grossRewardSats);
  assert.equal(content.netRewardSats, undefined);
  assert.equal(content.priceSnapshot.usage, "unavailable");
  assert.equal(priceRequests, 1);
});

test("optional price failure does not invalidate a complete deterministic sats calculation", async (context) => {
  const prices = new CoinGeckoPriceProvider({ now: offlineNow, fetchFn: async () => { throw new Error("prices offline"); } });
  const service = new BitcoinStakingService({ stacks: new OfflineProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" }), testnetStacks: new OfflineProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" }), prices, now: offlineNow });
  const { client, server } = await connectedClient(service); context.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: "simulate_yield", arguments: { bondId: "genesis-bond", routeId: "genesis-native-l1-direct", principalBtc: "1 BTC", durationDays: 365, annualRateBps: 300, feeBps: 0 } });
  assert.equal(result.isError, undefined);
  const content = YieldOutputSchema.parse(result.structuredContent);
  assert.equal(content.principalSats, "100000000");
  assert.equal(content.netRewardSats, "3000000");
  assert.equal(content.priceSnapshot.usage, "unavailable");
  assert.ok(content.assumptions.some((item) => /price enrichment was unavailable/i.test(item)));
});

test("MCP schemas contain no passthrough or unknown output shortcuts", async () => {
  const source = await readFile(resolve("src/mcp/output-schemas.ts"), "utf8");
  assert.doesNotMatch(source, /z\.unknown\s*\(/);
  assert.doesNotMatch(source, /z\.json\s*\(/);
  assert.doesNotMatch(source, /\.passthrough\s*\(/);
  assert.doesNotMatch(EXPECTED_TOOL_NAMES.join(" "), /transaction|psbt|sign|broadcast/i);
});

test("runtime failures stay explicit inside deterministic market snapshot", async (context) => {
  const { client, server } = await connectedClient(offlineService(new FailingProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" }))); context.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: "get_market_snapshot", arguments: { network: "mainnet" } });
  assert.equal(result.isError, undefined); const content = result.structuredContent as any; assert.equal(content.protocol.status, "unavailable"); assert.equal(content.protocol.error.code, "UPSTREAM_ERROR");
});

test("audit guidance stays audit-specific and does not inherit a prior custodian", async (context) => {
  const { client, server } = await connectedClient(offlineService());
  context.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({
    name: "get_security_guidance",
    arguments: { topic: "audit_status" },
  });
  assert.equal(result.isError, undefined);
  const content = result.structuredContent as any;
  assert.equal(content.requestedTopic, "audit_status");
  assert.match(content.responseScope, /audit-specific|requested security topic/i);
  assert.equal(content.entries[0].answer, "Yes. The PoX-5 codebase was audited by Trail of Bits and Clarity Alliance, with additional review by Asymmetric Research.");
  assert.match(content.entries[0].responseScope, /without volunteering report-availability/i);
  assert.match(content.entries[0].whatIsNotProven[0], /must be confirmed from current MCP evidence/i);
  assert.match(content.entries[0].verificationChecklist[0], /if none are returned, contact the Bitcoin Staking team/i);
  assert.ok(content.entries[0].verificationChecklist.every((step: string) => !/wallet|custod|integration/i.test(step)));
  assert.doesNotMatch(JSON.stringify(content), /BitGo/i);
});

test("broad security guidance uses confidence, verification, and bounded-risk framing", async (context) => {
  const { client, server } = await connectedClient(offlineService());
  context.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({
    name: "get_security_guidance",
    arguments: { topic: "all" },
  });
  assert.equal(result.isError, undefined);
  const content = result.structuredContent as any;
  assert.equal(content.requestedTopic, "all");
  assert.match(content.responseScope, /native-L1 Bitcoin security foundation/i);
  assert.match(content.responseScope, /audit and transaction\/recovery verification controls/i);
  assert.match(content.responseScope, /bounded implementation and operational risk/i);
  assert.match(content.responseScope, /Do not open with a blanket no-safety guarantee/i);
  assert.match(content.responseScope, /do not apply native-L1 Bitcoin-script protections to a pool-based route/i);
});

test("capabilities expose versions and concierge prompt enforces intent-aware onboarding", async (context) => {
  const { client, server } = await connectedClient(offlineService()); context.after(async () => { await client.close(); await server.close(); });
  const serverInstructions = client.getInstructions() ?? "";
  assert.match(serverInstructions, /read-only Bitcoin Staking intelligence layer/i);
  assert.match(serverInstructions, /runtime and on-chain evidence as stronger than product-owner claims/i);
  assert.match(serverInstructions, /Never construct, sign, or broadcast transactions/i);
  assert.doesNotMatch(serverInstructions, /Scout|Hi, I'm|Try asking|fewer than 100 words/i);
  const resource = await client.readResource({ uri: "bitcoin-staking://capabilities" }); const text = (resource.contents[0] as any).text as string;
  assert.match(text, new RegExp(`Contract version: ${CONTRACT_VERSION}`)); assert.match(text, new RegExp(`Server version: ${SERVER_VERSION}`));
  assert.match(text, new RegExp(`Skill version: ${SKILL_VERSION.replace(/\./g, "\\.")}`)); assert.match(text, /Registry version: rev-/); assert.match(text, /Registry hash: sha256:[a-f0-9]{64}/); assert.match(text, /Registry review status: current/);
  const prompt = await client.getPrompt({ name: "bitcoin-staking-concierge", arguments: {} }); const content = prompt.messages[0]?.content;
  assert.equal(content?.type, "text"); if (content?.type === "text") {
    assert.match(content.text, /Onboarding follows the user's intent/i);
    assert.match(content.text, /fewer than 100 words/i);
    assert.match(content.text, /user-facing name is Scout/i);
    assert.match(content.text, /warm, professional guide/i);
    assert.match(content.text, /do not repeat the introduction in every answer/i);
    assert.match(content.text, /Hi, I'm Scout, your Bitcoin Staking Concierge/i);
    assert.match(content.text, /guide you through the process and answer your questions about earning rewards from BTC through the Stacks protocol/i);
    assert.match(content.text, /Find current and upcoming opportunities/i);
    assert.match(content.text, /Compare ways to participate/i);
    assert.match(content.text, /Understand rewards, lockups, fees, and risks/i);
    assert.match(content.text, /Build a personalized step-by-step participation plan/i);
    assert.match(content.text, /When is the next bond launching/i);
    assert.match(content.text, /How can I get started staking/i);
    assert.match(content.text, /Which participation option is right for me/i);
    assert.match(content.text, /Do not lead this general welcome with an upcoming bond/i);
    assert.match(content.text, /specific question, skip the general welcome/i);
    assert.match(content.text, /For opportunity or timing, call get_market_snapshot/i);
    assert.match(content.text, /direct how-to-participate question/i);
    assert.match(content.text, /allocation and enrollment mechanics as silent background context, not an investor-facing checklist/i);
    assert.match(content.text, /Do not proactively mention address binding, allocation immutability, partial enrollment or top-ups, overlapping-address rules, UTXO mechanics, rollover windows, reserve operations, or split-wallet handoffs/i);
    assert.match(content.text, /only when the user asks about it, it materially changes the selected route or immediate next step, or it is needed to correct a false assumption/i);
    assert.match(content.text, /fully enrolled based only on a Bitcoin funding or lock transaction/i);
    assert.match(content.text, /required Stacks registration is complete/i);
    assert.match(content.text, /provider-specific setup requirements only when the user names that provider/i);
    assert.match(content.text, /single next operational question needed to proceed; do not launch a readiness questionnaire/i);
    assert.match(content.text, /How will I know my Bitcoin is safe/i);
    assert.match(content.text, /security-foundation, independent-verification, bounded-residual-risk sequence/i);
    assert.match(content.text, /Security starts with Bitcoin itself/i);
    assert.match(content.text, /chosen wallet or custody key/i);
    assert.match(content.text, /Like any financial software, risk is not zero/i);
    assert.match(content.text, /Do not open with 'your Bitcoin cannot be guaranteed completely safe'/i);
    assert.match(content.text, /Never apply native-L1 Bitcoin-script protections to a pool-based route/i);
    assert.match(content.text, /keeping Bitcoin on L1 in self-custody versus using the staked position to borrow, lend, or unlock additional yield opportunities/i);
    assert.match(content.text, /do not imply that this route supports only self-custody/i);
    assert.match(content.text, /Resolve current software, hardware, multisig, institutional-wallet, and custody options from list_custody_paths rather than a fixed provider list/i);
    assert.match(content.text, /Describe the pooled route first as 'Join a pool'/i);
    assert.match(content.text, /Which matters more to you: keeping your Bitcoin on L1 in self-custody, or using your staked position to borrow, lend, or unlock additional yield opportunities/i);
    assert.match(content.text, /two stable route types when route detail is relevant/i);
    assert.match(content.text, /multiple pools with different input assets, operators, and LST designs/i);
    assert.match(content.text, /current pool names, requirements, token designs, products, terms, and integrations from the live registry/i);
    assert.doesNotMatch(content.text, /native-L1 direct for larger allowlisted institutional participation/i);
    assert.doesNotMatch(content.text, /permissionless sBTC pooling through StackingDAO/i);
    assert.match(content.text, /without adding 'No conversion to sBTC is required\.'/i);
    assert.match(content.text, /show the sourced gross reward, label net reward unknown/i);
    assert.match(content.text, /prices may enrich the scenario, but do not replace missing rate or duration inputs/i);
    assert.match(content.text, /three-decimal display fields/i);
    assert.match(content.text, /positive planned-yield structure above with values returned by current registry evidence and deterministic calculations/i);
    assert.match(content.text, /State only the economics returned by the current MCP read/i);
    assert.match(content.text, /lead with the user-facing answer rather than protocol state/i);
    assert.match(content.text, /mention only caveats and unknowns that change the answer/i);
    assert.match(content.text, /State a supported capability first and explain how it works/i);
    assert.match(content.text, /Do not manufacture a negative contrast around it/i);
    assert.match(content.text, /Explain user actions and outcomes before infrastructure terminology/i);
    assert.match(content.text, /PoX-5 supports an optional early-exit path/i);
    assert.match(content.text, /check current bond and route evidence before saying the user can use it/i);
    assert.match(content.text, /When a bond enables it, explain the Stacks transaction and later Bitcoin wallet approval/i);
    assert.match(content.text, /Early Exit Coordinator.*only when the user asks for technical detail/i);
    assert.match(content.text, /If a material limitation changes the decision, state it plainly in its own sentence after the mechanism/i);
    assert.match(content.text, /Do not list unverified liquidity, redemption, borrowing, market, or DeFi details/i);
    assert.match(content.text, /wallet- or custody-only question/i);
    assert.match(content.text, /Do not append a generic caveat that wallet support does not establish bond enrollment or availability/i);
    assert.match(content.text, /Do not narrate the absence of an amount-related rejection/i);
    assert.match(content.text, /read the current registry economics/i);
    assert.match(content.text, /State the returned annualized rate, approximate term, and reward asset/i);
    assert.match(content.text, /Call simulate_yield with a 1 BTC principal/i);
    assert.match(content.text, /do not calculate the worked return in prose/i);
    assert.match(content.text, /planned product targets and public reference-model assumptions distinct from bond-specific terms and final on-chain configured terms/i);
    assert.match(content.text, /Never retain a current rate, duration, reward asset, fee, capacity, or worked return/i);
    assert.match(content.text, /Invite the user to provide their BTC amount for a personalized estimate/i);
    assert.match(content.text, /Avoid stacked qualifiers and status jargon/i);
  }
});

test("alternate schedule and economics flow from runtime evidence rather than prompt copy", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "bitcoin-staking-runtime-facts-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const bond = JSON.parse(await readFile(resolve("data/bonds/genesis-bond.json"), "utf8"));
  bond.timing = { ...bond.timing, scheduledLaunchDate: "2026-09-17", startsRewardCycle: 145 };
  bond.economics = {
    targetRateBps: 425,
    rewardAsset: "BTC",
    rewardAssetOptions: ["BTC", "sBTC"],
    rewardModel: "target_principal_rate",
    rewardSource: "Alternate runtime fixture.",
    termsStatus: "reference_program_model",
    referenceModel: {
      id: "alternate-reference-model",
      status: "public_reference_model",
      sourceIds: ["genesis-bond-owner-attestation"],
      annualTargetRateBps: 425,
      pairedStxMinimumValueRatioBps: 500,
      bondingPeriodCycles: 7,
      daysPerCycle: 13,
      bondingPeriodDays: 91,
      initialCapacityBtc: 50,
      targetCoverageRatio: 1,
      calculationMethod: "simple_non_compounding",
    },
  };
  const alternatePool = bond.participationRoutes.find((route: any) => route.routeType === "sbtc_pool");
  alternatePool.name = "Alternate BTC pool";
  alternatePool.poolOperator = { id: "alternate-pool", name: "Alternate Pool" };
  alternatePool.lst = {
    tokenSymbol: "altBTC",
    productStatus: "in_progress",
    verification: ["product_owner_confirmed"],
    attestation: {
      scope: "Alternate pool LST fixture",
      ownerOrganization: "Fixture",
      reviewedAt: "2026-08-06T00:00:00.000Z",
      reviewCadenceDays: 7,
      sourceIds: ["genesis-bond-owner-attestation"],
    },
    transferable: true,
    redemption: { method: "Fixture redemption.", timing: "Fixture timing.", status: "unverified" },
    liquidityEvidence: { status: "unverified", description: "Fixture has no verified liquidity.", sourceIds: ["genesis-bond-owner-attestation"] },
    oracleEvidence: { status: "unverified", description: "Fixture has no verified oracle.", sourceIds: ["genesis-bond-owner-attestation"] },
    supportedMarkets: [],
    verifiedDefiIntegrations: [],
    sourceIds: ["genesis-bond-owner-attestation"],
  };
  await writeFile(join(directory, "alternate-bond.json"), JSON.stringify(bond), "utf8");

  const service = new BitcoinStakingService({
    manifests: new ManifestStore(directory, { now: offlineNow }),
    stacks: new OfflineProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" }),
    testnetStacks: new OfflineProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" }),
    prices: offlinePrices(),
    now: offlineNow,
  });
  const { client, server } = await connectedClient(service);
  context.after(async () => { await client.close(); await server.close(); });

  const bondsResult = await client.callTool({ name: "list_bonds", arguments: {} });
  assert.equal(bondsResult.isError, undefined);
  const listed = bondsResult.structuredContent as any;
  assert.equal(listed.bonds[0].scheduledLaunchDate, "2026-09-17");
  assert.equal(listed.bonds[0].timing.startsRewardCycle, 145);
  assert.equal(listed.bonds[0].economics.targetRateBps, 425);
  assert.equal(listed.bonds[0].economics.rewardAsset, "BTC");
  assert.equal(listed.bonds[0].economics.termsStatus, "reference_program_model");

  const yieldResult = await client.callTool({
    name: "simulate_yield",
    arguments: { bondId: bond.id, routeId: bond.participationRoutes[0].id, principalSats: "100000000", feeBps: 0 },
  });
  assert.equal(yieldResult.isError, undefined, JSON.stringify(yieldResult.content));
  const scenario = yieldResult.structuredContent as any;
  assert.equal(scenario.annualRateBps, 425);
  assert.equal(scenario.durationDays, 91);
  assert.equal(scenario.rewardAsset, "BTC");
  assert.equal(scenario.grossRewardSats, "1059589");
  assert.equal(scenario.grossRewardDisplay, "0.011 BTC");
  assert.equal(scenario.availability, "published_reference_model_scenario");
  assert.equal(scenario.modelContext.sourceStatus, "reference_not_final_bond_terms");

  const comparisonResult = await client.callTool({
    name: "compare_staking_paths",
    arguments: {
      ...profile,
      goal: "borrow_without_selling",
      assetHeld: "sbtc",
      participantType: "individual",
      whitelistStatus: "unknown",
      liquidityNeed: "access_anytime",
      bitcoinPathPreference: "open_to_sbtc",
      keyControlPreference: "self_controlled",
    },
  });
  assert.equal(comparisonResult.isError, undefined, JSON.stringify(comparisonResult.content));
  const comparison = comparisonResult.structuredContent as any;
  assert.match(comparison.conclusion, /Alternate BTC pool with optional altBTC/i);
  assert.doesNotMatch(comparison.conclusion, /StackingDAO|stBTC/i);

  const prompt = await client.getPrompt({ name: "bitcoin-staking-concierge", arguments: { request: "When is the next bond and what is the yield?" } });
  const content = prompt.messages[0]?.content;
  assert.equal(content?.type, "text");
  if (content?.type === "text") {
    assert.match(content.text, /protocol-derived cycle, burn height, and approximate calendar estimate returned by current MCP evidence/i);
    assert.match(content.text, /Call simulate_yield with a 1 BTC principal/i);
    assert.match(content.text, /planned product targets and public reference-model assumptions distinct from bond-specific terms and final on-chain configured terms/i);
  }
});

test("concierge prompt preserves broad, timing, and amount-bearing first-message intent", async (context) => {
  const { client, server } = await connectedClient(offlineService());
  context.after(async () => { await client.close(); await server.close(); });
  const requests = [
    "I'd like to get started with Bitcoin staking",
    "When is the next bond launching?",
    "How can I stake 0.25 BTC?",
    "How will I know my Bitcoin is safe?",
  ];
  for (const request of requests) {
    const prompt = await client.getPrompt({ name: "bitcoin-staking-concierge", arguments: { request } });
    const content = prompt.messages[0]?.content;
    assert.equal(content?.type, "text");
    if (content?.type === "text") {
      assert.match(content.text, new RegExp(`Current user request: ${request.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      assert.match(content.text, /Classify the newest request before responding/i);
      assert.match(content.text, /If the request asks a specific question, skip the general welcome/i);
    }
  }
});

test("concierge prompt makes the current audit question override unrelated prior context", async (context) => {
  const { client, server } = await connectedClient(offlineService());
  context.after(async () => { await client.close(); await server.close(); });
  const prompt = await client.getPrompt({
    name: "bitcoin-staking-concierge",
    arguments: { request: "Has PoX-5 been audited?" },
  });
  const content = prompt.messages[0]?.content;
  assert.equal(content?.type, "text");
  if (content?.type === "text") {
    assert.match(content.text, /newest user request as the controlling scope/i);
    assert.match(content.text, /Has the protocol been audited/i);
    assert.match(content.text, /without volunteering report-availability/i);
    assert.match(content.text, /check current MCP evidence: provide any returned public report links/i);
    assert.match(content.text, /if none are returned, say that the current evidence does not include them/i);
    assert.match(content.text, /Bitcoin Staking team for access/i);
    assert.match(content.text, /Do not mention BitGo or another named integration unless the current request asks whether it was covered/i);
  }
});
