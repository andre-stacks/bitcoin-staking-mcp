import { z } from "zod";

const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const SatsSchema = z.string().regex(/^\d+$/);
const BtcAmountSchema = z.string().trim().regex(/^\d+(?:\.\d{1,8})?\s*(?:s?btc)?$/i);
const MAX_BITCOIN_SUPPLY_SATS = 2_100_000_000_000_000n;

export function btcAmountToSats(value: string): string {
  const normalized = value.trim().replace(/\s*(?:s?btc)$/i, "");
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(normalized);
  if (!match) throw new Error("BTC amount must be a non-negative decimal with at most eight fractional digits.");
  const whole = match[1]!;
  const fraction = match[2] ?? "";
  return (BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"))).toString();
}

export const DataStatusSchema = z.enum(["live", "published", "derived", "demo"]);
export type DataStatus = z.infer<typeof DataStatusSchema>;
export const StacksNetworkSchema = z.enum(["mainnet", "testnet"]);
export type StacksNetworkName = z.infer<typeof StacksNetworkSchema>;
export const ProductStatusSchema = z.enum([
  "production", "tested", "in_progress", "blocked", "not_supported", "unconfirmed",
]);
export const EnrollmentStatusSchema = z.enum(["open", "scheduled", "paused", "closed", "unknown"]);
export const VerificationLevelSchema = z.enum([
  "product_owner_confirmed", "testnet_verified", "mainnet_verified",
]);
export const EffectiveAvailabilitySchema = z.enum([
  "available", "scheduled", "unavailable", "needs_review", "conflict", "unknown",
]);
export const RegistrySourceModeSchema = z.enum([
  "live_registry", "runtime_cache", "bundled_snapshot",
]);

export const SourceRefSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  sourceType: z.enum([
    "chain_api", "market_data_api", "official_docs", "source_code", "security_statement", "public_manifest", "demo_manifest", "economic_model",
  ]),
  dataStatus: DataStatusSchema,
  retrievedAt: z.iso.datetime().optional(),
  sourceVersion: z.string().min(1).optional(),
  contentHashSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const OwnerAttestationSchema = z.object({
  scope: z.string().min(1),
  ownerOrganization: z.string().min(1),
  reviewedAt: z.iso.datetime(),
  reviewCadenceDays: z.literal(7),
  sourceIds: z.array(z.string().min(1)).min(1),
}).strict();
export type OwnerAttestation = z.infer<typeof OwnerAttestationSchema>;

export const CompatibilityClaimSchema = z.object({
  kind: z.enum(["wallet", "custodian"]),
  name: z.string().min(1),
  status: z.enum(["supported", "unsupported", "unknown"]),
  evidence: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
}).strict();
export type CompatibilityClaim = z.infer<typeof CompatibilityClaimSchema>;

export const CustodyPathStatusSchema = z.enum([
  "available", "not_currently_supported", "in_integration", "unknown", "needs_review",
]);
export type CustodyPathStatus = z.infer<typeof CustodyPathStatusSchema>;
export const CustodyPathSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  category: z.enum([
    "software_wallet", "multisig_wallet", "hardware_wallet", "institutional_wallet", "qualified_custodian",
  ]),
  status: CustodyPathStatusSchema,
  summary: z.string().min(1),
  evidence: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  attestation: OwnerAttestationSchema,
}).strict();
export type CustodyPath = z.infer<typeof CustodyPathSchema>;

