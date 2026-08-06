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
      "build_participation_plan",
      "check_compatibility",
      "check_participant_status",
      "compare_staking_paths",
      "get_bond",
      "get_protocol_status",
      "list_bonds",
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
