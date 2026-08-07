import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BondManifestV2Schema, ConciergeRegistryContentSchema, ConciergeRegistrySnapshotSchema, CustodyRegistrySchema } from "../src/core/schemas.js";
import { registryContentHash } from "../src/providers/registry-store.js";

const root = resolve(import.meta.dirname, "..");
const reviewedAt = process.env.REGISTRY_REVIEWED_AT ?? "2026-08-06T00:00:00.000Z";
const publishedAt = process.env.REGISTRY_PUBLISHED_AT ?? reviewedAt;

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

const bonds = await Promise.all([
  "data/bonds/genesis-bond.json",
  "data/bonds/demo-native-bitcoin-bond.json",
].map(async (path) => BondManifestV2Schema.parse(await json(path))));
const custody = CustodyRegistrySchema.parse(await json("data/custody-paths.json"));
const source = {
  id: "genesis-bond-owner-attestation",
  title: "Stacks Labs Genesis Bond owner attestation",
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
  facts: [{
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
  }],
  integrations: [],
  sources: [source],
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
