import { simulateYield, type YieldSimulationInput } from "./core/economics.js";
import { ServiceError } from "./core/errors.js";
import {
  buildParticipationPlan,
  checkCompatibility,
  compareStakingPaths,
} from "./core/recommendation.js";
import {
  buildInstitutionalDiligence,
  type ProtocolBondScanSnapshot,
  type ProtocolStatusSnapshot,
} from "./core/diligence.js";
import {
  LifecycleFilterSchema,
  ParticipantProfileSchema,
  type ParticipantProfile,
  type SourceRef,
  type StacksNetworkName,
} from "./core/schemas.js";
import { ManifestStore } from "./providers/manifest-store.js";
import { StacksProvider } from "./providers/stacks.js";
import {
  getSecurityGuidance,
  listSecuritySources,
  type SecurityTopic,
} from "./security.js";
import { listCanonicalSources } from "./institutional.js";

export interface ServiceDependencies {
  manifests?: ManifestStore;
  stacks?: StacksProvider;
  testnetStacks?: StacksProvider;
  now?: () => Date;
}

export class BitcoinStakingService {
  readonly manifests: ManifestStore;
  readonly stacks: StacksProvider;
  readonly testnetStacks: StacksProvider;
  private readonly now: () => Date;

  constructor(dependencies: ServiceDependencies = {}) {
    this.manifests = dependencies.manifests ?? new ManifestStore();
    this.stacks = dependencies.stacks ?? new StacksProvider();
    this.testnetStacks =
      dependencies.testnetStacks ?? new StacksProvider({ network: "testnet" });
    this.now = dependencies.now ?? (() => new Date());
  }

  getProtocolStatus(network: StacksNetworkName = "mainnet") {
    return this.provider(network).getProtocolStatus();
  }

  listProtocolBonds(
    network: StacksNetworkName = "mainnet",
    options: { lookbackPeriods?: number; lookaheadPeriods?: number } = {},
  ) {
    return this.provider(network).listProtocolBonds(options);
  }

  getSecurityGuidance(topic: SecurityTopic | "all" = "all") {
    return getSecurityGuidance(topic);
  }

  async buildDiligenceReport(input: {
    network?: StacksNetworkName | undefined;
    bondIndex?: number | undefined;
    profile: ParticipantProfile;
  }) {
    const network = input.network ?? "mainnet";
    const profile = ParticipantProfileSchema.parse(input.profile);
    const [status, scan, security, allSources] = await Promise.all([
      this.getProtocolStatus(network),
      this.listProtocolBonds(network),
      Promise.resolve(this.getSecurityGuidance("all")),
      this.listSources(),
    ]);
    const securityTopics = new Set([
      "audit_status",
      "timelock_construction",
      "leather_transaction_safety",
    ]);
    const securityEntries = security.entries.filter((entry) => securityTopics.has(entry.topic));
    const evidenceSourceIds = new Set([
      ...security.sources.map((source) => source.id),
      "pox5-release-contract",
      "reference-signer-manager",
    ]);

    return buildInstitutionalDiligence({
      network,
      profile,
      requestedBondIndex: input.bondIndex,
      status: status as ProtocolStatusSnapshot,
      scan: scan as ProtocolBondScanSnapshot,
      securityEntries,
      sources: this.uniqueSources([
        ...status.sources,
        ...scan.sources,
        ...allSources.filter((source) => evidenceSourceIds.has(source.id)),
      ]),
      verifiedAt: this.now().toISOString(),
    });
  }

