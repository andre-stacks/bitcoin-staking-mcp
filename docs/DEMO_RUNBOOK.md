# Hackathon Demo Runbook

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

### 1. Mainnet truth

```text
What is the current Bitcoin Staking protocol status on mainnet? List only bonds that are configured on-chain, and distinguish that from published or demo opportunities.
```

Expected behavior: call `get_protocol_status` and `list_protocol_bonds`; show live source time; do not infer an opportunity from an empty scan.

### 2. Testnet proof

```text
Build an institutional diligence report for the dedicated PoX-5 testnet. I want yield, must keep 1 BTC on Bitcoin L1, want to control the maturity key, use Leather, and can lock for six months.
```

Expected behavior: call `build_diligence_report` with `network: testnet`.

- Before activation: show the live activation height/countdown and state that no bond can yet be assessed.
- Active without a bond: show the scanned indices and state that no configured bond was verified.
- Active with a bond: show `testnet_only_not_investable`, profile fit, paired-STX minimum, configured sBTC target, risks, and next verification step.

### 3. Security committee

```text
Has PoX-5 been audited, how is the native Bitcoin timelock constructed, and what must an institution independently verify before Leather signs or funds the transaction?
```

Expected behavior: call `get_security_guidance`; separate the published audit statement, protocol source behavior, SDK construction, Leather signing boundary, and missing end-to-end release proof.

### 4. Explicit demo fallback

```text
There is no current investable bond. Include the illustrative demo bond and model 1 BTC for 180 days, preserving every demo disclosure.
```

Expected behavior: call `list_bonds` with `includeDemo: true`, then `build_participation_plan` and `simulate_yield`. State that rewards are modeled in sBTC and that all demo terms are synthetic.

### 5. No-match journey

```text
I need continuous liquidity and want to borrow without selling while keeping BTC strictly on Bitcoin L1. Is this native bond a clean fit?
```

Expected behavior: return `no_match`; explain that a native timelock is not continuously liquid or proven borrowable; provide sBTC context without inventing a live product.

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

Show the eleven read-only tools, `build_diligence_report` structured output, the `bitcoin-staking://security` resource, and source resources. Point out that a wallet, UI, or agent can reuse the same primitive.

## Recording checklist

- Keep the live/testnet/demo label visible for every opportunity.
- Show at least one primary source URL and verification timestamp.
- Do not describe a configured target rate as a guaranteed APY.
- State that native-L1 BTC principal and sBTC rewards are different assets and paths.
- Do not construct, approve, sign, or broadcast a transaction.
- Capture the two adversarial prompts and confirm that neither produces a guessed compatibility, safety, availability, or APY claim.
- End with the product sentence: “Bitcoin Staking MCP gives any agent an evidence-aware, read-only interface for institutional Bitcoin staking diligence.”
