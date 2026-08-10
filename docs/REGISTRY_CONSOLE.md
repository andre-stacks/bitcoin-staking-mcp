# Scout live registry console

The registry console is implemented in `apps/registry-console`. Deployment, production publication, and the MCP release are separate approval gates.

## Vercel setup

Create one project under the Stacks Labs Vercel team with Root Directory `apps/registry-console`. Register a Sign in with Vercel application whose callback is `/api/auth/callback` and enable `openid`, `email`, and `profile`.

Isolate Preview writes either with separate environment-scoped Global Config and private Blob stores, or with the built-in environment namespace when a Vercel plan allows only one Global Config. `VERCEL_ENV=production` intentionally retains the legacy unprefixed keys and `revisions/` path. Preview and Development automatically use `preview_` or `development_` Global Config keys and matching `preview/revisions/` or `development/revisions/` Blob paths. `REGISTRY_STORAGE_NAMESPACE` can override that inference for another non-Production environment. Verify that Preview and Production resolve different stores or different keys and revision pathnames before publishing a test revision. This lets branch previews exercise the real persistence path without making a Preview publish or rollback a Production data mutation.

Configure the variables listed in `apps/registry-console/.env.example`. `VERCEL_API_TOKEN` should be limited to the team and permissions needed to update the selected Global Config. `PUBLISHER_EMAILS` is a comma-separated allowlist. Users with a valid Vercel account but an email outside that list receive read-only denial. `EDGE_CONFIG` and `EDGE_CONFIG_ID` remain supported as deprecated compatibility names for one release.

Production Global Config keys are:

- `publishedSnapshot`: the anonymous atomic snapshot;
- `draft`: the private shared draft or `null`;
- `publicationMetadata`: the current revision summary;
- `revisionIndex`: private Blob pathnames and revision metadata.

Each publish validates the full draft, hashes canonical content, writes a new private `<namespace>/revisions/<revision>.json` object (with no namespace in Production), and updates all environment-specific Global Config publication keys in one batch. Rollback reads an immutable private object and publishes its content as a new revision.

Public snapshots contain only the display identity `Stacks Labs registry team`. The authenticated publisher email remains in the private revision index and admin console. For native-L1 routes, an empty `custodyPathIds` list means the route adds no restriction beyond the current product-wide custody registry; a non-empty list narrows compatibility to the listed path IDs. It does not turn an unavailable or overdue custody path into an approved one.

## Local validation

```bash
npm run registry:build
npm run typecheck --workspace @bitcoin-staking/registry-console
npm test --workspace @bitcoin-staking/registry-console
npm run build --workspace @bitcoin-staking/registry-console
```

The public API never returns the draft, revision Blob locations, allowlist, OAuth tokens, or internal editor state. Mutation routes require a publisher session, same-origin request, and matching CSRF token.

## Rollout gates

1. Review the implementation PR and offline evidence.
2. Verify Preview and Production resolve different Global Config keys and Blob paths (or separate stores), then create a Vercel preview and publish a test revision.
3. Obtain explicit approval before merge.
4. Deploy the production Vercel project.
5. Publish the corrected Genesis snapshot before releasing MCP contract 4.0.0; the legacy Production snapshot contains a demo record that the narrowed schema rejects, and the bundled fallback is deliberately time-limited.
6. Release MCP and skill 0.5.0, then refresh Codex registration.
7. Verify Scout retrieves a publication and rollback within two minutes without another MCP release.
