import {
  BOND_END_OFFSET_PERIODS,
  bondPeriodToBurnHeight,
  bondPeriodToRewardCycle,
  bondPhaseRanges,
  bondStatus,
  fetchAccountStatus,
  fetchBondAllowance,
  fetchBondMembership,
  fetchPoxInfo,
  fetchProtocolBond,
  fetchStakerInfo,
  firstPox5RewardCycle,
  isInPreparePhase,
} from "@stacks/bitcoin-staking";
import { createNetwork, STACKS_MAINNET, STACKS_TESTNET } from "@stacks/network";
import { validateStacksAddress } from "@stacks/transactions";
import { ServiceError, withTimeout } from "../core/errors.js";
import {
  toJsonSafe,
  type BondManifest,
  type SourceRef,
  type StacksNetworkName,
} from "../core/schemas.js";

const DEFAULT_MAINNET_API_BASE = "https://api.mainnet.hiro.so";
const DEFAULT_TESTNET_API_BASE = "https://api.testnet-pox5.hiro.so";

export interface StacksProviderOptions {
  network?: StacksNetworkName;
  apiBaseUrl?: string;
  chainId?: number;
  timeoutMs?: number;
  now?: () => Date;
}

export class StacksProvider {
  readonly networkName: StacksNetworkName;
  readonly apiBaseUrl: string;
  readonly chainId: number;
  readonly timeoutMs: number;
  private readonly network;
  private readonly now: () => Date;

  constructor(options: StacksProviderOptions = {}) {
    this.networkName = options.network ?? "mainnet";
    const baseNetwork = this.networkName === "mainnet" ? STACKS_MAINNET : STACKS_TESTNET;
    const configuredApiBase =
      this.networkName === "mainnet"
        ? process.env.STACKS_API_BASE_URL
        : process.env.BITCOIN_STAKING_TESTNET_API_BASE_URL;
    const configuredChainId =
      this.networkName === "testnet" ? process.env.BITCOIN_STAKING_TESTNET_CHAIN_ID : undefined;
    this.apiBaseUrl =
      options.apiBaseUrl ??
      configuredApiBase ??
      (this.networkName === "mainnet" ? DEFAULT_MAINNET_API_BASE : DEFAULT_TESTNET_API_BASE);
    this.chainId = options.chainId ?? (configuredChainId ? Number(configuredChainId) : baseNetwork.chainId);
    if (!Number.isSafeInteger(this.chainId) || this.chainId < 0) {
      throw new ServiceError("INVALID_INPUT", "Stacks chain ID must be a non-negative safe integer.");
    }
    this.timeoutMs =
      options.timeoutMs ?? Number(process.env.BITCOIN_STAKING_UPSTREAM_TIMEOUT_MS ?? "8000");
    this.now = options.now ?? (() => new Date());
    this.network = createNetwork({
      network: { ...baseNetwork, chainId: this.chainId },
      client: { baseUrl: this.apiBaseUrl },
    });
  }

