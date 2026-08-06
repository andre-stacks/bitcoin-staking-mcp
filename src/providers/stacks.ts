import {
  fetchAccountStatus,
  fetchBondAllowance,
  fetchBondMembership,
  fetchPoxInfo,
  fetchProtocolBond,
  fetchStakerInfo,
} from "@stacks/bitcoin-staking";
import { createNetwork, STACKS_MAINNET } from "@stacks/network";
import { validateStacksAddress } from "@stacks/transactions";
import { ServiceError, withTimeout } from "../core/errors.js";
import { toJsonSafe, type BondManifest, type SourceRef } from "../core/schemas.js";

const DEFAULT_API_BASE = "https://api.mainnet.hiro.so";

export interface StacksProviderOptions {
  apiBaseUrl?: string;
  timeoutMs?: number;
}

export class StacksProvider {
  readonly apiBaseUrl: string;
  readonly timeoutMs: number;
  private readonly network;

  constructor(options: StacksProviderOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? process.env.STACKS_API_BASE_URL ?? DEFAULT_API_BASE;
    this.timeoutMs =
      options.timeoutMs ?? Number(process.env.BITCOIN_STAKING_UPSTREAM_TIMEOUT_MS ?? "8000");
    this.network = createNetwork({
      network: STACKS_MAINNET,
      client: { baseUrl: this.apiBaseUrl },
    });
  }

  private source(retrievedAt: string): SourceRef {
    return {
      id: "hiro-mainnet-pox-api",
      title: "Hiro Stacks Mainnet PoX API",
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
      return toJsonSafe({
        network: "mainnet",
        contractId: info.contractId,
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
        sources: [this.source(startedAt)],
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
        dataStatus: "live" as const,
        sources: [this.source(verifiedAt)],
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
