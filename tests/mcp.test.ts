import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { MetadataSchema } from "../src/core/schemas.js";
import { ServiceError } from "../src/core/errors.js";
import { createBitcoinStakingMcpServer } from "../src/mcp/server.js";
import { StacksProvider } from "../src/providers/stacks.js";
import { BitcoinStakingService } from "../src/service.js";

async function connectedClient(service?: BitcoinStakingService) {
  const server = createBitcoinStakingMcpServer(service);
  const client = new Client(
    { name: "bitcoin-staking-mcp-tests", version: "0.1.0" },
    { capabilities: {}, versionNegotiation: { mode: "legacy" } },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

class OfflineProvider extends StacksProvider {
  override async getProtocolStatus(): Promise<any> {
    const verifiedAt = "2026-08-06T19:00:00.000Z";
    return {
      network: this.networkName,
      chainId: this.chainId,
      contractId:
        this.networkName === "mainnet"
          ? "SP000000000000000000002Q6VF78.pox-5"
          : "ST000000000000000000002AMW42H.pox-5",
      pox5Active: true,
      pox5Scheduled: false,
      pox5ActivationBurnchainBlockHeight: 1,
      blocksUntilPox5Activation: 0,
      firstPox5RewardCycle: 1,
      currentBurnchainBlockHeight: 10,
      dataStatus: "live",
      sources: [this.sourceRef(verifiedAt)],
      assumptions: ["Offline MCP fixture."],
      verifiedAt,
    };
  }

  override async listProtocolBonds(): Promise<any> {
    const verifiedAt = "2026-08-06T19:00:00.000Z";
    return {
      network: this.networkName,
      pox5Active: true,
      currentBurnchainBlockHeight: 10,
      scannedBondIndices: [0, 1, 2],
      bonds: [],
      dataStatus: "live",
      sources: [this.sourceRef(verifiedAt)],
      assumptions: ["Only configured records are returned."],
      verifiedAt,
    };
  }

  override async getParticipantStatus(address: string): Promise<any> {
    const verifiedAt = "2026-08-06T19:00:00.000Z";
    return {
      address,
      network: this.networkName,
      accountStatus: null,
      stakerInfo: null,
      bondMembership: null,
      bondAllowanceSats: null,
      dataStatus: "live",
      sources: [this.sourceRef(verifiedAt)],
      assumptions: ["Offline MCP fixture does not prove address control."],
      verifiedAt,
    };
  }
}

class FailingProvider extends OfflineProvider {
  override async getProtocolStatus(): Promise<any> {
    throw new ServiceError("UPSTREAM_ERROR", "Live network unavailable.", true);
  }
}

function offlineService() {
  return new BitcoinStakingService({
    stacks: new OfflineProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" }),
    testnetStacks: new OfflineProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" }),
    now: () => new Date("2026-08-06T19:00:00.000Z"),
  });
}

const nativeProfile = {
  goal: "earn_yield",
  liquidityNeed: "lock_until_maturity",
  bitcoinPathPreference: "bitcoin_l1_only",
  keyControlPreference: "self_controlled",
  amountSats: "100000000",
} as const;

test("MCP lists all read-only tools", async (context) => {
  const { client, server } = await connectedClient();
  context.after(async () => {
    await client.close();
    await server.close();
  });

  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    [
      "build_diligence_report",
      "build_participation_plan",
      "check_compatibility",
      "check_participant_status",
      "compare_staking_paths",
      "get_bond",
      "get_protocol_status",
      "get_security_guidance",
      "list_bonds",
      "list_protocol_bonds",
      "simulate_yield",
    ],
  );
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
  }
});

