import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ConciergeRegistrySnapshotSchema, currentRecordStatus, isReviewCurrent } from "../src/core/schemas.js";
import { registryContentHash } from "../src/providers/registry-store.js";

const live = process.argv.includes("--live");
const errors: string[] = [];
const freshnessIssues: string[] = [];
const now = new Date(process.env.BITCOIN_STAKING_REVIEW_NOW ?? Date.now());
if (Number.isNaN(now.getTime())) throw new Error("BITCOIN_STAKING_REVIEW_NOW must be a valid date-time when provided.");

const bundledRaw = await readFile(resolve("data/registry-snapshot.json"), "utf8");
let snapshot = ConciergeRegistrySnapshotSchema.parse(JSON.parse(bundledRaw));
if (live) {
  const url = process.env.BITCOIN_STAKING_REGISTRY_URL || "https://bitcoin-staking-registry.vercel.app/api/v1/registry";
  try {
    const response = await fetch(url, { headers: { "User-Agent": "bitcoin-staking-mcp-registry-review/0.5.1" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    snapshot = ConciergeRegistrySnapshotSchema.parse(await response.json());
  } catch (error) {
    errors.push(`Live Vercel registry is unavailable or invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (snapshot.contentHash !== registryContentHash(snapshot.content)) errors.push("Registry content hash does not match canonical content.");
if (!isReviewCurrent(snapshot.reviewedAt, now, snapshot.reviewCadenceDays)) freshnessIssues.push(`Registry review is overdue: ${snapshot.reviewedAt}.`);
const genesis = snapshot.content.bonds.find((bond) => bond.id === "genesis-bond");
if (!genesis) errors.push("Genesis Bond is missing.");
else {
  if (genesis.onChainBondIndex !== 1) errors.push("Genesis Bond must store PoX-5 bond period/index 1.");
  if (genesis.timing.startsRewardCycle !== undefined || genesis.timing.scheduledLaunchDate !== undefined) errors.push("Genesis protocol cycle and calendar estimate must be derived rather than stored.");
  if (genesis.protocolTerms.unresolvedTerms.some((term) => /\bduration\b/i.test(term))) errors.push("Genesis must not treat the contract-fixed PoX-5 bond duration as unresolved.");
  if (!genesis.sources.some((source) => source.id === "pox5-release-contract")) errors.push("Genesis must cite the pinned PoX-5 contract for its fixed 12-cycle duration.");
  if (!genesis.aliases.includes("genesis-bond-cycle-142")) errors.push("Genesis legacy ID alias is missing.");
  const routeTypes = genesis.participationRoutes.map((route) => route.routeType);
  if (routeTypes.length !== 2 || routeTypes[0] !== "native_l1_direct" || routeTypes[1] !== "sbtc_pool") errors.push("Genesis must expose the two stable route types.");
}

const attestations = [
  ...snapshot.content.bonds.flatMap((bond) => [bond.attestation, ...bond.participationRoutes.flatMap((route) => [route.attestation, ...(route.routeType === "sbtc_pool" && route.lst ? [route.lst.attestation] : [])])]),
  ...snapshot.content.custody.paths.map((path) => path.attestation),
  ...snapshot.content.facts.map((fact) => fact.attestation),
  ...snapshot.content.integrations.map((integration) => integration.attestation),
];
for (const attestation of attestations) {
  if (new Date(attestation.reviewedAt).getTime() > now.getTime()) errors.push(`Future attestation: ${attestation.scope}.`);
  else if (!isReviewCurrent(attestation.reviewedAt, now, attestation.reviewCadenceDays)) freshnessIssues.push(`Owner attestation is overdue: ${attestation.scope}.`);
}
for (const fact of snapshot.content.facts) {
  if (fact.category === "announcement" && !fact.expiresAt) errors.push(`Temporary notice lacks expiresAt: ${fact.id}.`);
  void currentRecordStatus(fact, now); // Ensures the same effective-freshness path used by Scout remains parseable.
}

const sources = [...new Map([
  ...snapshot.content.sources,
  ...snapshot.content.custody.sources,
  ...snapshot.content.bonds.flatMap((bond) => bond.sources),
].map((source) => [source.id, source])).values()];
if (live) {
  errors.push(...freshnessIssues);
  for (const source of sources.filter((item) => item.url)) {
    try {
      let response = await fetch(source.url!, { method: "HEAD", headers: { "User-Agent": "bitcoin-staking-mcp-registry-review/0.5.1" }, signal: AbortSignal.timeout(15_000) });
      if (response.status === 405) response = await fetch(source.url!, { method: "GET", headers: { "User-Agent": "bitcoin-staking-mcp-registry-review/0.5.1" }, signal: AbortSignal.timeout(15_000) });
      if (response.status < 200 || response.status >= 400) errors.push(`${source.id} returned HTTP ${response.status}.`);
    } catch (error) { errors.push(`${source.id} is unreachable: ${error instanceof Error ? error.message : String(error)}`); }
  }
}

process.stdout.write(`${JSON.stringify({ revision: snapshot.revision, contentHash: snapshot.contentHash, bonds: snapshot.content.bonds.length, custodyPaths: snapshot.content.custody.paths.length, facts: snapshot.content.facts.length, integrations: snapshot.content.integrations.length, sourceCount: sources.length, freshness: freshnessIssues.length ? "review_required" : "current" }, null, 2)}\n`);
if (!live && freshnessIssues.length) process.stderr.write(`${freshnessIssues.map((issue) => `- needs_review: ${issue}`).join("\n")}\n`);
if (errors.length) { process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`); process.exitCode = 1; }
