import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { ServiceError } from "../src/core/errors.js";
import { CONTRACT_VERSION, EXPECTED_TOOL_NAMES, SERVER_VERSION, createBitcoinStakingMcpServer } from "../src/mcp/server.js";
import { StacksProvider } from "../src/providers/stacks.js";
import { CoinGeckoPriceProvider } from "../src/providers/coingecko.js";
import { BitcoinStakingService } from "../src/service.js";
import { SuccessfulToolOutputSchemas, YieldOutputSchema } from "../src/mcp/output-schemas.js";

async function connectedClient(service?: BitcoinStakingService) { const server = createBitcoinStakingMcpServer(service); const client = new Client({ name: "tests", version: "0.1.0" }, { capabilities: {}, versionNegotiation: { mode: "legacy" } }); const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair(); await server.connect(serverTransport); await client.connect(clientTransport); return { client, server }; }

class OfflineProvider extends StacksProvider {
  statusReads = 0;
  bondScanReads = 0;
  override async getProtocolStatus(): Promise<any> { this.statusReads += 1; const verifiedAt = "2026-08-06T19:00:00.000Z"; return { network: this.networkName, chainId: this.chainId, contractId: this.networkName === "mainnet" ? "SP000000000000000000002Q6VF78.pox-5" : "ST000000000000000000002AMW42H.pox-5", pox5Active: true, pox5Scheduled: false, currentBurnchainBlockHeight: 10, dataStatus: "live", sources: [this.sourceRef(verifiedAt)], assumptions: ["Offline fixture."], verifiedAt }; }
  override async listProtocolBonds(): Promise<any> { this.bondScanReads += 1; const verifiedAt = "2026-08-06T19:00:00.000Z"; return { network: this.networkName, pox5Active: true, currentBurnchainBlockHeight: 10, scannedBondIndices: [0, 1, 2], bonds: [], dataStatus: "live", sources: [this.sourceRef(verifiedAt)], assumptions: ["Offline fixture."], verifiedAt }; }
  override async getOnChainBond(): Promise<any> { return undefined; }
  override async getParticipantStatus(address: string): Promise<any> { const verifiedAt = "2026-08-06T19:00:00.000Z"; return { address, network: this.networkName, accountStatus: null, stakerInfo: null, bondMembership: null, bondAllowanceSats: null, requestedBondId: null, requestedBondDataStatus: null, dataStatus: "live", sources: [this.sourceRef(verifiedAt)], assumptions: ["Offline fixture."], verifiedAt }; }
}
class FailingProvider extends OfflineProvider { override async getProtocolStatus(): Promise<any> { throw new ServiceError("UPSTREAM_ERROR", "Live network unavailable.", true); } }
const offlineNow = () => new Date("2026-08-06T19:00:00.000Z");
function offlinePrices() { return new CoinGeckoPriceProvider({ now: offlineNow, fetchFn: async () => new Response(JSON.stringify({ bitcoin: { usd: 64_415, last_updated_at: 1_786_048_080 }, blockstack: { usd: 0.129774, last_updated_at: 1_786_048_080 } }), { status: 200, headers: { "content-type": "application/json" } }) }); }
function offlineService(provider: StacksProvider = new OfflineProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" })) { return new BitcoinStakingService({ stacks: provider, testnetStacks: new OfflineProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" }), prices: offlinePrices(), now: offlineNow }); }
const profile = { goal: "earn_yield", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "approved", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", walletOrCustodian: "Leather", amountSats: "100000000" } as const;

test("MCP exposes the complete 14-tool read-only production-beta contract", async (context) => {
  const { client, server } = await connectedClient(offlineService()); context.after(async () => { await client.close(); await server.close(); });
  const { tools } = await client.listTools(); assert.deepEqual(tools.map((tool) => tool.name), [...EXPECTED_TOOL_NAMES]);
  for (const tool of tools) { assert.equal(tool.annotations?.readOnlyHint, true); assert.equal(tool.annotations?.destructiveHint, false); assert.ok(tool.outputSchema); }
  const liveRegistryReads = new Set(["get_market_snapshot", "get_protocol_status", "list_protocol_bonds", "build_diligence_report", "list_bonds", "list_custody_paths", "list_bond_participation_routes", "get_bond", "check_participant_status", "check_compatibility", "simulate_yield", "compare_staking_paths", "build_participation_plan"]);
  for (const tool of tools) assert.equal(tool.annotations?.openWorldHint, liveRegistryReads.has(tool.name), `${tool.name} openWorldHint`);
});

test("market snapshot grounds the first turn in two routes", async (context) => {
  const { client, server } = await connectedClient(offlineService()); context.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: "get_market_snapshot", arguments: { network: "mainnet" } });
  assert.equal(result.isError, undefined); const content = result.structuredContent as any;
  assert.deepEqual(content.routes.map((route: any) => route.routeType), ["native_l1_direct", "sbtc_pool"]);
  assert.equal(content.routes.find((route: any) => route.routeType === "sbtc_pool")?.poolOperator, "StackingDAO");
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
    { name: "get_security_guidance", arguments: { topic: "audit_status" } }, { name: "build_diligence_report", arguments: { bondId: "genesis-bond-cycle-142", profile } },
    { name: "list_bonds", arguments: { includeDemo: true } }, { name: "list_custody_paths", arguments: {} }, { name: "list_bond_participation_routes", arguments: { bondId: "genesis-bond-cycle-142" } },
    { name: "get_bond", arguments: { bondId: "genesis-bond-cycle-142" } }, { name: "check_participant_status", arguments: { address: "SP000000000000000000002Q6VF78" } },
    { name: "check_compatibility", arguments: { bondId: "genesis-bond-cycle-142", provider: "Leather", keyControlPreference: "custodian" } },
    { name: "simulate_yield", arguments: { bondId: "genesis-bond-cycle-142", routeId: "genesis-native-l1-direct", principalSats: "100000000", durationDays: 365, feeBps: 0 } },
    { name: "compare_staking_paths", arguments: profile }, { name: "build_participation_plan", arguments: { bondId: "genesis-bond-cycle-142", profile } },
  ];
  for (const call of calls) { const result = await client.callTool(call); assert.equal(result.isError, undefined, `${call.name}: ${JSON.stringify(result.content)}`); SuccessfulToolOutputSchemas[call.name as keyof typeof SuccessfulToolOutputSchemas].parse(result.structuredContent); const serialized = JSON.stringify(result.structuredContent); assert.doesNotMatch(serialized, /"(?:psbt|rawTransaction|signedTransaction|signature|broadcastPayload)"\s*:/i); }
});

