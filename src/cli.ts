#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { runInstaller, parseInstallerOptions, type InstallerAction } from "./installer.js";
import { createBitcoinStakingMcpServer } from "./mcp/server.js";

const HELP = `Bitcoin Staking MCP

Usage:
  bitcoin-staking-mcp [serve]
  bitcoin-staking-mcp setup [--hosts codex,claude] [--local] [--package-spec SPEC] [--json]
  bitcoin-staking-mcp update [--hosts codex,claude] [--local] [--package-spec SPEC] [--json]
  bitcoin-staking-mcp check [--hosts codex,claude] [--local] [--package-spec SPEC] [--json]
  bitcoin-staking-mcp uninstall [--hosts codex,claude] [--keep-skill] [--json]

Portable install:
  npx -y github:andre-stacks/bitcoin-staking-mcp#v0.5.0 setup

Options:
  --hosts HOSTS       codex, claude, both as a comma-separated list, or all
  --local             Register this checkout instead of the GitHub npx package
  --package-spec SPEC Override the npx package source
  --json              Print machine-readable output
  --keep-skill        Keep the global Codex skill during uninstall
`;

function startServer() {
  serveStdio(() => createBitcoinStakingMcpServer(), {
    onerror: (error) => console.error(`[bitcoin-staking-mcp] ${error.message}`),
  });
}

function printHumanResult(result: Awaited<ReturnType<typeof runInstaller>>) {
  console.log(`Bitcoin Staking MCP ${result.action}: ${result.ok ? "PASS" : "FAIL"}`);
  console.log(`Source: ${result.source}`);
  for (const step of result.steps) {
    console.log(`- [${step.status.toUpperCase()}] ${step.target}: ${step.message}`);
  }
  if (result.nextSteps.length > 0) {
    console.log("Next steps:");
    for (const step of result.nextSteps) console.log(`- ${step}`);
  }
}

async function main() {
  const [command = "serve", ...args] = process.argv.slice(2);
  if (command === "serve") {
    startServer();
    return;
  }
  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }
  if (command !== "setup" && command !== "update" && command !== "check" && command !== "uninstall") {
    throw new Error(`Unknown command: ${command}. Run bitcoin-staking-mcp --help.`);
  }

  const options = parseInstallerOptions(command as InstallerAction, args);
  const result = await runInstaller(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printHumanResult(result);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[bitcoin-staking-mcp] ${message}`);
  process.exitCode = 1;
});