export const CustodyRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  registryVersion: z.string().min(1).default("1"),
  scope: z.literal("native_l1_bitcoin_staking"),
  reviewCadenceDays: z.literal(7),
  reviewedAt: z.iso.datetime(),
  verificationMethod: z.literal("product_owner_confirmed"),
  ownerOrganization: z.string().min(1).default("Stacks Labs"),
  paths: z.array(CustodyPathSchema).min(1),
  sources: z.array(SourceRefSchema).min(1),
}).strict().superRefine((value, context) => {
  validateReferences(value.paths, value.sources, context, "paths");
  validateUniqueSourceIds(value.sources, context);
  const sourceIds = new Set(value.sources.map((source) => source.id));
  value.paths.forEach((path, index) => path.attestation.sourceIds.forEach((sourceId) => {
    if (!sourceIds.has(sourceId)) context.addIssue({ code: "custom", path: ["paths", index, "attestation", "sourceIds"], message: `Missing source ID: ${sourceId}` });
  }));
  value.paths.forEach((path, index) => validateAttestation(path.attestation, value.sources, context, ["paths", index, "attestation"]));
});
export type CustodyRegistry = z.infer<typeof CustodyRegistrySchema>;

const RouteBaseShape = {
  id: IdSchema,
  name: z.string().min(1),
  productStatus: ProductStatusSchema,
  enrollmentStatus: EnrollmentStatusSchema,
  verification: z.array(VerificationLevelSchema),
  attestation: OwnerAttestationSchema,
  sourceIds: z.array(z.string().min(1)).min(1),
  summary: z.string().min(1),
};

export const LstCapabilitySchema = z.object({
  tokenSymbol: z.string().min(1),
  tokenContract: z.string().regex(/^[SM][A-Z0-9]{38,40}\.[a-zA-Z0-9_-]+$/).optional(),
  productStatus: ProductStatusSchema,
  verification: z.array(VerificationLevelSchema),
  attestation: OwnerAttestationSchema,
  transferable: z.boolean(),
  redemption: z.object({
    method: z.string().min(1),
    timing: z.string().min(1),
    status: z.enum(["verified", "unverified", "not_supported"]),
  }).strict(),
  feeBps: z.number().int().min(0).max(10_000).optional(),
  liquidityEvidence: z.object({
    status: z.enum(["verified", "unverified", "none"]),
    description: z.string().min(1),
    sourceIds: z.array(z.string().min(1)),
  }).strict(),
  oracleEvidence: z.object({
    status: z.enum(["verified", "unverified", "none"]),
    description: z.string().min(1),
    sourceIds: z.array(z.string().min(1)),
  }).strict(),
  supportedMarkets: z.array(z.string().min(1)),
  verifiedDefiIntegrations: z.array(z.object({
    name: z.string().min(1),
    capability: z.enum(["swap", "liquidity", "lending", "borrowing"]),
    status: z.literal("live"),
    collateralTerms: z.string().min(1).optional(),
    sourceIds: z.array(z.string().min(1)).min(1),
  }).strict().superRefine((integration, context) => {
    if (["lending", "borrowing"].includes(integration.capability) && !integration.collateralTerms) {
      context.addIssue({ code: "custom", path: ["collateralTerms"], message: "Live lending or borrowing integrations require sourced collateral terms." });
    }
  })),
  sourceIds: z.array(z.string().min(1)).min(1),
}).strict();

export const NativeL1DirectRouteSchema = z.object({
  ...RouteBaseShape,
  routeType: z.literal("native_l1_direct"),
  whitelist: z.object({
    required: z.boolean(),
    status: z.enum(["available", "not_available", "unknown"]),
  }).strict(),
  participantTypes: z.array(z.enum(["institution", "individual"])).min(1),
  custodyPathIds: z.array(IdSchema),
  minimumSats: SatsSchema.optional(),
  maximumSats: SatsSchema.optional(),
  pairedStx: z.object({ required: z.boolean(), minimumValueRatioBps: z.number().int().min(0).max(10_000).optional() }).strict(),
  keyControl: z.enum(["participant", "custodian_or_participant", "unknown"]),
  enrollment: z.object({ method: z.string().min(1), url: z.url().optional() }).strict(),
  recovery: z.object({ status: z.enum(["documented", "unconfirmed"]), evidence: z.string().min(1) }).strict(),
  earlyExit: z.object({ status: z.enum(["supported", "unsupported", "unknown"]), evidence: z.string().min(1) }).strict(),
}).strict();
export type NativeL1DirectRoute = z.infer<typeof NativeL1DirectRouteSchema>;

