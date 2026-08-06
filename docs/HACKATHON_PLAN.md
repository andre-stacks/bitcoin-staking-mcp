# Bitcoin Staking MCP — Hackathon Delivery Plan

Deadline: Friday, August 7, 2026 at 5:00 PM ET. Stdio is required. Remote HTTP, custom UI, and transaction preparation are deferred.

## Milestones

- M1: Live mainnet PoX status, the dedicated testnet's scheduled/active PoX-5 state, and the explicitly labeled demo manifest are visible through MCP.
- M2: All eleven tools return validated structured output and the offline suite passes.
- M3: The concierge completes the native-yield and liquidity/borrowing journeys in Codex and Claude.
- M4: A clean clone installs, builds, runs, and supports the recorded demo.

## Thursday, August 6

- 1:15–2:15 PM: repository and product, technical, and delivery documents.
- 2:15–4:30 PM: schemas, manifest loader, live provider, provenance, economics, and recommendation logic.
- 4:30–7:00 PM: tools, resources, prompt, and stdio server.
- 7:00–8:00 PM: unit/MCP tests and Inspector run.
- 8:30–10:00 PM: concierge skill and both host configurations.
- 10:00–11:00 PM: Codex and Claude smoke tests.
- 11:00 PM: core feature freeze.

## Friday, August 7

- 8:00–10:00 AM: host fixes and final automated tests.
- 10:00–11:30 AM: source, disclosure, metadata, and example polish.
- 11:30 AM–12:30 PM: rehearse both journeys and capture Inspector fallback.
- 12:30–2:00 PM: record and edit primary demo.
- 2:00–3:00 PM: finalize README, screenshots, architecture, and submission copy.
- 3:00 PM: submission feature freeze.
- 3:00–4:00 PM: clean-clone validation in both hosts.
- 4:00–5:00 PM: upload and submission buffer.

## Demo script

1. Ask for current mainnet Bitcoin Staking protocol status and upcoming bonds.
2. Show live mainnet PoX-5 state and the honest absence of configured public manifests if applicable.
3. Switch explicitly to the dedicated PoX-5 testnet. Before activation, show its scheduled activation height and countdown; after activation, discover any configured upcoming on-chain bond.
4. If a testnet bond exists, point out `testnet_only_not_investable`; then request demo opportunities and show the separate `[DEMO]` manifest.
5. Ask whether PoX-5 is audited and how Leather can safely sign the native-L1 lock transaction. Show known facts, unproven integration claims, and the pre-funding checklist.
6. Invoke the concierge with a long-term, L1-only, self-controlled yield profile.
7. Build the participation plan and run a 1 BTC yield scenario.
8. Ask for continuous liquidity and borrowing without selling.
9. Show a native-bond no-match and sBTC context without inventing a live DeFi product.
10. End in Inspector on the tool schemas, read-only annotations, security sources, and structured output.

The exact prompts, state branches, fallback command, and recording close are in `docs/DEMO_RUNBOOK.md`.

## Recording checklist

- Start from a clean terminal and built commit.
- Keep the demo-data disclosure visible when the illustrative bond appears.
- Show source URLs and data status at least once.
- Show one deterministic calculation and one explicit no-match.
- Avoid wallet, key, transaction, or investment-action language.
- Record an Inspector fallback before the primary agent-host recording.

## Submission checklist

- `npm ci && npm run check` passes from a clean clone.
- `npm run test:live` passes immediately before recording.
- `npm run test:testnet` passes against the configured PoX-5 testnet immediately before recording.
- Skill validator passes.
- Codex and Claude list the server.
- The portable one-command installer passes setup and check from outside the repository.
- Claude lists the concierge MCP prompt.
- README commands are copied and rerun exactly.
- Repository is public, licensed, and contains no `.env`, private addresses, partner data, or credentials.
- Demo video, short description, architecture image, and repository URL are ready.

## Cut line

If schedule slips, cut remote HTTP, additional fixtures, participant status, compatibility breadth, then visual polish. Do not cut provenance, demo isolation, deterministic math, dual-host proof, or the two core journeys.
