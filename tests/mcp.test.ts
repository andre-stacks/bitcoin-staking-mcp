import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { ServiceError } from "../src/core/errors.js";
import { CONTRACT_VERSION, EXPECTED_TOOL_NAMES, SERVER_VERSION, createBitcoinStakingMcpServer } from "../src/mcp/server.js";
import { StacksProvider } from "../src/providers/stacks.js";
import { CoinGeckoPriceProvider } from "../src/providers/coingecko.js";
import { BitcoinStakingService } from "../src/service.js";
import { SuccessfulToolOutputSchemas } from "../src/mcp/output-schemas.js";

async function connectedClient(service?: BitcoinStakingService) { const server = createBitcoinStakingMcpServer(service); const client = new Client({ name: "tests", version: "0.1.0" }, { capabilities: {}, versionNegotiation: { mode: "legacy" } }); const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair(); await server.connect(serverTransport); await client.connect(clientTransport); return { client, server }; }

class OfflineProvider extends StacksProvider {
  override async getProtocolStatus(): Promise<any> { const verifiedAt = "2026-08-06T19:00:00.000Z"; return { network: this.networkName, chainId: this.chainId, contractId: this.networkName === "mainnet" ? "SP000000000000000000002Q6VF78.pox-5" : "ST000000000000000000002AMW42H.pox-5", pox5Active: true, pox5Scheduled: false, currentBurnchainBlockHeight: 10, dataStatus: "live", sources: [this.sourceRef(verifiedAt)], assumptions: ["Offline fixture."], verifiedAt }; }
  override async listProtocolBonds(): Promise<any> { const verifiedAt = "2026-08-06T19:00:00.000Z"; return { network: this.networkName, pox5Active: true, currentBurnchainBlockHeight: 10, scannedBondIndices: [0, 1, 2], bonds: [], dataStatus: "live", sources: [this.sourceRef(verifiedAt)], assumptions: ["Offline fixture."], verifiedAt }; }
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
});

test("market snapshot grounds the first turn in two routes", async (context) => {
  const { client, server } = await connectedClient(offlineService()); context.after(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: "get_market_snapshot", arguments: { network: "mainnet" } });
  assert.equal(result.isError, undefined); const content = result.structuredContent as any;
  assert.deepEqual(content.routes.map((route: any) => route.routeType), ["native_l1_direct", "sbtc_pool"]);
  assert.equal(content.routes.find((route: any) => route.routeType === "sbtc_pool")?.poolOperator, "StackingDAO");
  assert.match(content.precedence, /on-chain.*outranks owner/i);
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
  assert.ok(content.sources.some((source: any) => source.id === "coingecko-simple-price"));
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

test("capabilities expose server and contract versions and concierge uses one routing question", async (context) => {
  const { client, server } = await connectedClient(offlineService()); context.after(async () => { await client.close(); await server.close(); });
  const resource = await client.readResource({ uri: "bitcoin-staking://capabilities" }); const text = (resource.contents[0] as any).text as string;
  assert.match(text, new RegExp(`Contract version: ${CONTRACT_VERSION}`)); assert.match(text, new RegExp(`Server version: ${SERVER_VERSION}`));
  const prompt = await client.getPrompt({ name: "bitcoin-staking-concierge", arguments: {} }); const content = prompt.messages[0]?.content;
  assert.equal(content?.type, "text"); if (content?.type === "text") { assert.match(content.text, /call get_market_snapshot first/i); assert.match(content.text, /exactly two routes/i); assert.match(content.text, /keeping BTC on L1, permissionless smaller-balance access, or liquidity/i); assert.match(content.text, /stBTC.*optional/i); assert.match(content.text, /current CoinGecko BTC and STX prices/i); assert.match(content.text, /paired STX units/i); assert.match(content.text, /three-decimal display fields/i); assert.match(content.text, /net yield unknown rather than refusing/i); assert.match(content.text, /not final configured bond terms/i); }
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
    assert.match(content.text, /current user request as the controlling scope/i);
    assert.match(content.text, /audit-status question/i);
    assert.match(content.text, /Do not mention BitGo or another named integration unless the current request asks whether it was covered/i);
  }
});
