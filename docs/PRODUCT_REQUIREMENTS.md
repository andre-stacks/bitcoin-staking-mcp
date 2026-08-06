# Bitcoin Staking MCP — Product Requirements

Status: v0.3.0 production beta. The product is read-only and does not authorize transaction construction, signing, broadcasting, or use of capital.

## Outcome

Make native Bitcoin staking discoverable, understandable, and agent-readable. An agent should be able to distinguish current protocol state, published product metadata, deterministic calculations, and illustrative demo data without inventing availability or compatibility.

## Users and jobs

Primary users are BTC holders working through an agent, institutional participants, wallet and custody teams, and developers building Bitcoin applications.

The default persona is a knowledgeable, approachable Bitcoin Staking guide with institutional-quality diligence. It helps users choose between a bond's direct native-L1 route and approved StackingDAO sBTC pool without becoming promotional or implying individualized advice. stBTC is an optional capability of that pool, not a third route.

The MCP should help them:

- Find upcoming, open, or historical Bitcoin Staking bonds.
- Compare the direct native-L1 route and approved StackingDAO sBTC pool; evaluate optional stBTC redemption and liquidity only within the pool.
- Understand timing, capacity, economics, eligibility, BTC location, key-control, early-exit, and compatibility requirements.
- Inspect public PoX-5 and participant state.
- Answer recurring investor security questions with sourced assurance, explicit unknowns, and component-specific verification steps.
- Model yield scenarios with explicit assumptions.
- Determine whether a native-L1 bond fits a stated goal.
- Recognize when liquidity or borrowing goals point to the planned stBTC path rather than a direct native-L1 bond, without implying that a live lending market exists.

## Product layers

1. The Bitcoin Staking Intelligence Core owns schemas, source precedence, calculations, compatibility, and recommendation rules. It contains no LLM calls.
2. Bitcoin Staking MCP exposes the core through read-only tools and resources.
3. Bitcoin Staking Concierge is a prompt and an instruction-only skill that asks goal-oriented questions and composes MCP tools.

The concierge is not a second backend. A future web app should consume the same MCP or core interfaces.

## Core journeys

### Discover a bond

The agent reads live protocol status, scans the active on-chain PoX-5 bond window, and lists public manifests without requiring the user to select a network. It checks mainnet and published opportunities first. When neither is available, it inspects the configured testnet automatically as the live demo/prototype environment for the intended mainnet journey. Testnet uses test assets and remains separate from mainnet opportunities. Demo manifests remain opt-in and separately grouped. The agent can retrieve terms and on-chain verification for one manifest-backed bond.

### Choose a participation route

An empty concierge invocation calls `get_market_snapshot`. It explains the direct native-L1 and approved StackingDAO sBTC-pool routes, then asks whether L1 custody, permissionless smaller-balance access, or liquidity matters most. A request that already contains a goal proceeds directly. The concierge returns the closest route, freshness, current status, the principal tradeoff, and one useful next action.

For a live protocol opportunity, `build_diligence_report` combines current network state, bounded bond discovery, the participant profile, exact configured-target math, and security evidence. When an upcoming published bond is not yet configured on-chain, it returns the schedule and preparation plan without substituting missing economic terms.

### Model yield

The user supplies a BTC/sBTC principal naturally and the service converts it to sats. A calculation is returned only when duration, rate, and every applicable route or selected-LST fee are sourced or explicitly supplied. CoinGecko BTC and STX prices are optional enrichment for paired-STX units; price failure does not block an otherwise complete sats-denominated scenario. Public-model inputs remain distinct from final configured bond terms.

### Check public state

The user supplies a public Stacks address. The server validates the address locally, then reads account, staking, bond membership, and applicable allowlist state. It never implies control of the address.

### Answer security diligence

The concierge classifies audit, timelock, Leather, pre-funding, recovery, and early-exit questions into deterministic security topics. Every answer states what is known, what remains unproven, and how to verify the exact wallet/application path. Sanitized investor questions guide coverage; private conversations are never returned or treated as evidence.

## Functional requirements

