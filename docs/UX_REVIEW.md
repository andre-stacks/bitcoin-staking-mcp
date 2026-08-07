# Bitcoin Staking Concierge — User Experience Review

Status: implemented for the v0.3.0 production beta.

## Finding

The original setup succeeded technically but left two first-run dead ends:

1. The installer explained how to invoke the concierge without showing why to use it or what to ask.
2. An empty invocation opened with “What would you like your Bitcoin to do?” before introducing the service, its evidence boundaries, or its available workflows.

The raw MCP tool catalog was documented but not translated into user goals. A new user could reasonably conclude that the product contained only one vague command.

## Product decision

Keep one user-facing concierge entry point. Do not turn fourteen implementation tools into commands a user must learn.

The concierge now introduces two bond-scoped participation routes:

1. Direct native-L1 bond for users who prioritize keeping BTC on Bitcoin L1.
2. The approved StackingDAO sBTC pool for permissionless smaller-balance participation, with any stBTC option offered through the pool.
The first response loads the upcoming opportunity and current custody paths, explains the routes in plain language, and asks which priority matters most. If the user already asks something, the agent proceeds directly and does not repeat the introduction.

## First-run contract

The first response must:

- identify the product as the Bitcoin Staking Concierge;
- state the upcoming opportunity and two routes in plain language;
- ask whether the user prioritizes L1, liquidity, or a smaller pooled position;
- avoid a network-selection question;
- make no factual protocol or product claim before reading MCP evidence;
- call the market snapshot, bond-route, and direct-custody tools before making factual claims.

The installer must end with useful example questions, not only host-specific invocation syntax.

## Technical discovery

The fourteen tools remain directly available through the MCP host and Inspector. The `bitcoin-staking://capabilities` resource maps user goals to exact tool names and versions for agents and developers.

## Voice

The welcome is approachable and direct. Once diligence begins, answers remain neutral, concise, decision-relevant, and sourced, but they should not read like an audit log. Lead with the user-facing status, translate internal fields into plain language, and mention only the unknowns that change the answer. Keep route taxonomy and exhaustive integration caveats out of a general opportunity response unless the user asks for that detail.

## Acceptance criteria

- Empty Codex and Claude concierge invocations call the same market snapshot and show the same two routes.
- The phrase “What would you like your Bitcoin to do?” is not used as the opening.
- A supplied request bypasses the introduction.
- Setup output includes at least one status/discovery prompt and one security prompt.
- Capability discovery names all fourteen tools, including the market snapshot, bond-scoped routes, and native-L1 custody directory.
- Existing provenance, abstention, read-only, and network-routing policies remain unchanged.
