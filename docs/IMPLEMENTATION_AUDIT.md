# Scout Live Knowledge Registry — Implementation Audit

Audit date: August 10, 2026. Target: MCP/skill `0.5.1`, MCP contract `4.0.0`. Scope: the Vercel-hosted live knowledge registry, its editor, public API, mainnet-only MCP integration, migration, tests, Preview and Production deployment, release, Codex registration, and Golden Path acceptance.

## Verdict

The implementation is code-complete and the automated, isolated-package, and live mainnet-read gates pass. Every code requirement and edge case explicitly named in the approved plan is implemented and covered by executable evidence. No known code gap remains.

The audit found and fixed five material gaps before reaching this verdict: the initial seeded snapshot was not automatically recoverable on first publish; rollback depended on an eventually consistent draft reread; root CI did not run the console suite/build; the package tarball omitted the shared contract workspace; and the public API did not independently verify the stored content hash. The final rollback design performs one atomic Global Config mutation and has been proven against the real Vercel service.

A follow-up audit found and fixed three more regression risks: blank and whitespace-only prompt requests were not classified explicitly; only part of the public tool contract rejected unknown legacy inputs; and release-version/test evidence could drift across public surfaces. The MCP now emits a deterministic welcome/direct-workflow mode, all fifteen tools fail closed on unknown inputs, and tests pin package, server, skill, contract, and public install-version alignment.

PR #5, the Production deployment, corrected Preview and Production publications, and the `0.5.0` release completed on August 10. Golden Path verification then found one inaccurate direct-route tradeoff: it mentioned paired STX even when the published route explicitly did not require it. Version `0.5.1` derives that sentence from route evidence and adds both required-STX and no-STX regression cases.

Preview and Production now return `200` from registry and health, `304` on ETag revalidation, and `401` for anonymous admin state. They serve independent revision IDs with the same reviewed content hash and no demo/testnet records.

## Plan traceability

| Plan area | Status | Evidence |
| --- | --- | --- |
| Next.js registry console | Complete | `apps/registry-console` contains the editor, authenticated admin routes, anonymous public routes, and production build configuration. |
| Vercel storage | Complete | Global Config stores the draft, published snapshot, publication metadata, and complete revision index. Private Blob stores immutable snapshots without overwrite. Preview and Development use environment-namespaced keys and revision paths; Production retains the legacy unprefixed keys and history. Live publication proved Preview writes do not mutate Production. |
| Sign in with Vercel | Complete | OAuth authorization-code flow uses PKCE, `openid email profile`, signed HTTP-only sessions, publisher allowlist enforcement, origin checks, and CSRF tokens. Real Preview OAuth succeeded for an allowlisted Stacks Labs publisher. Anonymous and non-allowlisted users cannot read private state or mutate data. |
| Editor workflow | Complete | Separate Bonds, Projects, Products, Notices, Partners & integrations, Custody, Sources, and Revision History sections support Save, Validate, Preview Diff, Publish, Discard, and Roll Back. Structurally valid incomplete work may be saved privately; publication always validates the complete contract. |
| Publication and rollback | Complete | Publish validates, hashes, archives, and atomically updates the public snapshot. Rollback reads an immutable Blob revision and creates a new revision in one Global Config write; it never deletes or overwrites history and does not rely on read-after-write consistency. |
| Public API | Complete | `GET /api/v1/registry` is anonymous, draft-free, schema/hash verified, cacheable, and supports exact, weak, list, and wildcard `If-None-Match` handling. `GET /api/v1/health` returns revision, hash, publication/review dates, and freshness. Invalid stored data fails closed with `503` and `no-store`. |
| Shared contract | Complete | The Zod contract is shared by the console and MCP. It enforces globally unique IDs/aliases, resolvable relationships and sources, integration tuple separation, scoped attestations, effective/expiry dates, seven-day review cadence, and notice expiry. |
| Unified MCP registry | Complete | `RegistryStore` loads one atomic snapshot, revalidates after 60 seconds with ETags, verifies the canonical hash, uses a current bundled fallback, and fails closed after expiry. Deprecated bond/custody URL fallbacks remain for one release. `ManifestStore` and `CustodyStore` are compatible specialized views. |
| Catalog and tools | Complete | `search_current_facts` is the fifteenth tool and applies deterministic query/category/status/limit filters. It returns freshness, sources, registry revision, and verification time. `bitcoin-staking://catalog` and market-snapshot highlights expose current facts/notices without allowing expired or overdue claims to support current answers. |
| Dynamic dates and precedence | Complete | Genesis stores stable bond index `1`, not an editable reward cycle. Live reads derive Cycle 143 and burn height through the PoX-5 SDK and estimate time from remaining Bitcoin blocks at ten minutes per block. Precedence is live chain, protocol derivation, then owner-reviewed target. Cycle 142 exists only as the required legacy alias. |
| Stale-copy cleanup | Complete | Static skill, MCP instructions, response standards, docs, and tests contain no current August 26 date, Cycle 142 eligibility claim, named current operator, or hard-coded current economics. Stable route mechanics remain static; current products, partners, terms, and integrations come from the registry. |
| Versioning and packaging | Complete | Package/skill are `0.5.1`, contract is `4.0.0`, and the expected tool count is 15. The packed artifact includes `packages/registry-contract` and installs/initializes outside the repository. |
| Nightly operations | Complete | The workflow validates the live Vercel snapshot, freshness, and every registry evidence URL, then opens or updates the existing review-due issue. |

