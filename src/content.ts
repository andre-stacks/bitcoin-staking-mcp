export const GLOSSARY = `# Bitcoin Staking glossary

- Native L1 Bitcoin staking: BTC committed in a Bitcoin L1 output under the PoX-5 bond rules. It is distinct from holding sBTC on Stacks.
- sBTC: A programmable representation of BTC on Stacks. It can be self-custodied, so sBTC versus L1 and self-custody versus custody are separate choices.
- Pool-based participation: A bond route operated through a current registry-published pool. Operator, input asset, minimum, fee, withdrawal, accounting, and availability terms come from the live registry.
- Pool-specific liquid staking token: An optional capability nested under the pool that issues it, not a separate enrollment route. Its contracts, redemption, liquidity, and lending support must be current and registry-published.
- Bond: A configured Bitcoin Staking opportunity with defined timing, economics, requirements, and an optional on-chain PoX-5 bond index.
- Participant key control: The participant or its custodian retains the key material required by the bond's Bitcoin script and recovery path.
- Early exit: A bond-specific path to spend locked BTC before maturity. Availability, signers, costs, and forfeited rewards must be verified.
`;

export const CAPABILITIES = `# Bitcoin Staking Concierge capabilities

The concierge is one conversational entry point backed by fifteen read-only MCP tools. It guides users toward the closest participation route and a practical next step.

1. **Check protocol status and availability** — current PoX-5 state, reward-cycle timing, and whether a verified bond is available.
2. **Find Bitcoin Staking bonds and routes** — active or upcoming bonds plus direct native-L1 and current pool-based routes, with any LST nested under its issuing pool, current products and integrations loaded from the live registry, and scheduled product information separated from live on-chain state.
3. **Assess participation fit** — liquidity needs, Bitcoin L1 versus sBTC path, key control, amount, time horizon, wallet, and custodian constraints.
4. **Model economics** — deterministic yield, fee, and price scenarios using sourced terms and explicit assumptions.
5. **Review security and transaction boundaries** — audits, timelock construction, Leather behavior, pre-funding validation, maturity recovery, and early exit, including what is not yet proven.
6. **Review custody and public status** — the maintained product-level custody directory, exact bond compatibility when a manifest exists, and public Stacks address participation state. Address checks never prove ownership.
7. **Compare staking paths** — direct native-L1 and current pool-based routes, using only current registry evidence for operators, LSTs, liquidity, or DeFi support and never inventing a live borrowing product.

## Tool map for developers

| User need | MCP tool |
| --- | --- |
| Reviewed market and route snapshot | \`get_market_snapshot\` |
| Protocol status | \`get_protocol_status\` |
| Live on-chain bond discovery | \`list_protocol_bonds\` |
| Reviewed mainnet bond discovery | \`list_bonds\` |
| One bond's direct and pooled routes, including optional LST capability | \`list_bond_participation_routes\` |
| Current product-level custody paths | \`list_custody_paths\` |
| One bond's normalized terms | \`get_bond\` |
| Institutional diligence report | \`build_diligence_report\` |
| Security diligence | \`get_security_guidance\` |
| Yield scenarios | \`simulate_yield\` |
| Wallet or custodian compatibility | \`check_compatibility\` |
| Public participant status | \`check_participant_status\` |
| Personalized comparison of the direct route and approved pool, including an optional LST capability | \`compare_staking_paths\` |
| Participation fit and checklist | \`build_participation_plan\` |
| Current projects, products, notices, and integrations | \`search_current_facts\` |

All tools are informational and read-only. They cannot construct, sign, or broadcast transactions.
`;

export const YIELD_METHODOLOGY = `# Yield methodology

The service performs deterministic scenario analysis. It never predicts BTC or STX prices and never invents missing economics. A duration and annual rate must come from current registry evidence or explicit user inputs; current terms are not retained in this static resource. Planned product targets, public reference-model assumptions, bond-specific terms, and final on-chain configured terms remain distinct.

For a BTC- or sBTC-denominated target-principal-rate model:

gross reward sats = floor(principal sats × annual rate bps × duration days ÷ 10,000 ÷ 365)

fee sats = floor(gross reward sats × fee bps ÷ 10,000)

net reward sats = gross reward sats − fee sats

The calculation uses simple, non-compounding annualized yield. By default, the MCP fetches current BTC and STX USD observations from CoinGecko Simple Price and uses them to calculate the value-based STX pairing in token units. Explicit caller prices override the corresponding live defaults. Prices are observations, not forecasts or execution quotes. If a bond does not publish a compatible reward model, the tool returns INSUFFICIENT_DATA.

When a current route publishes a value-based paired-STX requirement:

required STX value = BTC principal value × minimum STX ratio

The user-facing answer reports current BTC and STX prices and required STX units when live price enrichment succeeds. Exact reward sats remain available for deterministic verification. Missing duration or rate blocks the projection; a missing applicable route or selected-LST fee leaves net yield unknown while preserving the sourced gross scenario. Price failure alone does not invalidate deterministic reward sats.
`;
