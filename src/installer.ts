import { spawn } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

export const DEFAULT_PACKAGE_SPEC = "github:andre-stacks/bitcoin-staking-mcp";
export const SERVER_NAME = "bitcoin-staking";
export const SKILL_NAME = "bitcoin-staking-concierge";

export type InstallerAction = "setup" | "check" | "uninstall";
export type InstallerHost = "codex" | "claude";

export interface InstallerOptions {
  action: InstallerAction;
  hosts: InstallerHost[];
  local: boolean;
  packageSpec: string;
  json: boolean;
  keepSkill: boolean;
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CommandOptions {
  cwd?: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: CommandOptions,
) => Promise<CommandResult>;

export interface InstallerDependencies {
  runCommand?: CommandRunner;
  packageRoot?: string;
  homeDirectory?: string;
  verificationCwd?: string;
  verifyServer?: () => Promise<number>;
}

export interface InstallerStepResult {
  target: string;
  status: "installed" | "verified" | "removed" | "skipped" | "failed";
  message: string;
}

export interface InstallerResult {
  ok: boolean;
  action: InstallerAction;
  source: string;
  steps: InstallerStepResult[];
  nextSteps: string[];
}

const packageRootFromModule = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function splitHosts(value: string): InstallerHost[] {
  const hosts = value.split(",").map((host) => host.trim().toLowerCase());
  if (hosts.includes("all") || hosts.includes("both")) return ["codex", "claude"];
  const invalid = hosts.filter((host) => host !== "codex" && host !== "claude");
  if (invalid.length > 0 || hosts.length === 0) {
    throw new Error(`Unsupported host selection: ${value}. Use codex, claude, or all.`);
  }
  return [...new Set(hosts)] as InstallerHost[];
}

export function parseInstallerOptions(
  action: InstallerAction,
  args: string[],
): InstallerOptions {
  const options: InstallerOptions = {
    action,
    hosts: ["codex", "claude"],
    local: false,
    packageSpec: DEFAULT_PACKAGE_SPEC,
    json: false,
    keepSkill: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--local") {
      options.local = true;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--keep-skill") {
      options.keepSkill = true;
    } else if (argument === "--hosts") {
      const value = args[index + 1];
      if (!value) throw new Error("--hosts requires a value.");
      options.hosts = splitHosts(value);
      index += 1;
    } else if (argument?.startsWith("--hosts=")) {
      options.hosts = splitHosts(argument.slice("--hosts=".length));
    } else if (argument === "--package-spec") {
      const value = args[index + 1];
      if (!value) throw new Error("--package-spec requires a value.");
      options.packageSpec = value;
      index += 1;
    } else if (argument?.startsWith("--package-spec=")) {
      options.packageSpec = argument.slice("--package-spec=".length);
    } else {
      throw new Error(`Unknown installer option: ${argument ?? ""}`);
    }
  }

  return options;
}

export const defaultCommandRunner: CommandRunner = (command, args, options = {}) =>
  new Promise((resolveResult) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolveResult({ code: 127, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (code) => {
      resolveResult({ code: code ?? 1, stdout, stderr });
    });
  });

function serverCommand(options: InstallerOptions, packageRoot: string) {
  if (options.local) {
    return {
      command: process.execPath,
      args: [join(packageRoot, "dist", "cli.js"), "serve"],
      description: `local:${packageRoot}`,
    };
  }
  return {
    command: "npx",
    args: ["-y", options.packageSpec, "serve"],
    description: options.packageSpec,
  };
}

async function replaceHostRegistration(
  host: InstallerHost,
  command: string,
  args: string[],
  runCommand: CommandRunner,
  cwd: string,
): Promise<InstallerStepResult> {
  if (host === "codex") {
    await runCommand("codex", ["mcp", "remove", SERVER_NAME], { cwd });
    const added = await runCommand(
      "codex",
      ["mcp", "add", SERVER_NAME, "--", command, ...args],
      { cwd },
    );
    if (added.code !== 0) {
      return {
        target: host,
        status: "failed",
        message: added.stderr.trim() || added.stdout.trim() || "Codex registration failed.",
      };
    }
    return {
      target: host,
      status: "installed",
      message: "Registered in the user Codex MCP configuration.",
    };
  }

  await runCommand("claude", ["mcp", "remove", "--scope", "user", SERVER_NAME], { cwd });
  const added = await runCommand(
    "claude",
    ["mcp", "add", "--scope", "user", SERVER_NAME, "--", command, ...args],
    { cwd },
  );
  if (added.code !== 0) {
    return {
      target: host,
      status: "failed",
      message: added.stderr.trim() || added.stdout.trim() || "Claude registration failed.",
    };
  }
  return {
    target: host,
    status: "installed",
    message: "Registered in the Claude user-scope MCP configuration.",
  };
}

async function checkHostRegistration(
  host: InstallerHost,
  runCommand: CommandRunner,
  cwd: string,
): Promise<InstallerStepResult> {
  const checked =
    host === "codex"
      ? await runCommand("codex", ["mcp", "get", SERVER_NAME, "--json"], { cwd })
      : await runCommand("claude", ["mcp", "get", SERVER_NAME], { cwd });
  if (checked.code !== 0) {
    return {
      target: host,
      status: "failed",
      message:
        checked.stderr.trim() || checked.stdout.trim() || `${host} registration was not found.`,
    };
  }
  return {
    target: host,
    status: "verified",
    message: `${host} can resolve the ${SERVER_NAME} MCP registration.`,
  };
}

