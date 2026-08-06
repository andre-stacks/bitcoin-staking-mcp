import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ServiceError } from "../src/core/errors.js";
import type { BondManifest } from "../src/core/schemas.js";
import { ManifestStore } from "../src/providers/manifest-store.js";
import { StacksProvider } from "../src/providers/stacks.js";
import { BitcoinStakingService } from "../src/service.js";

class RecordingProvider extends StacksProvider {
  readonly bondReads: number[] = [];
  readonly participantReads: Array<{ address: string; bondId?: string }> = [];

  override async getOnChainBond(bondIndex: number): Promise<any> {
    this.bondReads.push(bondIndex);
    return {
      bondIndex,
      targetRateBps: 500,
      stxValueRatio: 1_000_000n,
      minUstxRatioBps: 8_000,
      earlyUnlockBytes: "00",
    };
  }

  override async getParticipantStatus(address: string, bond?: BondManifest): Promise<any> {
    this.participantReads.push({ address, ...(bond ? { bondId: bond.id } : {}) });
    const verifiedAt = "2026-08-06T19:00:00.000Z";
    return {
      address,
      network: this.networkName,
      requestedBondId: bond?.id ?? null,
      dataStatus: "live",
      sources: [this.sourceRef(verifiedAt)],
      assumptions: ["Test recording provider."],
      verifiedAt,
    };
  }
}

class SnapshotProvider extends RecordingProvider {
  override async getProtocolStatus(): Promise<any> {
    const verifiedAt = "2026-08-06T19:00:00.000Z";
    return { network: this.networkName, chainId: this.chainId, contractId: this.networkName === "mainnet" ? "SP000000000000000000002Q6VF78.pox-5" : "ST000000000000000000002AMW42H.pox-5", pox5Active: true, currentBurnchainBlockHeight: 1, dataStatus: "live", sources: [this.sourceRef(verifiedAt)], assumptions: ["Fixture."], verifiedAt };
  }
  override async listProtocolBonds(): Promise<any> {
    const verifiedAt = "2026-08-06T19:00:00.000Z";
    return { network: this.networkName, pox5Active: true, currentBurnchainBlockHeight: 1, scannedBondIndices: [0], bonds: [], dataStatus: "live", sources: [this.sourceRef(verifiedAt)], assumptions: ["Fixture."], verifiedAt };
  }
  override async getOnChainBond(): Promise<any> { return undefined; }
}

function publishedTestnetManifest() {
  return {
    schemaVersion: 1,
    id: "published-testnet-bond",
    title: "Published testnet bond",
    description: "Test fixture for network routing.",
    network: "testnet",
    onChainBondIndex: 3,
    lifecycleStatus: "upcoming",
    participationPath: "native_l1_btc",
    dataStatus: "published",
    timing: { lockDurationDays: 180 },
    economics: {
      targetRateBps: 500,
      managerFeeBps: 0,
      rewardAsset: "sBTC",
      rewardModel: "target_principal_rate",
    },
    capacity: {},
    requirements: {
      allowlistRequired: true,
      pairedStxRequired: true,
      pairedStxMinimumValueRatioBps: 500,
      btcLocation: "bitcoin_l1",
      keyControl: "unknown",
      borrowingAgainstPosition: "unknown",
      earlyExit: "unknown",
    },
    compatibility: [],
    notes: ["Published test fixture."],
    sources: [
      {
        id: "published-testnet-manifest",
        title: "Published testnet manifest",
        url: "https://example.com/published-testnet-manifest.json",
        sourceType: "public_manifest",
        dataStatus: "published",
      },
    ],
    verifiedAt: "2026-08-06T19:00:00.000Z",
  };
}

test("manifest-backed reads route to the manifest network and include live verification provenance", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "bitcoin-staking-manifests-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, "published-testnet-bond.json"),
    JSON.stringify(publishedTestnetManifest()),
    "utf8",
  );

  const mainnet = new RecordingProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" });
  const testnet = new RecordingProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" });
  const service = new BitcoinStakingService({
    manifests: new ManifestStore(directory),
    stacks: mainnet,
    testnetStacks: testnet,
    now: () => new Date("2026-08-06T19:00:00.000Z"),
  });

  const result = await service.getBond("published-testnet-bond");
  assert.deepEqual(mainnet.bondReads, []);
  assert.deepEqual(testnet.bondReads, [3]);
  assert.equal(result.onChainVerification.status, "found");
  assert.equal(result.onChainVerification.network, "testnet");
  assert.equal(result.onChainVerification.dataStatus, "live");
  assert.ok(result.sources.some((source) => source.id === "hiro-testnet-pox-api"));

  const participant = await service.checkParticipantStatus(
    "ST000000000000000000002AMW42H",
    "published-testnet-bond",
  );
  assert.equal(participant.network, "testnet");
  assert.equal(mainnet.participantReads.length, 0);
  assert.equal(testnet.participantReads[0]?.bondId, "published-testnet-bond");

  const defaultParticipant = await service.checkParticipantStatus("SP000000000000000000002Q6VF78");
  assert.equal(defaultParticipant.network, "mainnet");
  assert.equal(mainnet.participantReads.length, 1);
});

