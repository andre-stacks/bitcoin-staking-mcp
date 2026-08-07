import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SKILL_VERSION } from "../src/mcp/server.js";

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
  assert.match(skill, /keeping Bitcoin on L1 in self-custody versus using the staked position to borrow, lend, or unlock additional yield opportunities/i);
  assert.match(skill, /Do not imply that the route supports only self-custody/i);
  assert.match(skill, /Resolve current software, hardware, multisig, institutional-wallet, and custody options from `list_custody_paths`/i);
  assert.match(skill, /Describe the pooled route first as “Join a pool”/i);
  assert.match(skill, /Which matters more to you: keeping your Bitcoin on L1 in self-custody, or using your staked position to borrow, lend, or unlock additional yield opportunities/i);
  assert.match(skill, /current named integration and sourced terms/i);
  assert.match(skill, /names a planned integration, name it as the planned destination/i);
  assert.match(skill, /general intention to support other DeFi protocols into a named integration/i);
  assert.match(skill, /Do not add “No conversion to sBTC is required\.”/i);
  assert.match(skill, /Do not narrate the absence of an amount-related rejection/i);
  assert.match(skill, /search_current_facts/i);
  assert.match(skill, /named wallet or custodian/i);
  assert.match(skill, /require a current named live integration/i);
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
  assert.match(skill, /Where do I sign up.*handoff intent/i);
  assert.match(skill, /direct native-L1 Bitcoin Staking path.*do not use an internal bond name/i);
  assert.match(skill, /primary CTA labeled “Register your interest here/i);
  assert.match(skill, /connects you with the Stacks team/i);
  assert.match(skill, /follow up to guide you through onboarding and the next allocation steps/i);
  assert.match(skill, /you’ll be able to visit `staking\.stacks\.co`/i);
  assert.match(skill, /do not add configuration or availability commentary to the conclusion/i);
  assert.match(skill, /primary CTA labeled “Start enrollment/i);
  assert.match(skill, /Do not restart route discovery/i);
  assert.match(skill, /newest user request as the controlling scope/i);
  assert.match(skill, /allocation and enrollment mechanics as silent background context, not an investor-facing checklist/i);
  assert.match(skill, /Do not proactively mention address binding, allocation immutability, partial enrollment or top-ups, overlapping-address rules, UTXO mechanics, rollover windows, reserve operations, or split-wallet handoffs/i);
  assert.match(skill, /only when the user asks about it, it materially changes the selected route or immediate next step, or it is needed to correct a false assumption/i);
  assert.match(skill, /fully enrolled based only on a Bitcoin funding or lock transaction/i);
  assert.match(skill, /required Stacks registration is complete/i);
  assert.match(skill, /provider-specific setup requirements only when the user names that provider/i);
  assert.match(skill, /single next operational question needed to proceed; do not launch a readiness questionnaire/i);
  assert.match(skill, /Has the protocol been audited/i);
  assert.match(skill, /Security confidence sequence/i);
  assert.match(skill, /Security starts with Bitcoin itself/i);
  assert.match(skill, /security foundation.*Independent verification.*Bounded residual risk/is);
  assert.match(skill, /Like any financial software, risk is not zero/i);
  assert.match(skill, /Do not open a broad safety answer with “your Bitcoin cannot be guaranteed completely safe”/i);
  assert.match(skill, /Never apply native-L1 Bitcoin-script protections to a pool-based route/i);
  assert.match(skill, /without volunteering report-availability/i);
  assert.match(skill, /check current MCP evidence: provide any returned public report links/i);
  assert.match(skill, /if none are returned, say that the current evidence does not include them/i);
  assert.match(skill, /Bitcoin Staking team for access/i);
  assert.match(skill, /Lead with the answer in ordinary language/i);
  assert.match(skill, /include a caveat only when it changes the answer/i);
  assert.match(skill, /State the supported capability first and explain how it works/i);
  assert.match(skill, /Do not manufacture a negative contrast around a supported feature/i);
  assert.match(skill, /Explain what the user does and what happens next before naming protocol infrastructure/i);
  assert.match(skill, /PoX-5 supports an optional early-exit path/i);
  assert.match(skill, /check current bond and route evidence before saying the user can use it/i);
  assert.match(skill, /When a bond enables it, explain the Stacks transaction and later Bitcoin wallet approval/i);
  assert.match(skill, /Early Exit Coordinator.*for technical follow-up/i);
  assert.match(skill, /state it plainly in its own sentence after the mechanism/i);
  assert.match(skill, /do not list every unverified pool-specific LST integration/i);
  assert.match(skill, /wallet- or custody-only question/i);
  assert.match(skill, /Do not append a generic caveat that wallet support does not establish bond enrollment or availability/i);
  assert.match(skill, /returned annualized rate and approximate term/i);
  assert.match(skill, /call `simulate_yield` with a 1 BTC principal/i);
  assert.match(skill, /do not calculate the return in prose/i);
  assert.match(skill, /planned product targets and public reference-model assumptions distinct from bond-specific terms and final on-chain configured terms/i);
  assert.match(skill, /every bond term is 12 reward cycles, approximately six months on mainnet/i);
  assert.match(skill, /native-L1 unlock height.*one-half reward cycle before the bond ends/i);
  assert.match(skill, /contract-fixed 12-cycle term is a stable protocol invariant/i);
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
  assert.match(readme, /direct native-L1.*current pool-based routes/i);
  assert.match(readme, /Fifteen read-only MCP tools/i);
});

