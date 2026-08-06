import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

test("packaged CLI serve command initializes and serves tools", async (context) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("dist/cli.js"), "serve"],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client(
    { name: "bitcoin-staking-stdio-test", version: "0.1.0" },
    { capabilities: {}, versionNegotiation: { mode: "legacy" } },
  );
  context.after(async () => client.close());

  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.ok(tools.some((tool) => tool.name === "get_protocol_status"));

  const result = await client.callTool({ name: "list_bonds", arguments: { includeDemo: false } });
  assert.equal(result.isError, undefined);
  assert.equal((result.structuredContent as { demoIncluded: boolean }).demoIncluded, false);
});