test("yield uses live CoinGecko prices and three-decimal quantity displays", async (context) => {
  const { client, server } = await connectedClient(offlineService()); context.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: "simulate_yield", arguments: { bondId: "genesis-bond-cycle-142", routeId: "genesis-native-l1-direct", principalSats: "2500000000" } });
  assert.equal(result.isError, undefined);
  const content = result.structuredContent as any;
  assert.equal(content.priceSnapshot.provider, "CoinGecko");
  assert.equal(content.priceSnapshot.btcUsd, 64_415);
  assert.equal(content.priceSnapshot.stxUsd, 0.129774);
  assert.equal(content.priceSnapshot.display.stxUsd, "$0.130");
  assert.equal(content.pairedStxRequirement.scenarios[0].requiredStxUnits, 620_453.635);
  assert.equal(content.pairedStxRequirement.scenarios[0].requiredStxUnitsDisplay, "620453.635 STX");
  assert.equal(content.grossRewardDisplay, "0.358 BTC");
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
  const result = await client.callTool({ name: "simulate_yield", arguments: { bondId: "genesis-bond-cycle-142", routeId: "genesis-stackingdao-sbtc-pool", principalBtc: "1 sBTC" } });
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
  const result = await client.callTool({ name: "simulate_yield", arguments: { bondId: "genesis-bond-cycle-142", routeId: "genesis-native-l1-direct", principalBtc: "1 BTC", durationDays: 365, annualRateBps: 300, feeBps: 0 } });
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
  assert.ok(content.entries[0].verificationChecklist.every((step: string) => !/wallet|custod|integration/i.test(step)));
  assert.doesNotMatch(JSON.stringify(content), /BitGo/i);
});

test("capabilities expose versions and concierge prompt enforces intent-aware onboarding", async (context) => {
  const { client, server } = await connectedClient(offlineService()); context.after(async () => { await client.close(); await server.close(); });
  const resource = await client.readResource({ uri: "bitcoin-staking://capabilities" }); const text = (resource.contents[0] as any).text as string;
  assert.match(text, new RegExp(`Contract version: ${CONTRACT_VERSION}`)); assert.match(text, new RegExp(`Server version: ${SERVER_VERSION}`));
  assert.match(text, /Skill version: 0\.3\.0/); assert.match(text, /Registry version: 2026-08-06\.1/); assert.match(text, /Registry hash: sha256:[a-f0-9]{64}/); assert.match(text, /Registry review status: current/);
  const prompt = await client.getPrompt({ name: "bitcoin-staking-concierge", arguments: {} }); const content = prompt.messages[0]?.content;
  assert.equal(content?.type, "text"); if (content?.type === "text") {
    assert.match(content.text, /Onboarding follows the user's intent/i);
    assert.match(content.text, /fewer than 100 words/i);
    assert.match(content.text, /Bitcoin staking lets you put your BTC to work and earn rewards through the Stacks protocol/i);
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
    assert.match(content.text, /exactly two bond enrollment routes when route detail is relevant/i);
    assert.match(content.text, /Keep stBTC under the StackingDAO pool/i);
    assert.match(content.text, /show the sourced gross reward, label net reward unknown/i);
    assert.match(content.text, /prices may enrich the scenario, but do not replace missing rate or duration inputs/i);
    assert.match(content.text, /three-decimal display fields/i);
    assert.match(content.text, /final terms may change before launch/i);
    assert.match(content.text, /lead with the user-facing answer rather than protocol state/i);
    assert.match(content.text, /mention only caveats and unknowns that change the answer/i);
    assert.match(content.text, /Do not list unverified liquidity, redemption, borrowing, market, or DeFi details/i);
    assert.match(content.text, /Avoid stacked qualifiers and status jargon/i);
  }
});

test("concierge prompt preserves broad, timing, and amount-bearing first-message intent", async (context) => {
  const { client, server } = await connectedClient(offlineService());
  context.after(async () => { await client.close(); await server.close(); });
  const requests = [
    "I'd like to get started with Bitcoin staking",
    "When is the next bond launching?",
    "How can I stake 0.25 BTC?",
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
    assert.match(content.text, /audit-status question/i);
    assert.match(content.text, /Do not mention BitGo or another named integration unless the current request asks whether it was covered/i);
  }
});
