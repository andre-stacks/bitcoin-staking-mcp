import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("repo concierge skill enforces guided discovery and evidence boundaries", async () => {
  const skill = await readFile(
    resolve(".agents/skills/bitcoin-staking-concierge/SKILL.md"),
    "utf8",
  );

  assert.match(skill, /knowledgeable, approachable guide/i);
  assert.match(skill, /closest participation route/i);
  assert.match(skill, /Never default to “wait”/i);
  assert.match(skill, /list_bond_participation_routes/);
  assert.match(skill, /StackingDAO sBTC pool/i);
  assert.match(skill, /stBTC.*optional.*pool capability/i);
  assert.match(skill, /For BitGo/i);
  assert.match(skill, /direct native-L1 bond is not borrowable/i);
  assert.match(skill, /Do not fill missing terms from memory/i);
  assert.match(skill, /Never construct, sign, or broadcast a transaction/);
  assert.match(skill, /Never present it as an investable fallback/i);
  assert.match(skill, /list_custody_paths/);
  assert.match(skill, /Do not show a tool menu/i);
  assert.match(skill, /keeping BTC on L1, staying liquid, or starting with a smaller pooled position/i);
  assert.match(skill, /newest user request as the controlling scope/i);
  assert.match(skill, /audit-status question must not introduce BitGo/i);
});

test("README examples stay network-agnostic", async () => {
  const readme = await readFile(resolve("README.md"), "utf8");

  assert.match(readme, /Users do not need to choose a network/);
  assert.match(readme, /best currently available data/);
  assert.doesNotMatch(readme, /On the configured testnet, which protocol bonds/);
  assert.doesNotMatch(readme, /Build an institutional diligence report for the PoX-5 testnet/);
  assert.match(readme, /direct native-L1.*StackingDAO sBTC pool/i);
  assert.match(readme, /Fourteen read-only MCP tools/i);
});

test("concierge skill remains orchestration-only", async () => {
  const skill = await readFile(
    resolve(".agents/skills/bitcoin-staking-concierge/SKILL.md"),
    "utf8",
  );

  assert.doesNotMatch(skill, /targetRateBps|stxValueRatio|minUstxRatioBps/);
  assert.match(skill, /public model/i);
  assert.match(skill, /CoinGecko prices may enrich the scenario/i);
  assert.match(skill, /three-decimal display fields/i);
  assert.match(skill, /show the gross reward.*net reward as unknown/i);
  assert.match(skill, /prices may enrich the scenario but do not replace missing rate or duration inputs/i);
  assert.doesNotMatch(skill, /api\.(?:mainnet|testnet)[^\s]+\/v2\/pox/i);
});

test("public response standard matches the guided, evidence-bound contract", async () => {
  const standard = await readFile(resolve("docs/INSTITUTIONAL_RESPONSE_STANDARD.md"), "utf8");

  assert.match(standard, /knowledgeable Bitcoin Staking guide/i);
  assert.match(standard, /CFO, investment committee, or treasury team/);
  assert.match(standard, /Technical, security, wallet, or custody team/);
  assert.match(standard, /This MCP does not currently verify that/);
  assert.match(standard, /Do not fill a missing fact from model memory/);
  assert.match(standard, /If a live tool fails or times out/);
  assert.match(standard, /Never infer wallet support from protocol compatibility/);
  assert.match(standard, /Never default to “wait”/i);
  assert.match(standard, /One useful next-step question/i);
  assert.match(standard, /newest user request controls the response scope/i);
  assert.match(standard, /Do not introduce BitGo or any other named integration/i);
});