export const SbtcPoolRouteSchema = z.object({
  ...RouteBaseShape,
  routeType: z.literal("sbtc_pool"),
  poolOperator: z.object({ id: IdSchema, name: z.string().min(1) }).strict(),
  permissionless: z.boolean(),
  investorInputs: z.enum(["sbtc_only", "sbtc_and_stx"]),
  minimumSats: SatsSchema.optional(),
  capacitySats: SatsSchema.optional(),
  feeBps: z.number().int().min(0).max(10_000).optional(),
  rewardAccounting: z.object({ method: z.string().min(1), rewardAsset: z.enum(["BTC", "sBTC", "STX", "unknown"]), status: z.enum(["verified", "unverified"]) }).strict(),
  contracts: z.array(z.object({ role: z.string().min(1), contractId: z.string().regex(/^[SM][A-Z0-9]{38,40}\.[a-zA-Z0-9_-]+$/), network: StacksNetworkSchema }).strict()),
  withdrawalTerms: z.object({ method: z.string().min(1), timing: z.string().min(1), status: z.enum(["verified", "unverified", "not_supported"])}).strict(),
  enrollmentUrl: z.url().optional(),
  lst: LstCapabilitySchema.optional(),
}).strict();
export type SbtcPoolRoute = z.infer<typeof SbtcPoolRouteSchema>;
export const ParticipationRouteSchema = z.discriminatedUnion("routeType", [NativeL1DirectRouteSchema, SbtcPoolRouteSchema]);
export type ParticipationRoute = z.infer<typeof ParticipationRouteSchema>;

export const TimingSchema = z.object({
  scheduledLaunchDate: z.iso.date().optional(), opensAt: z.iso.datetime().optional(), closesAt: z.iso.datetime().optional(),
  lockDurationDays: z.number().int().positive().optional(), startsRewardCycle: z.number().int().nonnegative().optional(),
  endsRewardCycle: z.number().int().nonnegative().optional(), unlockHeight: SatsSchema.optional(),
}).strict();
export const EconomicsSchema = z.object({
  targetRateBps: z.number().int().nonnegative().max(100_000).optional(),
  managerFeeBps: z.number().int().nonnegative().max(10_000).optional(),
  rewardAsset: z.enum(["BTC", "sBTC", "STX", "unknown"]),
  rewardAssetOptions: z.array(z.enum(["BTC", "sBTC", "STX"])).min(1).optional(),
  rewardModel: z.enum(["target_principal_rate", "fixed_reward_units", "unknown"]),
  rewardSource: z.string().min(1).optional(),
  termsStatus: z.enum(["bond_specific", "reference_program_model", "demo"]).optional(),
  fixedRewardUnits: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  referenceModel: z.object({
    id: IdSchema,
    status: z.literal("public_reference_model"),
    sourceIds: z.array(z.string().min(1)).min(1),
    annualTargetRateBps: z.number().int().nonnegative().max(100_000),
    pairedStxMinimumValueRatioBps: z.number().int().min(0).max(10_000),
    bondingPeriodCycles: z.number().int().positive(),
    daysPerCycle: z.number().positive(),
    bondingPeriodDays: z.number().int().positive(),
    initialCapacityBtc: z.number().positive(),
    targetCoverageRatio: z.number().positive(),
    calculationMethod: z.literal("simple_non_compounding"),
  }).strict().optional(),
}).strict();

