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
  assert.match(skill, /two stable route types/i);
  assert.match(skill, /multiple pools with different inputs and LST designs/i);
  assert.match(skill, /retaining control of native BTC on Bitcoin L1 through a preferred wallet or custody provider versus potentially using a staked BTC position in DeFi/i);
  assert.match(skill, /Do not equate this route with using only a self-custody wallet/i);
  assert.match(skill, /Resolve current software, hardware, multisig, institutional-wallet, and custody options from `list_custody_paths`/i);
  assert.match(skill, /Describe the pooled route first as “Join a pool”/i);
  assert.match(skill, /Which matters more to you: retaining control of native BTC on Bitcoin L1 through your preferred wallet or custody provider/i);
  assert.match(skill, /current named integration and sourced terms/i);
  assert.match(skill, /Do not add “No conversion to sBTC is required\.”/i);
  assert.match(skill, /For BitGo/i);
  assert.match(skill, /Do not narrate the absence of an amount-related rejection/i);
  assert.match(skill, /direct native-L1 bond is not borrowable/i);
  assert.match(skill, /Do not fill missing terms from memory/i);
  assert.match(skill, /Never construct, sign, or broadcast a transaction/);
  assert.match(skill, /Never present it as an investable fallback/i);
  assert.match(skill, /list_custody_paths/);
  assert.match(skill, /tool menu/i);
  assert.match(skill, /Onboarding follows the user's intent/i);
  assert.match(skill, /user-facing name is Scout/i);
  assert.match(skill, /warm, professional guide/i);
  assert.match(skill, /do not repeat the introduction in every answer/i);
  assert.match(skill, /Hi, I’m Scout, your Bitcoin Staking Concierge/i);
  assert.match(skill, /guide you through the process and answer your questions about earning rewards from BTC through the Stacks protocol/i);
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
  assert.match(skill, /Has the protocol been audited/i);
  assert.match(skill, /without volunteering report-availability/i);
  assert.match(skill, /reports have not been published publicly yet/i);
  assert.match(skill, /Bitcoin Staking team for access/i);
  assert.match(skill, /Lead with the answer in ordinary language/i);
  assert.match(skill, /include a caveat only when it changes the answer/i);
  assert.match(skill, /do not list every unverified stBTC integration/i);
  assert.match(skill, /wallet- or custody-only question/i);
  assert.match(skill, /Do not append a generic caveat that wallet support does not establish bond enrollment or availability/i);
  assert.match(skill, /planned to offer a 3% annualized rate for roughly six months/i);
  assert.match(skill, /rewards available in BTC or sBTC/i);
  assert.match(skill, /expected gross return over the six-month term is approximately 0\.015 BTC/i);
  assert.match(skill, /Do not describe this as 1\.5% growth over the term/i);
  assert.match(skill, /Final terms will be confirmed when each bond is published on-chain/i);
  assert.match(skill, /Avoid stacked qualifiers, status jargon/i);
});

test("Codex skill metadata presents Scout as the Bitcoin Staking Concierge", async () => {
  const metadata = await readFile(
    resolve(".agents/skills/bitcoin-staking-concierge/agents/openai.yaml"),
    "utf8",
  );

  assert.match(metadata, /display_name: "Scout — the Bitcoin Staking Concierge"/);
  assert.match(metadata, /Explore Bitcoin staking with Scout/);
  assert.match(metadata, /introduce Scout/);
});

test("hackathon and user-facing names remain distinct", async () => {
  const [plan, uxReview] = await Promise.all([
    readFile(resolve("docs/HACKATHON_PLAN.md"), "utf8"),
    readFile(resolve("docs/UX_REVIEW.md"), "utf8"),
  ]);

  assert.match(plan, /Submission name: \*\*Scout AI\*\*/);
  assert.match(plan, /Scout — the Bitcoin Staking Concierge/);
  assert.match(uxReview, /Scout AI.*internal hackathon submission/i);
  assert.match(uxReview, /not used as the concierge's name in onboarding/i);
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
  assert.match(standard, /without volunteering report availability/i);
  assert.match(standard, /reports have not been published publicly yet/i);
  assert.match(standard, /Bitcoin Staking team for access/i);
  assert.match(standard, /Do not introduce BitGo or any other named integration/i);
  assert.match(standard, /Lead with the answer in ordinary language/i);
  assert.match(standard, /surface a caveat only when it changes the conclusion/i);
  assert.match(standard, /do not list every unverified liquidity/i);
  assert.match(standard, /wallet- or custody-only question/i);
  assert.match(standard, /Do not append a generic caveat that wallet support does not establish bond enrollment or availability/i);
  assert.match(standard, /Describe the pooled option first as “Join a pool”/i);
  assert.match(standard, /Which matters more to you: retaining control of native BTC on Bitcoin L1 through your preferred wallet or custody provider/i);
  assert.match(standard, /software, hardware, multisig, institutional-wallet, and custody options from current MCP evidence rather than a fixed provider list/i);
  assert.match(standard, /Do not narrate that the amount did not trigger a rejection/i);
  assert.match(standard, /multiple pools with different input assets and LST designs/i);
  assert.match(standard, /planned to offer a 3% annualized rate for roughly six months/i);
  assert.match(standard, /expected gross return over the six-month term is approximately 0\.015 BTC/i);
  assert.match(standard, /Do not restate the expected six-month return as 1\.5% growth/i);
  assert.match(standard, /Final terms will be confirmed when each bond is published on-chain/i);
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
