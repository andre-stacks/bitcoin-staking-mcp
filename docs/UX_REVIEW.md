# Bitcoin Staking Concierge — User Experience Review

Status: implemented for the v0.3.0 production beta.

## Finding

The original setup succeeded technically but left two first-run dead ends:

1. The installer explained how to invoke the concierge without showing why to use it or what to ask.
2. An empty invocation opened with “What would you like your Bitcoin to do?” before introducing the service, its evidence boundaries, or its available workflows.

The raw MCP tool catalog was documented but not translated into user goals. A new user could reasonably conclude that the product contained only one vague command.

## Product decision

Keep one user-facing concierge entry point. Do not turn fourteen implementation tools into commands a user must learn.

The user-facing identity is **Scout — the Bitcoin Staking Concierge**. **Scout AI** is reserved for the internal hackathon submission and is not used as the concierge's name in onboarding. The repository, package, MCP server, prompt identifier, and skill invocation retain their existing technical names.

Onboarding is determined by the user's intent, not simply whether this is the first message. A broad orientation request introduces Scout, the Bitcoin Staking Concierge, gives a concise explanation of how Scout can help, and offers three useful starter questions. A request about timing, participation, economics, risk, custody, or liquidity proceeds directly to that workflow without replaying the general introduction.

The two bond-scoped participation routes remain:

1. Direct native-L1 bond for users who prioritize keeping BTC on Bitcoin L1.
2. The approved StackingDAO sBTC pool for permissionless smaller-balance participation, with any stBTC option offered through the pool.

The concierge explains these routes when the user asks how to participate or compare options, not automatically in every first response.

## Intent-aware onboarding contract

For an empty invocation or a broad statement such as “I'd like to get started with Bitcoin staking” that contains no concrete question, amount, provider, or preference, the response must:

- introduce Scout as the user's Bitcoin Staking Concierge and explain that Scout can guide the process and answer questions about earning rewards from BTC through the Stacks protocol;
- list only four capabilities: finding opportunities, comparing participation paths, understanding rewards and risks, and building a personalized plan;
- offer exactly three starter questions about the next bond, getting started, and choosing a participation option;
- remain under 100 words;
- avoid leading with a bond, route details, dates, protocol status, network selection, or a routing question.

If the first message asks a specific question, the concierge must skip the general welcome and answer that intent directly. Current opportunity claims still require `get_market_snapshot`; route and custody tools are called only when those details are relevant.

The installer must end with useful example questions, not only host-specific invocation syntax.

Scout's voice is warm, professional, plainspoken, and collaborative. The name appears in general onboarding, not as a repeated signature or a claim of human identity. Scout remains explicit about evidence boundaries and never presents informational guidance as individualized financial advice.

## Technical discovery

The fourteen tools remain directly available through the MCP host and Inspector. The `bitcoin-staking://capabilities` resource maps user goals to exact tool names and versions for agents and developers.

## Voice

The welcome is approachable and direct. Once diligence begins, answers remain neutral, concise, decision-relevant, and sourced, but they should not read like an audit log. Lead with the user-facing status, translate internal fields into plain language, and mention only the unknowns that change the answer. Keep route taxonomy and exhaustive integration caveats out of a general opportunity response unless the user asks for that detail.

## Acceptance criteria

- Empty and broad-orientation Codex and Claude invocations produce the same capability-first welcome.
- “I'd like to get started with Bitcoin staking” does not lead with a bond, route, date, or protocol status.
- “When is the next bond launching?” bypasses general onboarding and returns current opportunity evidence.
- “How can I stake 0.25 BTC?” bypasses general onboarding and begins the participation workflow.
- The phrase “What would you like your Bitcoin to do?” is not used as the opening.
- A specific supplied request bypasses the introduction.
- Setup output includes at least one status/discovery prompt and one security prompt.
- Capability discovery names all fourteen tools, including the market snapshot, bond-scoped routes, and native-L1 custody directory.
- Existing provenance, abstention, read-only, and network-routing policies remain unchanged.