export const BondManifestV2Schema = z.object({
  schemaVersion: z.literal(2), id: IdSchema, title: z.string().min(1), description: z.string().min(1),
  network: StacksNetworkSchema, onChainBondIndex: z.number().int().nonnegative().optional(),
  lifecycleStatus: z.enum(["upcoming", "open", "closed", "unknown"]), dataStatus: z.enum(["published", "demo"]),
  productStatus: ProductStatusSchema, enrollmentStatus: EnrollmentStatusSchema,
  verification: z.array(VerificationLevelSchema), attestation: OwnerAttestationSchema,
  timing: TimingSchema, economics: EconomicsSchema,
  protocolTerms: z.object({
    coverageBoundary: z.string().min(1), signerAndAdministrationControls: z.string().min(1),
    audits: z.array(z.string().min(1)), unresolvedTerms: z.array(z.string().min(1)),
  }).strict(),
  participationRoutes: z.array(ParticipationRouteSchema).min(1), notes: z.array(z.string().min(1)),
  sources: z.array(SourceRefSchema).min(1), verifiedAt: z.iso.datetime(),
}).strict().superRefine((value, context) => {
  if (value.dataStatus === "demo" && !value.sources.some((source) => source.dataStatus === "demo")) {
    context.addIssue({ code: "custom", path: ["sources"], message: "Demo manifests must include a demo source." });
  }
  validateReferences(value.participationRoutes, value.sources, context, "participationRoutes");
  const sourceIds = new Set(value.sources.map((source) => source.id));
  validateUniqueSourceIds(value.sources, context);
  const attestationSourceTypes: SourceRef["sourceType"][] =
    value.dataStatus === "demo"
      ? ["demo_manifest", "public_manifest"]
      : ["public_manifest"];
  const allowedAttestationTypes = (status: z.infer<typeof ProductStatusSchema>, verification: Array<z.infer<typeof VerificationLevelSchema>>) =>
    status === "unconfirmed" && !verification.includes("product_owner_confirmed")
      ? SourceRefSchema.shape.sourceType.options
      : attestationSourceTypes;
  validateAttestation(value.attestation, value.sources, context, ["attestation"], allowedAttestationTypes(value.productStatus, value.verification));
  for (const sourceId of value.economics.referenceModel?.sourceIds ?? []) {
    if (!sourceIds.has(sourceId)) context.addIssue({ code: "custom", path: ["economics", "referenceModel", "sourceIds"], message: `Missing source ID: ${sourceId}` });
  }
  for (const [routeIndex, route] of value.participationRoutes.entries()) {
    validateAttestation(route.attestation, value.sources, context, ["participationRoutes", routeIndex, "attestation"], allowedAttestationTypes(route.productStatus, route.verification));
    for (const sourceId of route.attestation.sourceIds) if (!sourceIds.has(sourceId)) context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "attestation", "sourceIds"], message: `Missing source ID: ${sourceId}` });
    if (route.routeType === "native_l1_direct") {
      if (route.minimumSats && route.maximumSats && BigInt(route.minimumSats) > BigInt(route.maximumSats)) context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "maximumSats"], message: "maximumSats must be at least minimumSats." });
      if (route.pairedStx.required && route.pairedStx.minimumValueRatioBps === undefined) context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "pairedStx", "minimumValueRatioBps"], message: "A required paired-STX position must declare its minimum value ratio." });
    }
    if (route.routeType === "sbtc_pool" && route.lst) {
      validateAttestation(route.lst.attestation, value.sources, context, ["participationRoutes", routeIndex, "lst", "attestation"], allowedAttestationTypes(route.lst.productStatus, route.lst.verification));
      for (const sourceId of route.lst.sourceIds) if (!sourceIds.has(sourceId)) context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "lst", "sourceIds"], message: `Missing source ID: ${sourceId}` });
      for (const [field, ids] of [["liquidityEvidence", route.lst.liquidityEvidence.sourceIds], ["oracleEvidence", route.lst.oracleEvidence.sourceIds]] as const) {
        for (const sourceId of ids) if (!sourceIds.has(sourceId)) context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "lst", field, "sourceIds"], message: `Missing source ID: ${sourceId}` });
      }
      route.lst.verifiedDefiIntegrations.forEach((integration, integrationIndex) => integration.sourceIds.forEach((sourceId) => {
        if (!sourceIds.has(sourceId)) context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "lst", "verifiedDefiIntegrations", integrationIndex, "sourceIds"], message: `Missing source ID: ${sourceId}` });
      }));
      if (route.lst.productStatus === "production" && !route.lst.tokenContract) context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "lst", "tokenContract"], message: "A production LST requires a deployed token contract." });
    }
    if (route.routeType === "sbtc_pool") {
      if (route.minimumSats && route.capacitySats && BigInt(route.minimumSats) > BigInt(route.capacitySats)) context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "capacitySats"], message: "capacitySats must be at least minimumSats." });
      for (const [contractIndex, contract] of route.contracts.entries()) if (contract.network !== value.network) context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "contracts", contractIndex, "network"], message: `Contract network ${contract.network} does not match bond network ${value.network}.` });
      if (["production", "tested"].includes(route.productStatus) && route.contracts.length === 0) context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "contracts"], message: "Production or tested pools require at least one deployed contract." });
      if (route.enrollmentStatus === "open") {
        if (route.feeBps === undefined) context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "feeBps"], message: "An open pool must publish its fee." });
        if (route.rewardAccounting.status !== "verified") context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "rewardAccounting", "status"], message: "An open pool requires verified reward accounting." });
        if (route.withdrawalTerms.status !== "verified") context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "withdrawalTerms", "status"], message: "An open pool requires verified withdrawal terms." });
        if (!route.enrollmentUrl) context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "enrollmentUrl"], message: "An open pool requires an enrollment link." });
      }
    }
    if (route.routeType === "native_l1_direct" && route.enrollmentStatus === "open" && !route.enrollment.url) context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "enrollment", "url"], message: "An open direct route requires an enrollment link." });
    if (route.enrollmentStatus === "open" && route.productStatus !== "production") context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "productStatus"], message: "Open enrollment requires production product status." });
    if (route.enrollmentStatus === "open" && !route.verification.includes("product_owner_confirmed")) context.addIssue({ code: "custom", path: ["participationRoutes", routeIndex, "verification"], message: "Open enrollment requires product-owner confirmation." });
  }
  if (value.timing.opensAt && value.timing.closesAt && new Date(value.timing.opensAt) >= new Date(value.timing.closesAt)) context.addIssue({ code: "custom", path: ["timing", "closesAt"], message: "closesAt must be after opensAt." });
  if (value.timing.startsRewardCycle !== undefined && value.timing.endsRewardCycle !== undefined && value.timing.startsRewardCycle > value.timing.endsRewardCycle) context.addIssue({ code: "custom", path: ["timing", "endsRewardCycle"], message: "endsRewardCycle must not precede startsRewardCycle." });
  if (value.economics.rewardModel === "fixed_reward_units" && value.economics.fixedRewardUnits === undefined) context.addIssue({ code: "custom", path: ["economics", "fixedRewardUnits"], message: "Fixed-unit reward models require fixedRewardUnits." });
  if (value.economics.rewardModel === "target_principal_rate" && value.economics.targetRateBps === undefined && value.economics.referenceModel === undefined) context.addIssue({ code: "custom", path: ["economics", "targetRateBps"], message: "Target-principal-rate models require a bond rate or sourced reference model." });
  if (value.economics.rewardAssetOptions && new Set(value.economics.rewardAssetOptions).size !== value.economics.rewardAssetOptions.length) context.addIssue({ code: "custom", path: ["economics", "rewardAssetOptions"], message: "Reward-asset options must be unique." });
  if (value.economics.rewardAssetOptions && value.economics.rewardAsset !== "unknown" && !value.economics.rewardAssetOptions.includes(value.economics.rewardAsset)) context.addIssue({ code: "custom", path: ["economics", "rewardAsset"], message: "The modeled reward asset must be one of the published reward-asset options." });
  if (value.enrollmentStatus === "open" && value.productStatus !== "production") context.addIssue({ code: "custom", path: ["productStatus"], message: "Open bond enrollment requires production product status." });
  if (value.enrollmentStatus === "open" && !value.verification.includes("product_owner_confirmed")) context.addIssue({ code: "custom", path: ["verification"], message: "Open bond enrollment requires product-owner confirmation." });
  const routeIds = value.participationRoutes.map((route) => route.id);
  if (new Set(routeIds).size !== routeIds.length) context.addIssue({ code: "custom", path: ["participationRoutes"], message: "Duplicate route ID." });
});
export type BondManifestV2 = z.infer<typeof BondManifestV2Schema>;

