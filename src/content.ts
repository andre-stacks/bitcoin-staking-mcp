export const GLOSSARY = `# Bitcoin Staking glossary

- Native L1 Bitcoin staking: BTC committed in a Bitcoin L1 output under the PoX-5 bond rules. It is distinct from holding sBTC on Stacks.
- sBTC: A programmable representation of BTC on Stacks. It can be self-custodied, so sBTC versus L1 and self-custody versus custody are separate choices.
- Bond: A configured Bitcoin Staking opportunity with defined timing, economics, requirements, and an optional on-chain PoX-5 bond index.
- Participant key control: The participant or its custodian retains the key material required by the bond's Bitcoin script and recovery path.
- Early exit: A bond-specific path to spend locked BTC before maturity. Availability, signers, costs, and forfeited rewards must be verified.
- Demo manifest: An illustrative record for testing agent behavior. It is never evidence that a live opportunity exists.
`;

export const CAPABILITIES = `# Bitcoin Staking Concierge capabilities

The concierge is one conversational entry point backed by eleven read-only MCP tools. Users can choose a capability or ask in plain language.

1. **Check protocol status and availability** — current PoX-5 state, reward-cycle timing, and whether a verified bond is available.
2. **Find Bitcoin Staking bonds** — active, upcoming, historical, or explicitly requested demo opportunities, with production and pre-production data clearly separated.
3. **Assess participation fit** — liquidity needs, Bitcoin L1 versus sBTC path, key control, amount, time horizon, wallet, and custodian constraints.
4. **Model economics** — deterministic yield, fee, and price scenarios using sourced terms and explicit assumptions.
5. **Review security and transaction boundaries** — audits, timelock construction, Leather behavior, pre-funding validation, maturity recovery, and early exit, including what is not yet proven.
6. **Check compatibility or public status** — cited wallet/custodian support and public Stacks address participation state. Address checks never prove ownership.
7. **Compare staking paths** — native L1 Bitcoin staking and sourced sBTC context, without inventing a live liquidity or borrowing product.

## Tool map for developers

| User need | MCP tool |
| --- | --- |
| Protocol status | \`get_protocol_status\` |
| Live on-chain bond discovery | \`list_protocol_bonds\` |
| Public and demo manifest discovery | \`list_bonds\` |
| One bond's normalized terms | \`get_bond\` |
| Institutional diligence report | \`build_diligence_report\` |
| Security diligence | \`get_security_guidance\` |
| Yield scenarios | \`simulate_yield\` |
| Wallet or custodian compatibility | \`check_compatibility\` |
| Public participant status | \`check_participant_status\` |
| Native L1 versus sBTC context | \`compare_staking_paths\` |
| Participation fit and checklist | \`build_participation_plan\` |

All tools are informational and read-only. They cannot construct, sign, or broadcast transactions.
`;

export const YIELD_METHODOLOGY = `# Yield methodology

The MVP performs deterministic scenario analysis. It never predicts BTC or STX prices and never invents missing economics.

For a BTC- or sBTC-denominated target-principal-rate model:

gross reward sats = floor(principal sats × annual rate bps × duration days ÷ 10,000 ÷ 365)

fee sats = floor(gross reward sats × fee bps ÷ 10,000)

net reward sats = gross reward sats − fee sats

The calculation uses simple, non-compounding annualized yield. Price scenarios only translate stated reward units into an estimated value. If a bond does not publish a compatible reward model, the tool returns INSUFFICIENT_DATA.
`;
