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
  assert.match(skill, /stBTC.*under the StackingDAO pool/i);
  assert.match(skill, /For BitGo/i);
  assert.match(skill, /direct native-L1 bond is not borrowable/i);
  assert.match(skill, /Do not fill missing terms from memory/i);
  assert.match(skill, /Never construct, sign, or broadcast a transaction/);
  assert.match(skill, /Never present it as an investable fallback/i);
  assert.match(skill, /list_custody_paths/);
  assert.match(skill, /tool menu/i);
  assert.match(skill, /Onboarding follows the user's intent/i);
  assert.match(skill, /Bitcoin staking lets you put your BTC to work and earn rewards through the Stacks protocol/i);
  assert.match(skill, /Find current and upcoming opportunities/i);
  assert.match(skill, /Compare ways to participate/i);
  assert.match(skill, /Understand rewards, lockups, fees, and risks/i);
  assert.match(skill, /Build a personalized step-by-step participation plan/i);
  assert.match(skill, /When is the next bond launching/i);
  assert.match(skill, /How can I get started staking/i);
  assert.match(skill, /Which participation option is right for me/i);
  assert.match(skill, /Do not lead this general welcome with an upcoming bond/i);
  assert.match(skill, /If the user asks a specific question, skip the general welcome/i);
  assert.match(skill, /For opportunity or timing, call `get_market_snapshot`/i);
  assert.match(skill, /capability-only welcome does not need market data/i);
  assert.match(skill, /newest user request as the controlling scope/i);
  assert.match(skill, /audit-status question must not introduce BitGo/i);
  assert.match(skill, /Lead with the answer in ordinary language/i);
  assert.match(skill, /include a caveat only when it changes the answer/i);
  assert.match(skill, /do not list every unverified stBTC integration/i);
  assert.match(skill, /Final terms may change before launch/i);
  assert.match(skill, /Avoid stacked qualifiers, status jargon/i);
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
  assert.match(standard, /Lead with the answer in ordinary language/i);
  assert.match(standard, /surface a caveat only when it changes the conclusion/i);
  assert.match(standard, /do not list every unverified liquidity/i);
  assert.match(standard, /Final terms may change before launch/i);
  assert.match(standard, /stacked qualifiers and status jargon/i);
});

test("nightly registry validation preserves pipeline failures", async () => {
  const workflow = await readFile(resolve(".github/workflows/custody-registry-review.yml"), "utf8");
  assert.match(workflow, /id: registry\n\s+continue-on-error: true\n\s+shell: bash\n\s+run: npm run registry:validate:live \| tee registry-review\.md/);
  assert.match(workflow, /steps\.registry\.outcome == 'failure'/);
});

test("legacy diligence implementation is absent from source and packaged build output", async () => {
  await assert.rejects(readFile(resolve("src/core/diligence.ts"), "utf8"), { code: "ENOENT" });
  await assert.rejects(readFile(resolve("dist/core/diligence.js"), "utf8"), { code: "ENOENT" });
});