  async listBonds(
    input: { lifecycleStatus?: string | undefined; includeDemo?: boolean | undefined } = {},
  ) {
    const lifecycleStatus = input.lifecycleStatus
      ? LifecycleFilterSchema.parse(input.lifecycleStatus)
      : undefined;
    const manifests = (await this.manifests.list()).filter(
      (bond) => !lifecycleStatus || bond.lifecycleStatus === lifecycleStatus,
    );
    const publishedBonds = manifests.filter((bond) => bond.dataStatus === "published");
    const demoBonds = input.includeDemo ? manifests.filter((bond) => bond.dataStatus === "demo") : [];
    const sources = this.uniqueSources([...publishedBonds, ...demoBonds].flatMap((bond) => bond.sources));

    return {
      bonds: publishedBonds,
      demoBonds,
      counts: {
        published: publishedBonds.length,
        demo: demoBonds.length,
      },
      demoIncluded: input.includeDemo ?? false,
      dataStatus: publishedBonds.length > 0 ? ("published" as const) : ("derived" as const),
      sources,
      assumptions: [
        "This tool lists versioned public manifests; it does not infer undisclosed future bonds from bond indices.",
        input.includeDemo
          ? "Demo records are returned in a separate demoBonds array and are not live opportunities."
          : "Demo records are excluded unless includeDemo is explicitly true.",
      ],
      verifiedAt: this.now().toISOString(),
    };
  }

  async getBond(bondId: string) {
    const bond = await this.manifests.get(bondId);
    const onChainVerification =
      bond.onChainBondIndex === undefined
        ? {
            status: "not_attempted" as const,
            reason: "This manifest has no on-chain bond index.",
          }
        : await this.stacks.getOnChainBond(bond.onChainBondIndex).then((record) => ({
            status: record ? ("found" as const) : ("not_found" as const),
            bondIndex: bond.onChainBondIndex,
            record: record ?? null,
          }));

    return {
      bond,
      onChainVerification,
      dataStatus: bond.dataStatus,
      sources: bond.sources,
      assumptions: [
        bond.dataStatus === "demo"
          ? "This is an illustrative demo manifest and not an available bond."
          : "Published metadata is not treated as live chain state unless onChainVerification is found.",
      ],
      verifiedAt: this.now().toISOString(),
    };
  }

  async checkParticipantStatus(address: string, bondId?: string) {
    const bond = bondId ? await this.manifests.get(bondId) : undefined;
    return this.stacks.getParticipantStatus(address, bond);
  }

  async checkCompatibility(input: {
    bondId: string;
    provider: string;
    keyControlPreference: ParticipantProfile["keyControlPreference"];
  }) {
    const bond = await this.manifests.get(input.bondId);
    return checkCompatibility(bond, input.provider, input.keyControlPreference);
  }

  async simulateYield(input: YieldSimulationInput & { bondId: string }) {
    const bond = await this.manifests.get(input.bondId);
    return simulateYield(bond, input);
  }

  async compareStakingPaths(profileInput: ParticipantProfile) {
    const profile = ParticipantProfileSchema.parse(profileInput);
    const sources = this.uniqueSources((await this.manifests.list()).flatMap((bond) => bond.sources));
    return compareStakingPaths(profile, sources);
  }

  async buildParticipationPlan(bondId: string, profileInput: ParticipantProfile) {
    const bond = await this.manifests.get(bondId);
    const profile = ParticipantProfileSchema.parse(profileInput);
    return buildParticipationPlan(bond, profile);
  }

  async getSource(sourceId: string): Promise<SourceRef> {
    const source = (await this.listSources()).find((candidate) => candidate.id === sourceId);
    if (!source) throw new ServiceError("NOT_FOUND", `Source not found: ${sourceId}`);
    return source;
  }

  async listSources(): Promise<SourceRef[]> {
    return this.uniqueSources([
      ...(await this.manifests.sources()),
      ...listSecuritySources(),
      ...listCanonicalSources(),
    ]);
  }

  private uniqueSources(sources: SourceRef[]): SourceRef[] {
    return [...new Map(sources.map((source) => [source.id, source])).values()];
  }

  private provider(network: StacksNetworkName): StacksProvider {
    return network === "testnet" ? this.testnetStacks : this.stacks;
  }
}
