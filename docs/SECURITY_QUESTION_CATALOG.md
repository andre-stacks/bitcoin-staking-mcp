# Bitcoin Staking Security Question Catalog

This catalog translates recurring investor and integration questions into public, sourceable MCP topics. It contains no investor names, allocations, addresses, private product terms, or private-chat assertions.

## Current topics

| Investor question | MCP topic | Required answer boundary |
| --- | --- | --- |
| Has PoX-5 been audited? | `audit_status` | Name the published assurance and reviewers. Do not volunteer report gaps; if the user requests the documents or deeper audit diligence, say the reports are not public yet and direct them to the Bitcoin Staking team for access. |

Audit-status answers remain topic-local. A simple status question should not expand into report, scope, findings, remediation, commit-attestation, or integration caveats. Those details are progressive disclosure for a relevant follow-up. Audit answers must not introduce a named wallet or custodian from an earlier turn unless the current question asks whether it was covered.
| How is the timelock constructed? | `timelock_construction` | Explain P2WSH, the CLTV maturity branch, the separate early-exit branch, participant unlock material, and the complete-script commitment. |
| How do we know the Leather transaction is safe? | `leather_transaction_safety` | Separate SDK/app construction from Leather account selection and PSBT signing; require destination comparison and release-specific testnet proof. |
| What must be checked before sending BTC? | `pre_funding_validation` | Derive the expected complete script and P2WSH destination from exact public inputs before funding. |
| Can BTC be recovered if the app disappears? | `maturity_recovery` | Explain the protocol maturity path and separately identify key, script-data, and product-UX dependencies. |
| Can BTC exit early? | `early_exit` | Lead with availability and the coordinated signing steps. State forfeited yield and paired-STX timing directly. Discuss product-specific availability only when it changes the answer or next step. |

## Intake rule for new investor questions

1. Remove the person's name, company-sensitive context, allocation, addresses, screenshots, and private terms.
2. Preserve the exact security concern in plain language.
3. Identify the participation path first: native L1 BTC, sBTC, or STX-only.
4. Map the question to an existing topic or propose one narrowly scoped new topic.
5. Attach primary public evidence. Private chat text may justify coverage but is never a factual source.
6. State separately: what is known, what is not proven, how to verify it, and which component owns each step.
7. Never turn a protocol audit into a claim that a wallet, custodian, application, or recovery UI is production-validated.

## Next useful topics

- Signer-manager control, upgradeability, fee caps, and admin-key risk.
- Custodian-specific PSBT and witness-script support.
- Recovery-material retention and operational runbooks.
- Testnet evidence for the exact wallet/app release combination.
- Audit report scope and remediation status once public report links are available.
- Bitcoin reorg, fee, stuck-transaction, and maturity-spend operational risks.
