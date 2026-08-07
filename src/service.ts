import { selectDefaultRoute, simulateYield, type YieldSimulationInput } from "./core/economics.js";
import { ServiceError } from "./core/errors.js";
import { assessRoute, compareBondRoutes } from "./core/recommendation.js";
import {
  CustodyPathStatusSchema, LifecycleFilterSchema, ParticipantProfileSchema, StacksNetworkSchema,
  isReviewCurrent, normalizeParticipantProfileAmount, reviewDueAt, routeEffectiveAvailability,
  type BondManifest, type ParticipantProfile, type ParticipationRoute, type SourceRef, type StacksNetworkName,
} from "./core/schemas.js";
import { CoinGeckoPriceProvider } from "./providers/coingecko.js";
import { ManifestStore } from "./providers/manifest-store.js";
import { CustodyStore } from "./providers/custody-store.js";
import { RegistryStore } from "./providers/registry-store.js";
import { StacksProvider } from "./providers/stacks.js";
import { getSecurityGuidance, listSecuritySources, type SecurityTopic } from "./security.js";
import { listCanonicalSources } from "./institutional.js";

export interface ServiceDependencies {
  manifests?: ManifestStore;
  custody?: CustodyStore;
  registry?: RegistryStore;
  stacks?: StacksProvider;
  testnetStacks?: StacksProvider;
  prices?: CoinGeckoPriceProvider;
  now?: () => Date;
}

type ManifestRegistryRead = Awaited<ReturnType<ManifestStore["listWithMetadata"]>>;
type CustodyRegistryRead = Awaited<ReturnType<CustodyStore["readWithMetadata"]>>;

function errorSummary(reason: unknown) {
  const error = reason instanceof ServiceError ? reason : new ServiceError("UPSTREAM_ERROR", reason instanceof Error ? reason.message : String(reason), true);
  return { status: "unavailable" as const, error: { code: error.code, message: error.message, retryable: error.retryable } };
}

type ProtocolBondsResult = Awaited<ReturnType<StacksProvider["listProtocolBonds"]>>;
type ProtocolBondsSettledResult = PromiseSettledResult<ProtocolBondsResult>;

export class BitcoinStakingService {
  readonly manifests: ManifestStore;
  readonly custody: CustodyStore;
  readonly registry: RegistryStore;
  readonly stacks: StacksProvider;
  readonly testnetStacks: StacksProvider;
  readonly prices: CoinGeckoPriceProvider;
  private readonly now: () => Date;

  constructor(dependencies: ServiceDependencies = {}) {
    this.now = dependencies.now ?? (() => new Date());
    this.registry = dependencies.registry ?? new RegistryStore({ now: this.now });
    const useDeprecatedRegistries = !process.env.BITCOIN_STAKING_REGISTRY_URL && Boolean(process.env.BITCOIN_STAKING_BOND_REGISTRY_URL || process.env.BITCOIN_STAKING_CUSTODY_REGISTRY_URL);
    this.manifests = dependencies.manifests ?? new ManifestStore(undefined, { now: this.now, ...(useDeprecatedRegistries ? {} : { registryStore: this.registry }) });
    this.custody = dependencies.custody ?? new CustodyStore(undefined, { now: this.now, ...(useDeprecatedRegistries ? {} : { registryStore: this.registry }) });
    this.stacks = dependencies.stacks ?? new StacksProvider();
    this.testnetStacks = dependencies.testnetStacks ?? new StacksProvider({ network: "testnet" });
    this.prices = dependencies.prices ?? new CoinGeckoPriceProvider({ now: this.now });
  }

