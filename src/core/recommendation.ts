import type {
  BondManifest,
  CompatibilityClaim,
  ParticipantProfile,
  RecommendationResult,
} from "./schemas.js";

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function findCompatibility(
  bond: BondManifest,
  name: string,
): CompatibilityClaim | undefined {
  return bond.compatibility.find((claim) => normalized(claim.name) === normalized(name));
}

export function checkCompatibility(
  bond: BondManifest,
  name: string,
  keyControlPreference: ParticipantProfile["keyControlPreference"],
) {
  const claim = findCompatibility(bond, name);
  const fallbackEvidence =
    "No public compatibility claim is present in this manifest. Unknown is not evidence of support or incompatibility.";

  return {
    bondId: bond.id,
    provider: name,
    providerKind: claim?.kind ?? "unknown",
    status: claim?.status ?? "unknown",
    evidence: claim?.evidence ?? fallbackEvidence,
    keyControlPreference,
    keyControlFit:
      keyControlPreference === "unknown" || keyControlPreference === "either"
        ? "not_evaluated"
        : bond.requirements.keyControl === "custodian_or_participant"
          ? "compatible_in_principle"
          : keyControlPreference === "self_controlled" && bond.requirements.keyControl === "participant"
            ? "compatible_in_principle"
            : "unknown",
    dataStatus: bond.dataStatus,
    sources: claim
      ? bond.sources.filter((source) => claim.sourceIds.includes(source.id))
      : bond.sources,
    assumptions: [
      "Compatibility is a product claim, not a protocol guarantee.",
      "Unknown remains unknown until an end-to-end wallet or custodian flow is publicly verified.",
    ],
    verifiedAt: bond.verifiedAt,
  };
}

export function compareStakingPaths(profile: ParticipantProfile, sources: BondManifest["sources"]) {
  const wantsBorrowing = profile.goal === "borrow_without_selling";
  const needsLiquidity = profile.liquidityNeed === "access_anytime";
  const l1Only = profile.bitcoinPathPreference === "bitcoin_l1_only";

  return {
    profile,
    paths: [
      {
        id: "native_l1_btc_staking",
        availability: "bond_dependent",
        fit: wantsBorrowing || needsLiquidity ? "weak" : "potential",
        bitcoinLocation: "Bitcoin L1 timelocked output",
        custody: "Can preserve participant key control; exact wallet or custodian support is product-specific.",
        strengths: ["BTC remains on Bitcoin L1", "Defined maturity recovery path"],
        constraints: [
          "BTC is locked for the bond term",
          "Borrowing against the locked position is not implied",
          "Early exit and wallet support must be verified per bond",
        ],
      },
      {
        id: "sbtc_application_context",
        availability: "context_only",
        fit: l1Only ? "excluded_by_preference" : wantsBorrowing || needsLiquidity ? "investigate" : "optional",
        bitcoinLocation: "sBTC on Stacks",
        custody: "Custody, redemption, and application assumptions require separate verification for the selected sBTC path.",
        strengths: ["Programmable in Stacks applications", "May support lending or other DeFi uses"],
        constraints: [
          "This MCP does not verify or rank a live DeFi product in the MVP",
          "Liquidity, collateral terms, and smart-contract risks are application-specific",
        ],
      },
    ],
    conclusion:
      wantsBorrowing && l1Only
        ? "No verified native-bond borrowing path is represented. Keep the requirement open and do not infer that a locked bond is borrowable."
        : "Use a specific bond manifest and compatibility evidence before selecting a participation path.",
    dataStatus: "derived" as const,
    sources,
    assumptions: [
      "sBTC information is context, not a verified live-product recommendation.",
      "Self-custody and Bitcoin-versus-sBTC location are separate decisions.",
    ],
    verifiedAt: new Date().toISOString(),
  };
}

