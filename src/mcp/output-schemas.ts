import { z } from "zod";
import {
  BondManifestV2Schema,
  CustodyPathSchema,
  DataStatusSchema,
  EconomicsSchema,
  EffectiveAvailabilitySchema,
  EnrollmentStatusSchema,
  NativeL1DirectRouteSchema,
  OperationalFitSchema,
  ParticipantProfileSchema,
  ProductStatusSchema,
  RegistryMetadataSchema,
  SbtcPoolRouteSchema,
  SourceRefSchema,
  StacksNetworkSchema,
  TimingSchema,
} from "../core/schemas.js";

const metadata = {
  dataStatus: DataStatusSchema,
  sources: z.array(SourceRefSchema),
  assumptions: z.array(z.string()),
  verifiedAt: z.iso.datetime(),
};
const output = <T extends z.ZodRawShape>(shape: T) => z.object({ ...shape, ...metadata }).strict();
const ErrorSchema = z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).strict();
const UnavailableSchema = z.object({ status: z.literal("unavailable"), error: ErrorSchema }).strict();
const CurrentCycleSchema = z.object({ id: z.number().int(), stakedUstx: z.string(), isPoxActive: z.boolean() }).strict();
const NextCycleSchema = z.object({ id: z.number().int(), stakedUstx: z.string() }).strict();
const BondPhaseSchema = z.object({ name: z.enum(["open", "locked", "unlocked", "finished"]), startBurnHeight: z.number().int(), length: z.number().int(), endBurnHeight: z.number().int() }).strict();
const OnChainBondRecordSchema = z.object({ bondIndex: z.number().int().nonnegative(), targetRateBps: z.number().int(), stxValueRatio: z.union([z.string(), z.number()]), minUstxRatioBps: z.number().int(), earlyUnlockBytes: z.string() }).strict();

export const ProtocolStatusOutputSchema = output({
  network: StacksNetworkSchema,
  chainId: z.number().int(),
  apiBaseUrl: z.url().optional(),
  contractId: z.string(),
  pox5Active: z.boolean(),
  pox5Scheduled: z.boolean().optional(),
  pox5ActivationBurnchainBlockHeight: z.number().nullable().optional(),
  blocksUntilPox5Activation: z.number().nullable().optional(),
  firstPox5RewardCycle: z.number().nullable().optional(),
  currentBurnchainBlockHeight: z.number(),
  rewardCycleLength: z.number().optional(),
  prepareCycleLength: z.number().optional(),
  currentCycle: CurrentCycleSchema.optional(),
  nextCycle: NextCycleSchema.optional(),
  nextPreparePhaseStartHeight: z.number().optional(),
  blocksUntilNextPreparePhase: z.number().optional(),
  nextRewardPhaseStartHeight: z.number().optional(),
  blocksUntilNextRewardPhase: z.number().optional(),
  sbtcContract: z.string().nullable().optional(),
});

const ProtocolBondSchema = z.object({
  id: z.string(), network: StacksNetworkSchema, chainId: z.number().int(), onChainBondIndex: z.number().int().nonnegative(),
  contractId: z.string(), protocolStatus: z.string(), registrationStatus: z.enum(["open", "closed", "temporarily_blocked_prepare_phase"]),
  currentBurnchainBlockHeight: z.number(), startBurnHeight: z.number(), blocksUntilStart: z.number(), startRewardCycle: z.number(),
  phases: z.array(BondPhaseSchema), targetRateBps: z.number(), stxValueRatio: z.union([z.string(), z.number()]), minUstxRatioBps: z.number(), earlyUnlockBytes: z.string(),
  availability: z.enum(["live_testnet_demo", "mainnet_on_chain"]), ...metadata,
}).strict();

export const ProtocolBondsOutputSchema = output({
  network: StacksNetworkSchema, chainId: z.number().int().optional(), apiBaseUrl: z.url().optional(), contractId: z.string().optional(),
  pox5Active: z.boolean(), pox5Scheduled: z.boolean().optional(), pox5ActivationBurnchainBlockHeight: z.number().nullable().optional(),
  blocksUntilPox5Activation: z.number().nullable().optional(), firstPox5RewardCycle: z.number().nullable().optional(), currentBurnchainBlockHeight: z.number(),
  currentRewardCycle: z.number().optional(), currentBondIndex: z.number().optional(), scannedBondIndices: z.array(z.number().int().nonnegative()), bonds: z.array(ProtocolBondSchema),
});

