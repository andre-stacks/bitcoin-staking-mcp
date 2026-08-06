import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createBitcoinStakingMcpServer } from "../src/mcp/server.js";

async function connectedClient() {
  const server = createBitcoinStakingMcpServer();
  const client = new Client(
    { name: "bitcoin-staking-mcp-tests", version: "0.1.0" },
    { capabilities: {}, versionNegotiation: { mode: "legacy" } },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

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
  };
  assert.equal(included.bonds.length, 0);
  assert.equal(included.demoBonds.length, 1);
  assert.equal(included.demoBonds[0]?.dataStatus, "demo");
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
  if (content?.type === "text") assert.match(content.text, /^What would you like your Bitcoin to do\?/);
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
