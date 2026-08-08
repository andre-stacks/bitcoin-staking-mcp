import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DEFAULT_PACKAGE_SPEC,
  parseInstallerOptions,
  runInstaller,
  type CommandRunner,
} from "../src/installer.js";
import { CONTRACT_VERSION, EXPECTED_TOOL_NAMES, SERVER_VERSION, SKILL_VERSION } from "../src/mcp/server.js";

const completeVerification = {
  toolNames: [...EXPECTED_TOOL_NAMES], serverVersion: SERVER_VERSION, contractVersion: CONTRACT_VERSION,
  skillVersion: SKILL_VERSION, registryVersion: "2026-08-06.1", registryHash: "sha256:abc", registryReviewStatus: "current",
};

test("installer options default to both hosts and support aliases", () => {
  const defaults = parseInstallerOptions("setup", []);
  assert.deepEqual(defaults.hosts, ["codex", "claude"]);
  assert.equal(defaults.packageSpec, DEFAULT_PACKAGE_SPEC);
  assert.match(defaults.packageSpec, /#v0\.4\.0$/);

  const selected = parseInstallerOptions("setup", [
    "--hosts=both",
    "--package-spec",
    "github:example/pinned-package#v1",
    "--json",
  ]);
  assert.deepEqual(selected.hosts, ["codex", "claude"]);
  assert.equal(selected.packageSpec, "github:example/pinned-package#v1");
  assert.equal(selected.json, true);

  assert.throws(
    () => parseInstallerOptions("setup", ["--hosts", "cursor"]),
    /Unsupported host selection/,
  );
});

test("setup registers both hosts, installs the global skill, and verifies registrations", async (context) => {
  const fakeHome = await mkdtemp(join(tmpdir(), "bitcoin-staking-installer-home-"));
  context.after(() => rm(fakeHome, { recursive: true, force: true }));
  const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
  const runCommand: CommandRunner = async (command, args, options) => {
    calls.push({ command, args, ...(options?.cwd ? { cwd: options.cwd } : {}) });
    if (command === "codex" && args.join(" ") === "mcp get bitcoin-staking --json") {
      return { code: 0, stdout: JSON.stringify({ command: "npx", args: ["-y", DEFAULT_PACKAGE_SPEC, "serve"] }), stderr: "" };
    }
    if (command === "claude" && args.join(" ") === "mcp get bitcoin-staking") {
      return { code: 0, stdout: `bitcoin-staking:\n  Command: npx\n  Args: -y ${DEFAULT_PACKAGE_SPEC} serve\n`, stderr: "" };
    }
    return { code: 0, stdout: "ok", stderr: "" };
  };

  const result = await runInstaller(parseInstallerOptions("setup", []), {
    runCommand,
    packageRoot: resolve("."),
    homeDirectory: fakeHome,
    verificationCwd: tmpdir(),
    verifyServer: async () => 15,
  });

  assert.equal(result.ok, true);
  assert.ok(
    calls.some(
      (call) =>
        call.command === "codex" &&
        call.args.join(" ") ===
          `mcp add bitcoin-staking -- npx -y ${DEFAULT_PACKAGE_SPEC} serve`,
    ),
  );
  assert.ok(
    calls.some(
      (call) =>
        call.command === "claude" &&
        call.args.join(" ") ===
          `mcp add --scope user bitcoin-staking -- npx -y ${DEFAULT_PACKAGE_SPEC} serve`,
    ),
  );
  assert.ok(calls.every((call) => call.cwd === tmpdir()));
  await access(join(fakeHome, ".agents", "skills", "bitcoin-staking-concierge", "SKILL.md"));
  assert.ok(result.nextSteps.some((step) => step.includes("$bitcoin-staking-concierge")));
  assert.ok(result.nextSteps.some((step) => step.includes("Scout")));
  assert.ok(result.nextSteps.some((step) => step.includes("I'd like to get started with Bitcoin staking")));
  assert.ok(result.nextSteps.some((step) => step.includes("next bond launching")));
  assert.ok(result.nextSteps.some((step) => step.includes("security evidence")));
  assert.ok(result.nextSteps.some((step) => step.includes("guided overview of what it can help with")));
});

test("setup fails closed before registration when the MCP handshake is incomplete", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const result = await runInstaller(parseInstallerOptions("setup", []), {
    runCommand: async (command, args) => {
      calls.push({ command, args });
      return { code: 0, stdout: "", stderr: "" };
    },
    verifyServer: async () => 10,
  });

  assert.equal(result.ok, false);
  assert.ok(calls.every((call) => call.args.join(" ") === "--version"));
  assert.ok(!calls.some((call) => call.args.includes("add")));
  assert.equal(result.steps[0]?.target, "mcp-server");
  assert.equal(result.steps[0]?.status, "failed");
});

