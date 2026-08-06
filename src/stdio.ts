#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createBitcoinStakingMcpServer } from "./mcp/server.js";

serveStdio(() => createBitcoinStakingMcpServer(), {
  onerror: (error) => console.error(`[bitcoin-staking-mcp] ${error.message}`),
});
