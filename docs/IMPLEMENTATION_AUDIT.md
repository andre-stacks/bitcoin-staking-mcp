# Bitcoin Staking MCP — Production-Beta Implementation Audit

Audit date: August 6, 2026. Target: v0.4.0. Scope: the approved bond-centric production-beta plan, implementation, offline and live tests, registry operations, package artifact, and installer contract. This is an engineering/product acceptance record, not a protocol security audit or authorization to tag, publish, deploy, or use capital.

## Verdict

All code, data, documentation, test, and workflow requirements in the production-beta plan are implemented and locally verified. The deterministic product boundary is fail-closed: stale evidence, owner/runtime conflicts, invalid network selection, incomplete route economics, and unsupported borrowing or liquidity claims cannot become current recommendations.

Release execution remains a separate approval boundary. The repository is versioned and documented for v0.4.0, but this audit does not create the Git tag, publish a package, mutate real user host registrations, or deploy a service. Those actions belong to the final release gate.

## Requirements traceability

| Plan area | Status | Implemented evidence |
| --- | --- | --- |
| Bond and route model | Complete | `BondManifestV2` contains a discriminated `native_l1_direct` / `sbtc_pool` route union. Genesis contains those stable route types; current operators and pool capabilities come from the registry. |
| Status and attestation model | Complete | Product, enrollment, verification, and effective availability remain independent. Owner attestations contain scope, organization, review date, seven-day cadence, and registry source. Future-dated and expired reviews cannot be current. |
| Runtime precedence | Complete | Runtime state outranks owner claims. Missing configured chain state conflicts with a production/open claim and propagates through snapshot, bond detail, report, comparison, and plan. Scheduled routes remain scheduled rather than being mislabeled as conflicting. |
| V1 compatibility | Complete | Valid v1 manifests normalize to one unconfirmed direct route with no fabricated verification. Compatibility includes legacy manifests whose source was documentation rather than an owner manifest. |
| Registry provider | Complete | First-use remote fetch, 15-minute cache, exact-boundary ETag revalidation, version/hash/fetch metadata, honest source modes, current bundled fallback, stale/future refusal, remote-manifest fallback, and typed `REGISTRY_UNAVAILABLE` are tested. |
| Registry validation and operations | Complete | One command validates schemas, duplicates, references, formats, networks, status-specific fields, dates, and freshness. Live mode checks external evidence. CI runs validation on PRs; the nightly workflow opens or updates one `registry-review-due` issue. The registry PR template captures owner, scope, exclusions, claims, date, and optional chain evidence. |
| Market snapshot | Complete | `get_market_snapshot` merges registry, route freshness, mainnet/testnet PoX state, configured bonds, custody evidence, optional prices, and precedence into one deterministic response. |
| Route-aware MCP | Complete | Fifteen read-only tools expose route summaries/details, custody-only direct support, optional bond/route diligence, route-aware planning/comparison, network-safe participant reads, and complete strict success schemas. No output schema uses passthrough, `unknown`, or generic JSON shortcuts. |
| Participant fit | Complete | Profiles accept natural BTC/sBTC amounts and cover asset, amount, whitelist, participant type, L1 preference, liquidity, key control, custody, STX availability, and horizon. Direct fit enforces amount, whitelist, horizon, paired STX, and current custody; pool fit enforces sBTC exposure, inputs, enrollment, and disclosed dependencies. |
| LST and borrowing evidence | Complete | Liquidity requires a current production LST plus verified redemption and market evidence. Borrowing requires a current LST, a named live lender, and sourced collateral terms. Transferability alone is never treated as borrowing or exit-liquidity proof. |
| Yield behavior | Complete | Integer sats math applies route and selected-LST fees sequentially. Duration and rate are mandatory for gross reward; missing applicable fees leave net reward unknown rather than defaulting to zero. Optional CoinGecko failure cannot invalidate deterministic sats math or cure a missing rate or duration. Invalid, conflicting, impossible-supply, and non-finite inputs fail closed. |
| Participant network/provenance | Complete | Address inference, requested network, and selected bond are reconciled with bond precedence and conflict rejection. Component output identifies the exact account endpoint, contract/function, and map provenance. |
| Diligence report | Complete | Reports cover schedule/configuration/registration/boundary, protocol economics and controls, direct and pool risks, optional LST risks, operational fit, claim sources, freshness, missing evidence, and a concrete next action. |
| Concierge onboarding | Complete | Broad orientation introduces Scout, summarizes four user-facing capabilities, and offers three starter questions. Specific timing, participation, economics, risk, custody, and liquidity requests bypass the welcome and proceed directly to the relevant evidence-backed workflow. |
| Safety boundary | Complete | Tools cannot construct transactions, PSBTs, signatures, or broadcast payloads. All tool annotations are read-only/non-destructive; tools that may fetch registry, chain, or price data are correctly marked open-world. |
| Version and installer contract | Complete | Server 0.4.0, contract 3.0.0, skill 0.4.0, registry revision/hash/status/source mode are exposed through capabilities and verified by setup/check. The default install pins `#v0.4.0`; unpinned main remains development-only. |
| Host lifecycle | Complete | Setup/update/check/uninstall, exact Codex and Claude registration specs, host autodetection, explicit-host failure, skill hashing/tamper detection, version mismatch refusal, and targeted removal are tested. |
| Release automation | Complete | CI, nightly registry review, package contents, stdio startup, live opt-in smoke tests, and release documentation are present. Tagging/publishing is intentionally not performed by this audit. |