test("check reports a missing explicitly selected host registration", async (context) => {
  const fakeHome = await mkdtemp(join(tmpdir(), "bitcoin-staking-installer-check-"));
  context.after(() => rm(fakeHome, { recursive: true, force: true }));
  const result = await runInstaller(parseInstallerOptions("check", ["--hosts", "codex"]), {
    runCommand: async () => ({ code: 1, stdout: "", stderr: "not found" }),
    homeDirectory: fakeHome,
    verifyServer: async () => 15,
  });

  assert.equal(result.ok, false);
  assert.ok(result.steps.some((step) => step.target === "codex" && step.status === "failed"));
});

test("uninstall removes only selected registrations and the product skill", async (context) => {
  const fakeHome = await mkdtemp(join(tmpdir(), "bitcoin-staking-installer-uninstall-"));
  context.after(() => rm(fakeHome, { recursive: true, force: true }));
  const calls: Array<{ command: string; args: string[] }> = [];
  const runCommand: CommandRunner = async (command, args) => {
    calls.push({ command, args });
    if (command === "codex" && args.join(" ") === "mcp get bitcoin-staking --json") {
      return { code: 0, stdout: JSON.stringify({ command: "npx", args: ["-y", DEFAULT_PACKAGE_SPEC, "serve"] }), stderr: "" };
    }
    return { code: 0, stdout: "removed", stderr: "" };
  };

  await runInstaller(parseInstallerOptions("setup", ["--hosts", "codex"]), {
    runCommand,
    packageRoot: resolve("."),
    homeDirectory: fakeHome,
    verifyServer: async () => 15,
  });
  const result = await runInstaller(parseInstallerOptions("uninstall", ["--hosts", "codex"]), {
    runCommand,
    packageRoot: resolve("."),
    homeDirectory: fakeHome,
    verifyServer: async () => 15,
  });

  assert.equal(result.ok, true);
  assert.ok(
    calls.some(
      (call) => call.command === "codex" && call.args.join(" ") === "mcp remove bitcoin-staking",
    ),
  );
  await assert.rejects(
    access(join(fakeHome, ".agents", "skills", "bitcoin-staking-concierge", "SKILL.md")),
  );
});

test("default host autodetection skips absent hosts while explicit selection fails", async () => {
  const absent: CommandRunner = async () => ({ code: 127, stdout: "", stderr: "not installed" });
  const defaults = await runInstaller(parseInstallerOptions("setup", []), { runCommand: absent, verifyServer: async () => completeVerification });
  assert.equal(defaults.ok, true);
  assert.deepEqual(defaults.steps.filter((step) => step.target === "codex" || step.target === "claude").map((step) => step.status), ["skipped", "skipped"]);

  const explicit = await runInstaller(parseInstallerOptions("setup", ["--hosts", "codex"]), { runCommand: absent, verifyServer: async () => completeVerification });
  assert.equal(explicit.ok, false);
  assert.equal(explicit.steps.find((step) => step.target === "codex")?.status, "failed");
});

