# Canonical PoX-5 Source Corpus

The concierge is grounded on a versioned source corpus at runtime. It should not be described as trained on private investor conversations. Private questions may expand coverage after sanitization, but only public primary evidence supports factual answers.

## Source precedence

1. Current on-chain state, deployed contract state, and live APIs.
2. Deployed or release-pinned PoX-5 contracts and reference implementations.
3. Accepted SIP-045 and governing specifications.
4. Release-pinned SDK source, tests, and reference integration code.
5. Current official operator and developer documentation.
6. Official public audit and product statements.
7. Versioned public bond or product manifests.

When sources conflict, the answer reports the conflict. Runtime and contract evidence determine behavior; lower-precedence documentation can explain intent but cannot override it.

## Protocol and network

| Source | Role |
| --- | --- |
| [Mainnet PoX API](https://api.mainnet.hiro.so/v2/pox) | Current contract, burn height, cycles, and network state. |
| [SIP-045](https://github.com/stacksgov/sips/blob/0b7cecaecdb6060a6fc19510f2e7dd8dde1d2fa1/sips/sip-045/sip-045-pox-5-bitcoin-staking.md) | Accepted protocol specification and intended mechanics. |
| [PoX-5 in stacks-core 4.0.1](https://github.com/stacks-network/stacks-core/blob/4.0.1/stackslib/src/chainstate/stacks/boot/pox-5.clar) | Release-pinned protocol contract source. |

## Reference implementation and operator behavior

| Source | Role |
| --- | --- |
| [Reference signer-manager](https://github.com/stacks-network/stacks-core/blob/4.0.1/contrib/core-contract-tests/contracts/signer-manager.clar) | Reference authorization, rewards, fee, withdrawal, and administration behavior. |
| [Reference signer-manager tests](https://github.com/stacks-network/stacks-core/blob/4.0.1/contrib/core-contract-tests/tests/pox-5/signer-manager.test.ts) | Release-pinned behavioral test coverage. |
| [Signer-manager deployment guide](https://docs.stacks.co/operate/deploy-a-signer-manager-contract) | Current operator workflow and role guidance. |
| [Signer integration guide](https://pox-5.vercel.app/docs/development/advanced/signers) | Signer-key grant and integration workflow. |
| [STX-only staking guide](https://pox-5.vercel.app/docs/development/solo-stx) | STX-only path and prerequisites. |
| [Pools integration guide](https://pox-5.vercel.app/docs/development/pools) | sBTC/pool path and operator integration. |

## SDK and wallet boundary

| Source | Role |
| --- | --- |
| [Stacks.js Bitcoin Staking script construction](https://github.com/stx-labs/stacks.js/blob/6101c99efe5a9616ce7e16cef68e28fd10676e7e/packages/bitcoin-staking/src/script.ts) | Pinned SDK lock and unlock-script construction. |
| [Golden-vector tests](https://github.com/stx-labs/stacks.js/blob/6101c99efe5a9616ce7e16cef68e28fd10676e7e/packages/bitcoin-staking/tests/privatenet/actions/golden-vectors.test.ts) | SDK-to-contract construction checks. |
| [Leather getAddresses](https://github.com/leather-io/mono/blob/2d285250dc686b2fc7354c469d85ed94b85c7c17/packages/rpc/src/methods/get-addresses.ts) | Selected account and public-key boundary. |
| [Leather signPsbt](https://github.com/leather-io/mono/blob/2d285250dc686b2fc7354c469d85ed94b85c7c17/packages/rpc/src/methods/bitcoin/sign-psbt.ts) | Application-provided PSBT signing boundary. |

## Public assurance

| Source | Role |
| --- | --- |
| [PoX-5 hardfork and audit statement](https://www.stacks.co/blog/the-pox-5-hardfork-what-to-expect-this-week) | Official statement naming Trail of Bits, Clarity Alliance, and Asymmetric Research. |

## Evidence gaps to check at runtime

- Public links to final audit reports, exact in-scope commit attestations, finding severity tables, and remediation status must be resolved from current evidence rather than inferred from the published reviewer statement.
- Release-specific end-to-end proof for each wallet, custodian, and application combination.
- Public compatibility evidence for every supported wallet and custody provider.
- A canonical public product manifest for every upcoming bond.

These gaps must appear as unknown or not verified. They must not be filled from private chat or roadmap intent.

When the current corpus and tool output do not support a requested claim, the concierge must say “This MCP does not currently verify that,” name the missing evidence, and stop. Model memory, plausibility, and user prompting are not fallback sources.