test("demo bonds are excluded by default and separated when requested", async (context) => {
  const { client, server } = await connectedClient();
  context.after(async () => {
    await client.close();
    await server.close();
  });

  const withoutDemo = await client.callTool({ name: "list_bonds", arguments: {} });
  const base = withoutDemo.structuredContent as {
    bonds: unknown[];
    demoBonds: unknown[];
    demoIncluded: boolean;
  };
  assert.equal(base.bonds.length, 0);
  assert.equal(base.demoBonds.length, 0);
  assert.equal(base.demoIncluded, false);

  const withDemo = await client.callTool({ name: "list_bonds", arguments: { includeDemo: true } });
  const included = withDemo.structuredContent as {
    bonds: unknown[];
    demoBonds: Array<{ dataStatus: string }>;
    dataStatus: string;
  };
  assert.equal(included.bonds.length, 0);
  assert.equal(included.demoBonds.length, 1);
  assert.equal(included.demoBonds[0]?.dataStatus, "demo");
  assert.equal(included.dataStatus, "demo");
});

test("every tool returns metadata-valid structured output through an in-process client", async (context) => {
  const { client, server } = await connectedClient(offlineService());
  context.after(async () => {
    await client.close();
    await server.close();
  });

  const calls = [
    { name: "get_protocol_status", arguments: { network: "mainnet" } },
    { name: "list_protocol_bonds", arguments: { network: "testnet" } },
    { name: "get_security_guidance", arguments: { topic: "audit_status" } },
    { name: "build_diligence_report", arguments: { network: "testnet", profile: nativeProfile } },
    { name: "list_bonds", arguments: { includeDemo: true } },
    { name: "get_bond", arguments: { bondId: "demo-native-bitcoin-bond" } },
    {
      name: "check_participant_status",
      arguments: { address: "SP000000000000000000002Q6VF78" },
    },
    {
      name: "check_compatibility",
      arguments: {
        bondId: "demo-native-bitcoin-bond",
        provider: "Leather",
        keyControlPreference: "self_controlled",
      },
    },
    {
      name: "simulate_yield",
      arguments: { bondId: "demo-native-bitcoin-bond", principalSats: "100000000" },
    },
    { name: "compare_staking_paths", arguments: nativeProfile },
    {
      name: "build_participation_plan",
      arguments: { bondId: "demo-native-bitcoin-bond", profile: nativeProfile },
    },
  ];

  for (const call of calls) {
    const result = await client.callTool(call);
    assert.equal(result.isError, undefined, `${call.name} returned an error`);
    MetadataSchema.parse(result.structuredContent);
    const serialized = JSON.stringify(result.structuredContent);
    assert.doesNotMatch(serialized, /"(?:psbt|rawTransaction|signedTransaction|broadcastPayload)"\s*:/i);
  }
});

test("live-read failure is explicit and never falls back to demo data", async (context) => {
  const service = new BitcoinStakingService({
    stacks: new FailingProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" }),
    testnetStacks: new FailingProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" }),
  });
  const { client, server } = await connectedClient(service);
  context.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "build_diligence_report",
    arguments: { network: "mainnet", profile: nativeProfile },
  });
  assert.equal(result.isError, true);
  const text = JSON.stringify(result.content);
  assert.match(text, /UPSTREAM_ERROR/);
  assert.match(text, /Live network unavailable/);
  assert.doesNotMatch(text, /demo-native-bitcoin-bond|illustrative bond/i);
});

test("path comparison uses canonical public evidence and never inherits demo sources", async (context) => {
  const { client, server } = await connectedClient(offlineService());
  context.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "compare_staking_paths",
    arguments: nativeProfile,
  });
  assert.equal(result.isError, undefined);
  const content = result.structuredContent as {
    sources: Array<{ id: string; dataStatus: string }>;
  };
  assert.ok(content.sources.length > 0);
  assert.ok(content.sources.every((source) => source.dataStatus !== "demo"));
  assert.ok(content.sources.some((source) => source.id === "sip-045"));
  assert.ok(content.sources.some((source) => source.id === "pox5-release-contract"));
});

