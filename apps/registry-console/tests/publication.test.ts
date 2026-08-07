import assert from "node:assert/strict";
import test from "node:test";
import { ConciergeRegistryContentSchema } from "bitcoin-staking-mcp";
import { diffSummary, discardDraft, publishDraft, rollbackToRevision, saveDraft, validatePublishableContent } from "../lib/publication";
import { seedSnapshot } from "../lib/seed";
import type { RegistryBackend, RegistryState } from "../lib/store";

class MemoryBackend implements RegistryBackend {
  state: RegistryState = { publishedSnapshot: seedSnapshot, draft: null, revisions: [] };
  blobs = new Map<string, typeof seedSnapshot>();
  writes: Array<Record<string, unknown>> = [];
  async readState() { return structuredClone(this.state); }
  async writeItems(items: Record<string, unknown>) {
    this.writes.push(structuredClone(items));
    this.state = {
      ...this.state,
      ...(items.publishedSnapshot === undefined ? {} : { publishedSnapshot: items.publishedSnapshot }),
      ...(items.draft === undefined ? {} : { draft: items.draft }),
      ...(items.revisionIndex === undefined ? {} : { revisions: items.revisionIndex }),
    } as RegistryState;
  }
  async archive(snapshot: typeof seedSnapshot) { const path = `revisions/${snapshot.revision}.json`; if (this.blobs.has(path)) throw new Error("immutable collision"); this.blobs.set(path, snapshot); return path; }
  async readRevision(pathname: string) { const value = this.blobs.get(pathname); if (!value) throw new Error("missing"); return value; }
}

test("registry contract rejects malformed, duplicate, and missing-source records", () => {
  assert.equal(ConciergeRegistryContentSchema.safeParse({}).success, false);
  const duplicate = structuredClone(seedSnapshot.content);
  duplicate.facts.push({ ...duplicate.facts[0]!, id: duplicate.bonds[0]!.id });
  assert.equal(ConciergeRegistryContentSchema.safeParse(duplicate).success, false);
  const missing = structuredClone(seedSnapshot.content);
  missing.facts[0]!.sourceIds = ["missing-source"];
  assert.equal(ConciergeRegistryContentSchema.safeParse(missing).success, false);
});

test("temporary notices require expiry while expired notices remain valid historical data", () => {
  const content = structuredClone(seedSnapshot.content);
  content.facts.push({ ...content.facts[0]!, id: "temporary-notice", category: "announcement", status: "completed" });
  assert.equal(ConciergeRegistryContentSchema.safeParse(content).success, false);
  content.facts.at(-1)!.expiresAt = "2026-08-05T00:00:00.000Z";
  content.facts.at(-1)!.effectiveAt = "2026-08-01T00:00:00.000Z";
  assert.equal(ConciergeRegistryContentSchema.safeParse(content).success, true);
});

test("partner product roles are independently addressable and future attestations cannot publish", () => {
  const content = structuredClone(seedSnapshot.content);
  const base = { ...content.facts[0]!, id: "partner-product-custody", partnerId: "partner-a", productId: "genesis-bond", role: "custody", network: "mainnet" as const, status: "planned" as const };
  delete (base as Partial<typeof base>).category;
  content.integrations = [base, { ...base, id: "partner-product-signing", role: "signing" }];
  assert.equal(ConciergeRegistryContentSchema.safeParse(content).success, true);
  content.integrations.push({ ...base, id: "partner-product-custody-duplicate" });
  assert.equal(ConciergeRegistryContentSchema.safeParse(content).success, false);
  content.integrations.pop();
  content.integrations[0]!.attestation.reviewedAt = "2026-08-08T00:00:00.000Z";
  assert.throws(() => validatePublishableContent(content, new Date("2026-08-07T00:00:00.000Z")), /Future owner attestation/);
});

test("registry-wide IDs and related record references are unique and resolvable", () => {
  const duplicateRoute = structuredClone(seedSnapshot.content);
  duplicateRoute.facts[0]!.id = duplicateRoute.bonds[0]!.participationRoutes[0]!.id;
  assert.equal(ConciergeRegistryContentSchema.safeParse(duplicateRoute).success, false);
  const dangling = structuredClone(seedSnapshot.content);
  dangling.facts[0]!.relatedIds = ["missing-record"];
  assert.equal(ConciergeRegistryContentSchema.safeParse(dangling).success, false);
});

test("draft, validation, publish, diff, discard, and rollback preserve immutable history", async () => {
  const backend = new MemoryBackend();
  const changed = structuredClone(seedSnapshot.content);
  changed.facts[0]!.summary = "Updated without an MCP release.";
  await saveDraft(backend, changed, "publisher@stackslabs.com", new Date("2026-08-07T10:00:00.000Z"));
  assert.equal(diffSummary(seedSnapshot, backend.state.draft).changed, true);
  const first = await publishDraft(backend, "publisher@stackslabs.com", new Date("2026-08-07T10:01:00.000Z"));
  assert.equal(backend.state.draft, null);
  assert.equal(backend.state.publishedSnapshot?.content.facts[0]?.summary, "Updated without an MCP release.");
  assert.equal(backend.blobs.size, 2);
  assert.deepEqual(backend.state.revisions.map((entry) => entry.revision), [first.snapshot.revision, seedSnapshot.revision]);
  backend.writes = [];
  const rolled = await rollbackToRevision(backend, seedSnapshot.revision, "publisher@stackslabs.com", new Date("2026-08-07T10:02:00.000Z"));
  assert.notEqual(rolled.snapshot.revision, seedSnapshot.revision);
  assert.notEqual(rolled.snapshot.revision, first.snapshot.revision);
  assert.equal(backend.state.publishedSnapshot?.content.facts[0]?.summary, seedSnapshot.content.facts[0]?.summary);
  assert.equal(backend.blobs.size, 3);
  assert.equal(backend.writes.length, 1);
  assert.deepEqual(Object.keys(backend.writes[0]!).sort(), ["draft", "publicationMetadata", "publishedSnapshot", "revisionIndex"]);
  await saveDraft(backend, changed, "publisher@stackslabs.com"); await discardDraft(backend); assert.equal(backend.state.draft, null);
});

test("invalid work can be saved privately but cannot validate or publish", async () => {
  const backend = new MemoryBackend();
  const invalid = structuredClone(seedSnapshot.content);
  invalid.facts[0]!.sourceIds = ["source-still-being-added"];
  await saveDraft(backend, invalid, "publisher@stackslabs.com", new Date("2026-08-07T11:00:00.000Z"));
  assert.equal(backend.state.draft?.content && typeof backend.state.draft.content === "object", true);
  const diff = diffSummary(seedSnapshot, backend.state.draft);
  assert.equal(diff.sections.facts?.after, 1);
  assert.throws(() => validatePublishableContent(invalid, new Date("2026-08-07T11:01:00.000Z")));
  await assert.rejects(publishDraft(backend, "publisher@stackslabs.com", new Date("2026-08-07T11:02:00.000Z")));
  assert.equal(backend.state.publishedSnapshot?.revision, seedSnapshot.revision);
  assert.notEqual(backend.state.draft, null);
  assert.equal(backend.blobs.size, 0);
});
