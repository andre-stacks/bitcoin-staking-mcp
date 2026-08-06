import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BondManifestSchema, BondRegistrySchema, CustodyRegistrySchema, isReviewCurrent } from "../src/core/schemas.js";

const live = process.argv.includes("--live");
const root = resolve("data");
const index = BondRegistrySchema.parse(JSON.parse(await readFile(resolve(root, "bond-registry.json"), "utf8")));
const custody = CustodyRegistrySchema.parse(JSON.parse(await readFile(resolve(root, "custody-paths.json"), "utf8")));
const bonds = await Promise.all(index.bondFiles.map(async (name) => BondManifestSchema.parse(JSON.parse(await readFile(resolve(root, "bonds", name), "utf8")))));
const errors: string[] = [];
const freshnessIssues: string[] = [];
const now = new Date(process.env.BITCOIN_STAKING_REVIEW_NOW ?? Date.now());
if (Number.isNaN(now.getTime())) throw new Error("BITCOIN_STAKING_REVIEW_NOW must be a valid date-time when provided.");

if (new Set(bonds.map((bond) => bond.id)).size !== bonds.length) errors.push("Duplicate bond ID.");
if (!isReviewCurrent(index.reviewedAt, now, index.reviewCadenceDays)) freshnessIssues.push(`Bond registry is overdue: ${index.reviewedAt}.`);
if (!isReviewCurrent(custody.reviewedAt, now, custody.reviewCadenceDays)) freshnessIssues.push(`Custody registry is overdue: ${custody.reviewedAt}.`);
for (const bond of bonds) {
  if (!isReviewCurrent(bond.attestation.reviewedAt, now, bond.attestation.reviewCadenceDays)) freshnessIssues.push(`${bond.id} owner attestation is overdue: ${bond.attestation.reviewedAt}.`);
  for (const route of bond.participationRoutes) {
    if (!isReviewCurrent(route.attestation.reviewedAt, now, route.attestation.reviewCadenceDays)) freshnessIssues.push(`${bond.id}/${route.id} owner attestation is overdue: ${route.attestation.reviewedAt}.`);
    if (route.routeType === "sbtc_pool") {
      for (const contract of route.contracts) if (contract.network !== bond.network) errors.push(`${bond.id}/${route.id} contract ${contract.contractId} uses ${contract.network}, expected ${bond.network}.`);
      if (route.lst && !isReviewCurrent(route.lst.attestation.reviewedAt, now, route.lst.attestation.reviewCadenceDays)) freshnessIssues.push(`${bond.id}/${route.id}/${route.lst.tokenSymbol} owner attestation is overdue: ${route.lst.attestation.reviewedAt}.`);
    }
  }
}
for (const path of custody.paths) if (!isReviewCurrent(path.attestation.reviewedAt, now, path.attestation.reviewCadenceDays)) freshnessIssues.push(`Custody path ${path.id} owner attestation is overdue: ${path.attestation.reviewedAt}.`);
const genesis = bonds.find((bond) => bond.id === "genesis-bond-cycle-142");
if (!genesis) errors.push("Genesis Bond is missing.");
else {
  const types = genesis.participationRoutes.map((route) => route.routeType);
  if (types.length !== 2 || types[0] !== "native_l1_direct" || types[1] !== "sbtc_pool") errors.push("Genesis Bond must expose exactly native_l1_direct and sbtc_pool routes.");
  const pools = genesis.participationRoutes.filter((route) => route.routeType === "sbtc_pool");
  if (pools.length !== 1 || pools[0]?.poolOperator.id !== "stackingdao") errors.push("StackingDAO must be the only seeded pool.");
}

const sources = [...bonds.flatMap((bond) => bond.sources), ...custody.sources];
if (live) {
  errors.push(...freshnessIssues);
  for (const source of new Map(sources.map((item) => [item.url, item])).values()) {
    if (source.sourceType === "public_manifest" || source.sourceType === "demo_manifest") continue; // The checked-in file itself is validated locally before it can exist at the release URL.
    try {
      let response = await fetch(source.url, { method: "HEAD", headers: { "User-Agent": "bitcoin-staking-mcp-registry-review/0.3.0" }, signal: AbortSignal.timeout(15_000) });
      if (response.status === 405) response = await fetch(source.url, { method: "GET", headers: { "User-Agent": "bitcoin-staking-mcp-registry-review/0.3.0" }, signal: AbortSignal.timeout(15_000) });
      if (response.status < 200 || response.status >= 400) errors.push(`${source.id} returned HTTP ${response.status}.`);
    } catch (error) { errors.push(`${source.id} is unreachable: ${error instanceof Error ? error.message : String(error)}`); }
  }
}

process.stdout.write(`${JSON.stringify({ registryVersion: index.registryVersion, bonds: bonds.length, custodyPaths: custody.paths.length, sourceCount: sources.length, freshness: freshnessIssues.length ? "review_required" : "current" }, null, 2)}\n`);
if (!live && freshnessIssues.length) process.stderr.write(`${freshnessIssues.map((issue) => `- needs_review: ${issue}`).join("\n")}\n`);
if (errors.length) { process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`); process.exitCode = 1; }