const CurrentPricesSchema = output({
  provider: z.literal("CoinGecko"), btcUsd: z.number().positive(), stxUsd: z.number().positive(),
  coinIds: z.object({ btc: z.literal("bitcoin"), stx: z.literal("blockstack") }).strict(),
  marketUpdatedAt: z.object({ btc: z.iso.datetime(), stx: z.iso.datetime() }).strict(),
});
const BondSummarySchema = z.object({ id: z.string(), title: z.string(), lifecycleStatus: z.enum(["upcoming", "open", "closed", "unknown"]), scheduledLaunchDate: z.iso.date().nullable() }).strict();
const RouteSummarySchema = z.object({
  bondId: z.string(), routeId: z.string(), routeType: z.enum(["native_l1_direct", "sbtc_pool"]), name: z.string(),
  productStatus: ProductStatusSchema, enrollmentStatus: EnrollmentStatusSchema, effectiveAvailability: EffectiveAvailabilitySchema,
  onChainReconciliation: z.enum(["conflict", "configured", "unavailable", "not_configured"]), poolOperator: z.string().nullable(),
  optionalLst: z.object({ symbol: z.string(), productStatus: ProductStatusSchema }).strict().nullable(),
}).strict();
const SnapshotCustodySchema = z.object({ status: z.literal("available"), current: z.boolean(), registry: RegistryMetadataSchema, availablePathIds: z.array(z.string()) }).strict();

export const MarketSnapshotOutputSchema = output({
  network: StacksNetworkSchema, bondCount: z.number().int().nonnegative(), bonds: z.array(BondSummarySchema), routes: z.array(RouteSummarySchema),
  protocol: z.union([ProtocolStatusOutputSchema, UnavailableSchema]), onChainBonds: z.union([ProtocolBondsOutputSchema, UnavailableSchema]),
  testnetEvidence: z.object({ protocol: z.union([ProtocolStatusOutputSchema, UnavailableSchema]), bonds: z.union([ProtocolBondsOutputSchema, UnavailableSchema]), investable: z.literal(false) }).strict(),
  custody: z.union([SnapshotCustodySchema, UnavailableSchema]), prices: z.union([CurrentPricesSchema, UnavailableSchema]), registry: RegistryMetadataSchema, precedence: z.string(),
});

const SecurityEntrySchema = z.object({
  topic: z.string(), question: z.string(), responseScope: z.string().optional(), answer: z.string(), evidenceLevel: z.string(),
  whatIsKnown: z.array(z.string()), whatIsNotProven: z.array(z.string()), verificationChecklist: z.array(z.string()), sourceIds: z.array(z.string()),
}).strict();
export const SecurityOutputSchema = output({ requestedTopic: z.string(), responseScope: z.string(), entries: z.array(SecurityEntrySchema) });

const RouteAssessmentSchema = z.object({
  bondId: z.string(), routeId: z.string(), routeType: z.enum(["native_l1_direct", "sbtc_pool"]), fit: OperationalFitSchema,
  effectiveAvailability: EffectiveAvailabilitySchema, reasons: z.array(z.string()), tradeoffs: z.array(z.string()), missingEvidence: z.array(z.string()), unsupportedRequirements: z.array(z.string()), nextDiligenceAction: z.string(),
}).strict();
const EffectiveNativeRouteSchema = NativeL1DirectRouteSchema.extend({ effectiveAvailability: EffectiveAvailabilitySchema, reviewDueAt: z.iso.datetime().optional() });
const EffectivePoolRouteSchema = SbtcPoolRouteSchema.extend({ effectiveAvailability: EffectiveAvailabilitySchema, reviewDueAt: z.iso.datetime().optional() });
const EffectiveRouteSchema = z.discriminatedUnion("routeType", [EffectiveNativeRouteSchema, EffectivePoolRouteSchema]);
const PublicBondSchema = z.object({ ...BondManifestV2Schema.shape, participationRoutes: z.array(EffectiveRouteSchema) }).strict();

