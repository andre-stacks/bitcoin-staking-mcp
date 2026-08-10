# Bitcoin Staking MCP — Product Requirements

Status: v0.5.1 production beta. The product is read-only and does not authorize transaction construction, signing, broadcasting, or use of capital.

## Outcome

Make native Bitcoin staking discoverable, understandable, and agent-readable. An agent should distinguish current mainnet protocol state, published product metadata, and deterministic calculations without inventing availability or compatibility.

## Users and jobs

Primary users are BTC holders working through an agent, institutional participants, wallet and custody teams, and developers building Bitcoin applications.

The default persona is a knowledgeable, approachable Bitcoin Staking guide with institutional-quality diligence. It helps users choose between direct native-L1 and pool-based participation without becoming promotional or implying individualized advice. Current pool operators, input assets, integrations, and optional LST capabilities come from the registry.

The MCP should help them:

- Find upcoming, open, or historical Bitcoin Staking bonds.
- Compare direct native-L1 and pool-based routes; evaluate any registry-published LST redemption and liquidity only within its pool.
- Understand timing, capacity, economics, eligibility, BTC location, key-control, early-exit, and compatibility requirements.
- Inspect public PoX-5 and participant state.
- Answer recurring investor security questions with sourced assurance, explicit unknowns, and component-specific verification steps.
- Model yield scenarios with explicit assumptions.
- Determine whether a native-L1 bond fits a stated goal.
- Recognize when liquidity or borrowing goals point to the planned stBTC path rather than a direct native-L1 bond. Name a registry-supported planned destination such as Zest Protocol while keeping rates, eligibility, final collateral parameters, contracts, and launch availability pending until current evidence verifies them.

## Product layers

1. The Bitcoin Staking Intelligence Core owns schemas, source precedence, calculations, compatibility, and recommendation rules. It contains no LLM calls.
2. Bitcoin Staking MCP exposes the core through read-only tools and resources.
3. Bitcoin Staking Concierge is a prompt and an instruction-only skill that asks goal-oriented questions and composes MCP tools.

The concierge is not a second backend. A future web app should consume the same MCP or core interfaces.

## Core journeys

### Discover a bond

The agent reads live mainnet protocol status, scans the active on-chain PoX-5 bond window, and lists reviewed mainnet manifests. The user does not select a network. When no current opportunity is supported, the agent reports the missing evidence and the closest useful preparation step. It can retrieve terms and on-chain verification for one manifest-backed bond.

### Choose a participation route

The user-facing identity is **Scout — the Bitcoin Staking Concierge**. An empty invocation receives concise capability-first onboarding from Scout: a personable introduction, four user-facing capabilities, and three starter questions. Every non-empty request, including a broad getting-started request, bypasses general onboarding and proceeds directly to the relevant evidence-backed workflow. The welcome never repeats within a conversation. For a general participation request, the first choice is framed around keeping BTC on Bitcoin L1 in self-custody or with a supported custodian versus using sBTC to borrow, lend, or unlock additional yield opportunities. The direct route keeps BTC native and may support software, hardware, multisig, institutional-wallet, or third-party custody arrangements; those options remain evidence-driven and are not enumerated before the user chooses that route. Explicit L1, custody, liquidity, and early-exit constraints remain active throughout route selection until the user changes them. A supported institutional custodian is treated as a direct-path fit when current compatibility evidence supports it and the user's requirement is to keep BTC native under the existing custody arrangement. Sole-key control and early-exit availability remain separate questions. The pooled option begins with “Join a pool,” while its operator, required asset, LST design, and integrations remain evidence-driven. The concierge returns the closest route, freshness, current status, the principal tradeoff, one concise provenance note for time-sensitive opportunity, security, and custody answers, and one useful next action when the user asks for route guidance.

When a user clearly accepts a route and asks where to sign up or apply, Scout enters a conclusive handoff instead of restarting discovery. For the scheduled direct native-L1 Bitcoin Staking path, it surfaces the current Stacks institutional access form as **Register your interest here** and says: “Submitting the form connects you with the Stacks team. They’ll follow up to guide you through onboarding and the next allocation steps.” It closes with: “If you’re interested in accessing the Bitcoin Staking application, you’ll be able to visit `staking.stacks.co`.” Once current evidence verifies open enrollment and an approved URL, the primary CTA becomes **Start enrollment**.

For a live protocol opportunity, `build_diligence_report` combines current network state, bounded bond discovery, the participant profile, exact configured-target math, and security evidence. When an upcoming published bond is not yet configured on-chain, it returns the schedule and preparation plan without substituting missing economic terms.

### Model yield

The user supplies a BTC/sBTC principal naturally and the service converts it to sats. A gross calculation is returned when duration and rate are sourced or explicitly supplied. Missing route or selected-LST fees leave net yield unknown. CoinGecko BTC and STX prices are the default source for paired-STX units; price failure does not block an otherwise complete sats-denominated scenario. Public-model inputs remain distinct from final configured bond terms.

For a general yield question without an amount, the agent should lead with registry-backed planned economics instead of only reporting that final terms are missing. When supported by current evidence, it states the annualized rate, approximate term, returned reward asset, and a 1 BTC gross-return example from `simulate_yield`, then invites the user to provide an amount. Planned product targets, public reference-model assumptions, bond-specific terms, and final on-chain configured terms remain distinct.

### Check public state