- Return structured and human-readable MCP tool results.
- Attach `dataStatus`, sources, assumptions, and verification time to every successful result.
- Ground protocol answers on live state, release-pinned contracts/reference implementations, accepted SIP-045, pinned SDK/tests, then official documentation in that order.
- Lead with decision-relevant conclusions while preserving primary-source traceability and explicit unknowns.
- Use only current MCP outputs and resources as factual support; never fill a missing answer from model memory, plausibility, roadmap intent, private chat, demo data, or a preferred conclusion.
- Use the explicit abstention “This MCP does not currently verify that” when the available evidence cannot answer a material question, followed by the evidence needed to resolve it.
- Treat `unknown`, `not_verified`, `not_assessable`, `context_only`, and empty results as final evidence states rather than prompts to guess.
- Serialize unsafe numeric blockchain values as decimal strings.
- Keep demo manifests separate from published/live records and exclude them by default.
- Route generic opportunity questions by evidence precedence: mainnet and published bonds first, then a labeled testnet preview; never require a network-specific user prompt.
- Keep native L1 BTC distinct from sBTC.
- Keep BTC location distinct from self-custody or custodial key control.
- Return unknown compatibility when evidence is missing.
- Expose the product-level custody directory without requiring a configured bond, including review freshness and explicit non-support.
- Expose exactly two approved bond routes: direct native-L1 and an approved sBTC pool. Represent any LST as an optional capability nested within its pool.
- Never default to waiting when an upcoming or adjacent route exists; name the closest route and the key tradeoff.
- Treat product compatibility separately from PoX-5 protocol behavior.
- Keep protocol audits, SDK construction, wallet behavior, and end-to-end integration proof as separate evidence layers.
- Treat price inputs as scenarios rather than predictions.
- Separate reference-program economics from final bond-specific and on-chain terms.
- Refuse a yield calculation unless duration, rate, and every applicable bond, pool, or selected-LST fee are sourced or explicitly supplied.
- Make every MCP tool read-only and non-destructive.

## Success criteria

- Clean install and build on Node 22.
- Complete a portable Codex and Claude installation from one `npx` command without requiring the user to remain in the repository.
- End setup with example questions and make an empty concierge invocation explain the available services and recommended first action.
- Verify the MCP handshake, both host registrations, and the global Codex skill; provide machine-readable check and targeted uninstall paths.
- Connect through stdio in Codex and Claude Code.
- Initialize and call every tool through MCP Inspector.
- Read current PoX status from the live Stacks API.
- Show scheduled PoX-5 activation on the dedicated testnet and discover configured bonds automatically once they exist, without conflating either state with mainnet availability.
- Replace the pre-production preview automatically when verified mainnet or published opportunity data becomes available, without changing the user-facing questions.
- Keep demo opportunities impossible to mistake for live bonds.
- Reproduce yield outputs from automated tests.
- Preserve `demo` provenance through every calculation based on synthetic terms.
- Invoke and metadata-validate every tool through an in-process MCP client without live-network dependencies.
- Demonstrate that a failed live read returns an explicit error and never falls back to demo or remembered state.
- Keep the prompt, skill, and response-standard resource aligned on guided discovery and evidence boundaries.
- Produce an initial concierge assessment after at most four goal-oriented questions.
- Demonstrate one direct native-yield journey and one liquidity/borrowing journey that routes to the closest planned stBTC path without presenting a live lending market.

## Exclusions

Transactions, PSBTs, signatures, wallet connection, private partner data, individualized financial advice, broad DeFi aggregation, custom web UI, autonomous outreach, CRM integrations, and live-capital actions are out of scope.

## Risks and guardrails

- Public APIs may be unavailable: return a typed, retryable upstream error without substituting stale demo data.
- The dedicated PoX-5 testnet may still be before its scheduled activation height: report the schedule and countdown, and return no protocol bonds rather than treating a future contract version as active.
- A public product document may lag chain state: label it published, not live.
- Wallet support may change: require cited product evidence and preserve unknown as unknown.
- A target APY may not define actual payout mechanics: refuse unsupported calculations.
- An agent may try to turn a checklist into execution: server capabilities contain no write or transaction-building tool.
- A host model can still ignore instructions: deterministic outputs, provenance, explicit unknown states, and adversarial host checks reduce this risk, but the product does not claim a mathematical no-hallucination guarantee for free-form model prose.

## Roadmap

- Phase 1: read-only MCP and manifests.
- Phase 1.5: concierge prompt and skill.
- Phase 2: dedicated concierge UI and broader verified opportunity adapters.
- Phase 3: operator intelligence, unmet-demand signals, approved transaction preparation, and BD workflows.
