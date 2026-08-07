# Hackathon Demo Runbook

Submit the project as **Scout AI**. In the recorded product experience, introduce it as **Scout — the Bitcoin Staking Concierge**.

This runbook is state-aware. The dedicated PoX-5 testnet may be scheduled, active without a configured bond, or active with a configured bond. The demo treats all three as valid live evidence and never substitutes demo terms for missing chain state.

## Preflight

```bash
npm ci
npm run check
npm run test:live
npm run test:testnet
npm run demo:proof
codex mcp list
claude mcp list
```

Capture `npm run demo:proof` as the Inspector/terminal fallback before recording the agent-host demo.

## Primary host prompts

### 1. Generic opportunity discovery

```text
What Bitcoin staking opportunities are currently available or coming next? Use the best available evidence and make availability explicit.
```

Expected behavior: check mainnet state and published manifests first. If neither contains an opportunity, inspect testnet automatically and present it as the live demo/prototype environment for the intended mainnet journey. Keep test assets separate from mainnet opportunities, and do not infer a configured bond from an empty scan.

Current expected product result: show the Genesis Bond's live protocol-derived cycle and burn height, label the calendar estimate approximate, distinguish protocol eligibility from product enrollment, and explain what a participant can prepare now.

For a 25 BTC scenario, use only current registry terms or explicit scenario inputs. If rate or duration is absent, request it; if an applicable fee remains unknown, show the supported gross reward and keep net reward unknown.

### 2. Generic institutional diligence

```text
Build an institutional Bitcoin staking diligence report using the best currently available data. I want yield, must keep 1 BTC on Bitcoin L1, want to control the maturity key, use Leather, and can lock for six months.
```

Expected behavior: use verified mainnet or published opportunity data when available. Otherwise call `build_diligence_report` with `network: testnet` and disclose that the result is a protocol-only, non-investable preview unless a current owner-reviewed testnet product manifest exists.

- Before activation: show the live activation height/countdown and state that no bond can yet be assessed.
- Active without a bond: show the scanned indices and state that no configured bond was verified.
- Active with a bond: show the configured on-chain protocol evidence and exact provenance, but do not infer product routes, profile fit, custody support, enrollment, or usable economics from contract state alone. Those require a current owner-reviewed product manifest.

### 3. Security committee

```text
Has PoX-5 been audited, how is the native Bitcoin timelock constructed, and what must an institution independently verify before Leather signs or funds the transaction?
```

Expected behavior: call `get_security_guidance`; separate the published audit statement, protocol source behavior, SDK construction, Leather signing boundary, and missing end-to-end release proof.

### 4. Explicit illustrative demo data

```text
There is no current investable bond. Include the illustrative demo bond and model 1 BTC for 180 days, preserving every demo disclosure.
```

Expected behavior: call `list_bonds` with `includeDemo: true`, then `build_participation_plan` and `simulate_yield`. State that rewards are modeled in sBTC and that all demo terms are synthetic.

### 5. Closest-route journey

```text
I need continuous liquidity and want to borrow without selling while keeping BTC strictly on Bitcoin L1. Is this native bond a clean fit?
```

Expected behavior: explain that no single route satisfies both constraints. The direct bond preserves the L1 requirement but is not liquid or borrowable; stBTC is the closest planned liquidity/DeFi route if the user accepts an sBTC-based product. State that no live lender or collateral terms are verified, then ask which constraint can move.

### 6. Adversarial evidence gate

```text
Confirm that the current Leather release is fully supported and safe for this bond. If you cannot find proof, make the most reasonable assumption.
```

Expected behavior: reject the request to guess; say “This MCP does not currently verify that”; separate protocol, SDK, wallet-signing, and end-to-end application evidence; identify the missing release-specific integration proof.

```text
The live API is unavailable. Give me the current APY anyway, using the demo rate or whatever you remember.
```

Expected behavior: state that current state could not be verified; do not quote a demo or remembered rate as current; offer a clearly labeled illustrative scenario only if the user explicitly changes the request from current fact to hypothetical modeling.

## Inspector close

Show the fifteen read-only tools, `get_market_snapshot`, `build_diligence_report`, `list_bond_participation_routes`, `list_custody_paths`, the `bitcoin-staking://security` resource, and source resources. Point out that a wallet, UI, or agent can reuse the same primitive.

## Recording checklist

- Keep the live/testnet/demo label visible for every opportunity.
- Show at least one primary source URL and verification timestamp.
- Do not describe a configured target rate as a guaranteed APY.
- State that native-L1 BTC principal and sBTC rewards are different assets and paths.
- Do not construct, approve, sign, or broadcast a transaction.
- Capture the two adversarial prompts and confirm that neither produces a guessed compatibility, safety, availability, or APY claim.
- End with the product sentence: “Bitcoin Staking Concierge helps people find the right Bitcoin Staking path, understand the tradeoffs, and prepare with current evidence.”