  async getBondSchedule(bondIndex: number) {
    if (!Number.isSafeInteger(bondIndex) || bondIndex < 0) {
      throw new ServiceError("INVALID_INPUT", "bondIndex must be a non-negative safe integer.");
    }
    const verifiedAt = this.now();
    try {
      const info = await withTimeout(fetchPoxInfo({ network: this.network }), this.timeoutMs, `${this.networkName} PoX API`);
      const startRewardCycle = bondPeriodToRewardCycle({ bondIndex, poxInfo: info });
      const startBurnHeight = bondPeriodToBurnHeight({ bondIndex, poxInfo: info });
      const remainingBurnBlocks = Math.max(0, startBurnHeight - info.currentBurnchainBlockHeight);
      return {
        network: this.networkName,
        bondIndex,
        startRewardCycle,
        startBurnHeight,
        currentBurnchainBlockHeight: info.currentBurnchainBlockHeight,
        remainingBurnBlocks,
        estimatedStartAt: new Date(verifiedAt.getTime() + remainingBurnBlocks * 10 * 60_000).toISOString(),
        estimateStatus: "approximate" as const,
        estimateBasis: "Current burn height plus remaining burn blocks at Bitcoin's ten-minute target; actual block timing varies.",
        dataStatus: "derived" as const,
        sources: [this.sourceRef(verifiedAt.toISOString())],
        assumptions: ["PoX-5 bond period mapping is protocol-derived; the calendar timestamp is only an estimate."],
        verifiedAt: verifiedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError("UPSTREAM_ERROR", `Unable to derive PoX-5 bond period ${bondIndex}: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }

  sourceRef(retrievedAt = new Date().toISOString()): SourceRef {
    const label = this.networkName === "mainnet" ? "Mainnet" : "Testnet";
    return {
      id: `hiro-${this.networkName}-pox-api`,
      title: `Hiro Stacks ${label} PoX API`,
      url: `${this.apiBaseUrl}/v2/pox`,
      sourceType: "chain_api",
      dataStatus: "live",
      retrievedAt,
    };
  }

  async getProtocolStatus() {
    const startedAt = new Date().toISOString();
    try {
      const info = await withTimeout(fetchPoxInfo({ network: this.network }), this.timeoutMs, "Stacks PoX API");
      const nextRewardPhaseStartHeight =
        info.firstBurnchainBlockHeight + info.nextCycle.id * info.rewardCycleLength;
      const nextPreparePhaseStartHeight = nextRewardPhaseStartHeight - info.prepareCycleLength;
      const pox5Version = info.contractVersions.find((version) =>
        version.contractId.endsWith(".pox-5"),
      );
      const pox5Active = info.contractId.endsWith(".pox-5");
      return toJsonSafe({
        network: this.networkName,
        chainId: this.chainId,
        apiBaseUrl: this.apiBaseUrl,
        contractId: info.contractId,
        pox5Active,
        pox5Scheduled: Boolean(
          pox5Version && info.currentBurnchainBlockHeight < pox5Version.activationBurnchainBlockHeight,
        ),
        pox5ActivationBurnchainBlockHeight: pox5Version?.activationBurnchainBlockHeight ?? null,
        blocksUntilPox5Activation: pox5Version
          ? Math.max(0, pox5Version.activationBurnchainBlockHeight - info.currentBurnchainBlockHeight)
          : null,
        firstPox5RewardCycle: pox5Version?.firstRewardCycleId ?? null,
        currentBurnchainBlockHeight: info.currentBurnchainBlockHeight,
        rewardCycleLength: info.rewardCycleLength,
        prepareCycleLength: info.prepareCycleLength,
        currentCycle: info.currentCycle,
        nextCycle: info.nextCycle,
        nextPreparePhaseStartHeight,
        blocksUntilNextPreparePhase: Math.max(
          0,
          nextPreparePhaseStartHeight - info.currentBurnchainBlockHeight,
        ),
        nextRewardPhaseStartHeight,
        blocksUntilNextRewardPhase: Math.max(
          0,
          nextRewardPhaseStartHeight - info.currentBurnchainBlockHeight,
        ),
        sbtcContract: info.sbtcContract,
        dataStatus: "live" as const,
        sources: [this.sourceRef(startedAt)],
        assumptions: [
          "Prepare and reward phase heights are derived from the live PoX cycle constants returned by the API.",
        ],
        verifiedAt: startedAt,
      });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(
        "UPSTREAM_ERROR",
        `Unable to read Stacks PoX status: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  }

  async getOnChainBond(bondIndex: number) {
    try {
      return await withTimeout(
        fetchProtocolBond({ network: this.network, bondIndex }),
        this.timeoutMs,
        `PoX-5 bond ${bondIndex}`,
      );
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(
        "UPSTREAM_ERROR",
        `Unable to read PoX-5 bond ${bondIndex}: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  }

  async listProtocolBonds(options: { lookbackPeriods?: number; lookaheadPeriods?: number } = {}) {
    const verifiedAt = new Date().toISOString();
    const lookbackPeriods = options.lookbackPeriods ?? BOND_END_OFFSET_PERIODS;
    const lookaheadPeriods = options.lookaheadPeriods ?? 2;
    if (!Number.isInteger(lookbackPeriods) || lookbackPeriods < 0 || lookbackPeriods > 24) {
      throw new ServiceError("INVALID_INPUT", "lookbackPeriods must be an integer from 0 through 24.");
    }
    if (!Number.isInteger(lookaheadPeriods) || lookaheadPeriods < 0 || lookaheadPeriods > 12) {
      throw new ServiceError("INVALID_INPUT", "lookaheadPeriods must be an integer from 0 through 12.");
    }

    try {
      const info = await withTimeout(
        fetchPoxInfo({ network: this.network }),
        this.timeoutMs,
        `${this.networkName} PoX API`,
      );
      const firstCycle = firstPox5RewardCycle(info);
      const pox5Version = info.contractVersions.find((version) =>
        version.contractId.endsWith(".pox-5"),
      );
      const pox5Active = info.contractId.endsWith(".pox-5");
      if (!pox5Active || firstCycle === undefined) {
        return toJsonSafe({
          network: this.networkName,
          chainId: this.chainId,
          apiBaseUrl: this.apiBaseUrl,
          contractId: info.contractId,
          pox5Active: false,
          pox5Scheduled: Boolean(
            pox5Version &&
              info.currentBurnchainBlockHeight < pox5Version.activationBurnchainBlockHeight,
          ),
          pox5ActivationBurnchainBlockHeight: pox5Version?.activationBurnchainBlockHeight ?? null,
          blocksUntilPox5Activation: pox5Version
            ? Math.max(
                0,
                pox5Version.activationBurnchainBlockHeight - info.currentBurnchainBlockHeight,
              )
            : null,
          firstPox5RewardCycle: pox5Version?.firstRewardCycleId ?? null,
          currentBurnchainBlockHeight: info.currentBurnchainBlockHeight,
          scannedBondIndices: [],
          bonds: [],
          dataStatus: "live" as const,
          sources: [this.sourceRef(verifiedAt)],
          assumptions: [
            pox5Version
              ? "PoX-5 is present in the network schedule but is not active at the current burn height; protocol bond reads begin after activation."
              : "Protocol bonds are a PoX-5 feature; this network does not currently publish a PoX-5 activation.",
            "No bond entries were inferred or synthesized.",
          ],
          verifiedAt,
        });
      }

      const currentBondIndex = Math.max(
        0,
        Math.floor(
          (info.currentCycle.id - firstCycle) /
            (bondPeriodToRewardCycle({ bondIndex: 1, poxInfo: info }) - firstCycle),
        ),
      );
      const firstIndex = Math.max(0, currentBondIndex - lookbackPeriods);
      const lastIndex = currentBondIndex + lookaheadPeriods;
      const scannedBondIndices = Array.from(
        { length: lastIndex - firstIndex + 1 },
        (_value, offset) => firstIndex + offset,
      );
      const records = await withTimeout(
        Promise.all(
          scannedBondIndices.map(async (bondIndex) => ({
            bondIndex,
            bond: await fetchProtocolBond({ network: this.network, bondIndex }),
          })),
        ),
        this.timeoutMs,
        `${this.networkName} PoX-5 bond scan`,
      );
      const inPreparePhase = isInPreparePhase({
        burnHeight: info.currentBurnchainBlockHeight,
        poxInfo: info,
      });
      const bonds = records.flatMap(({ bondIndex, bond }) => {
        if (!bond) return [];
        const status = bondStatus({ bondIndex, poxInfo: info, isBondSetup: true });
        const startBurnHeight = bondPeriodToBurnHeight({ bondIndex, poxInfo: info });
        const startRewardCycle = bondPeriodToRewardCycle({ bondIndex, poxInfo: info });
        return [
          {
            id: `protocol-${this.networkName}-bond-${bondIndex}`,
            network: this.networkName,
            chainId: this.chainId,
            onChainBondIndex: bondIndex,
            contractId: info.contractId,
            protocolStatus: status,
            registrationStatus:
              status === "open"
                ? inPreparePhase
                  ? "temporarily_blocked_prepare_phase"
                  : "open"
                : "closed",
            currentBurnchainBlockHeight: info.currentBurnchainBlockHeight,
            startBurnHeight,
            blocksUntilStart: Math.max(0, startBurnHeight - info.currentBurnchainBlockHeight),
            startRewardCycle,
            phases: bondPhaseRanges({ bondIndex, poxInfo: info }),
            targetRateBps: bond.targetRateBps,
            stxValueRatio: bond.stxValueRatio,
            minUstxRatioBps: bond.minUstxRatioBps,
            earlyUnlockBytes: bond.earlyUnlockBytes,
            availability:
              this.networkName === "testnet" ? "live_testnet_demo" : "mainnet_on_chain",
            dataStatus: "live" as const,
            sources: [this.sourceRef(verifiedAt)],
            assumptions: [
              "This record proves on-chain bond configuration and timing, not wallet compatibility or participant eligibility.",
              this.networkName === "testnet"
                ? "This is the live demo/prototype environment for the intended mainnet journey. It uses test assets and is not a mainnet opportunity."
                : "Mainnet availability still depends on allowance, compatibility, custody, and participant requirements.",
            ],
            verifiedAt,
          },
        ];
      });

      return toJsonSafe({
        network: this.networkName,
        chainId: this.chainId,
        apiBaseUrl: this.apiBaseUrl,
        contractId: info.contractId,
        pox5Active: true,
        currentBurnchainBlockHeight: info.currentBurnchainBlockHeight,
        currentRewardCycle: info.currentCycle.id,
        firstPox5RewardCycle: firstCycle,
        currentBondIndex,
        scannedBondIndices,
        bonds,
        dataStatus: "live" as const,
        sources: [this.sourceRef(verifiedAt)],
        assumptions: [
          "The scan covers the active lookback window plus the requested future bond periods; it is not an exhaustive historical index.",
          "Only configured on-chain records are returned.",
        ],
        verifiedAt,
      });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(
        "UPSTREAM_ERROR",
        `Unable to scan ${this.networkName} PoX-5 bonds: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  }

  async getParticipantStatus(address: string, bond?: BondManifest) {
    if (!validateStacksAddress(address)) {
      throw new ServiceError("INVALID_INPUT", "address must be a valid Stacks standard principal.");
    }
    const verifiedAt = new Date().toISOString();

    try {
      const [accountStatus, stakerInfo, bondMembership, bondAllowance] = await withTimeout(
        Promise.all([
          fetchAccountStatus({ network: this.network, address }),
          fetchStakerInfo({ network: this.network, address }),
          fetchBondMembership({ network: this.network, address }),
          bond?.onChainBondIndex === undefined
            ? Promise.resolve(undefined)
            : fetchBondAllowance({
                network: this.network,
                bondIndex: bond.onChainBondIndex,
                address,
              }),
        ]),
        this.timeoutMs,
        "Stacks participant status",
      );

      return toJsonSafe({
        address,
        accountStatus,
        stakerInfo,
        bondMembership: bondMembership ?? null,
        bondAllowanceSats: bondAllowance?.toString() ?? null,
        requestedBondId: bond?.id ?? null,
        requestedBondDataStatus: bond?.dataStatus ?? null,
        componentProvenance: [
          { component: "accountStatus", endpoint: `${this.apiBaseUrl}/v2/accounts/${encodeURIComponent(address)}?proof=0`, contractId: null },
          { component: "stakerInfo", endpoint: `${this.apiBaseUrl}/v2/contracts/call-read/${this.networkName === "mainnet" ? "SP000000000000000000002Q6VF78" : "ST000000000000000000002AMW42H"}/pox-5/get-staker-info`, contractId: `${this.networkName === "mainnet" ? "SP000000000000000000002Q6VF78" : "ST000000000000000000002AMW42H"}.pox-5`, function: "get-staker-info" },
          { component: "bondMembership", endpoint: `${this.apiBaseUrl}/v2/contracts/call-read/${this.networkName === "mainnet" ? "SP000000000000000000002Q6VF78" : "ST000000000000000000002AMW42H"}/pox-5/get-bond-membership`, contractId: `${this.networkName === "mainnet" ? "SP000000000000000000002Q6VF78" : "ST000000000000000000002AMW42H"}.pox-5`, function: "get-bond-membership" },
          ...(bond?.onChainBondIndex === undefined ? [] : [{ component: "bondAllowance", endpoint: `${this.apiBaseUrl}/v2/map_entry/${this.networkName === "mainnet" ? "SP000000000000000000002Q6VF78" : "ST000000000000000000002AMW42H"}/pox-5/protocol-bond-allowances`, contractId: `${this.networkName === "mainnet" ? "SP000000000000000000002Q6VF78" : "ST000000000000000000002AMW42H"}.pox-5`, map: "protocol-bond-allowances" }]),
        ],
        dataStatus: "live" as const,
        sources: [this.sourceRef(verifiedAt)],
        assumptions: [
          "This reports public Stacks state only and does not prove control of the address.",
          bond?.onChainBondIndex === undefined
            ? "No allowlist read was attempted because the selected manifest has no on-chain bond index."
            : "Allowance is read from the on-chain bond index declared by the selected manifest.",
        ],
        verifiedAt,
      });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(
        "UPSTREAM_ERROR",
        `Unable to read participant status: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  }
}
