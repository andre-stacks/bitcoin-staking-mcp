# Bitcoin Staking MCP — Installation

## Portable installation

Requires Node 22 plus the Codex and/or Claude Code CLI for the selected hosts.

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp setup
```

The default installs both hosts. It:

1. Fetches and builds the GitHub package.
2. Starts the packaged stdio server and requires an eleven-tool MCP handshake.
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

The concierge introduces protocol status, bond discovery, participation fit, yield modeling, security diligence, compatibility and public-status checks, and native-L1 versus sBTC comparison. Choose a number or ask naturally, for example:

```text
What is the current protocol status, and are any bonds available?
```

```text
What security evidence should I review before participating through Leather?
```

## Host selection

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp setup --hosts codex
npx -y github:andre-stacks/bitcoin-staking-mcp setup --hosts claude
```

`--hosts all` and `--hosts both` are aliases for the default.

## Verification

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp check
```

For harness automation:

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp check --json
```

A successful result requires:

- Node 22 or newer;
- an eleven-tool MCP handshake;
- resolvable registrations for every selected host;
- the global Codex skill when Codex is selected.

Claude model authentication is separate from MCP registration. If Claude reports a revoked or expired token, run `claude auth login` before testing a model turn.

## Update

Rerun `setup`. It replaces only the registration named `bitcoin-staking` and refreshes the named global Codex skill from the package.

To pin a release, tag, or commit:

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp setup \
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

## Uninstall

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp uninstall
```

This removes the user registrations named `bitcoin-staking` from both hosts and the global Codex skill directory named `bitcoin-staking-concierge`. It does not modify other MCP servers, skills, repositories, credentials, or host settings.

Keep the Codex skill while removing MCP registrations:

```bash
npx -y github:andre-stacks/bitcoin-staking-mcp uninstall --keep-skill
```
