# Bitcoin Staking MCP — Technical Specification

## Architecture

```mermaid
flowchart LR
  A["Stacks mainnet API"] --> P["Live provider"]
  B["Atomic Vercel registry snapshot"] --> M["Registry provider"]
  P --> C["Staking intelligence core"]
  M --> C
  C --> S["MCP tools and resources"]
  S --> X["Codex skill"]
  S --> Y["Claude MCP prompt"]
  S --> Z["Other MCP clients"]
```

The TypeScript core has no model dependency. The stdio server constructs a new MCP instance per connection. The separate Next.js registry console publishes data, not MCP requests.

## Runtime and dependencies

- Node 22, ESM, TypeScript 5.9, and Zod 4.
- `@modelcontextprotocol/server` 2.0.0 for MCP v2 with legacy-client support.
- `@stacks/bitcoin-staking` 7.6.0 for PoX-5 reads.
- `@stacks/network` and `@stacks/transactions` 7.6.0 for network and address validation.
- All package versions are pinned in `package-lock.json`.

## Core schemas

`BondManifestV2` contains shared bond identity, lifecycle, network, optional on-chain bond index, timing, economics, protocol controls, sources, and exactly the owner-approved participation routes. Routes are a discriminated union of native-L1 direct participation and an approved sBTC pool; an LST is nested only as an optional pool capability. V1 manifests normalize to one unconfirmed native-L1 route.

`ParticipantProfile` contains goal, liquidity requirement, Bitcoin/sBTC preference, key-control preference, optional wallet or custodian, BTC amount, and horizon.

`RecommendationResult` contains fit, reasons, tradeoffs, missing facts, unsupported requirements, alternatives, next steps, data status, sources, assumptions, and verification time.

Yield output contains principal, duration, annual rate, fee, reward model, gross/net result, price scenarios, and derivation metadata. BigInts become decimal strings at the MCP boundary.

## Provenance and source precedence

Each successful tool result includes:

- `dataStatus`: `live`, `published`, or `derived`.
- `sources`: absolute URL, title, type, source status, and optional retrieval time.
- `assumptions`: calculation and interpretation boundaries.
- `verifiedAt`: time the result was assembled.

Precedence is live chain/API data, published public documentation, then versioned public manifests.

Within public evidence, protocol behavior follows a stricter hierarchy: live/deployed state; release-pinned contracts and reference implementations; accepted SIP-045; release-pinned SDK/tests; current operator/developer docs; public assurance; and manifests. Conflicts are surfaced rather than silently reconciled in favor of lower-precedence prose.

## Providers

The Stacks provider uses `STACKS_API_BASE_URL` and defaults to Hiro mainnet. It reads PoX information, derives prepare and reward phase heights from returned cycle constants, checks optional bond indices, scans a bounded active bond window, and reads participant state. `list_protocol_bonds` requires `/v2/pox` to report an active `.pox-5` contract before reading bonds. It derives the current bond period, scans the six-period active lookback plus two future periods by default, and returns only indices whose `get-protocol-bond` read proves on-chain configuration. Requests are bounded by `BITCOIN_STAKING_UPSTREAM_TIMEOUT_MS`.

The registry provider reads one hash-verified schema-v3 snapshot, revalidates it with ETags every 60 seconds, and exposes specialized bond and custody views. Duplicate IDs or aliases, missing evidence, malformed records, future attestations, and content-hash mismatches fail closed. The bundled snapshot is an outage fallback only while its seven-day review window is current.

Each compatibility claim must cite at least one source ID contained in the same manifest. All public product manifests and participant reads are mainnet-only. Live verification sources are appended without overwriting manifest provenance.

## MCP interfaces

Fifteen tools are registered:

- `get_protocol_status`
- `list_protocol_bonds`
- `get_security_guidance`
- `build_diligence_report`
- `list_bonds`
- `list_custody_paths`
- `get_market_snapshot`
- `list_bond_participation_routes`
- `get_bond`
- `check_participant_status`
- `check_compatibility`
- `simulate_yield`
- `compare_staking_paths`
- `build_participation_plan`
- `search_current_facts`

All declare read-only and non-destructive annotations. Live network tools additionally declare open-world behavior. Inputs and successful outputs are Zod-validated. Errors return `INVALID_INPUT`, `NOT_FOUND`, `INSUFFICIENT_DATA`, `UPSTREAM_ERROR`, or `UPSTREAM_TIMEOUT`, plus a retryable flag.

Resources:

- `bitcoin-staking://capabilities`
- `bitcoin-staking://glossary`
- `bitcoin-staking://methodology/yield`
- `bitcoin-staking://security`
- `bitcoin-staking://custody-paths`
- `bitcoin-staking://catalog`
- `bitcoin-staking://methodology/sources`
- `bitcoin-staking://methodology/response-standard`
- `bitcoin-staking://bonds/{bondId}`
- `bitcoin-staking://sources/{sourceId}`

The `bitcoin-staking-concierge` prompt contains workflow instructions, not changing registry facts. On an empty invocation it introduces Scout and its capabilities; every non-empty request proceeds directly. Codex also discovers `.agents/skills/bitcoin-staking-concierge`. `bitcoin-staking://capabilities` maps all fifteen tools and exposes contract, server, and skill versions.

The prompt and skill share one institutional response contract. CFO/investment questions lead with availability, custody, liquidity, economics, and material risk. Technical/security/custody questions lead with mechanisms, component boundaries, deterministic verification, and pinned sources. Mixed questions receive a short executive conclusion followed by compact technical evidence. MCP initialize instructions contain only the technical server baseline so raw tool clients are not given Scout's onboarding or response persona.

