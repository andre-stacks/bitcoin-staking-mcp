import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";
import { ServiceError } from "../core/errors.js";
import {
  MetadataSchema,
  ParticipantProfileSchema,
  StacksNetworkSchema,
  toJsonSafe,
} from "../core/schemas.js";
import { GLOSSARY, YIELD_METHODOLOGY } from "../content.js";
import { BitcoinStakingService } from "../service.js";
import { SecurityTopicValues } from "../security.js";
import {
  INSTITUTIONAL_RESPONSE_STANDARD,
  SOURCE_METHODOLOGY,
} from "../institutional.js";

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const liveReadAnnotations = {
  ...readOnlyAnnotations,
  openWorldHint: true,
} as const;

function success(value: unknown) {
  const structuredContent = toJsonSafe(value) as Record<string, unknown>;
  return {
    structuredContent,
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent, null, 2) }],
  };
}

function failure(error: unknown) {
  const serviceError =
    error instanceof ServiceError
      ? error
      : new ServiceError(
          "INVALID_INPUT",
          error instanceof Error ? error.message : "Unknown request failure.",
          false,
        );
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            error: {
              code: serviceError.code,
              message: serviceError.message,
              retryable: serviceError.retryable,
            },
          },
          null,
          2,
        ),
      },
    ],
  };
}

function tool<T>(handler: () => Promise<T> | T) {
  return Promise.resolve()
    .then(handler)
    .then(success)
    .catch(failure);
}

