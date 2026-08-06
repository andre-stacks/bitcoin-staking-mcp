import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("repo concierge skill enforces institutional voice and evidence-bound abstention", async () => {
  const skill = await readFile(
    resolve(".agents/skills/bitcoin-staking-concierge/SKILL.md"),
    "utf8",
  );

  assert.match(skill, /institutional Bitcoin Staking diligence analyst/i);
  assert.match(skill, /CFO or investment audiences/);
  assert.match(skill, /technical, security, or custody audiences/);
  assert.match(skill, /neutral, factual, concise, calm, and non-promotional/);
  assert.match(skill, /This MCP does not currently verify that/);
  assert.match(skill, /Do not fill missing facts from model memory/);
  assert.match(skill, /If a live tool fails, state that current status could not be verified/);
  assert.match(skill, /Treat `unknown`, `not_verified`, `not_assessable`, `context_only`, and empty results as conclusions/);
  assert.match(skill, /Never construct, sign, or broadcast a transaction/);
  assert.match(skill, /Do not ask the user to choose a network/i);
  assert.match(skill, /mainnet state and published manifests first/i);
  assert.match(skill, /inspect the configured testnet automatically/i);
  assert.match(skill, /demo data is never the automatic fallback/i);
  assert.match(skill, /proceed without repeating that question/i);
});

test("README examples stay network-agnostic", async () => {
  const readme = await readFile(resolve("README.md"), "utf8");

  assert.match(readme, /Users do not need to choose a network/);
  assert.match(readme, /best currently available data/);
  assert.doesNotMatch(readme, /On the configured testnet, which protocol bonds/);
  assert.doesNotMatch(readme, /Build an institutional diligence report for the PoX-5 testnet/);
});

test("concierge skill remains orchestration-only", async () => {
  const skill = await readFile(
    resolve(".agents/skills/bitcoin-staking-concierge/SKILL.md"),
    "utf8",
  );

  assert.doesNotMatch(skill, /targetRateBps|stxValueRatio|minUstxRatioBps/);
  assert.doesNotMatch(skill, /\b\d+(?:\.\d+)?%\s*(?:APY|yield)/i);
  assert.doesNotMatch(skill, /api\.(?:mainnet|testnet)[^\s]+\/v2\/pox/i);
});

test("public response standard matches the runtime abstention and audience contract", async () => {
  const standard = await readFile(resolve("docs/INSTITUTIONAL_RESPONSE_STANDARD.md"), "utf8");

  assert.match(standard, /institutional Bitcoin Staking diligence analyst/i);
  assert.match(standard, /CFO, investment committee, or treasury team/);
  assert.match(standard, /Technical, security, wallet, or custody team/);
  assert.match(standard, /This MCP does not currently verify that/);
  assert.match(standard, /Do not fill a missing fact from model memory/);
  assert.match(standard, /If a live tool fails or times out/);
  assert.match(standard, /Never infer wallet support from protocol compatibility/);
});