export const BondManifestV1Schema = z.object({
  schemaVersion: z.literal(1), id: IdSchema, title: z.string().min(1), description: z.string().min(1), network: StacksNetworkSchema,
  onChainBondIndex: z.number().int().nonnegative().optional(), lifecycleStatus: z.enum(["upcoming", "open", "closed", "unknown"]),
  participationPath: z.literal("native_l1_btc"), dataStatus: z.enum(["published", "demo"]), timing: TimingSchema, economics: EconomicsSchema,
  capacity: z.object({ totalSats: SatsSchema.optional(), minSats: SatsSchema.optional(), maxSats: SatsSchema.optional() }).strict(),
  requirements: z.object({ allowlistRequired: z.boolean(), pairedStxRequired: z.boolean(), pairedStxMinimumValueRatioBps: z.number().int().min(0).max(10_000).optional(), btcLocation: z.literal("bitcoin_l1"), keyControl: z.enum(["participant", "custodian_or_participant", "unknown"]), borrowingAgainstPosition: z.enum(["supported", "unsupported", "unknown"]), earlyExit: z.enum(["supported", "unsupported", "unknown"]) }).strict(),
  compatibility: z.array(CompatibilityClaimSchema), notes: z.array(z.string().min(1)), sources: z.array(SourceRefSchema).min(1), verifiedAt: z.iso.datetime(),
}).strict();
export type BondManifestV1 = z.infer<typeof BondManifestV1Schema>;