export function buildParticipationPlan(
  bond: BondManifest,
  profile: ParticipantProfile,
): RecommendationResult {
  const reasons: string[] = [];
  const tradeoffs: string[] = [];
  const missingFacts: string[] = [];
  const unsupportedRequirements: string[] = [];
  const nextSteps: string[] = [];
  let fit: RecommendationResult["fit"] = "strong";

  if (bond.dataStatus === "demo") {
    reasons.push("This is an illustrative demo opportunity, not an available live bond.");
  }
  if (profile.goal === "borrow_without_selling") {
    if (bond.requirements.borrowingAgainstPosition !== "supported") {
      unsupportedRequirements.push("Borrowing against this staking position is not verified as supported.");
      fit = "no_match";
    }
  } else {
    reasons.push("The stated goal can be evaluated against a yield-bearing bond without assuming borrowing.");
  }

  if (profile.liquidityNeed === "access_anytime") {
    unsupportedRequirements.push("Continuous access conflicts with a timelocked native-L1 bond.");
    fit = "no_match";
  } else if (profile.liquidityNeed === "may_need_early_exit") {
    if (bond.requirements.earlyExit !== "supported") {
      missingFacts.push("A usable early-exit path is not verified for this bond.");
      if (fit === "strong") fit = "conditional";
    }
    tradeoffs.push("An early exit may forfeit rewards and depend on a bond-specific coordination path.");
  } else {
    reasons.push("The user can accept a maturity-based lock.");
  }

  if (profile.bitcoinPathPreference === "open_to_sbtc") {
    tradeoffs.push("This bond uses native BTC on L1; openness to sBTC does not make the locked position composable.");
  }
  if (profile.bitcoinPathPreference === "compare_both") {
    nextSteps.push("Call compare_staking_paths before choosing between a native bond and sBTC application context.");
  }

  if (profile.amountSats) {
    const amount = BigInt(profile.amountSats);
    if (bond.capacity.minSats && amount < BigInt(bond.capacity.minSats)) {
      unsupportedRequirements.push(`Amount is below the bond minimum of ${bond.capacity.minSats} sats.`);
      fit = "no_match";
    }
    if (bond.capacity.maxSats && amount > BigInt(bond.capacity.maxSats)) {
      unsupportedRequirements.push(`Amount exceeds the per-participant maximum of ${bond.capacity.maxSats} sats.`);
      fit = "no_match";
    }
  } else {
    missingFacts.push("BTC amount is needed to check minimums, maximums, and calculate scenarios.");
    if (fit === "strong") fit = "conditional";
  }

  if (profile.timeHorizonDays && bond.timing.lockDurationDays) {
    if (profile.timeHorizonDays < bond.timing.lockDurationDays) {
      unsupportedRequirements.push(
        `Time horizon is shorter than the ${bond.timing.lockDurationDays}-day illustrative lock.`,
      );
      fit = "no_match";
    }
  }

  if (profile.walletOrCustodian) {
    const compatibility = findCompatibility(bond, profile.walletOrCustodian);
    if (!compatibility || compatibility.status === "unknown") {
      missingFacts.push(`${profile.walletOrCustodian} compatibility is not publicly verified.`);
      if (fit === "strong") fit = "conditional";
    } else if (compatibility.status === "unsupported") {
      unsupportedRequirements.push(`${profile.walletOrCustodian} is marked unsupported by the manifest evidence.`);
      fit = "no_match";
    } else {
      reasons.push(`${profile.walletOrCustodian} is marked supported by cited product evidence.`);
    }
  }

  tradeoffs.push("Native BTC remains on Bitcoin L1 but is unavailable until maturity or a verified early-exit flow.");
  tradeoffs.push("Wallet and custody support must be verified separately from PoX-5 protocol behavior.");
  nextSteps.push("Review the bond sources and confirm it is live before taking any action.");
  nextSteps.push("Call check_compatibility for the exact wallet or custodian.");
  if (profile.amountSats) nextSteps.push("Call simulate_yield with explicit price and fee assumptions.");

  return {
    bondId: bond.id,
    fit,
    reasons,
    tradeoffs,
    missingFacts,
    unsupportedRequirements,
    alternatives: [
      {
        path: "sBTC application context",
        status: "context_only",
        reason: "Explore only if liquidity or borrowing goals justify additional protocol and application assumptions.",
      },
    ],
    nextSteps,
    dataStatus: bond.dataStatus === "demo" ? "demo" : "derived",
    sources: bond.sources,
    assumptions: [
      "This is a product-fit assessment, not individualized financial advice.",
      "No transaction has been constructed, signed, or broadcast.",
    ],
    verifiedAt: new Date().toISOString(),
  };
}