test("MCP exposes resources and the concierge prompt", async (context) => {
  const { client, server } = await connectedClient();
  context.after(async () => {
    await client.close();
    await server.close();
  });

  const resources = await client.listResources();
  assert.ok(resources.resources.some((resource) => resource.uri === "bitcoin-staking://glossary"));
  assert.ok(resources.resources.some((resource) => resource.uri === "bitcoin-staking://security"));
  assert.ok(
    resources.resources.some(
      (resource) => resource.uri === "bitcoin-staking://methodology/sources",
    ),
  );
  assert.ok(
    resources.resources.some(
      (resource) => resource.uri === "bitcoin-staking://methodology/response-standard",
    ),
  );
  assert.ok(
    resources.resources.some((resource) => resource.uri === "bitcoin-staking://bonds/demo-native-bitcoin-bond"),
  );

  const prompts = await client.listPrompts();
  assert.ok(prompts.prompts.some((prompt) => prompt.name === "bitcoin-staking-concierge"));
  const prompt = await client.getPrompt({
    name: "bitcoin-staking-concierge",
    arguments: { request: "I want yield and must keep BTC on L1." },
  });
  const content = prompt.messages[0]?.content;
  assert.equal(content?.type, "text");
  if (content?.type === "text") {
    assert.doesNotMatch(content.text, /^What would you like your Bitcoin to do\?/);
    assert.match(content.text, /Proceed without asking the user to repeat goals already provided/);
    assert.match(content.text, /This MCP does not currently verify that/);
    assert.match(content.text, /Never fill a missing answer from model memory/i);
    assert.match(content.text, /institutional Bitcoin Staking diligence analyst/i);
    assert.match(content.text, /CFO\/investment committee/);
    assert.match(content.text, /technical\/security\/custody/);
    assert.match(content.text, /do not ask the user to choose a network/i);
    assert.match(content.text, /mainnet state and published manifests first/i);
    assert.match(content.text, /automatically inspect the configured testnet/i);
    assert.match(content.text, /Demo data requires an explicit user request/i);
  }

  const emptyPrompt = await client.getPrompt({ name: "bitcoin-staking-concierge", arguments: {} });
  const emptyContent = emptyPrompt.messages[0]?.content;
  assert.equal(emptyContent?.type, "text");
  if (emptyContent?.type === "text") {
    assert.match(emptyContent.text, /^What would you like your Bitcoin to do\?/);
  }

  const responseStandard = await client.readResource({
    uri: "bitcoin-staking://methodology/response-standard",
  });
  const standardText = String(responseStandard.contents[0]?.text ?? "");
  assert.match(standardText, /Evidence gate and abstention/);
  assert.match(standardText, /Do not fill a missing field from model memory/);
  assert.match(standardText, /not a salesperson, promoter, investment adviser/i);
  assert.match(standardText, /Avoid hype, slogans, rhetorical reassurance/);
});

test("canonical source catalog exposes the reference implementation", async (context) => {
  const { client, server } = await connectedClient();
  context.after(async () => {
    await client.close();
    await server.close();
  });

  const resource = await client.readResource({
    uri: "bitcoin-staking://sources/reference-signer-manager",
  });
  const text = resource.contents[0]?.text;
  assert.equal(typeof text, "string");
  assert.match(String(text), /core-contract-tests\/contracts\/signer-manager\.clar/);
});

test("security guidance separates audit assurance from wallet integration proof", async (context) => {
  const { client, server } = await connectedClient();
  context.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "get_security_guidance",
    arguments: { topic: "audit_status" },
  });
  assert.equal(result.isError, undefined);
  const content = result.structuredContent as {
    entries: Array<{ answer: string; whatIsNotProven: string[] }>;
    sources: Array<{ id: string }>;
  };
  assert.match(content.entries[0]?.answer ?? "", /Trail of Bits/);
  assert.ok(content.entries[0]?.whatIsNotProven.some((item) => /wallet|application/i.test(item)));
  assert.ok(content.sources.some((source) => source.id === "stacks-pox5-audit-statement"));
});

test("invalid participant address fails before a network request", async (context) => {
  const { client, server } = await connectedClient();
  context.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "check_participant_status",
    arguments: { address: "not-a-stacks-address" },
  });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /INVALID_INPUT/);
});