export function normalizeBondManifest(value: unknown): BondManifestV2 {
  if (typeof value !== "object" || value === null || !("schemaVersion" in value)) {
    throw new Error("Bond manifest must be an object with a schemaVersion.");
  }
  if ((value as { schemaVersion?: unknown }).schemaVersion === 2) return BondManifestV2Schema.parse(value);
  const old = BondManifestV1Schema.parse(value);
  const sourceIds = old.sources.map((source) => source.id);
  const attestation = { scope: `${old.id}:native-l1-direct legacy source scope`, ownerOrganization: "Unconfirmed", reviewedAt: old.verifiedAt, reviewCadenceDays: 7 as const, sourceIds };
  return BondManifestV2Schema.parse({
    schemaVersion: 2, id: old.id, title: old.title, description: old.description, network: old.network,
    ...(old.onChainBondIndex === undefined ? {} : { onChainBondIndex: old.onChainBondIndex }),
    lifecycleStatus: old.lifecycleStatus, dataStatus: old.dataStatus, productStatus: "unconfirmed", enrollmentStatus: "unknown",
    verification: [], attestation, timing: old.timing, economics: old.economics,
    protocolTerms: { coverageBoundary: "Native L1 direct route only; normalized from a v1 manifest.", signerAndAdministrationControls: "Not specified by v1 manifest.", audits: [], unresolvedTerms: ["Owner scope and current product availability require v2 confirmation."] },
    participationRoutes: [{
      id: "native-l1-direct", name: "Native L1 direct", routeType: "native_l1_direct", productStatus: "unconfirmed", enrollmentStatus: "unknown", verification: [], attestation, sourceIds,
      summary: "Normalized legacy native-L1 route.", whitelist: { required: old.requirements.allowlistRequired, status: "unknown" }, participantTypes: ["institution", "individual"], custodyPathIds: [],
      ...(old.capacity.minSats ? { minimumSats: old.capacity.minSats } : {}), ...(old.capacity.maxSats ? { maximumSats: old.capacity.maxSats } : {}),
      pairedStx: { required: old.requirements.pairedStxRequired, ...(old.requirements.pairedStxMinimumValueRatioBps === undefined ? {} : { minimumValueRatioBps: old.requirements.pairedStxMinimumValueRatioBps }) },
      keyControl: old.requirements.keyControl, enrollment: { method: "Not specified in v1 manifest." },
      recovery: { status: "unconfirmed", evidence: "Not specified in v1 manifest." }, earlyExit: { status: old.requirements.earlyExit, evidence: "Normalized from v1 status only." },
    }], notes: old.notes, sources: old.sources, verifiedAt: old.verifiedAt,
  });
}
export const BondManifestSchema = z.union([BondManifestV2Schema, BondManifestV1Schema]).transform(normalizeBondManifest);
export type BondManifest = BondManifestV2;