## Scenario and edge-case proof

The automated suites cover:

- malformed sections/records, globally duplicate IDs or aliases, dangling relationships, missing sources, future attestations, and canonical-hash mismatch;
- expired and overdue facts remaining historical while being excluded from current/available answers;
- temporary notices without expiry, expired notices, category/status validation, and invalid status filters;
- partner/product/role/network tuple separation and independently addressable integration roles;
- anonymous read access, draft/secret exclusion, exact/weak/list/wildcard ETags, `304`, cache headers, health metadata, and fail-closed `503` responses;
- OAuth PKCE generation and callback validation, anonymous denial, allowlist denial, same-origin and CSRF enforcement, and signed-session behavior;
- incomplete private draft save, validation failure, publish refusal, valid save/diff/publish/discard, first-publish seed archival, immutable history, and atomic rollback;
- unified registry loading, the 60-second ETag boundary, malformed/upstream fallback, stale/future fallback refusal, aliases, catalog search, status/category/limit filters, and active-notice/product highlights;
- schedule mapping period 0 to Cycle 141, period 1 to Cycle 143, and period 2 to Cycle 145, with no Cycle 142 bond;
- publication of a new integration, public revision/hash change, Scout retrieval without an MCP deployment, rollback to a new revision, and removal from current Scout results.
- onboarding classification for absent, empty, whitespace-only, broad participation, timing, amount-bearing, security, and handoff-shaped requests; every non-empty request is explicitly placed in direct-workflow mode;
- rejection of unknown or removed inputs across all fifteen public tools, so no stale client request is silently reinterpreted as a mainnet request;
- package/server/skill `0.5.1`, contract `4.0.0`, and public `#v0.5.1` install-pin alignment;
- direct-route tradeoffs omit paired STX when the route says it is not required and state it definitively when it is required.

## Verification record

- `npm run check`: passed on the release tree. The root suite discovers 109 tests: 108 pass and the one opt-in live test skips as designed. The console suite passes 18/18. Across both suites, 127 tests are discovered, 126 pass, and one intentionally skips. TypeScript, schema validation, builds, and the Next.js production build pass.
- Historical real Preview OAuth/editor acceptance: passed with an allowlisted Stacks Labs publisher. A temporary integration was saved, validated, diffed, published, retrieved through the anonymous API and `RegistryStore`, then removed through rollback. Each publication produced a new immutable revision. The editor finished with the corrected seed, an empty integration list, and no saved draft at the time of that acceptance run.
- Real Vercel consistency regression: the audit reproduced an eventually consistent rollback failure, changed rollback to a single atomic mutation, deployed the fix, rolled from the seed to the temporary integration revision, and rolled back to the seed again. Both fixed rollbacks completed, produced new revision IDs, and retained all earlier revisions.
- Current Preview and Production API acceptance: `200` registry and health, matching weak ETags, `304` revalidation, `401` anonymous admin state, canonical content hash, no retired demo/testnet data, and independent revision IDs.
- Bundled and live Production registry validation passed with revision `rev-20260810130510033-7ab60606ebd3` and content hash `sha256:7ab60606ebd3e3ff423d3f99321df0a8f4b1ba8fcc8f5ce6fa8bb88dbd13de76`.
- Live PoX test: the opt-in mainnet smoke test passed on the follow-up audit tree. Time-specific observations are not stored as static eligibility dates.
- Isolated package install: passed on the release tree; the `0.5.1` tarball installed outside the monorepo, loaded exactly 15 tools, exposed the expected versioned capabilities resource, and routed empty and supplied prompts to welcome and direct-workflow modes respectively.
- `npm audit --audit-level=high`: zero known high-severity vulnerabilities in the locked dependency graph at audit time.
- `git diff --check` and stale-copy search: passed.

## Rollout gates

Completed:

1. Implementation, offline tests, isolated-package validation, and live PoX smoke.
2. Environment-isolated Preview deployment and clean snapshot publication.
3. PR #5 exact-head CI/Vercel validation, approval, and merge at `a732ed6ece18c98ced55de52e99d4b4762809941`.
4. Production deployment from the merge commit and corrected Production snapshot publication.
5. Preview and Production registry, health, ETag, authentication-boundary, content-hash, and retired-data validation.
6. `v0.5.0` release and Codex registration refresh.
7. Golden Path live-tool verification covering timing, route separation, Fireblocks custody, security guidance, and handoff records.
8. `0.5.1` paired-STX wording regression fix, exact-head validation, patch release, and Codex refresh.