  getProtocolStatus(network: StacksNetworkName = "mainnet") { return this.provider(network).getProtocolStatus(); }
  listProtocolBonds(network: StacksNetworkName = "mainnet", options: { lookbackPeriods?: number; lookaheadPeriods?: number } = {}) { return this.provider(network).listProtocolBonds(options); }
  getSecurityGuidance(topic: SecurityTopic | "all" = "all") { return getSecurityGuidance(topic); }
  searchCurrentFacts(input: { query?: string | undefined; category?: "project" | "product" | "announcement" | undefined; status?: string | undefined; limit?: number | undefined } = {}) {
    return this.registry.search({
      ...(input.query === undefined ? {} : { query: input.query }),
      ...(input.category === undefined ? {} : { category: input.category }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    });
  }

  async getMarketSnapshot(
    input: { network?: StacksNetworkName } = {},
    preloaded: { registry?: ManifestRegistryRead; custody?: CustodyRegistryRead } = {},
  ) {
    const network = StacksNetworkSchema.parse(input.network ?? "mainnet");
    const statusPromise = this.getProtocolStatus(network);
    const scanPromise = this.listProtocolBonds(network);
    const testnetStatusPromise = network === "testnet" ? statusPromise : this.getProtocolStatus("testnet");
    const testnetScanPromise = network === "testnet" ? scanPromise : this.listProtocolBonds("testnet");
    const [registryResult, custodyResult, statusResult, scanResult, testnetStatusResult, testnetScanResult, priceResult] = await Promise.allSettled([
      preloaded.registry ? Promise.resolve(preloaded.registry) : this.manifests.listWithMetadata(),
      preloaded.custody ? Promise.resolve(preloaded.custody) : this.custody.readWithMetadata(),
      statusPromise, scanPromise,
      testnetStatusPromise, testnetScanPromise,
      this.prices.getCurrentUsdPrices(),
    ]);
    if (registryResult.status === "rejected") throw registryResult.reason;
    const now = this.now();
    const published = registryResult.value.bonds.filter((bond) => bond.dataStatus === "published" && bond.network === network);
    type BondScheduleValue = Awaited<ReturnType<StacksProvider["getBondSchedule"]>> | ReturnType<typeof errorSummary> | null;
    const scheduleResults: Array<readonly [string, BondScheduleValue]> = await Promise.all(published.map(async (bond): Promise<readonly [string, BondScheduleValue]> => {
      if (bond.onChainBondIndex === undefined) return [bond.id, null] as const;
      try { return [bond.id, await this.provider(network).getBondSchedule(bond.onChainBondIndex)] as const; }
      catch (error) { return [bond.id, errorSummary(error)] as const; }
    }));
    const schedules = new Map(scheduleResults);
    const catalogResult = await this.searchCurrentFacts({ limit: 100 }).then((value) => ({ status: "available" as const, value })).catch(errorSummary);
    const routeSummaries = this.summarizeRoutes(published, scanResult, now);
    const chain = statusResult.status === "fulfilled" ? statusResult.value : errorSummary(statusResult.reason);
    const onChainBonds = scanResult.status === "fulfilled" ? scanResult.value : errorSummary(scanResult.reason);
    const testnetEvidence = {
      protocol: testnetStatusResult.status === "fulfilled" ? testnetStatusResult.value : errorSummary(testnetStatusResult.reason),
      bonds: testnetScanResult.status === "fulfilled" ? testnetScanResult.value : errorSummary(testnetScanResult.reason),
      investable: false,
    };
    const custody = custodyResult.status === "fulfilled" ? {
      status: "available" as const, current: custodyResult.value.metadata.reviewStatus === "current",
      registry: custodyResult.value.metadata,
      availablePathIds: custodyResult.value.metadata.reviewStatus === "current"
        ? custodyResult.value.registry.paths.filter((path) =>
            path.status === "available" && isReviewCurrent(path.attestation.reviewedAt, now, path.attestation.reviewCadenceDays)
          ).map((path) => path.id)
        : [],
    } : errorSummary(custodyResult.reason);
    const prices = priceResult.status === "fulfilled" ? priceResult.value : errorSummary(priceResult.reason);
    return {
      network, bondCount: published.length, bonds: published.map((bond) => ({ id: bond.id, title: bond.title, lifecycleStatus: bond.lifecycleStatus, protocolSchedule: schedules.get(bond.id) ?? null })),
      routes: routeSummaries, protocol: chain, onChainBonds, testnetEvidence, custody, prices, registry: registryResult.value.metadata,
      catalog: catalogResult,
      activeNotices: catalogResult.status === "available" ? catalogResult.value.results.filter((item) => item.kind === "fact" && "category" in item && item.category === "announcement") : [],
      productHighlights: catalogResult.status === "available" ? catalogResult.value.results.filter((item) => item.kind === "fact" && "category" in item && item.category === "product") : [],
      precedence: "Runtime/on-chain protocol state outranks owner claims. A conflict or overdue attestation prevents a route from being presented as currently usable.",
      dataStatus: "derived" as const, sources: this.uniqueSources([
        ...published.flatMap((bond) => bond.sources),
        ...(custodyResult.status === "fulfilled" ? custodyResult.value.registry.sources : []),
        ...(statusResult.status === "fulfilled" ? statusResult.value.sources : []),
        ...(scanResult.status === "fulfilled" ? scanResult.value.sources : []),
        ...(testnetStatusResult.status === "fulfilled" ? testnetStatusResult.value.sources : []),
        ...(testnetScanResult.status === "fulfilled" ? testnetScanResult.value.sources : []),
        ...(priceResult.status === "fulfilled" ? priceResult.value.sources : []),
      ]),
      assumptions: ["The snapshot is deterministic and applies status, enrollment, verification, and freshness independently."], verifiedAt: now.toISOString(),
    };
  }

  async listBonds(input: { lifecycleStatus?: string | undefined; includeDemo?: boolean | undefined } = {}) {
    const lifecycle = input.lifecycleStatus ? LifecycleFilterSchema.parse(input.lifecycleStatus) : undefined;
    const { bonds, metadata } = await this.manifests.listWithMetadata();
    const filtered = bonds.filter((bond) => !lifecycle || bond.lifecycleStatus === lifecycle);
    const summarize = async (bond: typeof filtered[number]) => ({
      id: bond.id, title: bond.title, network: bond.network, lifecycleStatus: bond.lifecycleStatus,
      productStatus: bond.productStatus, enrollmentStatus: bond.enrollmentStatus, scheduledLaunchDate: bond.timing.scheduledLaunchDate ?? null,
      protocolSchedule: bond.onChainBondIndex === undefined ? null : await this.provider(bond.network).getBondSchedule(bond.onChainBondIndex).catch(errorSummary),
      dataStatus: bond.dataStatus, timing: bond.timing, economics: bond.economics, notes: bond.notes,
      routes: bond.participationRoutes.map((route) => ({ id: route.id, name: route.name, routeType: route.routeType, effectiveAvailability: routeEffectiveAvailability(route, this.now()) })),
    });
    const published = filtered.filter((bond) => bond.dataStatus === "published");
    const demos = input.includeDemo ? filtered.filter((bond) => bond.dataStatus === "demo") : [];
    return { bonds: await Promise.all(published.map(summarize)), demoBonds: await Promise.all(demos.map(summarize)), counts: { published: published.length, demo: demos.length }, demoIncluded: input.includeDemo ?? false, registry: metadata,
      dataStatus: published.length ? "published" as const : demos.length ? "demo" as const : "derived" as const,
      sources: this.uniqueSources([...published, ...demos].flatMap((bond) => bond.sources)), assumptions: ["Demo records are excluded unless explicitly requested."], verifiedAt: this.now().toISOString() };
  }

  async listBondParticipationRoutes(input: { bondId: string }) {
    const bond = await this.manifests.get(input.bondId); const now = this.now();
    return { bondId: bond.id, routes: bond.participationRoutes.map((route) => ({ ...route, effectiveAvailability: routeEffectiveAvailability(route, now), reviewDueAt: reviewDueAt(route.attestation.reviewedAt, route.attestation.reviewCadenceDays) })),
      routeModel: { topLevelRoutes: ["native_l1_direct", "sbtc_pool"], lstTreatment: "An LST is an optional sBTC pool capability, never a third route." },
      dataStatus: bond.dataStatus, sources: bond.sources, assumptions: ["Only owner-approved named pools are published."], verifiedAt: now.toISOString() };
  }

  async listCustodyPaths(input: { provider?: string | undefined; status?: string | undefined } = {}, preloaded?: CustodyRegistryRead) {
    const status = input.status ? CustodyPathStatusSchema.parse(input.status) : undefined;
    const { registry, metadata } = preloaded ?? await this.custody.readWithMetadata();
    const provider = input.provider?.trim().toLowerCase();
    const paths = registry.paths.filter((path) =>
      (!provider || path.id.toLowerCase() === provider || path.name.toLowerCase() === provider) &&
      (!status || path.status === status)
    );
    const current = metadata.reviewStatus === "current";
    const effectivePaths = paths.map((path) => ({
      ...path,
      effectiveStatus: current && isReviewCurrent(path.attestation.reviewedAt, this.now(), path.attestation.reviewCadenceDays) ? path.status : "needs_review" as const,
    }));
    return { scope: registry.scope, paths: effectivePaths, registry: metadata,
      reviewStatus: current ? "current" as const : "review_due" as const,
      reviewCadenceDays: registry.reviewCadenceDays, reviewedAt: registry.reviewedAt,
      reviewDueAt: reviewDueAt(registry.reviewedAt, registry.reviewCadenceDays),
      verificationMethod: registry.verificationMethod,
      counts: {
        total: paths.length,
        available: effectivePaths.filter((path) => path.effectiveStatus === "available").length,
        notCurrentlySupported: paths.filter((path) => path.status === "not_currently_supported").length,
        unknown: paths.filter((path) => path.status === "unknown").length,
      },
      dataStatus: "published" as const, sources: registry.sources, assumptions: ["Custody paths apply only to native-L1 direct participation.", "A current custody path does not prove that a bond is configured or enrollment is open.", current ? "The registry is inside its seven-day review window." : "Overdue claims are historical context and cannot support a current recommendation."], verifiedAt: this.now().toISOString() };
  }

  async getBond(bondId: string) {
    const bond = await this.manifests.get(bondId); const provider = this.provider(bond.network); const now = this.now();
    let onChainVerification: Record<string, unknown>;
    if (bond.onChainBondIndex === undefined) onChainVerification = { status: "not_attempted", reason: "No on-chain bond index is declared." };
    else {
      const source = provider.sourceRef(now.toISOString());
      try {
        const record = await provider.getOnChainBond(bond.onChainBondIndex);
        const anyCurrentClaim = bond.participationRoutes.some((route) => route.productStatus === "production" && route.enrollmentStatus === "open");
        const conflict = !record && anyCurrentClaim;
        onChainVerification = { status: conflict ? "conflict" : record ? "found" : "not_found", bondIndex: bond.onChainBondIndex, record: record ?? null, network: bond.network, dataStatus: "live", sources: [source], provenance: source };
      } catch (error) {
        onChainVerification = { ...errorSummary(error), bondIndex: bond.onChainBondIndex, network: bond.network, sources: [source], provenance: source };
      }
    }
    const conflict = onChainVerification.status === "conflict";
    const routes = bond.participationRoutes.map((route) => {
      const registryAvailability = routeEffectiveAvailability(route, now);
      const routeConflict = conflict && route.productStatus === "production" && route.enrollmentStatus === "open";
      return { ...route, effectiveAvailability: onChainVerification.status === "unavailable" && registryAvailability === "available" ? "unknown" as const : routeEffectiveAvailability(route, now, routeConflict) };
    });
    const runtimeSource = bond.onChainBondIndex === undefined ? [] : [provider.sourceRef(now.toISOString())];
    const protocolSchedule = bond.onChainBondIndex === undefined ? null : await provider.getBondSchedule(bond.onChainBondIndex).catch(errorSummary);
    return { bond: { ...bond, participationRoutes: routes }, onChainReconciliation: onChainVerification,
      onChainVerification, protocolSchedule,
      dataStatus: bond.dataStatus, sources: this.uniqueSources([...bond.sources, ...runtimeSource]), assumptions: [conflict ? "Owner and runtime state conflict; no route is currently usable." : "Published product state remains distinct from runtime configuration."], verifiedAt: now.toISOString() };
  }

  async buildDiligenceReport(input: { network?: StacksNetworkName | undefined; bondIndex?: number | undefined; bondId?: string | undefined; routeId?: string | undefined; profile: ParticipantProfile }) {
    const profile = normalizeParticipantProfileAmount(ParticipantProfileSchema.parse(input.profile)); const now = this.now();
    const manifestRead = await this.manifests.listWithMetadata();
    let custodyRead: CustodyRegistryRead | undefined;
    try { custodyRead = await this.custody.readWithMetadata(); }
    catch { /* Pool diligence remains usable; direct-route fit is not assessable without custody evidence. */ }
    const bonds = manifestRead.bonds.filter((bond) => bond.dataStatus === "published");
    let bond: BondManifest | undefined;
    if (input.bondId) {
      const resolved = await this.manifests.get(input.bondId);
      bond = bonds.find((item) => item.id === resolved.id);
      if (!bond) throw new ServiceError("NOT_FOUND", `Published bond not found: ${input.bondId}`);
      if (input.bondIndex !== undefined && bond.onChainBondIndex !== input.bondIndex) {
        throw new ServiceError("INVALID_INPUT", `Bond ${input.bondId} does not match bond index ${input.bondIndex}.`);
      }
    } else if (input.bondIndex !== undefined) {
      bond = bonds.find((item) => item.onChainBondIndex === input.bondIndex && (!input.network || item.network === input.network));
      if (!bond) throw new ServiceError("NOT_FOUND", `No published bond manifest matches on-chain index ${input.bondIndex}.`);
    } else {
      bond = bonds.find((item) => item.network === (input.network ?? "mainnet"));
    }
    if (!bond && input.network) return this.buildNetworkDiligencePreview(input.network, profile, now, { registry: manifestRead, ...(custodyRead ? { custody: custodyRead } : {}) });
    if (!bond) throw new ServiceError("NOT_FOUND", "No published bond matches the request.");
    if (input.network && bond.network !== input.network) throw new ServiceError("INVALID_INPUT", `Bond ${bond.id} is on ${bond.network}, not ${input.network}.`);
    const custody = custodyRead ? await this.listCustodyPaths({}, custodyRead) : { paths: [], sources: [] };
    const selectedRoutes = input.routeId ? bond.participationRoutes.filter((route) => route.id === input.routeId) : bond.participationRoutes;
    if (!selectedRoutes.length) throw new ServiceError("NOT_FOUND", `Route not found on ${bond.id}: ${input.routeId}`);
    const runtimeRoutes = await this.getBondRuntimeRoutes(bond);
    const availabilityByRoute = new Map(runtimeRoutes.map((route) => [route.routeId, route.effectiveAvailability]));
    const assessments = selectedRoutes.map((route) => assessRoute(bond!, route, profile, custody.paths, now, availabilityByRoute.get(route.id)));
    const economicScenarios = profile.amountSats
      ? await Promise.all(selectedRoutes.map(async (route) => {
          try {
            return { routeId: route.id, status: "calculated" as const, scenario: await this.calculateYieldWithPrices(bond!, route, { principalSats: profile.amountSats! }) };
          } catch (error) {
            if (error instanceof ServiceError && error.code === "INSUFFICIENT_DATA") {
              return { routeId: route.id, status: "incomplete_economics" as const, scenario: null, reason: error.message };
            }
            throw error;
          }
        }))
      : [];
    const directScenario = economicScenarios.find((item) =>
      selectedRoutes.find((route) => route.id === item.routeId)?.routeType === "native_l1_direct"
    );
    const primaryScenario = input.routeId ? economicScenarios[0] : directScenario ?? economicScenarios[0];
    const protocolSchedule = bond.onChainBondIndex === undefined ? null : await this.provider(bond.network).getBondSchedule(bond.onChainBondIndex).catch(errorSummary);
    const scheduledDate = bond.timing.scheduledLaunchDate
      ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${bond.timing.scheduledLaunchDate}T00:00:00.000Z`))
      : null;
    const assessmentStatus = bond.lifecycleStatus === "upcoming" && (scheduledDate || (protocolSchedule && !("status" in protocolSchedule)))
      ? "upcoming_bond_scheduled" as const
      : "published_bond_assessed" as const;
    const derivedTiming = protocolSchedule && !("status" in protocolSchedule)
      ? `Protocol eligibility begins in Cycle ${protocolSchedule.startRewardCycle} at burn height ${protocolSchedule.startBurnHeight}; the current calendar estimate is ${protocolSchedule.estimatedStartAt} and is approximate.`
      : null;
    const bottomLine = derivedTiming
      ? `${bond.title}: ${derivedTiming} Product enrollment and on-chain configuration remain separate checks.`
      : scheduledDate
      ? `${bond.title} is slated for ${scheduledDate}${bond.timing.startsRewardCycle === undefined ? "" : ` in Cycle ${bond.timing.startsRewardCycle}`}. Enrollment and on-chain configuration remain pending; sourced public-model gross yield can be shown while net yield remains unknown until applicable fees are published.`
      : `${bond.title} is published for diligence. Route availability and final economics must be confirmed from current product and on-chain state.`;
    const nextDiligenceSteps = [
      "Choose a currently supported custody path for direct native-L1 participation, or review the currently published sBTC pool route.",
      "Confirm the final bond duration and every applicable fee before treating a gross projection as a net-return scenario.",
      "Reconcile enrollment and on-chain configuration before funding.",
    ];
    return {
      assessmentStatus,
      bottomLine,
      bondAvailability: {
        scheduled: bond.timing.scheduledLaunchDate ?? null,
        protocolSchedule,
        lifecycleStatus: bond.lifecycleStatus,
        productStatus: bond.productStatus,
        enrollmentStatus: bond.enrollmentStatus,
        registration: bond.participationRoutes.map((route) => ({ routeId: route.id, enrollmentStatus: route.enrollmentStatus })),
        onChainConfigured: runtimeRoutes.some((route) => route.onChainReconciliation === "configured"),
        onChainReconciliation: runtimeRoutes.map((route) => ({ routeId: route.routeId, status: route.onChainReconciliation })),
        coverageBoundary: bond.protocolTerms.coverageBoundary,
      },
      commonProtocolEconomics: { ...bond.economics, signerAndAdministrationControls: bond.protocolTerms.signerAndAdministrationControls, audits: bond.protocolTerms.audits, unresolvedTerms: bond.protocolTerms.unresolvedTerms, coverageBoundary: bond.protocolTerms.coverageBoundary },
      economics: primaryScenario?.status === "calculated"
        ? {
            status: primaryScenario.scenario.availability === "published_reference_model_scenario"
              ? "reference_model_projection" as const
              : "bond_specific_projection" as const,
            scenario: primaryScenario.scenario,
          }
        : { status: profile.amountSats ? "incomplete_economics" as const : "amount_required" as const, scenario: null },
      routeEconomicScenarios: economicScenarios,
      routeAssessments: assessments.map((assessment) => ({ assessment, details: selectedRoutes.find((route) => route.id === assessment.routeId) })),
      riskSections: selectedRoutes.map((route) => route.routeType === "native_l1_direct" ? {
        routeId: route.id,
        routeType: route.routeType,
        eligibility: { whitelist: route.whitelist, participantTypes: route.participantTypes, minimumSats: route.minimumSats ?? null, maximumSats: route.maximumSats ?? null },
        custody: { custodyPathIds: route.custodyPathIds, keyControl: route.keyControl },
        pairedStx: route.pairedStx,
        timelock: { lockDurationDays: bond!.timing.lockDurationDays ?? null, unlockHeight: bond!.timing.unlockHeight ?? null },
        recovery: route.recovery,
        earlyExit: route.earlyExit,
      } : {
        routeId: route.id,
        routeType: route.routeType,
        operator: route.poolOperator,
        investorInputs: route.investorInputs,
        feeBps: route.feeBps ?? null,
        contracts: route.contracts,
        administration: { ownerOrganization: route.attestation.ownerOrganization, scope: route.attestation.scope },
        withdrawal: route.withdrawalTerms,
        accounting: route.rewardAccounting,
        sbtcRisks: "This route adds sBTC consensus, peg, contract, operator, accounting, and withdrawal dependencies beyond native Bitcoin L1.",
        lst: route.lst ? {
          tokenSymbol: route.lst.tokenSymbol,
          redemption: route.lst.redemption,
          liquidity: route.lst.liquidityEvidence,
          smartContractRisk: route.lst.tokenContract ? "A deployed LST contract adds smart-contract and administration risk." : "No deployed LST contract is currently verified.",
          oracle: route.lst.oracleEvidence,
          integrations: route.lst.verifiedDefiIntegrations,
        } : null,
      }),
      operationalFit: assessments.length === 1 ? assessments[0]?.fit : assessments.some((item) => item.fit === "strong") ? "strong" : assessments.some((item) => item.fit === "conditional") ? "conditional" : assessments.every((item) => item.fit === "no_match") ? "no_match" : "not_assessable",
      missingEvidence: [...new Set(assessments.flatMap((item) => item.missingEvidence))],
      nextDiligenceAction: assessments.find((item) => item.fit !== "no_match")?.nextDiligenceAction ?? "Change a route-changing constraint or obtain evidence that resolves the no-match condition.",
      nextDiligenceSteps,
      profile,
      dataStatus: "derived" as const,
      sources: this.uniqueSources([
        ...bond.sources,
        ...custody.sources,
        ...economicScenarios.flatMap((item) => item.scenario?.sources ?? []),
        this.provider(bond.network).sourceRef(now.toISOString()),
      ]),
      assumptions: ["Claim-level sources are identified by each route and custody sourceIds field.", "This is diligence support, not individualized advice."],
      verifiedAt: now.toISOString(),
    };
  }

  private async buildNetworkDiligencePreview(
    network: StacksNetworkName,
    profile: ParticipantProfile,
    now: Date,
    preloaded: { registry: ManifestRegistryRead; custody?: CustodyRegistryRead },
  ) {
    const snapshot = await this.getMarketSnapshot({ network }, preloaded);
    const protocol = "error" in snapshot.protocol ? null : snapshot.protocol;
    const onChainBonds = "error" in snapshot.onChainBonds ? null : snapshot.onChainBonds;
    const configuredBonds = onChainBonds?.bonds ?? [];
    const scheduled = protocol?.pox5Scheduled === true && !protocol.pox5Active;
    const state = scheduled
      ? "PoX-5 is scheduled on this network, but no published product bond manifest exists for route or investor-fit diligence."
      : configuredBonds.length
        ? `PoX-5 is active and ${configuredBonds.length} on-chain bond configuration${configuredBonds.length === 1 ? " was" : "s were"} observed, but no published product bond manifest exists for investable route diligence.`
        : protocol?.pox5Active
          ? "PoX-5 is active, but no configured bond and no published product bond manifest were verified."
          : "Protocol state is unavailable and no published product bond manifest exists for this network.";
    const coverageBoundary = `${network} protocol evidence only. On-chain configuration does not establish product availability, enrollment, custody compatibility, route economics, or investability.`;
    return {
      assessmentStatus: "network_protocol_preview" as const,
      bottomLine: state,
      bondAvailability: {
        scheduled: null,
        protocolSchedule: null,
        lifecycleStatus: "unknown" as const,
        productStatus: "unconfirmed" as const,
        enrollmentStatus: "unknown" as const,
        registration: [],
        onChainConfigured: configuredBonds.length > 0,
        onChainReconciliation: configuredBonds.map((record) => ({ routeId: `protocol-bond-${record.onChainBondIndex}`, status: "configured" as const })),
        coverageBoundary,
      },
      commonProtocolEconomics: {
        rewardAsset: "unknown" as const,
        rewardModel: "unknown" as const,
        signerAndAdministrationControls: "No published product manifest exists; inspect the exact on-chain contract provenance in the market snapshot.",
        audits: [],
        unresolvedTerms: ["Product routes, eligibility, custody support, fees, reward accounting, enrollment, and withdrawal terms are not published for this network."],
        coverageBoundary,
      },
      economics: { status: "not_available" as const, scenario: null },
      routeEconomicScenarios: [],
      routeAssessments: [],
      riskSections: [],
      operationalFit: "not_assessable" as const,
      missingEvidence: ["A current owner-reviewed bond manifest with participation routes is not published for this network."],
      nextDiligenceAction: "Publish and validate an owner-reviewed bond manifest before assessing route availability, economics, or operational fit.",
      nextDiligenceSteps: [
        "Review the reported protocol activation and configured-bond evidence.",
        "Obtain a current owner-reviewed product manifest for the intended bond.",
        "Re-run route diligence only after product and protocol evidence can be reconciled.",
      ],
      profile,
      dataStatus: "derived" as const,
      sources: snapshot.sources,
      assumptions: ["Testnet assets are non-investable.", "On-chain protocol evidence is not substituted for missing product claims."],
      verifiedAt: now.toISOString(),
    };
  }

  async checkParticipantStatus(address: string, bondId?: string | undefined, networkInput?: StacksNetworkName | undefined) {
    const inferred = address.startsWith("ST") || address.startsWith("SN") ? "testnet" : address.startsWith("SP") || address.startsWith("SM") ? "mainnet" : undefined;
    const bond = bondId ? await this.manifests.get(bondId) : undefined;
    const requested = networkInput ? StacksNetworkSchema.parse(networkInput) : undefined;
    const network = bond?.network ?? requested ?? inferred ?? "mainnet";
    if (bond && requested && bond.network !== requested) throw new ServiceError("INVALID_INPUT", `Bond network ${bond.network} conflicts with requested network ${requested}.`);
    if (bond && inferred && bond.network !== inferred) throw new ServiceError("INVALID_INPUT", `Bond network ${bond.network} conflicts with address-implied network ${inferred}.`);
    if (!bond && requested && inferred && requested !== inferred) throw new ServiceError("INVALID_INPUT", `Address implies ${inferred}, which conflicts with requested network ${requested}.`);
    const result = await this.provider(network).getParticipantStatus(address, bond);
    return { ...result, networkResolution: { network, selectedBy: bond ? "bond" : requested ? "request" : inferred ? "address" : "default", inferredFromAddress: inferred ?? null }, componentProvenance: result.componentProvenance ?? result.sources };
  }

  async checkCompatibility(input: { bondId: string; provider: string; keyControlPreference: ParticipantProfile["keyControlPreference"] }) {
    const bond = await this.manifests.get(input.bondId); const route = bond.participationRoutes.find((item) => item.routeType === "native_l1_direct");
    if (!route || route.routeType !== "native_l1_direct") throw new ServiceError("NOT_FOUND", "This bond has no direct native-L1 route.");
    const { paths, registry } = await this.custody.list({ provider: input.provider }); const path = paths[0];
    const supported = !!path && path.status === "available" && (route.custodyPathIds.length === 0 || route.custodyPathIds.includes(path.id)) && isReviewCurrent(route.attestation.reviewedAt, this.now()) && isReviewCurrent(path.attestation.reviewedAt, this.now(), path.attestation.reviewCadenceDays);
    return { bondId: bond.id, routeId: route.id, provider: input.provider, status: supported ? "supported" : path?.status === "not_currently_supported" ? "unsupported" : "unknown", keyControlPreference: input.keyControlPreference, evidence: path?.evidence ?? "No current custody evidence found.",
      dataStatus: bond.dataStatus, sources: path ? registry.sources.filter((source) => path.sourceIds.includes(source.id)) : registry.sources, assumptions: ["Compatibility is a product claim, not a protocol guarantee."], verifiedAt: this.now().toISOString() };
  }

  async simulateYield(input: YieldSimulationInput & { bondId: string; routeId?: string | undefined }) {
    const bond = await this.manifests.get(input.bondId); const route = input.routeId ? bond.participationRoutes.find((item) => item.id === input.routeId) : selectDefaultRoute(bond);
    if (!route) throw new ServiceError("NOT_FOUND", "Participation route not found.");
    return this.calculateYieldWithPrices(bond, route, input);
  }

  async compareStakingPaths(profileInput: ParticipantProfile, bondId?: string) {
    const profile = normalizeParticipantProfileAmount(ParticipantProfileSchema.parse(profileInput)); const bond = bondId ? await this.manifests.get(bondId) : (await this.manifests.list()).find((item) => item.dataStatus === "published");
    if (!bond) throw new ServiceError("NOT_FOUND", "No published bond is available for comparison.");
    const { paths, registry } = await this.custody.list();
    const availabilityByRoute = new Map((await this.getBondRuntimeRoutes(bond)).map((route) => [route.routeId, route.effectiveAvailability]));
    const comparison = compareBondRoutes(
      bond,
      profile,
      paths,
      this.now(),
      this.uniqueSources([...bond.sources, ...registry.sources, ...listCanonicalSources()]),
      availabilityByRoute,
    );
    const pool = bond.participationRoutes.find((route) => route.routeType === "sbtc_pool");
    const needsLiquidityRoute = profile.goal === "borrow_without_selling" || profile.liquidityNeed === "access_anytime";
    return {
      ...comparison,
      closestRouteId: comparison.recommendedRouteId ?? (needsLiquidityRoute ? pool?.id ?? null : null),
      conclusion: needsLiquidityRoute
        ? `The ${pool?.name ?? "approved sBTC pool"} with optional stBTC is the closest planned experience, but no named live lender, collateral terms, or reliable exit liquidity is verified.`
        : "Compare the direct native-L1 route with the currently published sBTC pool using the stated custody and liquidity tradeoffs.",
    };
  }

  async buildParticipationPlan(bondId: string, profileInput: ParticipantProfile, routeId?: string | undefined) {
    const profile = normalizeParticipantProfileAmount(ParticipantProfileSchema.parse(profileInput)); const bond = await this.manifests.get(bondId); const { paths, registry } = await this.custody.list();
    const routes = routeId ? bond.participationRoutes.filter((route) => route.id === routeId) : bond.participationRoutes;
    if (!routes.length) throw new ServiceError("NOT_FOUND", `Route not found: ${routeId}`);
    const availabilityByRoute = new Map((await this.getBondRuntimeRoutes(bond)).map((route) => [route.routeId, route.effectiveAvailability]));
    const assessments = routes.map((route) => assessRoute(bond, route, profile, paths, this.now(), availabilityByRoute.get(route.id)));
    return { bondId, routeId: routeId ?? null, assessments, selectedRouteId: assessments.find((item) => item.effectiveAvailability === "available" && (item.fit === "strong" || item.fit === "conditional"))?.routeId ?? null,
      dataStatus: "derived" as const, sources: this.uniqueSources([...bond.sources, ...registry.sources]), assumptions: ["Read-only preparation plan; no transaction fields are produced."], verifiedAt: this.now().toISOString() };
  }

  async getSource(sourceId: string) { const source = (await this.listSources()).find((item) => item.id === sourceId); if (!source) throw new ServiceError("NOT_FOUND", `Source not found: ${sourceId}`); return source; }
  async listSources(): Promise<SourceRef[]> { return this.uniqueSources([...(await this.manifests.sources()), ...(await this.custody.sources()), ...listSecuritySources(), ...listCanonicalSources()]); }
  private async calculateYieldWithPrices(bond: BondManifest, route: ParticipationRoute, input: YieldSimulationInput) {
    const baseResult = simulateYield(bond, route, input);
    const needsLivePrices = input.btcPriceUsd === undefined || !input.stxPriceScenariosUsd?.length;
    let livePrices: Awaited<ReturnType<CoinGeckoPriceProvider["getCurrentUsdPrices"]>> | null = null;
    let priceError: ReturnType<typeof errorSummary> | null = null;
    if (needsLivePrices) {
      try { livePrices = await this.prices.getCurrentUsdPrices(); }
      catch (error) { priceError = errorSummary(error); }
    }
    const btcPriceUsd = input.btcPriceUsd ?? livePrices?.btcUsd;
    const stxPriceScenariosUsd = input.stxPriceScenariosUsd?.length ? input.stxPriceScenariosUsd : livePrices ? [livePrices.stxUsd] : undefined;
    const result = livePrices || input.btcPriceUsd !== undefined || input.stxPriceScenariosUsd?.length ? simulateYield(bond, route, {
      ...input,
      ...(btcPriceUsd === undefined ? {} : { btcPriceUsd }),
      ...(stxPriceScenariosUsd === undefined ? {} : { stxPriceScenariosUsd }),
    }) : baseResult;
    const activeStxPriceUsd = stxPriceScenariosUsd?.[0] ?? null;
    const priceSnapshot = livePrices
      ? {
          ...livePrices,
          usage: input.btcPriceUsd === undefined && !input.stxPriceScenariosUsd?.length ? "live_defaults" as const : "mixed_live_and_explicit" as const,
          usedBtcPriceUsd: btcPriceUsd ?? null,
          usedStxPriceUsd: activeStxPriceUsd,
          display: {
            btcUsd: btcPriceUsd === undefined ? null : `$${btcPriceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
            stxUsd: activeStxPriceUsd === null ? null : `$${activeStxPriceUsd.toFixed(3)}`,
          },
        }
      : priceError ? {
          provider: "CoinGecko" as const,
          usage: "unavailable" as const,
          usedBtcPriceUsd: btcPriceUsd ?? null,
          usedStxPriceUsd: activeStxPriceUsd,
          error: priceError.error,
          display: { btcUsd: null, stxUsd: null },
        } : {
          provider: "user_supplied" as const,
          usage: "explicit_inputs" as const,
          usedBtcPriceUsd: btcPriceUsd ?? null,
          usedStxPriceUsd: activeStxPriceUsd,
          display: {
            btcUsd: btcPriceUsd === undefined ? null : `$${btcPriceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
            stxUsd: activeStxPriceUsd === null ? null : `$${activeStxPriceUsd.toFixed(3)}`,
          },
        };
    return {
      ...result,
      priceSnapshot,
      sources: this.uniqueSources([...result.sources, ...(livePrices?.sources ?? [])]),
      assumptions: [
        ...result.assumptions,
        ...(livePrices
          ? livePrices.assumptions
          : priceError
            ? ["Live price enrichment was unavailable; deterministic reward sats remain valid without a price quote."]
            : ["Price inputs were explicitly supplied by the caller."]),
      ],
    };
  }
  private summarizeRoutes(bonds: BondManifest[], scanResult: ProtocolBondsSettledResult, now: Date) {
    return bonds.flatMap((bond) => {
      const configured = scanResult.status === "fulfilled" && bond.onChainBondIndex !== undefined
        ? scanResult.value.bonds.some((record: { onChainBondIndex?: number }) => record.onChainBondIndex === bond.onChainBondIndex)
        : false;
      return bond.participationRoutes.map((route) => {
        const claimsCurrentlyUsable = route.productStatus === "production" && route.enrollmentStatus === "open";
        const conflict = scanResult.status === "fulfilled" && claimsCurrentlyUsable && (bond.onChainBondIndex === undefined || !configured);
        const registryAvailability = routeEffectiveAvailability(route, now, conflict);
        const effectiveAvailability = scanResult.status === "rejected" && registryAvailability === "available" ? "unknown" as const : registryAvailability;
        return {
          bondId: bond.id, routeId: route.id, routeType: route.routeType, name: route.name,
          productStatus: route.productStatus, enrollmentStatus: route.enrollmentStatus,
          effectiveAvailability, onChainReconciliation: conflict ? "conflict" as const : configured ? "configured" as const : scanResult.status === "rejected" ? "unavailable" as const : "not_configured" as const,
          poolOperator: route.routeType === "sbtc_pool" ? route.poolOperator.name : null,
          optionalLst: route.routeType === "sbtc_pool" && route.lst ? { symbol: route.lst.tokenSymbol, productStatus: route.lst.productStatus } : null,
        };
      });
    });
  }
  private async getBondRuntimeRoutes(bond: BondManifest) {
    const [scanResult] = await Promise.allSettled([this.listProtocolBonds(bond.network)]);
    return this.summarizeRoutes([bond], scanResult!, this.now());
  }
  private uniqueSources(sources: SourceRef[]) { return [...new Map(sources.map((source) => [source.id, source])).values()]; }
  private provider(network: StacksNetworkName) { return network === "testnet" ? this.testnetStacks : this.stacks; }
}