For generic opportunity and diligence requests, the orchestration layer reads mainnet state and reviewed mainnet manifests. Users do not select a network. If no current opportunity is supported by that evidence, Scout reports the gap and the closest preparation step.

The versioned custody registry in `data/custody-paths.json` is product-level rather than bond-level. It distinguishes available, not-currently-supported, in-integration, and unknown paths; records a review cadence and verification method; and cites its sources. The scheduled `custody-registry-review` workflow validates freshness and source reachability every week. It flags review work but never changes a partner's status automatically.

Genesis stores stable bond period/index 1, not an editable cycle or date. `bond-period-to-reward-cycle` and `bond-period-to-burn-height` are evaluated from live PoX information. The pinned PoX-5 contract fixes `BOND_LENGTH_CYCLES` at 12, so every bond term is 12 reward cycles, approximately six months on mainnet. `getBondSchedule` returns the start and end cycles and heights, the 12-cycle duration, an approximate day count, and the separately derived native-L1 unlock height one-half reward cycle before bond end. Calendar estimates use remaining burn blocks at Bitcoin's ten-minute target and are always labeled approximate. Live on-chain state outranks protocol-derived timing, which outranks owner-reviewed product targets. Current rates, paired-STX ratios, capacities, coverage, reward assets, fees, operators, and integrations remain registry evidence rather than static instructions. `simulate_yield` uses a bond-specific duration or sourced reference period. A missing duration or rate blocks the projection; missing route or selected-LST fees leave net yield unknown without suppressing the sourced gross result. Cached CoinGecko BTC and STX prices supply the default paired-STX calculation; explicit prices override live observations and price failure does not block deterministic reward sats. Every result distinguishes planned product targets, public reference-model assumptions, bond-specific terms, and final on-chain configured terms.

That response contract is evidence-gated. Current MCP structured output and resources are the only factual input. Missing evidence produces the fixed abstention “This MCP does not currently verify that,” plus the evidence required to answer. Live-read failure cannot be replaced with stale or remembered state. Unknown and empty results remain unknown and empty. The technical evidence baseline is present in server instructions; the full response policy is duplicated deliberately in the MCP prompt, the response-standard resource, and the repo skill. Contract tests guard both scopes.

Security guidance is a versioned deterministic corpus in `src/security.ts`. Topics return an answer, evidence level, known facts, unproven claims, verification checklist, and pinned source IDs. The source set includes the official public audit statement, SIP-045, pinned PoX-5 and Stacks.js code, golden-vector tests, and pinned Leather RPC implementations. Investor chats affect topic coverage only; they are not stored as evidence.

`build_diligence_report` is a deterministic composition layer. It has scheduled-activation, no-configured-bond, and configured-bond branches. The configured branch derives the minimum paired uSTX and target sBTC reward from the live bond tuple, preserves wallet compatibility as unknown, and states that the reward pool can cap actual payout.

## Economics

For BTC/sBTC target-rate manifests:

```text
gross sats = floor(principal sats × annual rate bps × days ÷ 10,000 ÷ 365)
fee sats   = floor(gross sats × fee bps ÷ 10,000)
net sats   = gross sats − fee sats
```

The model is simple and non-compounding. STX price scenarios do not alter BTC- or sBTC-denominated reward sats. Fixed STX reward models require a manifest-provided unit quantity. Unknown or incompatible reward models return `INSUFFICIENT_DATA`.

For live PoX-5 protocol bonds, the target scenario mirrors the contract calculation: `floor(floor(principal sats × target-rate bps ÷ 10,000) ÷ 50)` sBTC sats per reward calculation. Annualized target sats multiply that rounded value by 50. Actual earned rewards can be lower when available rewards do not cover the target. The minimum paired uSTX mirrors `min-ustx-for-sats-amount` using the live `stx-value-ratio` and `min-ustx-ratio`.

## Host configuration

The checked-in `.codex/config.toml` starts `node dist/stdio.js` and the repo-scoped skill is available after the project is trusted. `.mcp.json` provides the equivalent Claude Code project configuration. Build before opening either host.

For cross-repository use, `dist/cli.js` is the package binary. `setup` verifies the exact fifteen-tool contract, server/contract/skill versions, registry revision/hash/freshness, and selected hosts. It autodetects Codex and Claude, skips absent default hosts, fails for an absent explicitly requested host, and installs a hashed concierge skill. `update` repeats the safe registration flow. `uninstall` removes only the named registrations and skill. The portable default pins `#v0.5.0`; unpinned `main` is development-only.

Claude exposes the MCP prompt as `/mcp__bitcoin_staking__bitcoin_staking_concierge`. Codex invokes `$bitcoin-staking-concierge`; both use the same MCP tools.

## Testing

The default suite is offline. It covers registry contracts, immutable publication and rollback, auth and CSRF gates, ETag/cache/fallback behavior, PoX-5 period mapping, deterministic economics, participant journeys, mainnet provenance, invocation of all fifteen tools, read-only annotations, installer integrity checks, and targeted uninstall behavior.

`npm run test:live` performs the opt-in mainnet PoX smoke test. `npm run check` runs type checking, offline tests, and a production build.

No test constructs or broadcasts a transaction.

The deterministic server can enforce schemas, provenance, failure behavior, and absence of transaction capabilities. It cannot guarantee that an arbitrary host model will always obey a natural-language instruction. Host acceptance therefore includes adversarial prompts that request guessing or unsupported safety claims; expected behavior is explicit abstention or a sourced, bounded answer.