test("upstream HTTP failures return a typed retryable error", async (context) => {
  const server = createServer((_request, response) => {
    response.statusCode = 503;
    response.end("temporarily unavailable");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const provider = new StacksProvider({
    network: "testnet",
    apiBaseUrl: `http://127.0.0.1:${address.port}`,
    timeoutMs: 1_000,
  });
  await assert.rejects(
    provider.getProtocolStatus(),
    (error: unknown) =>
      error instanceof ServiceError && error.code === "UPSTREAM_ERROR" && error.retryable,
  );
});

test("participant network resolution rejects bond, request, and address conflicts plus invalid principals", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "bitcoin-staking-network-conflicts-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "published-testnet-bond.json"), JSON.stringify(publishedTestnetManifest()), "utf8");
  const mainnet = new RecordingProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" });
  const testnet = new RecordingProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" });
  const service = new BitcoinStakingService({ manifests: new ManifestStore(directory), stacks: mainnet, testnetStacks: testnet, now: () => new Date("2026-08-06T19:00:00.000Z") });

  await assert.rejects(service.checkParticipantStatus("SP000000000000000000002Q6VF78", "published-testnet-bond"), (error: unknown) => error instanceof ServiceError && error.code === "INVALID_INPUT" && /address-implied/.test(error.message));
  await assert.rejects(service.checkParticipantStatus("SP000000000000000000002Q6VF78", undefined, "testnet"), (error: unknown) => error instanceof ServiceError && error.code === "INVALID_INPUT" && /conflicts/.test(error.message));
  await assert.rejects(service.checkParticipantStatus("ST000000000000000000002AMW42H", "published-testnet-bond", "mainnet"), (error: unknown) => error instanceof ServiceError && error.code === "INVALID_INPUT" && /Bond network/.test(error.message));

  const validating = new BitcoinStakingService({ manifests: new ManifestStore(directory), stacks: new StacksProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" }), testnetStacks: testnet, now: () => new Date("2026-08-06T19:00:00.000Z") });
  await assert.rejects(validating.checkParticipantStatus("not-a-stacks-address"), (error: unknown) => error instanceof ServiceError && error.code === "INVALID_INPUT");
});

test("runtime conflict overrides a fresh owner claim in snapshot, bond detail, report, comparison, and plan", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "bitcoin-staking-runtime-conflict-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const bond = JSON.parse(await readFile(resolve("data/bonds/genesis-bond-cycle-142.json"), "utf8"));
  Object.assign(bond, { productStatus: "production", enrollmentStatus: "open" });
  Object.assign(bond.participationRoutes[0], { productStatus: "production", enrollmentStatus: "open" });
  bond.participationRoutes[0].enrollment.url = "https://example.com/enroll";
  await writeFile(join(directory, "bond.json"), JSON.stringify(bond), "utf8");
  const mainnet = new SnapshotProvider({ network: "mainnet", apiBaseUrl: "http://mainnet.invalid" });
  const testnet = new SnapshotProvider({ network: "testnet", apiBaseUrl: "http://testnet.invalid" });
  const service = new BitcoinStakingService({ manifests: new ManifestStore(directory), stacks: mainnet, testnetStacks: testnet, now: () => new Date("2026-08-06T19:00:00.000Z") });
  const profile = { goal: "earn_yield", assetHeld: "btc_l1", participantType: "institution", whitelistStatus: "approved", liquidityNeed: "lock_until_maturity", bitcoinPathPreference: "bitcoin_l1_only", keyControlPreference: "custodian", walletOrCustodian: "Leather", amountSats: "2500000000", stxAvailable: "yes" } as const;

  const snapshot = await service.getMarketSnapshot();
  assert.equal(snapshot.routes.find((route) => route.routeType === "native_l1_direct")?.effectiveAvailability, "conflict");
  const detail = await service.getBond("genesis-bond-cycle-142");
  assert.equal(detail.onChainReconciliation.status, "conflict");
  assert.equal(detail.bond.participationRoutes[0]?.effectiveAvailability, "conflict");
  assert.equal(detail.bond.participationRoutes[1]?.effectiveAvailability, "scheduled");
  const comparison = await service.compareStakingPaths(profile);
  assert.equal(comparison.recommendedRouteId, null);
  const plan = await service.buildParticipationPlan("genesis-bond-cycle-142", profile);
  assert.equal(plan.selectedRouteId, null);
  const report = await service.buildDiligenceReport({ bondId: "genesis-bond-cycle-142", routeId: "genesis-native-l1-direct", profile });
  assert.equal(report.operationalFit, "not_assessable");
  assert.equal(report.bondAvailability.onChainReconciliation[0]?.status, "conflict");
});
