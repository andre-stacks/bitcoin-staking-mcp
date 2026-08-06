# Bitcoin Staking MCP — Installation

## Portable installation

Requires Node 22 plus the Codex and/or Claude Code CLI for the selected hosts.

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp#v0.3.0 setup
```

The pinned tag is the production-beta install. Use the unpinned `github:andre-stacks/bitcoin-staking-mcp` spec only when intentionally testing the current development branch.

The default installs both hosts. It:

1. Fetches and builds the GitHub package.
2. Starts the packaged stdio server and requires the exact fourteen-tool MCP contract plus server, contract, skill, and registry versions.
3. Replaces only the user-level MCP registration named `bitcoin-staking` in Codex and Claude Code.
4. Installs the Codex workflow at `~/.agents/skills/bitcoin-staking-concierge`.
5. Re-reads both host registrations and reports each step.

Restart Codex and Claude Code after setup so they reload MCP and skill metadata.

## First use

Open the concierge without a question to see the available services.

Codex:

```text
$bitcoin-staking-concierge
```

Claude Code:

```text
/mcp__bitcoin_staking__bitcoin_staking_concierge
```

The concierge introduces protocol status, bond discovery, participation fit, yield modeling, security diligence, compatibility and public-status checks, and native-L1 versus sBTC comparison. Ask naturally, for example:

```text
What is the current protocol status, and are any bonds available?
```

```text
What security evidence should I review before participating through Leather?
```

## Host selection

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp#v0.3.0 setup --hosts codex
npx -y github:andre-stacks/bitcoin-staking-mcp#v0.3.0 setup --hosts claude
```

`--hosts all` and `--hosts both` are aliases for the default.

## Verification

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp#v0.3.0 check
```

Re-run setup safely or use the explicit update command to refresh the registered package and concierge skill:

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp#v0.3.0 update
```

For harness automation:

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp#v0.3.0 check --json
```

A successful result requires:

- Node 22 or newer;
- the exact fourteen-tool MCP contract and expected versions;
- resolvable registrations for every selected host;
- the global Codex skill when Codex is selected.

Claude model authentication is separate from MCP registration. If Claude reports a revoked or expired token, run `claude auth login` before testing a model turn.

## Update

Rerun `setup`. It replaces only the registration named `bitcoin-staking` and refreshes the named global Codex skill from the package.

To pin a release, tag, or commit:

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp#v0.3.0 setup \
  --package-spec github:andre-stacks/bitcoin-staking-mcp#COMMIT_OR_TAG
```

The same pinned source is stored in both host launch commands.

## Local checkout

For development, register the current checkout instead of the GitHub package:

```bash
git clone https://github.com/andre-stacks/bitcoin-staking-mcp.git
cd bitcoin-staking-mcp
npm ci
npm run build
npm run setup
```

This stores the absolute local `dist/cli.js serve` command. Moving or deleting the checkout invalidates that registration; rerun portable setup to switch back.

## CoinGecko pricing

Current BTC and STX USD prices use CoinGecko Simple Price. The default `public` plan works without credentials:

```bash
COINGECKO_API_PLAN=public
COINGECKO_API_BASE_URL=https://api.coingecko.com/api/v3
BITCOIN_STAKING_PRICE_CACHE_MS=60000
```

For a CoinGecko Demo or Pro key, set `COINGECKO_API_PLAN=demo` or `pro` and provide `COINGECKO_API_KEY`. Keys are sent in the appropriate request header and are never included in source URLs or tool output.

## Uninstall

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp#v0.3.0 uninstall
```

This removes the user registrations named `bitcoin-staking` from both hosts and the global Codex skill directory named `bitcoin-staking-concierge`. It does not modify other MCP servers, skills, repositories, credentials, or host settings.

Keep the Codex skill while removing MCP registrations:

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp#v0.3.0 uninstall --keep-skill
```