test("concierge skill remains orchestration-only", async () => {
  const skill = await readFile(
    resolve(".agents/skills/bitcoin-staking-concierge/SKILL.md"),
    "utf8",
  );

  assert.doesNotMatch(skill, /targetRateBps|stxValueRatio|minUstxRatioBps/);
  assert.match(skill, /current registry evidence supports them/i);
  assert.match(skill, /public reference-model/i);
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
  assert.match(standard, /Allocation and enrollment mechanics are silent background context, not an investor-facing checklist/i);
  assert.match(standard, /Do not proactively mention address binding, allocation immutability, partial enrollment or top-ups, overlapping-address rules, UTXO mechanics, rollover windows, reserve operations, or split-wallet handoffs/i);
  assert.match(standard, /only when the user asks about it, it materially changes the selected route or immediate next step, or it is needed to correct a false assumption/i);
  assert.match(standard, /fully enrolled based only on a Bitcoin funding or lock transaction/i);
  assert.match(standard, /required Stacks registration is complete/i);
  assert.match(standard, /provider-specific setup requirements only when the user names that provider/i);
  assert.match(standard, /single next operational question needed to proceed; do not launch a readiness questionnaire/i);
  assert.match(standard, /Where do I sign up.*handoff intent/i);
  assert.match(standard, /direct native-L1 Bitcoin Staking path.*do not use an internal bond name/i);
  assert.match(standard, /institutional access form as \*\*Register your interest here\*\*/i);
  assert.match(standard, /connects you with the Stacks team/i);
  assert.match(standard, /follow up to guide you through onboarding and the next allocation steps/i);
  assert.match(standard, /you’ll be able to visit `staking\.stacks\.co`/i);
  assert.match(standard, /verified enrollment link \*\*Start enrollment\*\*/i);
  assert.match(standard, /never imply that a form was submitted/i);
  assert.match(standard, /without volunteering report availability/i);
  assert.match(standard, /Security starts with Bitcoin itself/i);
  assert.match(standard, /Security foundation.*Independent verification.*Bounded residual risk/is);
  assert.match(standard, /Like any financial software, risk is not zero/i);
  assert.match(standard, /Do not open a broad safety answer with “your Bitcoin cannot be guaranteed completely safe”/i);
  assert.match(standard, /Never apply native-L1 Bitcoin-script protections to a pool-based route/i);
  assert.match(standard, /check current MCP evidence: provide any returned public report links/i);
  assert.match(standard, /if none are returned, say that the current evidence does not include them/i);
  assert.match(standard, /Bitcoin Staking team for access/i);
  assert.match(standard, /Do not introduce BitGo or any other named integration/i);
  assert.match(standard, /Lead with the answer in ordinary language/i);
  assert.match(standard, /surface a caveat only when it changes the conclusion/i);
  assert.match(standard, /State a supported capability first and explain how it works/i);
  assert.match(standard, /Do not manufacture a negative contrast around it/i);
  assert.match(standard, /Explain what the user does and what happens next before naming protocol infrastructure/i);
  assert.match(standard, /PoX-5 supports an optional early-exit path before maturity/i);
  assert.match(standard, /Whether it is available for a specific bond requires current bond and route confirmation/i);
  assert.match(standard, /submit an early-exit transaction on Stacks and approve it in your wallet/i);
  assert.match(standard, /approve a Bitcoin transaction in your wallet to return the BTC to your address/i);
  assert.match(standard, /Early Exit Coordinator.*for technical follow-up/i);
  assert.match(standard, /give it a separate plain sentence after the mechanism/i);
  assert.match(standard, /do not list every unverified liquidity/i);
  assert.match(standard, /wallet- or custody-only question/i);
  assert.match(standard, /Do not append a generic caveat that wallet support does not establish bond enrollment or availability/i);
  assert.match(standard, /Describe the pooled option first as “Join a pool”/i);
  assert.match(standard, /Which matters more to you: keeping your Bitcoin on L1 in self-custody, or using your staked position to borrow, lend, or unlock additional yield opportunities/i);
  assert.match(standard, /software, hardware, multisig, institutional-wallet, and custody options from current MCP evidence rather than a fixed provider list/i);
  assert.match(standard, /Do not narrate that the amount did not trigger a rejection/i);
  assert.match(standard, /multiple pools with different input assets and LST designs/i);
  assert.match(standard, /returned annualized rate and approximate term/i);
  assert.match(standard, /use `simulate_yield` with a 1 BTC principal/i);
  assert.match(standard, /Do not infer the worked return in prose/i);
  assert.match(standard, /Planned product targets and public reference-model assumptions are not bond-specific terms; bond-specific terms are not proof of final on-chain configuration/i);
  assert.match(standard, /every bond term at 12 reward cycles, approximately six months on mainnet/i);
  assert.match(standard, /native-L1 unlock height.*one-half reward cycle before the bond ends/i);
  assert.match(standard, /contract-fixed 12-cycle term is a stable protocol invariant/i);
  assert.match(standard, /stacked qualifiers and status jargon/i);
});