const PriceSnapshotSchema = z.union([
  z.object({ provider: z.literal("CoinGecko"), usage: z.enum(["live_defaults", "mixed_live_and_explicit"]), usedBtcPriceUsd: z.number().nullable(), usedStxPriceUsd: z.number().nullable(), display: z.object({ btcUsd: z.string().nullable(), stxUsd: z.string().nullable() }).strict(), btcUsd: z.number(), stxUsd: z.number(), coinIds: z.object({ btc: z.literal("bitcoin"), stx: z.literal("blockstack") }).strict(), marketUpdatedAt: z.object({ btc: z.iso.datetime(), stx: z.iso.datetime() }).strict(), dataStatus: z.literal("live"), sources: z.array(SourceRefSchema), assumptions: z.array(z.string()), verifiedAt: z.iso.datetime() }).strict(),
  z.object({ provider: z.literal("user_supplied"), usage: z.literal("explicit_inputs"), usedBtcPriceUsd: z.number().nullable(), usedStxPriceUsd: z.number().nullable(), display: z.object({ btcUsd: z.string().nullable(), stxUsd: z.string().nullable() }).strict() }).strict(),
  z.object({ provider: z.literal("CoinGecko"), usage: z.literal("unavailable"), usedBtcPriceUsd: z.number().nullable(), usedStxPriceUsd: z.number().nullable(), error: ErrorSchema, display: z.object({ btcUsd: z.null(), stxUsd: z.null() }).strict() }).strict(),
]);
export const YieldOutputSchema = output({
  bondId: z.string(), routeId: z.string(), principalSats: z.string(), principalBtc: z.string(), durationDays: z.number().int().positive(),
  projectionPeriod: z.enum(["specified_duration", "bond_duration", "reference_model_duration"]), annualRateBps: z.number().int(), feeBps: z.number().int().nullable(), routeFeeBps: z.number().int().nullable(), lstFeeBps: z.number().int().nullable(),
  grossRewardSats: z.string(), grossRewardBtc: z.string(), grossRewardBtcExact: z.string().optional(), grossRewardDisplay: z.string().optional(),
  feeSats: z.string().optional(), routeFeeSats: z.string().optional(), lstFeeSats: z.string().optional(), netRewardSats: z.string().optional(), netRewardBtc: z.string().optional(), netRewardBtcExact: z.string().optional(), netRewardDisplay: z.string().optional(),
  estimatedRewardValueUsd: z.number().nullable(), priceScenarios: z.array(z.object({ btcPriceUsd: z.number().nullable(), stxPriceUsd: z.number(), estimatedRewardValueUsd: z.number().nullable(), note: z.string() }).strict()),
  rewardAsset: z.enum(["BTC", "sBTC", "STX", "unknown"]),
  pairedStxRequirement: z.object({
    minimumValueRatioBps: z.number().int(), minimumValueRatioPercent: z.number(), minimumBtcEquivalentSats: z.string(), minimumBtcEquivalent: z.string(),
    exactStxUnitsStatus: z.enum(["scenario_calculated", "price_inputs_required"]),
    scenarios: z.array(z.object({ btcPriceUsd: z.number(), stxPriceUsd: z.number(), requiredStxValueUsd: z.number(), requiredStxUnits: z.number(), requiredStxUnitsDisplay: z.string() }).strict()),
  }).strict().nullable(),
  modelContext: z.object({
    id: z.string(), status: z.literal("public_reference_model"), sourceIds: z.array(z.string()), annualTargetRateBps: z.number().int(), pairedStxMinimumValueRatioBps: z.number().int(),
    bondingPeriodCycles: z.number().int(), daysPerCycle: z.number(), bondingPeriodDays: z.number().int(), initialCapacityBtc: z.number(), targetCoverageRatio: z.number(),
    calculationMethod: z.literal("simple_non_compounding"), sourceStatus: z.literal("reference_not_final_bond_terms"), grossRewardFormula: z.string(),
  }).strict().nullable(),
  availability: z.enum(["demo_only_not_investable", "published_reference_model_scenario", "published_terms_scenario"]), inputDataStatus: z.enum(["published", "demo"]), priceSnapshot: PriceSnapshotSchema,
});