The user supplies a public Stacks address. The server validates the address locally, then reads account, staking, bond membership, and applicable allowlist state. It never implies control of the address.

### Answer security diligence

The concierge classifies audit, timelock, Leather, pre-funding, recovery, and early-exit questions into deterministic security topics. For a broad Bitcoin-safety question, it uses a security-foundation, independent-verification, bounded-residual-risk sequence: explain Bitcoin-enforced native-L1 protections first, then audits and concrete transaction/recovery checks, then supported software and operational risks. It does not open with a blanket disclaimer and does not apply native-L1 script properties to a pool-based route. It applies progressive disclosure: a simple audit-status answer names the published assurance and reviewers, while report availability, scope, findings, remediation, and commit attestations appear only when the user asks for the documents or deeper audit diligence. Other material security answers state what is known, what remains unproven, and how to verify the exact wallet/application path. Supported capabilities come first; decision-relevant limitations follow in separate plain sentences instead of contrastive caveat clauses. User actions and outcomes come before protocol infrastructure terms. Technical terms such as coordinator, co-signing, reclaim transaction, unlock material, and signer policy appear only when the user asks for that detail. Sanitized investor questions guide coverage; private conversations are never returned or treated as evidence.

## Functional requirements

- Return structured and human-readable MCP tool results.
- Attach `dataStatus`, sources, assumptions, and verification time to every successful result.
- Ground protocol answers on live state, release-pinned contracts/reference implementations, accepted SIP-045, pinned SDK/tests, then official documentation in that order.
- Lead with decision-relevant conclusions while preserving primary-source traceability and explicit unknowns.
- Use only current MCP outputs and resources as factual support; never fill a missing answer from model memory, plausibility, roadmap intent, private chat, or a preferred conclusion.
- Use the explicit abstention “This MCP does not currently verify that” when the available evidence cannot answer a material question, followed by the evidence needed to resolve it.
- Treat `unknown`, `not_verified`, `not_assessable`, `context_only`, and empty results as final evidence states rather than prompts to guess.
- Serialize unsafe numeric blockchain values as decimal strings.
- Route generic opportunity questions through mainnet runtime state and reviewed mainnet product records; never require a network-specific user prompt.
- Keep native L1 BTC distinct from sBTC.
- Keep BTC location distinct from self-custody or custodial key control.
- Return unknown compatibility when evidence is missing.
- Expose the product-level custody directory without requiring a configured bond, including review freshness and explicit non-support.
- Expose two stable bond route types: direct native-L1 and pool-based participation. Allow one or more current pool implementations with distinct input assets and designs, and represent any LST as an optional capability nested within its pool.
- Never default to waiting when an upcoming or adjacent route exists; name the closest route and the key tradeoff.
- Treat product compatibility separately from PoX-5 protocol behavior.
- Keep protocol audits, SDK construction, wallet behavior, and end-to-end integration proof as separate evidence layers.
- Treat price inputs as scenarios rather than predictions.
- Separate reference-program economics from final bond-specific and on-chain terms.
- Refuse a gross yield calculation unless duration and rate are sourced or explicitly supplied; leave net yield unknown until every applicable bond, pool, or selected-LST fee is known.
- Make every MCP tool read-only and non-destructive.

## Success criteria

- Clean install and build on Node 22.
- Complete a portable Codex and Claude installation from one `npx` command without requiring the user to remain in the repository.
- End setup with example questions and make an empty concierge invocation explain the available services and recommended first action.
- Verify the MCP handshake, both host registrations, and the global Codex skill; provide machine-readable check and targeted uninstall paths.
- Connect through stdio in Codex and Claude Code.
- Initialize and call every tool through MCP Inspector.
- Read current PoX status from the live Stacks API.
- Reproduce yield outputs from automated tests.
- Invoke and metadata-validate every tool through an in-process MCP client without live-network dependencies.
- Demonstrate that a failed live read returns an explicit error and never falls back to stale or remembered state.
- Keep the prompt, skill, and response-standard resource aligned on guided discovery and evidence boundaries.
- Produce an initial concierge assessment after at most four goal-oriented questions.
- Cover one direct native-yield journey and one liquidity/borrowing journey that routes to the closest supported stBTC path without presenting an unverified lending market as live.

## Exclusions

Transactions, PSBTs, signatures, wallet connection, private partner data, individualized financial advice, broad DeFi aggregation, custom web UI, autonomous outreach, CRM integrations, and live-capital actions are out of scope.

## Risks and guardrails

- Public APIs may be unavailable: return a typed, retryable upstream error without substituting stale data.
- A public product document may lag chain state: label it published, not live.
- Wallet support may change: require cited product evidence and preserve unknown as unknown.
- A target APY may support a labeled gross scenario without defining actual payout mechanics; never infer fees or present an unknown net payout.
- An agent may try to turn a checklist into execution: server capabilities contain no write or transaction-building tool.
- A host model can still ignore instructions: deterministic outputs, provenance, explicit unknown states, and adversarial host checks reduce this risk, but the product does not claim a mathematical no-hallucination guarantee for free-form model prose.

## Roadmap

- Phase 1: read-only MCP and manifests.
- Phase 1.5: concierge prompt and skill.
- Phase 2: dedicated concierge UI and broader verified opportunity adapters.
- Phase 3: operator intelligence, unmet-demand signals, approved transaction preparation, and BD workflows.