test("check fails when the registered package command differs from the requested pinned source", async (context) => {
  const fakeHome = await mkdtemp(join(tmpdir(), "bitcoin-staking-installer-spec-"));
  context.after(() => rm(fakeHome, { recursive: true, force: true }));
  const runCommand: CommandRunner = async (command, args) => {
    if (args.join(" ") === "--version") return { code: 0, stdout: "1.0.0", stderr: "" };
    if (command === "codex" && args.includes("get")) return { code: 0, stdout: JSON.stringify({ command: "npx", args: ["-y", "github:wrong/repo#main", "serve"] }), stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  const result = await runInstaller(parseInstallerOptions("check", ["--hosts", "codex"]), { runCommand, homeDirectory: fakeHome, verifyServer: async () => completeVerification });
  assert.equal(result.ok, false);
  assert.match(result.steps.find((step) => step.target === "codex")?.message ?? "", /does not match/);
});

test("update repeats verified replacement and a tampered concierge skill fails check", async (context) => {
  const fakeHome = await mkdtemp(join(tmpdir(), "bitcoin-staking-installer-update-"));
  context.after(() => rm(fakeHome, { recursive: true, force: true }));
  const calls: string[] = [];
  const runCommand: CommandRunner = async (command, args) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (args.join(" ") === "--version") return { code: 0, stdout: "1.0.0", stderr: "" };
    if (command === "codex" && args.includes("get")) return { code: 0, stdout: JSON.stringify({ command: process.execPath, args: [resolve("dist/cli.js"), "serve"] }), stderr: "" };
    return { code: 0, stdout: "ok", stderr: "" };
  };
  const options = parseInstallerOptions("update", ["--hosts", "codex", "--local"]);
  const updated = await runInstaller(options, { runCommand, packageRoot: resolve("."), homeDirectory: fakeHome, verifyServer: async () => completeVerification });
  assert.equal(updated.ok, true);
  assert.ok(calls.some((call) => call.includes("mcp remove bitcoin-staking")));
  assert.ok(calls.some((call) => call.includes("mcp add bitcoin-staking")));

  await writeFile(join(fakeHome, ".agents", "skills", "bitcoin-staking-concierge", "SKILL.md"), "tampered", "utf8");
  const checked = await runInstaller(parseInstallerOptions("check", ["--hosts", "codex", "--local"]), { runCommand, packageRoot: resolve("."), homeDirectory: fakeHome, verifyServer: async () => completeVerification });
  assert.equal(checked.ok, false);
  assert.equal(checked.steps.find((step) => step.target === "codex-skill")?.status, "failed");
});

test("setup refuses version or exact tool-contract mismatches before host mutation", async () => {
  const calls: string[] = [];
  const result = await runInstaller(parseInstallerOptions("setup", []), {
    runCommand: async (command, args) => { calls.push(`${command} ${args.join(" ")}`); return { code: 0, stdout: "", stderr: "" }; },
    verifyServer: async () => ({ ...completeVerification, contractVersion: "1.0.0" }),
  });
  assert.equal(result.ok, false);
  assert.ok(!calls.some((call) => /mcp add/.test(call)));
  assert.match(result.steps.find((step) => step.target === "mcp-server")?.message ?? "", /contract=1\.0\.0/);
});

test("setup accepts an overdue registry in needs_review mode", async () => {
  const absent: CommandRunner = async () => ({ code: 127, stdout: "", stderr: "not installed" });
  const result = await runInstaller(parseInstallerOptions("setup", []), {
    runCommand: absent,
    verifyServer: async () => ({ ...completeVerification, registryReviewStatus: "needs_review" }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.steps.find((step) => step.target === "mcp-server")?.status, "verified");
});

test("Claude registration verification rejects a mismatched command", async () => {
  const result = await runInstaller(parseInstallerOptions("check", ["--hosts", "claude"]), {
    runCommand: async (_command, args) => args.join(" ") === "--version"
      ? { code: 0, stdout: "Claude", stderr: "" }
      : { code: 0, stdout: "bitcoin-staking:\n  Command: node\n  Args: wrong.js\n", stderr: "" },
    verifyServer: async () => 15,
  });
  assert.equal(result.ok, false);
  assert.ok(result.steps.some((step) => step.target === "claude" && step.status === "failed" && /does not match/i.test(step.message)));
});

test("uninstall attempts removal even when the host CLI probe would fail", async () => {
  const calls: string[] = [];
  const result = await runInstaller(parseInstallerOptions("uninstall", ["--hosts", "claude", "--keep-skill"]), {
    runCommand: async (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      return { code: 127, stdout: "", stderr: "command not found" };
    },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(calls, ["claude mcp remove --scope user bitcoin-staking"]);
  assert.ok(result.steps.some((step) => step.target === "claude" && step.status === "failed"));
});
