# Bitcoin Staking MCP — Product Requirements

Status: hackathon MVP. The product is read-only and does not authorize transaction construction, signing, broadcasting, or use of capital.

## Outcome

Make native Bitcoin staking discoverable, understandable, and agent-readable. An agent should be able to distinguish current protocol state, published product metadata, deterministic calculations, and illustrative demo data without inventing availability or compatibility.

## Users and jobs

Primary users are BTC holders working through an agent, institutional participants, wallet and custody teams, and developers building Bitcoin applications.

The MCP should help them:

- Find upcoming, open, or historical Bitcoin Staking bonds.
- Understand timing, capacity, economics, eligibility, BTC location, key-control, early-exit, and compatibility requirements.
- Inspect public PoX-5 and participant state.
- Answer recurring investor security questions with sourced assurance, explicit unknowns, and component-specific verification steps.
- Model yield scenarios with explicit assumptions.
- Determine whether a native-L1 bond fits a stated goal.
- Recognize when liquidity or borrowing goals require sBTC context or a future product rather than a native bond.

## Product layers

1. The Bitcoin Staking Intelligence Core owns schemas, source precedence, calculations, compatibility, and recommendation rules. It contains no LLM calls.
2. Bitcoin Staking MCP exposes the core through read-only tools and resources.
3. Bitcoin Staking Concierge is a prompt and an instruction-only skill that asks goal-oriented questions and composes MCP tools.

The concierge is not a second backend. A future web app should consume the same MCP or core interfaces.

## Core journeys

### Discover a bond

The agent reads live protocol status, scans the active on-chain PoX-5 bond window, lists public manifests, and optionally requests a separately grouped demo manifest. A testnet scan is opt-in and every result is explicitly non-investable. The agent can retrieve terms and on-chain verification for one manifest-backed bond.

### Evaluate fit

The concierge starts with “What would you like your Bitcoin to do?” It establishes goal, liquidity need, BTC-path preference, and key-control preference before asking amount, horizon, wallet, or custodian. It then returns fit, tradeoffs, missing facts, assumptions, sources, and the next safe step.

### Model yield

The user supplies a principal and any desired price or fee assumptions. The core performs deterministic, non-compounding scenario analysis. It refuses to calculate when the manifest does not define a compatible reward model.

### Check public state

The user supplies a public Stacks address. The server validates the address locally, then reads account, staking, bond membership, and applicable allowlist state. It never implies control of the address.

### Answer security diligence

The concierge classifies audit, timelock, Leather, pre-funding, recovery, and early-exit questions into deterministic security topics. Every answer states what is known, what remains unproven, and how to verify the exact wallet/application path. Sanitized investor questions guide coverage; private conversations are never returned or treated as evidence.

## Functional requirements

- Return structured and human-readable MCP tool results.
- Attach `dataStatus`, sources, assumptions, and verification time to every successful result.
- Serialize unsafe numeric blockchain values as decimal strings.
- Keep demo manifests separate from published/live records and exclude them by default.
- Keep native L1 BTC distinct from sBTC.
- Keep BTC location distinct from self-custody or custodial key control.
- Return unknown compatibility when evidence is missing.
- Treat product compatibility separately from PoX-5 protocol behavior.
- Keep protocol audits, SDK construction, wallet behavior, and end-to-end integration proof as separate evidence layers.
- Treat price inputs as scenarios rather than predictions.
- Make every MCP tool read-only and non-destructive.

## Success criteria

- Clean install and build on Node 22.
- Connect through stdio in Codex and Claude Code.
- Initialize and call every tool through MCP Inspector.
- Read current PoX status from the live Stacks API.
- Show scheduled PoX-5 activation on the dedicated testnet and discover configured bonds automatically once they exist, without conflating either state with mainnet availability.
- Keep demo opportunities impossible to mistake for live bonds.
- Reproduce yield outputs from automated tests.
- Produce an initial concierge assessment after at most four goal-oriented questions.
- Demonstrate one long-term native-yield journey and one liquidity/borrowing no-match journey.

## Exclusions

Transactions, PSBTs, signatures, wallet connection, private partner data, individualized financial advice, broad DeFi aggregation, custom web UI, autonomous outreach, CRM integrations, and live-capital actions are out of scope.

## Risks and guardrails

- Public APIs may be unavailable: return a typed, retryable upstream error without substituting stale demo data.
- The dedicated PoX-5 testnet may still be before its scheduled activation height: report the schedule and countdown, and return no protocol bonds rather than treating a future contract version as active.
- A public product document may lag chain state: label it published, not live.
- Wallet support may change: require cited product evidence and preserve unknown as unknown.
- A target APY may not define actual payout mechanics: refuse unsupported calculations.
- An agent may try to turn a checklist into execution: server capabilities contain no write or transaction-building tool.

## Roadmap

- Phase 1: read-only MCP and manifests.
- Phase 1.5: concierge prompt and skill.
- Phase 2: dedicated concierge UI and broader verified opportunity adapters.
- Phase 3: operator intelligence, unmet-demand signals, approved transaction preparation, and BD workflows.
