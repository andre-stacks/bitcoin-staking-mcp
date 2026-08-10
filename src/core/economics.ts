import { ServiceError } from "./errors.js";
import { btcAmountToSats } from "./schemas.js";
import type { BondManifest, ParticipationRoute } from "./schemas.js";

const MAX_BITCOIN_SUPPLY_SATS = 2_100_000_000_000_000n;

export interface YieldSimulationInput {
  principalSats?: string | undefined;
  principalBtc?: string | undefined;
  durationDays?: number | undefined;
  annualRateBps?: number | undefined;
  feeBps?: number | undefined;
  lstFeeBps?: number | undefined;
  btcPriceUsd?: number | undefined;
  stxPriceScenariosUsd?: number[] | undefined;
  includeLst?: boolean | undefined;
}

function satsToBtc(sats: bigint): string {
  const whole = sats / 100_000_000n;
  const fraction = (sats % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function roundToThree(value: number): number {
  return Number(value.toFixed(3));
}

function btcToThreeDecimals(sats: bigint): string {
  const roundedMilliBtc = (sats + 50_000n) / 100_000n;
  const whole = roundedMilliBtc / 1_000n;
  const fraction = (roundedMilliBtc % 1_000n).toString().padStart(3, "0");
  return `${whole}.${fraction}`;
}

function btcDisplay(sats: bigint): string {
  if (sats > 0n && sats < 100_000n) return "<0.001 BTC";
  return `${btcToThreeDecimals(sats)} BTC`;
}

export function selectDefaultRoute(bond: BondManifest): ParticipationRoute {
  const route =
    bond.participationRoutes.find((candidate) => candidate.routeType === "native_l1_direct") ??
    bond.participationRoutes[0];
  if (!route) throw new ServiceError("INSUFFICIENT_DATA", "The bond has no participation route.");
  return route;
}

export function simulateYield(bond: BondManifest, input: YieldSimulationInput): ReturnType<typeof calculateYield>;
export function simulateYield(
  bond: BondManifest,
  route: ParticipationRoute,
  input: YieldSimulationInput,
): ReturnType<typeof calculateYield>;
export function simulateYield(
  bond: BondManifest,
  routeOrInput: ParticipationRoute | YieldSimulationInput,
  maybeInput?: YieldSimulationInput,
) {
  const route = maybeInput ? (routeOrInput as ParticipationRoute) : selectDefaultRoute(bond);
  const input = maybeInput ?? (routeOrInput as YieldSimulationInput);
  return calculateYield(bond, route, input);
}

function calculateYield(bond: BondManifest, route: ParticipationRoute, input: YieldSimulationInput) {
  if ((input.btcPriceUsd !== undefined && (!Number.isFinite(input.btcPriceUsd) || input.btcPriceUsd <= 0)) ||
      input.stxPriceScenariosUsd?.some((price) => !Number.isFinite(price) || price <= 0)) {
    throw new ServiceError("INVALID_INPUT", "Price inputs must be finite positive numbers.");
  }
  let principalFromBtc: string | undefined;
  if (input.principalBtc) {
    try { principalFromBtc = btcAmountToSats(input.principalBtc); }
    catch (error) { throw new ServiceError("INVALID_INPUT", error instanceof Error ? error.message : String(error)); }
  }
  if (input.principalSats && principalFromBtc && input.principalSats !== principalFromBtc) throw new ServiceError("INVALID_INPUT", "principalSats and principalBtc disagree.");
  const principalValue = input.principalSats ?? principalFromBtc;
  if (!principalValue || !/^\d+$/.test(principalValue)) throw new ServiceError("INVALID_INPUT", "Provide principalSats or a BTC/sBTC decimal amount with at most eight decimal places.");
  const principal = BigInt(principalValue);
  if (principal <= 0n) {
    throw new ServiceError("INVALID_INPUT", "principalSats must be greater than zero.");
  }
  if (principal > MAX_BITCOIN_SUPPLY_SATS) {
    throw new ServiceError("INVALID_INPUT", "principal exceeds Bitcoin's maximum possible supply.");
  }
  const manifestDuration = bond.timing.lockDurationDays;
  const referenceModelDuration = bond.economics.referenceModel?.bondingPeriodDays;
  const durationDays = input.durationDays ?? manifestDuration ?? referenceModelDuration;
  const projectionPeriod =
    input.durationDays !== undefined
      ? ("specified_duration" as const)
      : manifestDuration !== undefined
        ? ("bond_duration" as const)
        : referenceModelDuration !== undefined
          ? ("reference_model_duration" as const)
          : ("missing" as const);
  const annualRateBps =
    input.annualRateBps ??
    bond.economics.targetRateBps ??
    bond.economics.referenceModel?.annualTargetRateBps;
  const sourcedRouteFee =
    route.routeType === "sbtc_pool" ? route.feeBps : bond.economics.managerFeeBps;
  const routeFeeBps = input.feeBps ?? sourcedRouteFee;
  if (input.includeLst && (route.routeType !== "sbtc_pool" || !route.lst)) throw new ServiceError("INVALID_INPUT", "includeLst requires an sBTC pool route with a published LST capability.");
  const lstFeeBps = route.routeType === "sbtc_pool" && input.includeLst ? input.lstFeeBps ?? route.lst?.feeBps : 0;

  if (durationDays === undefined || annualRateBps === undefined) {
    throw new ServiceError(
      "INSUFFICIENT_DATA",
      "Route economics are incomplete: duration and annual rate must be sourced or explicitly supplied.",
    );
  }
  if (
    !Number.isSafeInteger(durationDays) ||
    durationDays <= 0 ||
    !Number.isSafeInteger(annualRateBps) ||
    annualRateBps < 0 || annualRateBps > 100_000 ||
    (routeFeeBps !== undefined &&
      (!Number.isSafeInteger(routeFeeBps) || routeFeeBps < 0 || routeFeeBps > 10_000)) ||
    (lstFeeBps !== undefined &&
      (!Number.isSafeInteger(lstFeeBps) || lstFeeBps < 0 || lstFeeBps > 10_000))
  ) {
    throw new ServiceError("INVALID_INPUT", "Invalid duration, annual-rate, or fee input.");
  }
  const explicitTargetModel = input.durationDays !== undefined && input.annualRateBps !== undefined;
  if (!explicitTargetModel && (
    bond.economics.rewardModel !== "target_principal_rate" ||
    !["BTC", "sBTC"].includes(bond.economics.rewardAsset)
  )) {
    throw new ServiceError(
      "INSUFFICIENT_DATA",
      "This route does not expose a supported target-principal-rate model.",
    );
  }

  const gross =
    (principal * BigInt(annualRateBps) * BigInt(durationDays)) / (10_000n * 365n);
  const routeFee = routeFeeBps === undefined ? undefined : (gross * BigInt(routeFeeBps)) / 10_000n;
  const afterRouteFee = routeFee === undefined ? undefined : gross - routeFee;
  const lstFeeKnown =
    !input.includeLst || route.routeType !== "sbtc_pool" || !route.lst || lstFeeBps !== undefined;
  const lstFee =
    afterRouteFee === undefined || !lstFeeKnown
      ? undefined
      : (afterRouteFee * BigInt(lstFeeBps ?? 0)) / 10_000n;
  const net = afterRouteFee === undefined || lstFee === undefined ? undefined : afterRouteFee - lstFee;

  const pairedRatioBps =
    route.routeType === "native_l1_direct" ? route.pairedStx.minimumValueRatioBps : undefined;
  const pairedStxRequirement =
    pairedRatioBps === undefined
      ? null
      : (() => {
          const minimumBtcEquivalentSats = (principal * BigInt(pairedRatioBps)) / 10_000n;
          const scenarios =
            input.btcPriceUsd === undefined
              ? []
              : (input.stxPriceScenariosUsd ?? []).map((stxPriceUsd) => {
                  const requiredStxValueUsd =
                    (Number(principal) / 100_000_000) *
                    input.btcPriceUsd! *
                    (pairedRatioBps / 10_000);
                  return {
                    btcPriceUsd: input.btcPriceUsd!,
                    stxPriceUsd,
                    requiredStxValueUsd,
                    requiredStxUnits: roundToThree(requiredStxValueUsd / stxPriceUsd),
                    requiredStxUnitsDisplay: `${roundToThree(requiredStxValueUsd / stxPriceUsd).toFixed(3)} STX`,
                  };
                });
          return {
            minimumValueRatioBps: pairedRatioBps,
            minimumValueRatioPercent: pairedRatioBps / 100,
            minimumBtcEquivalentSats: minimumBtcEquivalentSats.toString(),
            minimumBtcEquivalent: satsToBtc(minimumBtcEquivalentSats),
            exactStxUnitsStatus:
              scenarios.length > 0
                ? ("scenario_calculated" as const)
                : ("price_inputs_required" as const),
            scenarios,
          };
        })();

  const assumptions = [
    "Simple non-compounding scenario; not a yield forecast or guarantee.",
    bond.economics.termsStatus === "reference_program_model"
      ? "The rate, STX ratio, and reference period come from the published public economic model, not final on-chain bond configuration."
      : "The rate comes from bond-specific terms or explicitly supplied scenario inputs.",
  ];
  if (projectionPeriod === "reference_model_duration") {
    assumptions.push(
      `The ${durationDays}-day period is the public model's ${bond.economics.referenceModel?.bondingPeriodCycles}-cycle reference period; ${bond.title}'s final configured duration remains pending.`,
    );
  }
  if (routeFeeBps === undefined || (input.includeLst && lstFeeBps === undefined)) {
    assumptions.push("Gross reward is projected from the sourced rate and duration; net reward remains unknown until every applicable fee is published.");
  }
  const priceScenarios = (input.stxPriceScenariosUsd ?? []).map((stxPriceUsd) => ({
    btcPriceUsd: input.btcPriceUsd ?? null,
    stxPriceUsd,
    estimatedRewardValueUsd:
      input.btcPriceUsd === undefined || net === undefined
        ? null
        : (Number(net) / 100_000_000) * input.btcPriceUsd,
    note: `The STX price scenario affects the paired-STX token estimate; it does not change the ${bond.economics.rewardAsset}-denominated reward.`,
  }));

  return {
    bondId: bond.id,
    routeId: route.id,
    principalSats: principal.toString(),
    principalBtc: satsToBtc(principal),
    durationDays,
    projectionPeriod,
    annualRateBps,
    feeBps: routeFeeBps ?? null,
    routeFeeBps: routeFeeBps ?? null,
    lstFeeBps: lstFeeBps ?? null,
    grossRewardSats: gross.toString(),
    grossRewardBtc: btcToThreeDecimals(gross),
    grossRewardBtcExact: satsToBtc(gross),
    grossRewardDisplay: btcDisplay(gross),
    feeSats: routeFee?.toString(),
    routeFeeSats: routeFee?.toString(),
    lstFeeSats: lstFee?.toString(),
    netRewardSats: net?.toString(),
    netRewardBtc: net === undefined ? undefined : btcToThreeDecimals(net),
    netRewardBtcExact: net === undefined ? undefined : satsToBtc(net),
    netRewardDisplay: net === undefined ? "Pending applicable fees" : btcDisplay(net),
    estimatedRewardValueUsd:
      input.btcPriceUsd === undefined || net === undefined
        ? null
        : (Number(net) / 100_000_000) * input.btcPriceUsd,
    priceScenarios,
    rewardAsset: bond.economics.rewardAsset,
    pairedStxRequirement,
    modelContext: bond.economics.referenceModel
      ? {
          ...bond.economics.referenceModel,
          sourceStatus: "reference_not_final_bond_terms" as const,
          grossRewardFormula:
            "floor(principal sats × annual target rate bps × duration days ÷ 10,000 ÷ 365)",
        }
      : null,
    availability:
      bond.economics.termsStatus === "reference_program_model"
        ? ("published_reference_model_scenario" as const)
        : ("published_terms_scenario" as const),
    inputDataStatus: bond.dataStatus,
    dataStatus: "derived" as const,
    sources: bond.sources.filter((source) =>
      route.sourceIds.includes(source.id) ||
      bond.economics.referenceModel?.sourceIds.includes(source.id),
    ),
    assumptions,
    verifiedAt: new Date().toISOString(),
  };
}