export function createBitcoinStakingMcpServer(service = new BitcoinStakingService()): McpServer {
  const server = new McpServer(
    { name: "bitcoin-staking-mcp", version: "0.1.0" },
    {
      instructions:
        "Act as an institutional Bitcoin Staking diligence analyst: neutral, factual, concise, evidence-led, and non-promotional. Lead with the decision-relevant answer; adapt depth for CFO, investment, technical, custody, or security audiences. Ground answers on live state, deployed or release-pinned PoX-5 contracts and reference implementations, accepted SIP-045, then pinned SDK/tests and official docs. Never imply that demo data is live or testnet assets are investable. Use get_protocol_status, list_protocol_bonds, and list_bonds before recommending a bond. Use build_diligence_report for a decision-ready live profile assessment. Use get_security_guidance for narrow audit, timelock, wallet, pre-funding, recovery, or early-exit questions. Keep protocol assurance separate from wallet integration proof. Keep native L1 BTC principal separate from sBTC rewards and sBTC principal paths, and treat wallet support as unknown unless cited product evidence says otherwise. State what is not proven. Never construct, sign, or broadcast transactions.",
    },
  );

  server.registerTool(
    "get_protocol_status",
    {
      title: "Get Bitcoin Staking protocol status",
      description:
        "Read the current Stacks PoX contract, burn height, current and next reward cycles, and derived prepare/reward phase heights from mainnet or a configured testnet API.",
      inputSchema: z.object({ network: StacksNetworkSchema.default("mainnet") }),
      outputSchema: MetadataSchema,
      annotations: liveReadAnnotations,
    },
    ({ network }) => tool(() => service.getProtocolStatus(network)),
  );

  server.registerTool(
    "list_protocol_bonds",
    {
      title: "List live PoX-5 protocol bonds",
      description:
        "Scan the active PoX-5 bond window on mainnet or a configured testnet and return only bonds proven to be configured on-chain, with phase, timing, terms, and explicit testnet availability.",
      inputSchema: z.object({
        network: StacksNetworkSchema.default("mainnet"),
        lookbackPeriods: z.number().int().min(0).max(24).default(6),
        lookaheadPeriods: z.number().int().min(0).max(12).default(2),
      }),
      outputSchema: MetadataSchema,
      annotations: liveReadAnnotations,
    },
    ({ network, lookbackPeriods, lookaheadPeriods }) =>
      tool(() => service.listProtocolBonds(network, { lookbackPeriods, lookaheadPeriods })),
  );

  server.registerTool(
    "get_security_guidance",
    {
      title: "Get Bitcoin Staking security guidance",
      description:
        "Answer a sourced security-diligence topic about PoX-5 audits, native-L1 timelock construction, Leather transaction boundaries, pre-funding validation, maturity recovery, or early exit. Separates published assurance from what still requires integration proof.",
      inputSchema: z.object({
        topic: z.enum([...SecurityTopicValues, "all"]).default("all"),
      }),
      outputSchema: MetadataSchema,
      annotations: readOnlyAnnotations,
    },
    ({ topic }) => tool(() => service.getSecurityGuidance(topic)),
  );

  server.registerTool(
    "build_diligence_report",
    {
      title: "Build an institutional Bitcoin Staking diligence report",
      description:
        "Combine live PoX-5 status, bounded on-chain bond discovery, a participant profile, exact target-rate economics, and sourced security evidence. Before activation or without a configured bond, returns a verified no-opportunity result rather than inferred terms. Testnet records are always non-investable.",
      inputSchema: z.object({
        network: StacksNetworkSchema.default("mainnet"),
        bondIndex: z.number().int().nonnegative().optional(),
        profile: ParticipantProfileSchema,
      }),
      outputSchema: MetadataSchema,
      annotations: liveReadAnnotations,
    },
    ({ network, bondIndex, profile }) =>
      tool(() => service.buildDiligenceReport({ network, bondIndex, profile })),
  );

  server.registerTool(
    "list_bonds",
    {
      title: "List Bitcoin Staking bonds",
      description:
        "List versioned public Bitcoin Staking bond manifests. Demo records are excluded by default and, when requested, returned in a separate demoBonds array.",
      inputSchema: z.object({
        lifecycleStatus: z.enum(["upcoming", "open", "closed", "unknown"]).optional(),
        includeDemo: z.boolean().default(false),
      }),
      outputSchema: MetadataSchema,
      annotations: readOnlyAnnotations,
    },
    (input) => tool(() => service.listBonds(input)),
  );

  server.registerTool(
    "get_bond",
    {
      title: "Get a Bitcoin Staking bond",
      description:
        "Get one normalized bond manifest, its sources, missing fields, demo status, and optional on-chain PoX-5 verification.",
      inputSchema: z.object({ bondId: z.string().min(1) }),
      outputSchema: MetadataSchema,
      annotations: liveReadAnnotations,
    },
    ({ bondId }) => tool(() => service.getBond(bondId)),
  );

  server.registerTool(
    "check_participant_status",
    {
      title: "Check public participant status",
      description:
        "Read public Stacks account, staker, bond membership, and optional allowance state. This never proves ownership of the address.",
      inputSchema: z.object({
        address: z.string().min(1),
        bondId: z.string().min(1).optional(),
      }),
      outputSchema: MetadataSchema,
      annotations: liveReadAnnotations,
    },
    ({ address, bondId }) => tool(() => service.checkParticipantStatus(address, bondId)),
  );

  server.registerTool(
    "check_compatibility",
    {
      title: "Check wallet or custodian compatibility",
      description:
        "Check a specific bond manifest for cited wallet or custodian compatibility. Missing evidence returns unknown, never assumed support.",
      inputSchema: z.object({
        bondId: z.string().min(1),
        provider: z.string().min(1),
        keyControlPreference: z
          .enum(["self_controlled", "custodian", "either", "unknown"])
          .default("unknown"),
      }),
      outputSchema: MetadataSchema,
      annotations: readOnlyAnnotations,
    },
    (input) => tool(() => service.checkCompatibility(input)),
  );

  server.registerTool(
    "simulate_yield",
    {
      title: "Simulate Bitcoin Staking yield",
      description:
        "Run deterministic, non-compounding yield and price scenarios using published manifest terms and explicit assumptions. Refuses unsupported or incomplete reward models.",
      inputSchema: z.object({
        bondId: z.string().min(1),
        principalSats: z.string().regex(/^\d+$/),
        durationDays: z.number().int().positive().optional(),
        annualRateBps: z.number().int().nonnegative().optional(),
        feeBps: z.number().int().min(0).max(10_000).optional(),
        btcPriceUsd: z.number().positive().optional(),
        stxPriceScenariosUsd: z.array(z.number().positive()).max(10).optional(),
      }),
      outputSchema: MetadataSchema,
      annotations: readOnlyAnnotations,
    },
    (input) => tool(() => service.simulateYield(input)),
  );

  server.registerTool(
    "compare_staking_paths",
    {
      title: "Compare native Bitcoin staking and sBTC context",
      description:
        "Compare a user's goals with native-L1 Bitcoin staking and sourced sBTC application context without inventing or ranking live DeFi products.",
      inputSchema: ParticipantProfileSchema,
      outputSchema: MetadataSchema,
      annotations: readOnlyAnnotations,
    },
    (profile) => tool(() => service.compareStakingPaths(profile)),
  );

  server.registerTool(
    "build_participation_plan",
    {
      title: "Build a Bitcoin Staking participation plan",
      description:
        "Evaluate one complete participant profile against a bond and return fit, tradeoffs, missing facts, unsupported requirements, and read-only next steps.",
      inputSchema: z.object({
        bondId: z.string().min(1),
        profile: ParticipantProfileSchema,
      }),
      outputSchema: MetadataSchema,
      annotations: readOnlyAnnotations,
    },
    ({ bondId, profile }) => tool(() => service.buildParticipationPlan(bondId, profile)),
  );

  server.registerResource(
    "bitcoin-staking-glossary",
    "bitcoin-staking://glossary",
    { title: "Bitcoin Staking glossary", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: GLOSSARY }] }),
  );

  server.registerResource(
    "bitcoin-staking-yield-methodology",
    "bitcoin-staking://methodology/yield",
    { title: "Bitcoin Staking yield methodology", mimeType: "text/markdown" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: YIELD_METHODOLOGY }],
    }),
  );

  server.registerResource(
    "bitcoin-staking-security",
    "bitcoin-staking://security",
    { title: "Bitcoin Staking security guidance", mimeType: "application/json" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(service.getSecurityGuidance("all"), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "bitcoin-staking-source-methodology",
    "bitcoin-staking://methodology/sources",
    { title: "Bitcoin Staking source methodology", mimeType: "text/markdown" },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "text/markdown", text: SOURCE_METHODOLOGY },
      ],
    }),
  );

  server.registerResource(
    "bitcoin-staking-institutional-response-standard",
    "bitcoin-staking://methodology/response-standard",
    { title: "Institutional response standard", mimeType: "text/markdown" },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "text/markdown", text: INSTITUTIONAL_RESPONSE_STANDARD },
      ],
    }),
  );

  server.registerResource(
    "bitcoin-staking-bond",
    new ResourceTemplate("bitcoin-staking://bonds/{bondId}", {
      list: async () => ({
        resources: (await service.manifests.list()).map((bond) => ({
          uri: `bitcoin-staking://bonds/${bond.id}`,
          name: bond.title,
          title: bond.dataStatus === "demo" ? `[DEMO] ${bond.title}` : bond.title,
          mimeType: "application/json",
          description: bond.description,
        })),
      }),
      complete: {
        bondId: async (value) =>
          (await service.manifests.list())
            .map((bond) => bond.id)
            .filter((id) => id.startsWith(value)),
      },
    }),
    { title: "Bitcoin Staking bond manifest", mimeType: "application/json" },
    async (uri, variables) => {
      const result = await service.getBond(String(variables.bondId));
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(toJsonSafe(result), null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "bitcoin-staking-source",
    new ResourceTemplate("bitcoin-staking://sources/{sourceId}", {
      list: async () => ({
        resources: (await service.listSources()).map((source) => ({
          uri: `bitcoin-staking://sources/${source.id}`,
          name: source.title,
          title: source.title,
          mimeType: "application/json",
          description: `${source.dataStatus} ${source.sourceType} source`,
        })),
      }),
      complete: {
        sourceId: async (value) =>
          (await service.listSources())
            .map((source) => source.id)
            .filter((id) => id.startsWith(value)),
      },
    }),
    { title: "Bitcoin Staking source", mimeType: "application/json" },
    async (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(await service.getSource(String(variables.sourceId)), null, 2),
        },
      ],
    }),
  );

  server.registerPrompt(
    "bitcoin-staking-concierge",
    {
      title: "Bitcoin Staking Concierge",
      description:
        "Gather a user's Bitcoin goals in plain language, then compose the read-only Bitcoin Staking tools into a sourced fit assessment.",
      argsSchema: z.object({ request: z.string().optional() }),
    },
    ({ request }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `What would you like your Bitcoin to do?

Act as a read-only institutional Bitcoin Staking diligence analyst. Be neutral, factual, concise, evidence-led, and non-promotional. Lead with the decision-relevant answer and adapt depth to the apparent audience: CFO/investment committee, technical/security/custody team, or mixed. ${request ? `The user's initial request is: ${request}` : "Wait for the user's answer."}

Ask no more than four goal-oriented questions before an initial assessment. Establish: primary goal, liquidity need, whether BTC must remain on Bitcoin L1 or the user is open to sBTC context, and who should control the keys. Ask amount, horizon, wallet, or custodian only when they change the result.

Ground protocol behavior in live state, the deployed or release-pinned PoX-5 contracts and reference implementations, accepted SIP-045, then pinned SDK/tests and official documentation. If evidence conflicts, say so and prefer the higher-precedence source. Use get_protocol_status, list_protocol_bonds, and list_bonds before discussing availability. Use build_diligence_report when the user wants a decision-ready mainnet or testnet assessment that combines availability, profile fit, economics, and security evidence. Use mainnet by default. Use testnet only when the user asks for a test, demonstration, or upcoming testnet bond, and label every testnet record as non-investable. For a narrow audit, timelock, Leather, pre-funding, recovery, or early-exit question, call get_security_guidance. State what is known, what is not proven, and the relevant verification checklist; never treat a protocol audit as proof of a wallet integration. Call build_participation_plan and simulate_yield for manifest-backed opportunities rather than doing calculations yourself. Keep native L1 BTC separate from sBTC rewards and sBTC principal paths. Treat wallet support as unknown unless check_compatibility cites evidence. Present the bottom line, current availability, material tradeoff or risk, assumptions, primary sources, and next diligence step. If nothing matches, say so. Never construct, sign, or broadcast a transaction.`,
          },
        },
      ],
    }),
  );

  return server;
}