## Scenario and edge-case proof

The automated suite proves the requested journeys and the failure boundaries around them:

- large allowlisted native-BTC holder with an approved custody path;
- unknown whitelist and stale custody evidence;
- smaller sBTC holder routed toward a current registry-published pool;
- `sbtc_only` versus `sbtc_and_stx`, including yes/no/unknown STX availability;
- liquidity-seeking user with stBTC kept conditional until product, redemption, and market evidence are current;
- borrowing rejected without a named live lender and collateral terms;
- L1-only plus borrowing returning no match;
- expired, future-dated, unavailable, unknown, scheduled, and conflicting availability states;
- exact freshness and 15-minute cache boundaries;
- min/max amount boundaries, paired-STX requirements, horizon and early-exit constraints, key-control and custody gaps;
- v1 normalization, duplicate IDs/sources, missing references, invalid attestation sources, impossible timing, invalid contract networks, and incomplete open-route fields;
- missing duration/rate refusal, unknown route/LST fees producing no net result, invalid LST selection, sequential fees, zero/full fees, maximum-supply principal, decimal conversion, conflicting principal forms, and non-finite/out-of-range inputs;
- runtime conflict propagation to all decision tools while a non-current scheduled route retains its correct status;
- ETag/cache, stale remote, stale fallback, future review, remote manifest failure, content hash changes, and typed registry failure;
- bond/request/address network conflicts, invalid principals, and source provenance;
- every MCP tool invoked through an in-process client with strict output validation and no transaction fields;
- optional price-service failure after complete deterministic economics;
- setup, update, check, uninstall, absent hosts, wrong package registration, tampered skill, and version/registry mismatch refusal.

## Verification record

- `npm run check`: passed. 86 tests discovered; 84 passed and the two opt-in live tests were skipped as designed. Type checking, registry validation, build, packaged stdio initialization, and all offline tests passed.
- `npm run registry:validate`: validates the checked-in atomic snapshot, canonical hash, stable Genesis index, attestations, and source graph. Live Vercel validation remains a deployment gate.
- `npm run test:live`: passed against the current mainnet PoX API.
- `npm run test:testnet`: passed against the dedicated PoX-5 testnet API.
- `npm run demo:proof`: passed. At the audit time, mainnet PoX-5 was active with no configured bond in indices 0–2; the dedicated testnet reported active PoX-5 and no configured bond in indices 0–2. These are time-specific observations, not permanent product claims.
- `npm pack --dry-run`: passed; the tarball contains compiled code, registry data, the concierge skill, installation docs, README, and license.
- Isolated tarball install: passed outside the repository. The installed artifact completed a real stdio MCP handshake with exactly 15 tools, server `0.4.0`, contract `3.0.0`, skill `0.4.0`, registry revision and hash, a SHA-256 content hash, and current review status.
- `npm audit --audit-level=high`: zero known vulnerabilities in the locked dependency graph at audit time.
- `git diff --check`: passed.

## Final release gate

Before tagging v0.4.0, rerun from the exact release commit:

```bash
npm ci
npm run check
npm run registry:validate:live
npm run test:live
npm run test:testnet
npm pack --dry-run
```

Then perform clean-clone setup/check/update/uninstall against the actual current Codex and Claude CLI versions in isolated host configuration directories, confirm required CI checks on the release commit, and only then create/push the tag and publish any release artifact. Those are release operations, not implied by this green implementation audit.
