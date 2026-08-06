import type {
  BondManifest,
  CustodyPath,
  ParticipantProfile,
  ParticipationRoute,
  SourceRef,
} from "./schemas.js";
import { isReviewCurrent, routeEffectiveAvailability } from "./schemas.js";

export interface RouteAssessment {
  bondId: string;
  routeId: string;
  routeType: ParticipationRoute["routeType"];
  fit: "strong" | "conditional" | "no_match" | "not_assessable";
  effectiveAvailability: ReturnType<typeof routeEffectiveAvailability>;
  reasons: string[];
  tradeoffs: string[];
  missingEvidence: string[];
  unsupportedRequirements: string[];
  nextDiligenceAction: string;
}

function amountFits(amountSats: string | undefined, minimum?: string, maximum?: string) {
  if (!amountSats) return "unknown" as const;
  const amount = BigInt(amountSats);
  if (minimum && amount < BigInt(minimum)) return "below" as const;
  if (maximum && amount > BigInt(maximum)) return "above" as const;
  return "fits" as const;
}

export function assessRoute(
  bond: BondManifest,
  route: ParticipationRoute,
  profile: ParticipantProfile,
  custodyPaths: CustodyPath[],
  now: Date,
  availabilityOverride?: ReturnType<typeof routeEffectiveAvailability>,
): RouteAssessment {
  const availability = availabilityOverride ?? routeEffectiveAvailability(route, now);
  const reasons: string[] = [];
  const tradeoffs: string[] = [];
  const missingEvidence: string[] = [];
  const unsupportedRequirements: string[] = [];
  let fit: RouteAssessment["fit"] = "strong";

  if (["conflict", "needs_review", "unknown"].includes(availability)) fit = "not_assessable";
  else if (availability === "unavailable") fit = "no_match";
  else if (availability !== "available") fit = "conditional";

  if (route.routeType === "native_l1_direct") {
    if (profile.bitcoinPathPreference === "open_to_sbtc" && profile.assetHeld === "sbtc") {
      unsupportedRequirements.push("This route requires native BTC on Bitcoin L1.");
      fit = "no_match";
    } else reasons.push("This route preserves principal on Bitcoin L1.");

    if (profile.participantType !== "unknown" && profile.participantType !== "either" && !route.participantTypes.includes(profile.participantType)) {
      unsupportedRequirements.push(`The route does not list ${profile.participantType} participants.`);
      fit = "no_match";
    }
    if (route.whitelist.required) {
      if (profile.whitelistStatus === "not_approved") {
        unsupportedRequirements.push("Allowlist approval is required.");
        fit = "no_match";
      } else if (profile.whitelistStatus !== "approved") {
        missingEvidence.push("Allowlist eligibility is not confirmed.");
        if (fit === "strong") fit = "conditional";
      }
    }

    const amount = amountFits(profile.amountSats, route.minimumSats, route.maximumSats);
    if (amount === "below" || amount === "above") {
      unsupportedRequirements.push("The amount is outside the direct route limits.");
      fit = "no_match";
    } else if (amount === "unknown") {
      missingEvidence.push("Amount is needed to check route limits.");
      if (fit === "strong") fit = "conditional";
    }

    if (route.pairedStx.required) {
      if (profile.stxAvailable === "no") {
        unsupportedRequirements.push("The route requires a paired STX position, but the user does not have STX available.");
        fit = "no_match";
      } else if (profile.stxAvailable !== "yes") {
        missingEvidence.push("STX availability is needed to satisfy the paired-STX requirement.");
        if (fit === "strong") fit = "conditional";
      } else reasons.push("The user reports STX is available for the paired-STX requirement.");
    }

    const lockDuration = bond.timing.lockDurationDays ?? bond.economics.referenceModel?.bondingPeriodDays;
    if (profile.timeHorizonDays && lockDuration && profile.timeHorizonDays < lockDuration) {
      if (bond.timing.lockDurationDays !== undefined) {
        unsupportedRequirements.push("The requested horizon is shorter than the bond lock.");
        fit = "no_match";
      } else {
        missingEvidence.push("The requested horizon is shorter than the published reference period, while final lock duration remains unconfirmed.");
        if (fit === "strong") fit = "conditional";
      }
    }
    if (profile.liquidityNeed === "access_anytime") {
      unsupportedRequirements.push("Continuous liquidity conflicts with the native-L1 timelock.");
      fit = "no_match";
    }
    if (profile.liquidityNeed === "may_need_early_exit" && route.earlyExit.status !== "supported") {
      if (route.earlyExit.status === "unsupported") {
        unsupportedRequirements.push("A usable bond-specific early-exit flow is not supported.");
        fit = "no_match";
      } else {
        missingEvidence.push("A usable bond-specific early-exit flow is not confirmed.");
        if (fit === "strong") fit = "conditional";
      }
    }
    if (profile.goal === "borrow_without_selling") {
      unsupportedRequirements.push("No borrowing capability is verified for the locked native-L1 position.");
      fit = "no_match";
    }
    if (profile.keyControlPreference === "self_controlled" && route.keyControl === "unknown") {
      missingEvidence.push("Participant-controlled maturity key support is not confirmed.");
      if (fit === "strong") fit = "conditional";
    }
    if (profile.keyControlPreference === "custodian" && route.keyControl === "participant") {
      unsupportedRequirements.push("The route requires participant-controlled maturity keys.");
      fit = "no_match";
    }

    const viableCustodyPaths = custodyPaths.filter((path) =>
      path.status === "available" &&
      route.custodyPathIds.includes(path.id) &&
      isReviewCurrent(path.attestation.reviewedAt, now, path.attestation.reviewCadenceDays)
    );
    if (viableCustodyPaths.length === 0) {
      missingEvidence.push("No current approved custody path is available for this direct route.");
      if (fit !== "no_match") fit = "not_assessable";
    }
    const requestedCustody = profile.walletOrCustodian?.toLowerCase();
    if (requestedCustody) {
      const path = custodyPaths.find((item) => item.id.toLowerCase() === requestedCustody || item.name.toLowerCase() === requestedCustody);
      const current = path && isReviewCurrent(path.attestation.reviewedAt, now, path.attestation.reviewCadenceDays);
      if (path && current && path.status === "not_currently_supported") {
        unsupportedRequirements.push(`${path.name} is currently confirmed as unsupported for this route.`);
        fit = "no_match";
      } else if (!path || path.status !== "available" || !route.custodyPathIds.includes(path.id) || !current) {
        missingEvidence.push(`${profile.walletOrCustodian} is not a current approved custody path for this route.`);
        if (fit === "strong") fit = "conditional";
      } else reasons.push(`${path.name} is a current approved custody path.`);
    } else {
      missingEvidence.push("A viable wallet or custodian has not been selected.");
      if (fit === "strong") fit = "conditional";
    }
    tradeoffs.push("BTC is timelocked on L1 and paired STX may be required.");
  } else {
    if (profile.bitcoinPathPreference === "bitcoin_l1_only") {
      unsupportedRequirements.push("This route requires sBTC exposure on Stacks.");
      fit = "no_match";
    }
    if (profile.assetHeld === "btc_l1") {
      missingEvidence.push("The user would need to obtain sBTC; that conversion is outside this read-only plan.");
      if (fit === "strong") fit = "conditional";
    }
    if (route.investorInputs === "sbtc_and_stx") {
      tradeoffs.push("The pool requires both sBTC and STX inputs.");
      if (profile.stxAvailable === "no") {
        unsupportedRequirements.push("The user does not have the STX input required by this pool.");
        fit = "no_match";
      } else if (profile.stxAvailable !== "yes") {
        missingEvidence.push("STX availability is needed for this pool's investor inputs.");
        if (fit === "strong") fit = "conditional";
      }
    } else reasons.push("The pool accepts sBTC without a participant-supplied STX input.");

    const amount = amountFits(profile.amountSats, route.minimumSats, route.capacitySats);
    if (amount === "below" || amount === "above") {
      unsupportedRequirements.push("The amount is outside the pool limits.");
      fit = "no_match";
    }
    if (route.feeBps === undefined) missingEvidence.push("The pool fee is not published.");
    if (route.contracts.length === 0) missingEvidence.push("Deployed pool contracts are not published.");
    if (route.rewardAccounting.status !== "verified") missingEvidence.push("Pool reward accounting is not verified.");
    if (route.withdrawalTerms.status !== "verified") missingEvidence.push("Pool withdrawal timing and method are not verified.");
    if (missingEvidence.length > 0 && fit === "strong") fit = "conditional";

    if (profile.liquidityNeed === "access_anytime") {
      const liquid = route.lst?.productStatus === "production" &&
        route.lst.verification.includes("product_owner_confirmed") &&
        route.lst.redemption.status === "verified" &&
        route.lst.liquidityEvidence.status === "verified" &&
        isReviewCurrent(route.lst.attestation.reviewedAt, now, route.lst.attestation.reviewCadenceDays);
      if (!liquid) {
        missingEvidence.push("The optional LST does not have current verified redemption and market-liquidity evidence.");
        if (fit === "strong") fit = "conditional";
      }
    }
    if (profile.goal === "borrow_without_selling") {
      const lstCurrent = route.lst?.productStatus === "production" &&
        route.lst.verification.includes("product_owner_confirmed") &&
        isReviewCurrent(route.lst.attestation.reviewedAt, now, route.lst.attestation.reviewCadenceDays);
      const lender = lstCurrent ? route.lst?.verifiedDefiIntegrations.find((item) => (item.capability === "borrowing" || item.capability === "lending") && item.status === "live" && item.collateralTerms) : undefined;
      if (!lender) {
        unsupportedRequirements.push("No named live lender with sourced collateral terms is verified.");
        fit = "no_match";
      }
    }
    tradeoffs.push("This route adds sBTC, pool operator, smart-contract, accounting, and withdrawal dependencies.");
  }

  return {
    bondId: bond.id,
    routeId: route.id,
    routeType: route.routeType,
    fit,
    effectiveAvailability: availability,
    reasons,
    tradeoffs,
    missingEvidence,
    unsupportedRequirements,
    nextDiligenceAction: route.routeType === "native_l1_direct"
      ? "Confirm allowlist eligibility and execute a custody-specific testnet lock and maturity-recovery rehearsal."
      : "Obtain the final pool fee, deployed contracts, accounting method, and verified withdrawal terms before depositing.",
  };
}

export function compareBondRoutes(
  bond: BondManifest,
  profile: ParticipantProfile,
  custody: CustodyPath[],
  now: Date,
  sources: SourceRef[],
  availabilityByRoute: Map<string, ReturnType<typeof routeEffectiveAvailability>> = new Map(),
) {
  const assessments = bond.participationRoutes.map((route) => assessRoute(bond, route, profile, custody, now, availabilityByRoute.get(route.id)));
  const rank = { strong: 0, conditional: 1, not_assessable: 2, no_match: 3 } as const;
  assessments.sort((a, b) => rank[a.fit] - rank[b.fit]);
  return {
    bondId: bond.id,
    profile,
    recommendedRouteId: assessments.find((item) => item.effectiveAvailability === "available" && (item.fit === "strong" || item.fit === "conditional"))?.routeId ?? null,
    assessments,
    dataStatus: "derived" as const,
    sources,
    assumptions: ["Product fit is not individualized financial advice.", "No transaction is constructed, signed, or broadcast."],
    verifiedAt: now.toISOString(),
  };
}
