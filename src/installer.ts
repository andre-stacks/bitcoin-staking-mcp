import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { CONTRACT_VERSION, EXPECTED_TOOL_NAMES, SERVER_VERSION, SKILL_VERSION } from "./mcp/server.js";

export const DEFAULT_PACKAGE_SPEC = "github:andre-stacks/bitcoin-staking-mcp#v0.4.0";
export const SERVER_NAME = "bitcoin-staking";
export const SKILL_NAME = "bitcoin-staking-concierge";

export type InstallerAction = "setup" | "update" | "check" | "uninstall";
export type InstallerHost = "codex" | "claude";

export interface InstallerOptions {
  action: InstallerAction;
  hosts: InstallerHost[];
  local: boolean;
  packageSpec: string;
  json: boolean;
  keepSkill: boolean;
  hostsExplicit: boolean;
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
  verifyServer?: () => Promise<number | ServerVerification>;
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
    hostsExplicit: false,
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
      options.hostsExplicit = true;
      index += 1;
    } else if (argument?.startsWith("--hosts=")) {
      options.hosts = splitHosts(argument.slice("--hosts=".length));
      options.hostsExplicit = true;
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
  expectedSource: ReturnType<typeof serverCommand>,
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
  if (host === "codex") {
    try {
      const value = JSON.parse(checked.stdout) as { command?: string; args?: string[]; transport?: { command?: string; args?: string[] } };
      const registration = value.transport ?? value;
      if (registration.command !== expectedSource.command || JSON.stringify(registration.args ?? []) !== JSON.stringify(expectedSource.args)) {
        return { target: host, status: "failed", message: `Registration does not match ${expectedSource.description}.` };
      }
    } catch {
      return { target: host, status: "failed", message: "Codex registration could not be parsed for exact package verification." };
    }
  } else {
    const normalized = `${checked.stdout}\n${checked.stderr}`;
    const expectedTokens = [expectedSource.command, ...expectedSource.args];
    if (!expectedTokens.every((token) => normalized.includes(token))) {
      return { target: host, status: "failed", message: `Registration does not match ${expectedSource.description}.` };
    }
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
    if (removed.code !== 127 && /not found|no server|does not exist/i.test(output)) {
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
  const skill = await readFile(join(destination, "SKILL.md"));
  await writeFile(join(destination, ".integrity.json"), `${JSON.stringify({ skillVersion: SKILL_VERSION, sha256: createHash("sha256").update(skill).digest("hex") }, null, 2)}\n`, "utf8");
  return {
    target: "codex-skill",
    status: "installed",
    message: `Installed $${SKILL_NAME} at ${destination}.`,
  };
}

async function checkCodexSkill(
  homeDirectory: string,
  packageRoot: string,
): Promise<InstallerStepResult> {
  const skillPath = join(homeDirectory, ".agents", "skills", SKILL_NAME, "SKILL.md");
  const packagedSkillPath = join(packageRoot, ".agents", "skills", SKILL_NAME, "SKILL.md");
  try {
    const skill = await readFile(skillPath);
    const packagedSkill = await readFile(packagedSkillPath);
    const integrity = JSON.parse(await readFile(join(dirname(skillPath), ".integrity.json"), "utf8")) as { skillVersion?: string; sha256?: string };
    const actualHash = createHash("sha256").update(skill).digest("hex");
    const packagedHash = createHash("sha256").update(packagedSkill).digest("hex");
    if (integrity.skillVersion !== SKILL_VERSION || integrity.sha256 !== actualHash || actualHash !== packagedHash) {
      throw new Error("Skill version or hash mismatch.");
    }
    return {
      target: "codex-skill",
      status: "verified",
      message: `Global concierge skill matches the packaged skill at ${skillPath}.`,
    };
  } catch {
    return {
      target: "codex-skill",
      status: "failed",
      message: `Global concierge skill is missing or does not match the packaged skill at ${skillPath}.`,
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

export interface ServerVerification {
  toolNames: string[];
  serverVersion: string;
  contractVersion: string;
  skillVersion: string;
  registryVersion: string;
  registryHash: string;
  registryReviewStatus: string;
}

export async function verifyPackagedServer(packageRoot = packageRootFromModule): Promise<ServerVerification> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(packageRoot, "dist", "cli.js"), "serve"],
    cwd: packageRoot,
    stderr: "pipe",
  });
  const client = new Client(
    { name: "bitcoin-staking-installer", version: SERVER_VERSION },
    { capabilities: {}, versionNegotiation: { mode: "legacy" } },
  );
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const capability = await client.readResource({ uri: "bitcoin-staking://capabilities" });
    const text = String((capability.contents[0] as { text?: string } | undefined)?.text ?? "");
    const listed = await client.callTool({ name: "list_bonds", arguments: {} });
    const registry = (listed.structuredContent as { registry?: { registryVersion?: string; contentHash?: string; reviewStatus?: string } } | undefined)?.registry;
    return {
      toolNames: tools.tools.map((tool) => tool.name), serverVersion: text.match(/Server version: ([^\s]+)/)?.[1] ?? "unknown",
      contractVersion: text.match(/Contract version: ([^\s]+)/)?.[1] ?? "unknown", skillVersion: text.match(/Skill version: ([^\s]+)/)?.[1] ?? "unknown",
      registryVersion: registry?.registryVersion ?? "unknown", registryHash: registry?.contentHash ?? "unknown", registryReviewStatus: registry?.reviewStatus ?? "unknown",
    };
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
  const availableHosts: InstallerHost[] = [];
  for (const host of options.hosts) {
    if (options.action === "uninstall") {
      availableHosts.push(host);
      continue;
    }
    const probe = await runCommand(host, ["--version"], { cwd: verificationCwd });
    if (probe.code === 0) availableHosts.push(host);
    else steps.push({ target: host, status: options.hostsExplicit ? "failed" : "skipped", message: `${host} is not installed; ${options.hostsExplicit ? "the explicitly requested host is required" : "default setup skipped it"}.` });
  }

  const serverVerification = async () => {
    const value = await verifyServer();
    if (typeof value === "number") return { ok: value === EXPECTED_TOOL_NAMES.length, message: `MCP handshake returned ${value} tools; expected ${EXPECTED_TOOL_NAMES.length}.` };
    const exactTools = JSON.stringify(value.toolNames) === JSON.stringify([...EXPECTED_TOOL_NAMES]);
    const ok = exactTools && value.serverVersion === SERVER_VERSION && value.contractVersion === CONTRACT_VERSION && value.skillVersion === SKILL_VERSION && value.registryVersion !== "unknown" && value.registryHash.startsWith("sha256:") && ["current", "needs_review"].includes(value.registryReviewStatus);
    return { ok, message: `tools=${value.toolNames.length}, server=${value.serverVersion}, contract=${value.contractVersion}, skill=${value.skillVersion}, registry=${value.registryVersion} ${value.registryReviewStatus}, hash=${value.registryHash}` };
  };

  if (options.action === "setup" || options.action === "update") {
    const verification = await serverVerification();
    const serverStep: InstallerStepResult = {
      target: "mcp-server",
      status: verification.ok ? "verified" : "failed",
      message: verification.message,
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
    for (const host of availableHosts) {
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
    if (availableHosts.includes("codex")) {
      steps.push(await installCodexSkill(packageRoot, homeDirectory));
    }
    for (const host of availableHosts) {
      steps.push(await checkHostRegistration(host, runCommand, verificationCwd, source));
    }
  } else if (options.action === "check") {
    const verification = await serverVerification();
    steps.push({
      target: "mcp-server",
      status: verification.ok ? "verified" : "failed",
      message: verification.message,
    });
    for (const host of availableHosts) {
      steps.push(await checkHostRegistration(host, runCommand, verificationCwd, source));
    }
    if (availableHosts.includes("codex")) {
      steps.push(await checkCodexSkill(homeDirectory, packageRoot));
    }
  } else {
    for (const host of availableHosts) {
      steps.push(await removeHostRegistration(host, runCommand, verificationCwd));
    }
    if (availableHosts.includes("codex") && !options.keepSkill) {
      steps.push(await removeCodexSkill(homeDirectory));
    }
  }

  const ok = steps.every((step) => step.status !== "failed");
  const checkCommand = options.local
    ? "npm run setup:check"
    : `npx -y ${options.packageSpec} check --package-spec ${options.packageSpec}`;
  const nextSteps =
    (options.action === "setup" || options.action === "update") && ok
      ? [
          "Restart Codex and Claude Code so they reload MCP and skill metadata.",
          "Open Scout, the Bitcoin Staking Concierge, in Codex with $bitcoin-staking-concierge, or in Claude Code with /mcp__bitcoin_staking__bitcoin_staking_concierge.",
          "Start with: How can I get started staking?",
          "Or ask: When is the next bond launching?",
          "Or ask: What security evidence should I review before participating through Leather?",
          "You can also invoke Scout without a question for a guided overview of what it can help with.",
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
