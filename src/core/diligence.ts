import type {
  BondManifest,
  ParticipantProfile,
  SourceRef,
  StacksNetworkName,
} from "./schemas.js";
import { simulateYield } from "./economics.js";

const BPS_DENOMINATOR = 10_000n;
const TARGET_CALCULATIONS_PER_YEAR = 50n;

export interface ProtocolStatusSnapshot {
  network: StacksNetworkName;
  chainId: number;
  contractId: string;
  pox5Active: boolean;
  pox5Scheduled: boolean;
  pox5ActivationBurnchainBlockHeight: number | null;
  blocksUntilPox5Activation: number | null;
  firstPox5RewardCycle: number | null;
  currentBurnchainBlockHeight: number;
  sbtcContract?: string | null;
  sources: SourceRef[];
  assumptions: string[];
  verifiedAt: string;
}

export interface ProtocolBondSnapshot {
  id: string;
  network: StacksNetworkName;
  chainId: number;
  onChainBondIndex: number;
  contractId: string;
  protocolStatus: string;
  registrationStatus: string;
  startBurnHeight: number;
  blocksUntilStart: number;
  startRewardCycle: number;
  phases: Array<{
    name: string;
    startBurnHeight: number;
    length: number;
    endBurnHeight: number;
  }>;
  targetRateBps: number;
  stxValueRatio: string;
  minUstxRatioBps: number;
  earlyUnlockBytes: string;
  availability: string;
  sources: SourceRef[];
  assumptions: string[];
  verifiedAt: string;
}

export interface ProtocolBondScanSnapshot {
  network: StacksNetworkName;
  pox5Active: boolean;
  pox5Scheduled?: boolean;
  currentBurnchainBlockHeight: number;
  scannedBondIndices: number[];
  bonds: ProtocolBondSnapshot[];
  sources: SourceRef[];
  assumptions: string[];
  verifiedAt: string;
}

export interface DiligenceSecurityEntry {
  topic: string;
  answer: string;
  evidenceLevel: string;
  whatIsNotProven: readonly string[];
  verificationChecklist: readonly string[];
}

function uniqueSources(sources: SourceRef[]): SourceRef[] {
  return [...new Map(sources.map((source) => [source.id, source])).values()];
}