async function removeHostRegistration(
  host: InstallerHost,
  runCommand: CommandRunner,
  cwd: string,
): Promise<InstallerStepResult> {
  const removed =
    host === "codex"
      ? await runCommand("codex", ["mcp", "remove", SERVER_NAME], { cwd })
      : await runCommand("claude", ["mcp", "remove", "--scope", "user", SERVER_NAME], {
          cwd,
        });
  if (removed.code !== 0) {
    const output = `${removed.stderr}\n${removed.stdout}`;
    if (/not found|no server|does not exist/i.test(output)) {
      return { target: host, status: "skipped", message: "No registration was present." };
    }
    return {
      target: host,
      status: "failed",
      message: removed.stderr.trim() || removed.stdout.trim() || `${host} removal failed.`,
    };
  }
  return { target: host, status: "removed", message: "MCP registration removed." };
}

async function installCodexSkill(
  packageRoot: string,
  homeDirectory: string,
): Promise<InstallerStepResult> {
  const source = join(packageRoot, ".agents", "skills", SKILL_NAME);
  const destination = join(homeDirectory, ".agents", "skills", SKILL_NAME);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
  return {
    target: "codex-skill",
    status: "installed",
    message: `Installed $${SKILL_NAME} at ${destination}.`,
  };
}

async function checkCodexSkill(homeDirectory: string): Promise<InstallerStepResult> {
  const skillPath = join(homeDirectory, ".agents", "skills", SKILL_NAME, "SKILL.md");
  try {
    const { access } = await import("node:fs/promises");
    await access(skillPath);
    return {
      target: "codex-skill",
      status: "verified",
      message: `Global concierge skill found at ${skillPath}.`,
    };
  } catch {
    return {
      target: "codex-skill",
      status: "failed",
      message: `Global concierge skill not found at ${skillPath}.`,
    };
  }
}

async function removeCodexSkill(homeDirectory: string): Promise<InstallerStepResult> {
  const destination = join(homeDirectory, ".agents", "skills", SKILL_NAME);
  await rm(destination, { recursive: true, force: true });
  return {
    target: "codex-skill",
    status: "removed",
    message: `Removed ${destination}.`,
  };
}

export async function verifyPackagedServer(packageRoot = packageRootFromModule): Promise<number> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(packageRoot, "dist", "cli.js"), "serve"],
    cwd: packageRoot,
    stderr: "pipe",
  });
  const client = new Client(
    { name: "bitcoin-staking-installer", version: "0.2.0" },
    { capabilities: {}, versionNegotiation: { mode: "legacy" } },
  );
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    return tools.tools.length;
  } finally {
    await client.close();
  }
}

export async function runInstaller(
  options: InstallerOptions,
  dependencies: InstallerDependencies = {},
): Promise<InstallerResult> {
  const majorVersion = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (majorVersion < 22) {
    throw new Error(`Node 22 or newer is required; found ${process.versions.node}.`);
  }

  const runCommand = dependencies.runCommand ?? defaultCommandRunner;
  const packageRoot = dependencies.packageRoot ?? packageRootFromModule;
  const homeDirectory = dependencies.homeDirectory ?? homedir();
  const verificationCwd = dependencies.verificationCwd ?? tmpdir();
  const verifyServer = dependencies.verifyServer ?? (() => verifyPackagedServer(packageRoot));
  const source = serverCommand(options, packageRoot);
  const steps: InstallerStepResult[] = [];

  if (options.action === "setup") {
    const toolCount = await verifyServer();
    const serverStep: InstallerStepResult = {
      target: "mcp-server",
      status: toolCount === 11 ? "verified" : "failed",
      message: `MCP handshake returned ${toolCount} tools; expected 11.`,
    };
    steps.push(serverStep);
    if (serverStep.status === "failed") {
      return {
        ok: false,
        action: options.action,
        source: source.description,
        steps,
        nextSteps: [],
      };
    }
    for (const host of options.hosts) {
      steps.push(
        await replaceHostRegistration(
          host,
          source.command,
          source.args,
          runCommand,
          verificationCwd,
        ),
      );
    }
    if (options.hosts.includes("codex")) {
      steps.push(await installCodexSkill(packageRoot, homeDirectory));
    }
    for (const host of options.hosts) {
      steps.push(await checkHostRegistration(host, runCommand, verificationCwd));
    }
  } else if (options.action === "check") {
    const toolCount = await verifyServer();
    steps.push({
      target: "mcp-server",
      status: toolCount === 11 ? "verified" : "failed",
      message: `MCP handshake returned ${toolCount} tools; expected 11.`,
    });
    for (const host of options.hosts) {
      steps.push(await checkHostRegistration(host, runCommand, verificationCwd));
    }
    if (options.hosts.includes("codex")) {
      steps.push(await checkCodexSkill(homeDirectory));
    }
  } else {
    for (const host of options.hosts) {
      steps.push(await removeHostRegistration(host, runCommand, verificationCwd));
    }
    if (options.hosts.includes("codex") && !options.keepSkill) {
      steps.push(await removeCodexSkill(homeDirectory));
    }
  }

  const ok = steps.every((step) => step.status !== "failed");
  const checkCommand = options.local
    ? "npm run setup:check"
    : `npx -y ${options.packageSpec} check --package-spec ${options.packageSpec}`;
  const nextSteps =
    options.action === "setup" && ok
      ? [
          "Restart Codex and Claude Code so they reload MCP and skill metadata.",
          "Open the Bitcoin Staking Concierge in Codex with $bitcoin-staking-concierge, or in Claude Code with /mcp__bitcoin_staking__bitcoin_staking_concierge.",
          "Start with: What is the current protocol status, and are any bonds available?",
          "Or ask: What security evidence should I review before participating through Leather?",
          "You can also invoke the concierge without a question to see the complete capability menu.",
          `Re-verify later with: ${checkCommand}`,
        ]
      : [];

  return {
    ok,
    action: options.action,
    source: source.description,
    steps,
    nextSteps,
  };
}