export const DiligenceOutputSchema = output({
  assessmentStatus: z.enum(["upcoming_bond_scheduled", "published_bond_assessed"]), bottomLine: z.string(),
  bondAvailability: z.object({ scheduled: z.iso.date().nullable(), lifecycleStatus: z.enum(["upcoming", "open", "closed", "unknown"]), productStatus: ProductStatusSchema, enrollmentStatus: EnrollmentStatusSchema, registration: z.array(z.object({ routeId: z.string(), enrollmentStatus: EnrollmentStatusSchema }).strict()), onChainConfigured: z.boolean(), onChainReconciliation: z.array(z.object({ routeId: z.string(), status: z.enum(["conflict", "configured", "unavailable", "not_configured"]) }).strict()), coverageBoundary: z.string() }).strict(),
  commonProtocolEconomics: EconomicsSchema.extend({ signerAndAdministrationControls: z.string(), audits: z.array(z.string()), unresolvedTerms: z.array(z.string()), coverageBoundary: z.string() }).strict(),
  economics: z.object({ status: z.enum(["reference_model_projection", "incomplete_economics", "amount_required"]), scenario: YieldOutputSchema.nullable() }).strict(),
  routeEconomicScenarios: z.array(z.union([z.object({ routeId: z.string(), status: z.literal("calculated"), scenario: YieldOutputSchema }).strict(), z.object({ routeId: z.string(), status: z.literal("incomplete_economics"), scenario: z.null(), reason: z.string() }).strict()])),
  routeAssessments: z.array(z.object({ assessment: RouteAssessmentSchema, details: z.union([NativeL1DirectRouteSchema, SbtcPoolRouteSchema]) }).strict()),
  riskSections: z.array(z.discriminatedUnion("routeType", [
    z.object({
      routeId: z.string(), routeType: z.literal("native_l1_direct"),
      eligibility: z.object({ whitelist: NativeL1DirectRouteSchema.shape.whitelist, participantTypes: NativeL1DirectRouteSchema.shape.participantTypes, minimumSats: z.string().nullable(), maximumSats: z.string().nullable() }).strict(),
      custody: z.object({ custodyPathIds: z.array(z.string()), keyControl: NativeL1DirectRouteSchema.shape.keyControl }).strict(),
      pairedStx: NativeL1DirectRouteSchema.shape.pairedStx,
      timelock: z.object({ lockDurationDays: z.number().int().nullable(), unlockHeight: z.string().nullable() }).strict(),
      recovery: NativeL1DirectRouteSchema.shape.recovery, earlyExit: NativeL1DirectRouteSchema.shape.earlyExit,
    }).strict(),
    z.object({
      routeId: z.string(), routeType: z.literal("sbtc_pool"), operator: SbtcPoolRouteSchema.shape.poolOperator,
      investorInputs: SbtcPoolRouteSchema.shape.investorInputs, feeBps: z.number().int().nullable(), contracts: SbtcPoolRouteSchema.shape.contracts,
      administration: z.object({ ownerOrganization: z.string(), scope: z.string() }).strict(), withdrawal: SbtcPoolRouteSchema.shape.withdrawalTerms,
      accounting: SbtcPoolRouteSchema.shape.rewardAccounting, sbtcRisks: z.string(),
      lst: z.object({ tokenSymbol: z.string(), redemption: SbtcPoolRouteSchema.shape.lst.unwrap().shape.redemption, liquidity: SbtcPoolRouteSchema.shape.lst.unwrap().shape.liquidityEvidence, smartContractRisk: z.string(), oracle: SbtcPoolRouteSchema.shape.lst.unwrap().shape.oracleEvidence, integrations: SbtcPoolRouteSchema.shape.lst.unwrap().shape.verifiedDefiIntegrations }).strict().nullable(),
    }).strict(),
  ])), operationalFit: OperationalFitSchema, missingEvidence: z.array(z.string()), nextDiligenceAction: z.string(), nextDiligenceSteps: z.array(z.string()), profile: ParticipantProfileSchema,
});

const ListedBondSchema = z.object({ id: z.string(), title: z.string(), network: StacksNetworkSchema, lifecycleStatus: z.enum(["upcoming", "open", "closed", "unknown"]), productStatus: ProductStatusSchema, enrollmentStatus: EnrollmentStatusSchema, scheduledLaunchDate: z.iso.date().nullable(), dataStatus: z.enum(["published", "demo"]), timing: TimingSchema, economics: EconomicsSchema, notes: z.array(z.string()), routes: z.array(z.object({ id: z.string(), name: z.string(), routeType: z.enum(["native_l1_direct", "sbtc_pool"]), effectiveAvailability: EffectiveAvailabilitySchema }).strict()) }).strict();
export const BondsOutputSchema = output({ bonds: z.array(ListedBondSchema), demoBonds: z.array(ListedBondSchema), counts: z.object({ published: z.number(), demo: z.number() }).strict(), demoIncluded: z.boolean(), registry: RegistryMetadataSchema });
export const CustodyOutputSchema = output({ scope: z.literal("native_l1_bitcoin_staking"), paths: z.array(CustodyPathSchema.extend({ effectiveStatus: z.enum(["available", "not_currently_supported", "in_integration", "unknown", "needs_review"]) })), registry: RegistryMetadataSchema, reviewStatus: z.enum(["current", "review_due"]), reviewCadenceDays: z.literal(7), reviewedAt: z.iso.datetime(), reviewDueAt: z.iso.datetime(), verificationMethod: z.literal("product_owner_confirmed"), counts: z.object({ total: z.number(), available: z.number(), notCurrentlySupported: z.number(), unknown: z.number() }).strict() });
export const RoutesOutputSchema = output({ bondId: z.string(), routes: z.array(EffectiveRouteSchema), routeModel: z.object({ topLevelRoutes: z.tuple([z.literal("native_l1_direct"), z.literal("sbtc_pool")]), lstTreatment: z.string() }).strict() });