function scheduledDateLabel(value?: string): string {
  if (!value) return "the published launch window";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function pairedStxMinimumUstx(bond: ProtocolBondSnapshot, principalSats: bigint): bigint {
  return (
    ((BigInt(bond.stxValueRatio) * principalSats) / 100n) *
    BigInt(bond.minUstxRatioBps)
  ) / BPS_DENOMINATOR;
}

function targetRewardScenario(bond: ProtocolBondSnapshot, principalSats?: bigint) {
  if (!principalSats) {
    return {
      status: "principal_required",
      configuredTargetRateBps: bond.targetRateBps,
      rewardAsset: "sBTC",
      targetRewardPerCalculationSats: null,
      annualizedTargetSats: null,
      pairedStxMinimumUstx: null,
      caveat:
        "The on-chain target rate is not a guaranteed payout. Supply a BTC amount to model the contract target and paired-STX minimum.",
    };
  }

  const targetPerCalculation =
    ((principalSats * BigInt(bond.targetRateBps)) / BPS_DENOMINATOR) /
    TARGET_CALCULATIONS_PER_YEAR;

  return {
    status: "derived_target_scenario",
    configuredTargetRateBps: bond.targetRateBps,
    rewardAsset: "sBTC",
    targetRewardPerCalculationSats: targetPerCalculation.toString(),
    annualizedTargetSats: (targetPerCalculation * TARGET_CALCULATIONS_PER_YEAR).toString(),
    pairedStxMinimumUstx: pairedStxMinimumUstx(bond, principalSats).toString(),
    caveat:
      "PoX-5 caps each bond calculation at available rewards. This is the configured target, not a promised or forecast payout.",
  };
}

export function buildInstitutionalDiligence(input: {
  network: StacksNetworkName;
  profile: ParticipantProfile;
  requestedBondIndex?: number | undefined;
  status: ProtocolStatusSnapshot;
  scan: ProtocolBondScanSnapshot;
  upcomingBonds: BondManifest[];
  securityEntries: DiligenceSecurityEntry[];
  sources: SourceRef[];
  verifiedAt: string;
}) {
  const selectedBond =
    input.requestedBondIndex === undefined
      ? input.scan.bonds.find((bond) => bond.protocolStatus === "open") ?? input.scan.bonds[0]
      : input.scan.bonds.find((bond) => bond.onChainBondIndex === input.requestedBondIndex);
  const principalSats = input.profile.amountSats ? BigInt(input.profile.amountSats) : undefined;
  const testnet = input.network === "testnet";

  if (!input.status.pox5Active) {
    const scheduledHeight = input.status.pox5ActivationBurnchainBlockHeight;
    return {
      network: input.network,
      assessmentStatus: input.status.pox5Scheduled
        ? "scheduled_activation"
        : "pox5_unavailable",
      fit: "not_assessable",
      bottomLine: testnet
        ? input.status.pox5Scheduled
          ? `The live testnet demo environment is connected and schedules PoX-5 for burn height ${scheduledHeight}. Until activation, the complete mainnet-like bond journey cannot be demonstrated.`
          : "The live testnet demo environment is connected, but this endpoint does not report PoX-5 as active or scheduled, so the complete mainnet-like bond journey cannot be demonstrated."
        : input.status.pox5Scheduled
          ? `No PoX-5 bond can be assessed yet. The live ${input.network} API schedules PoX-5 for burn height ${scheduledHeight}; the active contract is still ${input.status.contractId}.`
          : `No PoX-5 bond can be assessed because the live ${input.network} API does not report PoX-5 as active or scheduled.`,
      availability: {
        investable: false,
        reason: testnet
          ? "This is the live product demo/prototype environment; PoX-5 is not active on this endpoint yet, so the full intended journey is not currently demonstrable."
          : "No active PoX-5 protocol opportunity was verified.",
        activationBurnHeight: scheduledHeight,
        currentBurnHeight: input.status.currentBurnchainBlockHeight,
        blocksUntilActivation: input.status.blocksUntilPox5Activation,
      },
      profile: input.profile,
      selectedBond: null,
      economics: {
        status: "not_available",
        reason: "No configured active PoX-5 bond terms are available for calculation.",
      },
      materialRisks: [
        "A scheduled protocol version is not evidence of a configured bond.",
        "Testnet configuration is not evidence of mainnet availability or wallet support.",
      ],
      securityEvidence: input.securityEntries,
      nextDiligenceSteps: [
        `Re-run this report after burn height ${scheduledHeight ?? "the published activation height"}.`,
        "Require an on-chain get-protocol-bond result before evaluating economics or eligibility.",
        "Validate the exact wallet or custodian release separately before funding.",
      ],
      dataStatus: "derived" as const,
      sources: uniqueSources(input.sources),
      assumptions: [
        ...input.status.assumptions,
        ...input.scan.assumptions,
        "No future bond record, economics, or compatibility was inferred from the activation schedule.",
      ],
      verifiedAt: input.verifiedAt,
    };
  }

  if (!selectedBond) {
    const upcomingBond =
      input.requestedBondIndex === undefined
        ? input.upcomingBonds[0]
        : input.upcomingBonds.find(
            (bond) => bond.onChainBondIndex === input.requestedBondIndex,
          );
    const requested =
      input.requestedBondIndex === undefined
        ? "No configured bond was returned in the scanned active window."
        : `Bond index ${input.requestedBondIndex} was not returned in the scanned active window.`;
    if (!testnet && upcomingBond) {
      const launchDate = scheduledDateLabel(upcomingBond.timing.scheduledLaunchDate);
      const cycle = upcomingBond.timing.startsRewardCycle;
      const referenceScenario = principalSats
        ? simulateYield(upcomingBond, { principalSats: principalSats.toString() })
        : null;
      return {
        network: input.network,
        assessmentStatus: "upcoming_bond_scheduled",
        fit: "preparation_stage",
        bottomLine: `${upcomingBond.title} is slated for ${launchDate}${cycle ? ` in Cycle ${cycle}` : ""}. It is not yet configured in the bounded on-chain scan, so final terms and enrollment are pending, but participants can prepare custody, eligibility, key control, and lock-horizon decisions now.`,
        availability: {
          investable: false,
          status: "upcoming",
          reason:
            "The product schedule is published, but on-chain configuration and open enrollment have not yet been verified.",
          scheduledLaunchDate: upcomingBond.timing.scheduledLaunchDate ?? null,
          startsRewardCycle: upcomingBond.timing.startsRewardCycle ?? null,
          currentBurnHeight: input.status.currentBurnchainBlockHeight,
          scannedBondIndices: input.scan.scannedBondIndices,
        },
        profile: input.profile,
        selectedBond: null,
        upcomingBond,
        economics: referenceScenario
          ? {
              status: "reference_model_projection",
              scenario: referenceScenario,
              caveat:
                "The target rate, duration, and STX value ratio are published reference-program inputs. The result uses complete supplied route economics but is not the final first-bond payout until configured terms, price snapshot, and on-chain state are verified.",
            }
          : {
              status: "reference_model_available",
              targetApyBps: upcomingBond.economics.targetRateBps ?? null,
              pairedStxMinimumValueRatioBps:
                upcomingBond.participationRoutes.find(
                  (route) => route.routeType === "native_l1_direct",
                )?.pairedStx.minimumValueRatioBps ?? null,
              reason:
                "Supply a BTC amount and every applicable route fee for a deterministic scenario; calculations are refused while required economics remain incomplete.",
            },
        materialRisks: [
          "A slated launch date is not proof of on-chain configuration or open enrollment.",
          "Final custody, eligibility, economics, and recovery terms may still change before launch.",
        ],
        securityEvidence: input.securityEntries,
        nextDiligenceSteps: [
          "Choose a currently supported custody path and confirm the Bitcoin lock and maturity-recovery signing flow.",
          "Confirm allowlist eligibility and the amount and lock horizon you are prepared to use.",
          "Compare the direct native-L1 bond with the announced community-pool and stBTC liquidity paths.",
          "Refresh the final duration, manager fee, STX price snapshot, capacity, enrollment window, and on-chain configuration near launch.",
        ],
        dataStatus: "derived" as const,
        sources: uniqueSources([...input.sources, ...upcomingBond.sources]),
        assumptions: [
          ...input.status.assumptions,
          ...input.scan.assumptions,
          "The published schedule is treated as upcoming product information, not live chain state.",
        ],
        verifiedAt: input.verifiedAt,
      };
    }
    return {
      network: input.network,
      assessmentStatus: "no_configured_bond",
      fit: "not_assessable",
      bottomLine: testnet
        ? `${requested} The live testnet remains the product's prototype environment, but the complete mainnet-like bond journey is not currently configured.`
        : `${requested} No opportunity terms were invented.`,
      availability: {
        investable: false,
        reason: testnet
          ? "The live testnet demo environment is available, but no bond is configured in the scanned window, so a complete bond experience cannot currently be shown."
          : "No configured mainnet bond was verified in the bounded scan.",
        currentBurnHeight: input.status.currentBurnchainBlockHeight,
        scannedBondIndices: input.scan.scannedBondIndices,
      },
      profile: input.profile,
      selectedBond: null,
      economics: {
        status: "not_available",
        reason: "No verified on-chain bond terms are available for calculation.",
      },
      materialRisks: [
        "An empty bounded scan is not a complete historical index.",
        "Published or demo terms must not be substituted for a missing live bond.",
      ],
      securityEvidence: input.securityEntries,
      nextDiligenceSteps: [
        "Re-run live discovery near the next bond setup and registration window.",
        "Obtain a public product manifest only after its on-chain bond index can be reconciled.",
      ],
      dataStatus: "derived" as const,
      sources: uniqueSources(input.sources),
      assumptions: [...input.status.assumptions, ...input.scan.assumptions],
      verifiedAt: input.verifiedAt,
    };
  }

  const reasons: string[] = [];
  const materialRisks: string[] = [];
  const missingFacts: string[] = [];
  let fit: "conditional" | "no_match" = "conditional";

  if (input.profile.bitcoinPathPreference === "bitcoin_l1_only") {
    reasons.push("The protocol bond supports a native Bitcoin L1 lock path.");
  }
  if (selectedBond.registrationStatus !== "open") {
    fit = "no_match";
    materialRisks.push(
      `New registration is not currently open; the live registration status is ${selectedBond.registrationStatus}.`,
    );
  }
  if (input.profile.liquidityNeed === "access_anytime") {
    fit = "no_match";
    materialRisks.push("Continuous liquidity conflicts with a native-L1 timelock.");
  } else if (input.profile.liquidityNeed === "may_need_early_exit") {
    materialRisks.push(
      "Early exit is cooperative, forfeits undistributed rewards, and requires product-specific operational support.",
    );
  } else {
    reasons.push("The profile accepts a maturity-based lock.");
  }
  if (input.profile.goal === "borrow_without_selling") {
    fit = "no_match";
    materialRisks.push("The live bond record does not establish borrowing against the locked position.");
  }
  if (input.profile.keyControlPreference === "self_controlled") {
    reasons.push(
      "PoX-5 supports participant-supplied maturity unlock material, but the exact wallet implementation remains separate evidence.",
    );
  }
  if (input.profile.walletOrCustodian) {
    missingFacts.push(
      `${input.profile.walletOrCustodian} compatibility is not proven by the protocol bond record.`,
    );
  }
  if (!principalSats) {
    missingFacts.push("BTC amount is required to derive the target reward and paired-STX minimum.");
  }

  materialRisks.push(
    "The configured target rate is capped by available sBTC rewards and is not a guaranteed payout.",
    "Allowance, participant state, signer-manager authorization, and wallet/custodian support require separate verification.",
  );

  return {
    network: input.network,
    assessmentStatus: "configured_bond_assessed",
    fit,
    bottomLine: `${testnet ? "A live testnet demo bond is configured and can exercise the intended mainnet-like product journey with test assets." : "A mainnet bond is configured on-chain."} The profile is ${fit === "no_match" ? "not a clean fit" : "a conditional fit pending eligibility and integration evidence"}.`,
    availability: {
      investable: false,
      reason: testnet
        ? "The record proves a working testnet demo configuration. It does not represent a mainnet opportunity."
        : "This MCP does not determine investability; on-chain configuration does not by itself prove open enrollment or suitability for this participant.",
      protocolStatus: selectedBond.protocolStatus,
      registrationStatus: selectedBond.registrationStatus,
    },
    profile: input.profile,
    selectedBond,
    reasons,
    missingFacts,
    economics: targetRewardScenario(selectedBond, principalSats),
    custody: {
      bitcoinLocation: "Bitcoin L1 P2WSH output",
      maturityControl:
        "The normal maturity branch evaluates participant-supplied unlock material; the application and wallet path must preserve the correct key and recovery data.",
      walletOrCustodianEvidence: input.profile.walletOrCustodian ? "unknown" : "not_requested",
    },
    materialRisks,
    securityEvidence: input.securityEntries,
    nextDiligenceSteps: [
      "Check the participant allowance, STX balance, existing bond membership, and signer-manager authorization.",
      "Independently reconstruct and compare the expected P2WSH destination before funding.",
      "Complete the lock, registration, reward, maturity, and reclaim flow on testnet with the exact release artifacts.",
    ],
    dataStatus: "derived" as const,
    sources: uniqueSources(input.sources),
    assumptions: [
      ...selectedBond.assumptions,
      "The target reward calculation mirrors the contract's 50-calculation annual target and does not model reward-pool shortfall.",
      "This is an informational fit assessment, not individualized financial advice.",
      "No transaction was constructed, signed, or broadcast.",
    ],
    verifiedAt: input.verifiedAt,
  };
}
