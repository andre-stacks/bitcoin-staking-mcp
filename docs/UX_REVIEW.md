# Bitcoin Staking Concierge — User Experience Review

Status: implemented for the hackathon MVP.

## Finding

The original setup succeeded technically but left two first-run dead ends:

1. The installer explained how to invoke the concierge without showing why to use it or what to ask.
2. An empty invocation opened with “What would you like your Bitcoin to do?” before introducing the service, its evidence boundaries, or its available workflows.

The raw MCP tool catalog was documented but not translated into user goals. A new user could reasonably conclude that the product contained only one vague command.

## Product decision

Keep one user-facing concierge entry point. Do not turn eleven implementation tools into eleven commands a user must learn.

The concierge now introduces seven service categories:

1. Protocol status and bond availability.
2. Active or upcoming bond discovery.
3. Participation fit across custody, liquidity, and time horizon.
4. Deterministic yield and fee scenarios.
5. Security diligence for audits, timelocks, Leather, recovery, and early exit.
6. Wallet/custodian compatibility and public participant status.
7. Native L1 Bitcoin staking versus sBTC path comparison.

The service menu is progressive disclosure. It is shown only when the concierge is invoked without a question. If the user already asks something, the agent proceeds directly and does not repeat the menu.

## First-run contract

The first response must:

- identify the product as the Bitcoin Staking Concierge;
- state the available services in plain language;
- allow either a number or a natural-language question;
- provide one recommended starting prompt;
- avoid a network-selection question;
- make no factual protocol or product claim before reading MCP evidence;
- stop and wait instead of calling tools speculatively.

The installer must end with useful example questions, not only host-specific invocation syntax.

## Technical discovery

The eleven tools remain directly available through the MCP host and Inspector. The `bitcoin-staking://capabilities` resource maps the seven service categories to exact tool names for agents and developers. This preserves a simple consumer experience without hiding the reusable primitive.

## Voice

The welcome is approachable and direct. Once diligence begins, answers retain the institutional response standard: neutral, concise, decision-relevant, sourced, and explicit about unknown or unproven facts.

## Acceptance criteria

- Empty Codex and Claude concierge invocations show the same seven capabilities.
- The phrase “What would you like your Bitcoin to do?” is not used as the opening.
- A supplied request bypasses the introductory menu.
- Setup output includes at least one status/discovery prompt and one security prompt.
- Capability discovery names all eleven tools without increasing the tool count.
- Existing provenance, abstention, read-only, and network-routing policies remain unchanged.