const OnChainReconciliationSchema = z.union([
  z.object({ status: z.literal("not_attempted"), reason: z.string() }).strict(),
  z.object({ status: z.enum(["found", "not_found", "conflict"]), bondIndex: z.number(), record: OnChainBondRecordSchema.nullable(), network: StacksNetworkSchema, dataStatus: z.literal("live"), sources: z.array(SourceRefSchema), provenance: SourceRefSchema }).strict(),
  z.object({ status: z.literal("unavailable"), error: ErrorSchema, bondIndex: z.number(), network: StacksNetworkSchema, sources: z.array(SourceRefSchema), provenance: SourceRefSchema }).strict(),
]);
export const BondOutputSchema = output({ bond: PublicBondSchema, onChainReconciliation: OnChainReconciliationSchema, onChainVerification: OnChainReconciliationSchema });

const ProvenanceSchema = z.object({ component: z.string(), endpoint: z.url(), contractId: z.string().nullable(), function: z.string().optional(), map: z.string().optional() }).strict();
const AccountStatusSchema = z.object({ balance: z.string(), locked: z.string(), nonce: z.string(), unlockHeight: z.number().int() }).strict();
const StakerInfoSchema = z.discriminatedUnion("staked", [
  z.object({ staked: z.literal(false) }).strict(),
  z.object({ staked: z.literal(true), details: z.object({ amountUstx: z.string(), firstRewardCycle: z.number().int(), numCycles: z.number().int(), signer: z.string() }).strict() }).strict(),
]);
const BondMembershipSchema = z.object({ bondIndex: z.number().int(), amountUstx: z.string(), signer: z.string(), isL1Lock: z.boolean(), amountSats: z.string() }).strict();
export const ParticipantOutputSchema = output({ address: z.string(), network: StacksNetworkSchema, accountStatus: AccountStatusSchema.nullable(), stakerInfo: StakerInfoSchema.nullable(), bondMembership: BondMembershipSchema.nullable(), bondAllowanceSats: z.string().nullable(), requestedBondId: z.string().nullable(), requestedBondDataStatus: z.enum(["published", "demo"]).nullable(), networkResolution: z.object({ network: StacksNetworkSchema, selectedBy: z.enum(["bond", "request", "address", "default"]), inferredFromAddress: StacksNetworkSchema.nullable() }).strict(), componentProvenance: z.array(z.union([ProvenanceSchema, SourceRefSchema])) });
export const CompatibilityOutputSchema = output({ bondId: z.string(), routeId: z.string(), provider: z.string(), status: z.enum(["supported", "unsupported", "unknown"]), keyControlPreference: z.enum(["self_controlled", "custodian", "either", "unknown"]), evidence: z.string() });
export const ComparisonOutputSchema = output({ bondId: z.string(), recommendedRouteId: z.string().nullable(), closestRouteId: z.string().nullable(), assessments: z.array(RouteAssessmentSchema), profile: ParticipantProfileSchema, conclusion: z.string() });
export const PlanOutputSchema = output({ bondId: z.string(), routeId: z.string().nullable(), selectedRouteId: z.string().nullable(), assessments: z.array(RouteAssessmentSchema) });

export const SuccessfulToolOutputSchemas = {
  get_market_snapshot: MarketSnapshotOutputSchema,
  get_protocol_status: ProtocolStatusOutputSchema,
  list_protocol_bonds: ProtocolBondsOutputSchema,
  get_security_guidance: SecurityOutputSchema,
  build_diligence_report: DiligenceOutputSchema,
  list_bonds: BondsOutputSchema,
  list_custody_paths: CustodyOutputSchema,
  list_bond_participation_routes: RoutesOutputSchema,
  get_bond: BondOutputSchema,
  check_participant_status: ParticipantOutputSchema,
  check_compatibility: CompatibilityOutputSchema,
  simulate_yield: YieldOutputSchema,
  compare_staking_paths: ComparisonOutputSchema,
  build_participation_plan: PlanOutputSchema,
} as const;