export const BondRegistrySchema = z.object({
  schemaVersion: z.literal(1), registryVersion: z.string().min(1), reviewedAt: z.iso.datetime(), reviewCadenceDays: z.literal(7),
  bondFiles: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]*\.json$/)).min(1),
}).strict().superRefine((value, context) => {
  if (new Set(value.bondFiles).size !== value.bondFiles.length) context.addIssue({ code: "custom", path: ["bondFiles"], message: "Duplicate bond file." });
});
export type BondRegistry = z.output<typeof BondRegistrySchema>;

export const ParticipantProfileSchema = z.object({
  goal: z.enum(["earn_yield", "prioritize_safety", "retain_flexibility", "borrow_without_selling", "compare_options"]),
  assetHeld: z.enum(["btc_l1", "sbtc", "both", "unknown"]).default("unknown"),
  participantType: z.enum(["institution", "individual", "either", "unknown"]).default("unknown"),
  whitelistStatus: z.enum(["approved", "pending", "not_approved", "unknown"]).default("unknown"),
  liquidityNeed: z.enum(["lock_until_maturity", "may_need_early_exit", "access_anytime", "unknown"]),
  bitcoinPathPreference: z.enum(["bitcoin_l1_only", "open_to_sbtc", "compare_both", "unknown"]),
  keyControlPreference: z.enum(["self_controlled", "custodian", "either", "unknown"]),
  stxAvailable: z.enum(["yes", "no", "unknown"]).default("unknown"),
  walletOrCustodian: z.string().min(1).optional(),
  amountSats: SatsSchema.refine((value) => BigInt(value) > 0n && BigInt(value) <= MAX_BITCOIN_SUPPLY_SATS, "amountSats must be positive and no greater than Bitcoin's maximum supply").optional(),
  amountBtc: BtcAmountSchema.optional(),
  timeHorizonDays: z.number().int().positive().optional(),
}).strict().superRefine((value, context) => {
  if (value.amountBtc && BigInt(btcAmountToSats(value.amountBtc)) <= 0n) context.addIssue({ code: "custom", path: ["amountBtc"], message: "amountBtc must be greater than zero." });
  if (value.amountBtc && BigInt(btcAmountToSats(value.amountBtc)) > MAX_BITCOIN_SUPPLY_SATS) context.addIssue({ code: "custom", path: ["amountBtc"], message: "amountBtc exceeds Bitcoin's maximum supply." });
  if (value.amountBtc && value.amountSats && btcAmountToSats(value.amountBtc) !== value.amountSats) context.addIssue({ code: "custom", path: ["amountBtc"], message: "amountBtc and amountSats disagree." });
});
export type ParticipantProfile = z.infer<typeof ParticipantProfileSchema>;

export function normalizeParticipantProfileAmount(profile: ParticipantProfile): ParticipantProfile {
  return profile.amountSats || !profile.amountBtc ? profile : { ...profile, amountSats: btcAmountToSats(profile.amountBtc) };
}

