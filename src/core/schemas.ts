import { z } from "zod";

export const DataStatusSchema = z.enum(["live", "published", "derived", "demo"]);
export type DataStatus = z.infer<typeof DataStatusSchema>;

export const StacksNetworkSchema = z.enum(["mainnet", "testnet"]);
export type StacksNetworkName = z.infer<typeof StacksNetworkSchema>;

export const SourceRefSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    url: z.url(),
    sourceType: z.enum(["chain_api", "official_docs", "public_manifest", "demo_manifest"]),
    dataStatus: DataStatusSchema,
    retrievedAt: z.iso.datetime().optional(),
  })
  .strict();
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const CompatibilityClaimSchema = z
  .object({
    kind: z.enum(["wallet", "custodian"]),
    name: z.string().min(1),
    status: z.enum(["supported", "unsupported", "unknown"]),
    evidence: z.string().min(1),
    sourceIds: z.array(z.string().min(1)),
  })
  .strict();
export type CompatibilityClaim = z.infer<typeof CompatibilityClaimSchema>;

export const BondManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    title: z.string().min(1),
    description: z.string().min(1),
    network: z.enum(["mainnet", "testnet"]),
    onChainBondIndex: z.number().int().nonnegative().optional(),
    lifecycleStatus: z.enum(["upcoming", "open", "closed", "unknown"]),
    participationPath: z.literal("native_l1_btc"),
    dataStatus: z.enum(["published", "demo"]),
    timing: z
      .object({
        opensAt: z.iso.datetime().optional(),
        closesAt: z.iso.datetime().optional(),
        lockDurationDays: z.number().int().positive().optional(),
        startsRewardCycle: z.number().int().nonnegative().optional(),
        endsRewardCycle: z.number().int().nonnegative().optional(),
        unlockHeight: z.string().regex(/^\d+$/).optional(),
      })
      .strict(),
    economics: z
      .object({
        targetRateBps: z.number().int().nonnegative().max(100_000).optional(),
        managerFeeBps: z.number().int().nonnegative().max(10_000).optional(),
        rewardAsset: z.enum(["BTC", "sBTC", "STX", "unknown"]),
        rewardModel: z.enum(["target_principal_rate", "fixed_reward_units", "unknown"]),
        fixedRewardUnits: z.string().regex(/^\d+(\.\d+)?$/).optional(),
      })
      .strict(),
    capacity: z
      .object({
        totalSats: z.string().regex(/^\d+$/).optional(),
        minSats: z.string().regex(/^\d+$/).optional(),
        maxSats: z.string().regex(/^\d+$/).optional(),
      })
      .strict(),
    requirements: z
      .object({
        allowlistRequired: z.boolean(),
        pairedStxRequired: z.boolean(),
        btcLocation: z.literal("bitcoin_l1"),
        keyControl: z.enum(["participant", "custodian_or_participant", "unknown"]),
        borrowingAgainstPosition: z.enum(["supported", "unsupported", "unknown"]),
        earlyExit: z.enum(["supported", "unsupported", "unknown"]),
      })
      .strict(),
    compatibility: z.array(CompatibilityClaimSchema),
    notes: z.array(z.string().min(1)),
    sources: z.array(SourceRefSchema).min(1),
    verifiedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.dataStatus === "demo" && !value.sources.some((source) => source.dataStatus === "demo")) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Demo manifests must include a demo source.",
      });
    }
    if (value.economics.rewardModel === "fixed_reward_units" && !value.economics.fixedRewardUnits) {
      context.addIssue({
        code: "custom",
        path: ["economics", "fixedRewardUnits"],
        message: "fixedRewardUnits is required for fixed_reward_units.",
      });
    }
  });
export type BondManifest = z.infer<typeof BondManifestSchema>;

export const ParticipantProfileSchema = z
  .object({
    goal: z.enum([
      "earn_yield",
      "prioritize_safety",
      "retain_flexibility",
      "borrow_without_selling",
      "compare_options",
    ]),
    liquidityNeed: z.enum(["lock_until_maturity", "may_need_early_exit", "access_anytime", "unknown"]),
    bitcoinPathPreference: z.enum(["bitcoin_l1_only", "open_to_sbtc", "compare_both", "unknown"]),
    keyControlPreference: z.enum(["self_controlled", "custodian", "either", "unknown"]),
    walletOrCustodian: z.string().min(1).optional(),
    amountSats: z.string().regex(/^\d+$/).optional(),
    timeHorizonDays: z.number().int().positive().optional(),
  })
  .strict();
export type ParticipantProfile = z.infer<typeof ParticipantProfileSchema>;

export const RecommendationResultSchema = z
  .object({
    bondId: z.string(),
    fit: z.enum(["strong", "conditional", "no_match"]),
    reasons: z.array(z.string()),
    tradeoffs: z.array(z.string()),
    missingFacts: z.array(z.string()),
    unsupportedRequirements: z.array(z.string()),
    alternatives: z.array(
      z.object({
        path: z.string(),
        status: z.enum(["available", "context_only", "not_verified"]),
        reason: z.string(),
      }),
    ),
    nextSteps: z.array(z.string()),
    dataStatus: DataStatusSchema,
    sources: z.array(SourceRefSchema),
    assumptions: z.array(z.string()),
    verifiedAt: z.iso.datetime(),
  })
  .strict();
export type RecommendationResult = z.infer<typeof RecommendationResultSchema>;

export const MetadataSchema = z
  .object({
    dataStatus: DataStatusSchema,
    sources: z.array(SourceRefSchema),
    assumptions: z.array(z.string()),
    verifiedAt: z.iso.datetime(),
  })
  .passthrough();

export const LifecycleFilterSchema = z.enum(["upcoming", "open", "closed", "unknown"]);

export function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) => (typeof item === "bigint" ? item.toString() : item)),
  ) as T;
}
