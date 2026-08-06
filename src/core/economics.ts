import { ServiceError } from "./errors.js";
import type { BondManifest, SourceRef } from "./schemas.js";

export interface YieldSimulationInput {
  principalSats: string;
  durationDays?: number | undefined;
  annualRateBps?: number | undefined;
  feeBps?: number | undefined;
  btcPriceUsd?: number | undefined;
  stxPriceScenariosUsd?: number[] | undefined;
}

export interface YieldSimulation {
  bondId: string;
  principalSats: string;
  durationDays: number;
  annualRateBps: number;
  feeBps: number;
  rewardAsset: BondManifest["economics"]["rewardAsset"];
  rewardModel: BondManifest["economics"]["rewardModel"];
  grossRewardSats?: string;
  feeSats?: string;
  netRewardSats?: string;
  netRewardUnits?: string;
  annualizedNetRateBps?: number;
  priceScenarios: Array<{
    btcPriceUsd?: number;
    stxPriceUsd?: number;
    estimatedRewardValueUsd?: number;
    note: string;
  }>;
  dataStatus: "derived";
  sources: SourceRef[];
  assumptions: string[];
  verifiedAt: string;
}

const BPS_DENOMINATOR = 10_000n;
const DAYS_PER_YEAR = 365n;

function parsePositiveSats(value: string): bigint {
  const sats = BigInt(value);
  if (sats <= 0n) throw new ServiceError("INVALID_INPUT", "principalSats must be greater than zero.");
  return sats;
}

export function simulateYield(bond: BondManifest, input: YieldSimulationInput): YieldSimulation {
  const principalSats = parsePositiveSats(input.principalSats);
  const durationDays = input.durationDays ?? bond.timing.lockDurationDays;
  const annualRateBps = input.annualRateBps ?? bond.economics.targetRateBps;
  const feeBps = input.feeBps ?? bond.economics.managerFeeBps ?? 0;

  if (!durationDays || !annualRateBps) {
    throw new ServiceError(
      "INSUFFICIENT_DATA",
      "A duration and annual rate are required. Supply explicit assumptions or use a bond that publishes them.",
    );
  }
  if (durationDays <= 0 || !Number.isInteger(durationDays)) {
    throw new ServiceError("INVALID_INPUT", "durationDays must be a positive whole number.");
  }
  if (annualRateBps < 0 || !Number.isInteger(annualRateBps)) {
    throw new ServiceError("INVALID_INPUT", "annualRateBps must be a non-negative whole number.");
  }
  if (feeBps < 0 || feeBps > 10_000 || !Number.isInteger(feeBps)) {
    throw new ServiceError("INVALID_INPUT", "feeBps must be a whole number between 0 and 10000.");
  }
  if (bond.economics.rewardModel === "unknown") {
    throw new ServiceError("INSUFFICIENT_DATA", "The bond does not define a reward model.");
  }

  const assumptions = [
    "This is deterministic scenario analysis, not a price or yield forecast.",
    "The calculation uses simple, non-compounding annualized yield and rounds down to the smallest reward unit.",
    `Annual rate ${annualRateBps} bps and fee ${feeBps} bps are ${
      input.annualRateBps !== undefined || input.feeBps !== undefined ? "explicit user assumptions where supplied" : "manifest values"
    }.`,
  ];

  const result: YieldSimulation = {
    bondId: bond.id,
    principalSats: principalSats.toString(),
    durationDays,
    annualRateBps,
    feeBps,
    rewardAsset: bond.economics.rewardAsset,
    rewardModel: bond.economics.rewardModel,
    priceScenarios: [],
    dataStatus: "derived",
    sources: bond.sources,
    assumptions,
    verifiedAt: new Date().toISOString(),
  };

  if (bond.economics.rewardModel === "fixed_reward_units") {
    if (!bond.economics.fixedRewardUnits || bond.economics.rewardAsset !== "STX") {
      throw new ServiceError(
        "INSUFFICIENT_DATA",
        "Fixed-unit reward modeling requires a published STX reward quantity.",
      );
    }
    result.netRewardUnits = bond.economics.fixedRewardUnits;
    result.priceScenarios = (input.stxPriceScenariosUsd ?? []).map((stxPriceUsd) => ({
      stxPriceUsd,
      estimatedRewardValueUsd: Number(bond.economics.fixedRewardUnits) * stxPriceUsd,
      note: "STX price changes value, not the fixed reward-unit quantity.",
    }));
    return result;
  }

  if (bond.economics.rewardAsset !== "BTC" && bond.economics.rewardAsset !== "sBTC") {
    throw new ServiceError(
      "INSUFFICIENT_DATA",
      "A target-principal-rate model currently requires a BTC- or sBTC-denominated reward asset.",
    );
  }

  const grossRewardSats =
    (principalSats * BigInt(annualRateBps) * BigInt(durationDays)) / (BPS_DENOMINATOR * DAYS_PER_YEAR);
  const feeSats = (grossRewardSats * BigInt(feeBps)) / BPS_DENOMINATOR;
  const netRewardSats = grossRewardSats - feeSats;
  result.grossRewardSats = grossRewardSats.toString();
  result.feeSats = feeSats.toString();
  result.netRewardSats = netRewardSats.toString();
  result.annualizedNetRateBps = Math.floor((annualRateBps * (10_000 - feeBps)) / 10_000);

  const stxScenarios = input.stxPriceScenariosUsd?.length ? input.stxPriceScenariosUsd : [undefined];
  result.priceScenarios = stxScenarios.map((stxPriceUsd) => {
    const scenario: YieldSimulation["priceScenarios"][number] = {
      note:
        stxPriceUsd === undefined
          ? "No STX price assumption supplied."
          : "In this BTC-target demo model, changing STX price does not change BTC-denominated reward sats.",
    };
    if (input.btcPriceUsd !== undefined) {
      scenario.btcPriceUsd = input.btcPriceUsd;
      scenario.estimatedRewardValueUsd = (Number(netRewardSats) / 100_000_000) * input.btcPriceUsd;
    }
    if (stxPriceUsd !== undefined) scenario.stxPriceUsd = stxPriceUsd;
    return scenario;
  });

  return result;
}
