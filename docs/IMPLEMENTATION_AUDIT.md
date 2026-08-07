# Scout Live Knowledge Registry — Implementation Audit

Audit date: August 7, 2026. Target: MCP/skill `0.4.0`, MCP contract `3.0.0`. Scope: the approved Vercel-hosted live knowledge registry plan, its editor, public API, MCP integration, migration, tests, Preview deployment, and pre-merge acceptance. This record does not authorize merge, Production deployment, package publication, or Codex registration changes.

## Verdict

The implementation and Preview-validation phases are complete. Every requirement and edge case explicitly named in the approved plan is implemented and covered by automated or live acceptance evidence. No known implementation gap remains.

The audit found and fixed five material gaps before reaching this verdict: the initial seeded snapshot was not automatically recoverable on first publish; rollback depended on an eventually consistent draft reread; root CI did not run the console suite/build; the package tarball omitted the shared contract workspace; and the public API did not independently verify the stored content hash. The final rollback design performs one atomic Global Config mutation and has been proven against the real Vercel service.

Merge, Production deployment, corrected Production publication, the `0.4.0` release, and Codex registration refresh remain separate rollout gates.

## Plan traceability

| Plan area | Status | Evidence |
| --- | --- | --- |
| Next.js registry console | Complete | `apps/registry-console` contains the editor, authenticated admin routes, anonymous public routes, and production build configuration. |
| Vercel storage | Complete | Global Config stores the shared draft, published snapshot, publication metadata, and complete revision index. Private Blob stores immutable snapshots without overwrite. First publish archives the preexisting seed. |
| Sign in with Vercel | Complete | OAuth authorization-code flow uses PKCE, `openid email profile`, signed HTTP-only sessions, publisher allowlist enforcement, origin checks, and CSRF tokens. Real Preview OAuth succeeded for an allowlisted Stacks Labs publisher. Anonymous and non-allowlisted users cannot read private state or mutate data. |
| Editor workflow | Complete | Separate Bonds, Projects, Products, Notices, Partners & integrations, Custody, Sources, and Revision History sections support Save, Validate, Preview Diff, Publish, Discard, and Roll Back. Structurally valid incomplete work may be saved privately; publication always validates the complete contract. |
| Publication and rollback | Complete | Publish validates, hashes, archives, and atomically updates the public snapshot. Rollback reads an immutable Blob revision and creates a new revision in one Global Config write; it never deletes or overwrites history and does not rely on read-after-write consistency. |
| Public API | Complete | `GET /api/v1/registry` is anonymous, draft-free, schema/hash verified, cacheable, and supports exact, weak, list, and wildcard `If-None-Match` handling. `GET /api/v1/health` returns revision, hash, publication/review dates, and freshness. Invalid stored data fails closed with `503` and `no-store`. |
| Shared contract | Complete | The Zod contract is shared by the console and MCP. It enforces globally unique IDs/aliases, resolvable relationships and sources, integration tuple separation, scoped attestations, effective/expiry dates, seven-day review cadence, and notice expiry. |
| Unified MCP registry | Complete | `RegistryStore` loads one atomic snapshot, revalidates after 60 seconds with ETags, verifies the canonical hash, uses a current bundled fallback, and fails closed after expiry. Deprecated bond/custody URL fallbacks remain for one release. `ManifestStore` and `CustodyStore` are compatible specialized views. |
| Catalog and tools | Complete | `search_current_facts` is the fifteenth tool and applies deterministic query/category/status/limit filters. It returns freshness, sources, registry revision, and verification time. `bitcoin-staking://catalog` and market-snapshot highlights expose current facts/notices without allowing expired or overdue claims to support current answers. |
| Dynamic dates and precedence | Complete | Genesis stores stable bond index `1`, not an editable reward cycle. Live reads derive Cycle 143 and burn height through the PoX-5 SDK and estimate time from remaining Bitcoin blocks at ten minutes per block. Precedence is live chain, protocol derivation, then owner-reviewed target. Cycle 142 exists only as the required legacy alias. |
| Stale-copy cleanup | Complete | Static skill, MCP instructions, response standards, docs, and tests contain no current August 26 date, Cycle 142 eligibility claim, named current operator, or hard-coded current economics. Stable route mechanics remain static; current products, partners, terms, and integrations come from the registry. |
| Versioning and packaging | Complete | Package/skill are `0.4.0`, contract is `3.0.0`, and the expected tool count is 15. The packed artifact includes `packages/registry-contract` and installs/initializes outside the repository. |
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

## Verification record

- `npm run check`: passed after the final implementation and PR3 integration changes. The root suite discovers 102 tests: 100 pass and the two opt-in live tests skip as designed. The console suite passes 14/14. Across both suites, 116 tests are discovered, 114 pass, and two intentionally skip. TypeScript, schema validation, builds, and the Next.js production build pass.
- Real Preview OAuth/editor acceptance: passed with an allowlisted Stacks Labs publisher. A temporary integration was saved, validated, diffed, published, retrieved through the anonymous API and `RegistryStore`, then removed through rollback. Each publication produced a new immutable revision. The editor finished with the corrected seed, an empty integration list, and no saved draft.
- Real Vercel consistency regression: the audit reproduced an eventually consistent rollback failure, changed rollback to a single atomic mutation, deployed the fix, rolled from the seed to the temporary integration revision, and rolled back to the seed again. Both fixed rollbacks completed, produced new revision IDs, and retained all earlier revisions.
- Public API acceptance: `200` registry, matching weak ETag, `304` revalidation, current health metadata, canonical content hash, no temporary integration after restoration, and no private draft fields.
- Live registry validation: passed for the snapshot and all ten evidence URLs, including public/demo manifest URLs.
- Live PoX tests: mainnet and testnet smoke tests passed. At the audit observation time, mainnet burn height was `961476`; the derived Genesis schedule was Cycle `143`, burn height `966350`, and an approximate September 10 estimate based on 4,874 remaining burn blocks and the ten-minute target. These observations are time-specific and are not stored as static eligibility dates.
- Demo proof: passed.
- Isolated package install: passed; the tarball loaded with 15 tools and contract `3.0.0` after installation outside the monorepo.
- `npm audit --audit-level=high`: zero known high-severity vulnerabilities in the locked dependency graph at audit time.
- `git diff --check` and stale-copy search: passed.

## Rollout gates

Completed:

1. Implementation and offline tests.
2. Vercel Preview deployment, seeded-data validation, real OAuth, publish/retrieve/rollback acceptance, and corrected-seed restoration.
3. PR #3 merge, integration into this branch, conflict resolution, and combined policy/runtime-fixture validation.

Required before merging this stacked PR:

1. Retarget this PR to `main` and verify the exact resulting head.
2. Obtain human review/approval and mark the PR ready for review.
3. Require green GitHub CI and Vercel checks on that exact head.

Post-merge gates, requiring separate authorization:

1. Production Vercel deployment.
2. Corrected Genesis snapshot publication in Production.
3. MCP/package and skill `0.4.0` release.
4. Codex registration refresh and live-answer verification.

No Production deployment, tag, package publication, merge, or Codex registration mutation is implied by this audit.
