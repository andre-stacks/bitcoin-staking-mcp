export const GLOSSARY = `# Bitcoin Staking glossary

- Native L1 Bitcoin staking: BTC committed in a Bitcoin L1 output under the PoX-5 bond rules. It is distinct from holding sBTC on Stacks.
- sBTC: A programmable representation of BTC on Stacks. It can be self-custodied, so sBTC versus L1 and self-custody versus custody are separate choices.
- Bond: A configured Bitcoin Staking opportunity with defined timing, economics, requirements, and an optional on-chain PoX-5 bond index.
- Participant key control: The participant or its custodian retains the key material required by the bond's Bitcoin script and recovery path.
- Early exit: A bond-specific path to spend locked BTC before maturity. Availability, signers, costs, and forfeited rewards must be verified.
- Demo manifest: An illustrative record for testing agent behavior. It is never evidence that a live opportunity exists.
`;

export const YIELD_METHODOLOGY = `# Yield methodology

The MVP performs deterministic scenario analysis. It never predicts BTC or STX prices and never invents missing economics.

For a BTC- or sBTC-denominated target-principal-rate model:

gross reward sats = floor(principal sats × annual rate bps × duration days ÷ 10,000 ÷ 365)

fee sats = floor(gross reward sats × fee bps ÷ 10,000)

net reward sats = gross reward sats − fee sats

The calculation uses simple, non-compounding annualized yield. Price scenarios only translate stated reward units into an estimated value. If a bond does not publish a compatible reward model, the tool returns INSUFFICIENT_DATA.
`;
