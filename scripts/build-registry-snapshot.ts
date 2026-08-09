import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BondManifestV2Schema, ConciergeRegistryContentSchema, ConciergeRegistrySnapshotSchema, CustodyRegistrySchema } from "../src/core/schemas.js";
import { registryContentHash } from "../src/providers/registry-store.js";

const root = resolve(import.meta.dirname, "..");
const reviewedAt = process.env.REGISTRY_REVIEWED_AT ?? "2026-08-09T00:00:00.000Z";
const publishedAt = process.env.REGISTRY_PUBLISHED_AT ?? reviewedAt;

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

const bonds = await Promise.all([
  "data/bonds/genesis-bond.json",
].map(async (path) => BondManifestV2Schema.parse(await json(path))));
const custody = CustodyRegistrySchema.parse(await json("data/custody-paths.json"));
const source = {
  id: "genesis-bond-owner-attestation",
  title: "Stacks Labs Genesis Bond owner attestation",
  sourceType: "owner_attestation" as const,
  dataStatus: "published" as const,
  retrievedAt: reviewedAt,
};
const stackingDaoZestSource = {
  id: "stackingdao-zest-vault-architecture",
  title: "StackingDAO and Zest Protocol stBTC vault architecture note",
  sourceType: "owner_attestation" as const,
  dataStatus: "published" as const,
  retrievedAt: reviewedAt,
};
const institutionalAccessSource = {
  id: "stacks-institutional-bitcoin-staking-access",
  title: "Stacks Institutional Bitcoin Staking access page",
  url: "https://www.stacks.co/institutional-bitcoin-staking",
  sourceType: "official_docs" as const,
  dataStatus: "published" as const,
};
const stakingApplicationSource = {
  id: "staking-application-owner-attestation",
  title: "Stacks Bitcoin Staking application destination owner attestation",
  sourceType: "owner_attestation" as const,
  dataStatus: "published" as const,
  retrievedAt: reviewedAt,
};
const attestation = {
  scope: "Genesis Bond product identity and corrected PoX-5 period mapping",
  ownerOrganization: "Stacks Labs",
  reviewedAt,
  reviewCadenceDays: 7 as const,
  sourceIds: [source.id],
};
const content = ConciergeRegistryContentSchema.parse({
  schemaVersion: 3,
  reviewedAt,
  reviewCadenceDays: 7,
  bonds,
  custody,
  facts: [
    {
      id: "genesis-bond-product",
      title: "Genesis Bond",
      summary: "The Genesis Bond uses PoX-5 bond period 1. Its eligible reward cycle and burn height are derived from live protocol state.",
      aliases: [],
      tags: ["genesis", "bond", "pox-5"],
      relatedIds: ["genesis-bond"],
      category: "product",
      status: "in_progress",
      effectiveAt: reviewedAt,
      sourceIds: [source.id],
      attestation,
    },
    {
      id: "stackingdao-stbtc",
      title: "StackingDAO stBTC",
      summary: "StackingDAO is developing stBTC as an sBTC-backed liquid-staking token for PoX-5. The design includes a withdrawal buffer and a cooldown path, with final contracts, fees, and redemption parameters still pending.",
      aliases: ["stbtc"],
      tags: ["stackingdao", "stbtc", "lst", "sbtc"],
      relatedIds: ["genesis-bond", "genesis-sbtc-pool"],
      category: "product",
      status: "in_progress",
      effectiveAt: reviewedAt,
      sourceIds: [stackingDaoZestSource.id],
      attestation: {
        scope: "StackingDAO stBTC product design",
        ownerOrganization: "StackingDAO and Zest Protocol",
        reviewedAt,
        reviewCadenceDays: 7,
        sourceIds: [stackingDaoZestSource.id],
      },
    },
    {
      id: "institutional-bitcoin-staking-access",
      title: "Register your interest in Bitcoin Staking",
      summary: "Register your interest at https://www.stacks.co/institutional-bitcoin-staking. Submitting the form connects you with the Stacks team. They will follow up to guide you through onboarding and the next allocation steps.",
      aliases: ["bitcoin-staking-interest-form", "institutional-access-request"],
      tags: ["bitcoin-staking", "institutional", "access", "interest", "signup", "onboarding"],
      relatedIds: ["genesis-bond", "genesis-native-l1-direct"],
      category: "product",
      status: "available",
      effectiveAt: reviewedAt,
      sourceIds: [institutionalAccessSource.id],
      attestation: {
        scope: "Current Institutional Bitcoin Staking access request",
        ownerOrganization: "Stacks Labs",
        reviewedAt,
        reviewCadenceDays: 7,
        sourceIds: [institutionalAccessSource.id],
      },
    },
    {
      id: "bitcoin-staking-application",
      title: "Bitcoin Staking landing page and application",
      summary: "If you are interested in accessing the Bitcoin Staking application, you will be able to visit https://staking.stacks.co.",
      aliases: ["staking-stacks-co"],
      tags: ["bitcoin-staking", "application", "landing-page", "planned"],
      relatedIds: ["genesis-bond"],
      category: "product",
      status: "planned",
      effectiveAt: reviewedAt,
      sourceIds: [stakingApplicationSource.id],
      attestation: {
        scope: "Planned Bitcoin Staking landing page and application destination",
        ownerOrganization: "Stacks Labs",
        reviewedAt,
        reviewCadenceDays: 7,
        sourceIds: [stakingApplicationSource.id],
      },
    },
  ],
  integrations: [{
    id: "zest-stbtc-borrowing",
    title: "Planned Zest Protocol stBTC borrowing and lending path",
    summary: "StackingDAO and Zest Protocol plan to support stBTC as collateral for sBTC borrowing and a leveraged stBTC yield vault. Interest rates, eligibility, final LTV, liquidation settings, oracle configuration, market depth, deployed contracts, and launch availability are not yet published.",
    aliases: ["zest-stbtc", "stbtc-zest"],
    tags: ["zest", "stackingdao", "stbtc", "borrowing", "lending", "planned"],
    relatedIds: ["genesis-bond", "genesis-sbtc-pool", "stackingdao-stbtc"],
    effectiveAt: reviewedAt,
    sourceIds: [stackingDaoZestSource.id],
    attestation: {
      scope: "Planned Zest Protocol support for StackingDAO stBTC",
      ownerOrganization: "StackingDAO and Zest Protocol",
      reviewedAt,
      reviewCadenceDays: 7,
      sourceIds: [stackingDaoZestSource.id],
    },
    partnerId: "zest-protocol",
    productId: "stackingdao-stbtc",
    role: "planned stBTC collateral, sBTC borrowing, and yield-vault infrastructure",
    network: "mainnet",
    status: "planned",
  }],
  sources: [source, stackingDaoZestSource, institutionalAccessSource, stakingApplicationSource],
});
const contentHash = registryContentHash(content);
const snapshot = ConciergeRegistrySnapshotSchema.parse({
  registryVersion: "3.0.0",
  reviewedAt,
  reviewCadenceDays: 7,
  reviewDueAt: new Date(new Date(reviewedAt).getTime() + 7 * 86_400_000).toISOString(),
  revision: `rev-${publishedAt.replace(/[-:.TZ]/g, "")}-${contentHash.slice(7, 19)}`,
  contentHash,
  publishedAt,
  publishedBy: process.env.REGISTRY_PUBLISHED_BY ?? "registry-bootstrap@stackslabs.com",
  content,
});
await writeFile(resolve(root, "data/registry-snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