export const OperationalFitSchema = z.enum(["strong", "conditional", "no_match", "not_assessable"]);
export const RecommendationResultSchema = z.object({
  bondId: z.string(), routeId: z.string().nullable(), fit: OperationalFitSchema, reasons: z.array(z.string()), tradeoffs: z.array(z.string()),
  missingFacts: z.array(z.string()), unsupportedRequirements: z.array(z.string()), alternatives: z.array(z.object({ path: z.string(), status: z.enum(["available", "context_only", "not_verified"]), reason: z.string() })),
  nextSteps: z.array(z.string()), dataStatus: DataStatusSchema, sources: z.array(SourceRefSchema), assumptions: z.array(z.string()), verifiedAt: z.iso.datetime(),
}).strict();
export type RecommendationResult = z.infer<typeof RecommendationResultSchema>;

export const RegistryMetadataSchema = z.object({
  sourceMode: RegistrySourceModeSchema, registryVersion: z.string(), contentHash: z.string(), fetchedAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime(), reviewDueAt: z.iso.datetime(), reviewStatus: z.enum(["current", "needs_review"]),
  fallbackReason: z.string().min(1).optional(),
}).strict();
export const LifecycleFilterSchema = z.enum(["upcoming", "open", "closed", "unknown"]);

function validateReferences(items: Array<{ id: string; sourceIds: string[] }>, sources: SourceRef[], context: z.RefinementCtx, path: string) {
  const ids = new Set<string>(); const sourceIds = new Set(sources.map((source) => source.id));
  items.forEach((item, index) => {
    if (ids.has(item.id)) context.addIssue({ code: "custom", path: [path, index, "id"], message: `Duplicate ID: ${item.id}` });
    ids.add(item.id);
    item.sourceIds.forEach((sourceId) => { if (!sourceIds.has(sourceId)) context.addIssue({ code: "custom", path: [path, index, "sourceIds"], message: `Missing source ID: ${sourceId}` }); });
  });
}

function validateUniqueSourceIds(sources: SourceRef[], context: z.RefinementCtx) {
  const ids = new Set<string>();
  sources.forEach((source, index) => {
    if (ids.has(source.id)) context.addIssue({ code: "custom", path: ["sources", index, "id"], message: `Duplicate source ID: ${source.id}` });
    ids.add(source.id);
  });
}

function validateAttestation(
  attestation: OwnerAttestation,
  sources: SourceRef[],
  context: z.RefinementCtx,
  path: Array<string | number>,
  allowedSourceTypes: SourceRef["sourceType"][] = ["public_manifest"],
) {
  const byId = new Map(sources.map((source) => [source.id, source]));
  for (const sourceId of attestation.sourceIds) {
    const source = byId.get(sourceId);
    if (!source) context.addIssue({ code: "custom", path: [...path, "sourceIds"], message: `Missing source ID: ${sourceId}` });
    else if (!allowedSourceTypes.includes(source.sourceType)) context.addIssue({ code: "custom", path: [...path, "sourceIds"], message: `Attestation source must be one of ${allowedSourceTypes.join(", ")}: ${sourceId}` });
  }
}

export function reviewDueAt(reviewedAt: string, cadenceDays = 7): string {
  return new Date(new Date(reviewedAt).getTime() + cadenceDays * 86_400_000).toISOString();
}
export function isReviewCurrent(reviewedAt: string, now: Date, cadenceDays = 7): boolean {
  const reviewed = new Date(reviewedAt).getTime();
  return reviewed <= now.getTime() && now.getTime() <= new Date(reviewDueAt(reviewedAt, cadenceDays)).getTime();
}
export function routeEffectiveAvailability(route: ParticipationRoute, now: Date, conflict = false) {
  if (conflict) return "conflict" as const;
  if (!isReviewCurrent(route.attestation.reviewedAt, now, route.attestation.reviewCadenceDays)) return "needs_review" as const;
  if (["blocked", "not_supported"].includes(route.productStatus) || ["paused", "closed"].includes(route.enrollmentStatus)) return "unavailable" as const;
  if (route.enrollmentStatus === "scheduled") return "scheduled" as const;
  if (route.productStatus === "production" && route.enrollmentStatus === "open") return "available" as const;
  return "unknown" as const;
}
export function toJsonSafe<T>(value: T): T { return JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString() : item)) as T; }