test("static Scout policy surfaces do not retain current schedule or economics", async () => {
  const paths = [
    ".agents/skills/bitcoin-staking-concierge/SKILL.md",
    "README.md",
    "docs/DEMO_RUNBOOK.md",
    "docs/INSTITUTIONAL_RESPONSE_STANDARD.md",
    "docs/PRODUCT_REQUIREMENTS.md",
    "docs/SECURITY_QUESTION_CATALOG.md",
    "docs/SOURCE_CORPUS.md",
    "docs/TECHNICAL_SPEC.md",
    "docs/UX_REVIEW.md",
    "src/content.ts",
    "src/institutional.ts",
    "src/mcp/server.ts",
  ];
  const forbidden = [
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}(?:, \d{4})?\b/i,
    /\b20\d{2}-\d{2}-\d{2}\b/,
    /\b\d+(?:\.\d+)?% annualized\b/i,
    /\broughly \w+(?:-\w+)? months?\b/i,
    /\bgross (?:return|reward)[^.\n]*\b0\.\d+ BTC\b/i,
  ];
  for (const path of paths) {
    const surface = await readFile(resolve(path), "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(surface, pattern, `${path} retains a time-sensitive product fact`);
    }
  }

  const runtimeOperatorSurfaces = [
    ".agents/skills/bitcoin-staking-concierge/SKILL.md",
    "README.md",
    "docs/INSTITUTIONAL_RESPONSE_STANDARD.md",
    "docs/PRODUCT_REQUIREMENTS.md",
    "docs/SECURITY_QUESTION_CATALOG.md",
    "docs/SOURCE_CORPUS.md",
    "docs/UX_REVIEW.md",
    "src/content.ts",
    "src/institutional.ts",
    "src/mcp/server.ts",
    "src/service.ts",
  ];
  for (const path of runtimeOperatorSurfaces) {
    const surface = await readFile(resolve(path), "utf8");
    assert.doesNotMatch(surface, /StackingDAO/, `${path} retains a current pool operator`);
  }

  const audit = await readFile(resolve("docs/IMPLEMENTATION_AUDIT.md"), "utf8");
  const documentedSkillVersions = [...audit.matchAll(/skill `?(\d+\.\d+\.\d+)`?/gi)].map((match) => match[1]);
  assert.ok(documentedSkillVersions.length >= 2);
  assert.deepEqual([...new Set(documentedSkillVersions)], [SKILL_VERSION]);
});

test("nightly registry validation preserves pipeline failures", async () => {
  const workflow = await readFile(resolve(".github/workflows/custody-registry-review.yml"), "utf8");
  const checker = await readFile(resolve("scripts/check-registry.ts"), "utf8");
  assert.match(workflow, /id: registry[\s\S]+run: npm run registry:validate:live \| tee registry-review\.md/);
  assert.match(workflow, /steps\.registry\.outcome == 'failure'/);
  assert.match(checker, /for \(const source of sources\.filter\(\(item\) => item\.url\)\)/);
  assert.doesNotMatch(checker, /sourceType === "public_manifest"|sourceType === "demo_manifest"/);
});

test("legacy diligence implementation is absent from source and packaged build output", async () => {
  await assert.rejects(readFile(resolve("src/core/diligence.ts"), "utf8"), { code: "ENOENT" });
  await assert.rejects(readFile(resolve("dist/core/diligence.js"), "utf8"), { code: "ENOENT" });
});
