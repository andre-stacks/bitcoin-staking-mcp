import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DEFAULT_PACKAGE_SPEC,
  parseInstallerOptions,
  runInstaller,
  type CommandRunner,
} from "../src/installer.js";

test("installer options default to both hosts and support aliases", () => {
  const defaults = parseInstallerOptions("setup", []);
  assert.deepEqual(defaults.hosts, ["codex", "claude"]);
  assert.equal(defaults.packageSpec, DEFAULT_PACKAGE_SPEC);
  assert.match(defaults.packageSpec, /#v0\.3\.0$/);

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
    return { code: 0, stdout: "ok", stderr: "" };
  };

  const result = await runInstaller(parseInstallerOptions("setup", []), {
    runCommand,
    packageRoot: resolve("."),
    homeDirectory: fakeHome,
    verificationCwd: tmpdir(),
    verifyServer: async () => 14,
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
  assert.ok(result.nextSteps.some((step) => step.includes("current protocol status")));
  assert.ok(result.nextSteps.some((step) => step.includes("security evidence")));
  assert.ok(result.nextSteps.some((step) => step.includes("complete capability menu")));
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

test("check reports missing host registration and skill", async (context) => {
  const fakeHome = await mkdtemp(join(tmpdir(), "bitcoin-staking-installer-check-"));
  context.after(() => rm(fakeHome, { recursive: true, force: true }));
  const result = await runInstaller(parseInstallerOptions("check", ["--hosts", "codex"]), {
    runCommand: async () => ({ code: 1, stdout: "", stderr: "not found" }),
    homeDirectory: fakeHome,
    verifyServer: async () => 14,
  });

  assert.equal(result.ok, false);
  assert.ok(result.steps.some((step) => step.target === "codex" && step.status === "failed"));
  assert.ok(result.steps.some((step) => step.target === "codex" && step.status === "failed"));
});

test("uninstall removes only selected registrations and the product skill", async (context) => {
  const fakeHome = await mkdtemp(join(tmpdir(), "bitcoin-staking-installer-uninstall-"));
  context.after(() => rm(fakeHome, { recursive: true, force: true }));
  const calls: Array<{ command: string; args: string[] }> = [];
  const runCommand: CommandRunner = async (command, args) => {
    calls.push({ command, args });
    return { code: 0, stdout: "removed", stderr: "" };
  };

  await runInstaller(parseInstallerOptions("setup", ["--hosts", "codex"]), {
    runCommand,
    packageRoot: resolve("."),
    homeDirectory: fakeHome,
    verifyServer: async () => 14,
  });
  const result = await runInstaller(parseInstallerOptions("uninstall", ["--hosts", "codex"]), {
    runCommand,
    packageRoot: resolve("."),
    homeDirectory: fakeHome,
    verifyServer: async () => 14,
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
