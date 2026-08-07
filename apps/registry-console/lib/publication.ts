import {
  ConciergeRegistryContentSchema,
  ConciergeRegistrySnapshotSchema,
  registryContentHash,
  type ConciergeRegistryContent,
  type ConciergeRegistrySnapshot,
} from "bitcoin-staking-mcp";
import type { RegistryBackend, RegistryDraft, RevisionEntry } from "./store";

function attestations(content: ConciergeRegistryContent) {
  return [
    ...content.bonds.flatMap((bond) => [bond.attestation, ...bond.participationRoutes.flatMap((route) => [route.attestation, ...(route.routeType === "sbtc_pool" && route.lst ? [route.lst.attestation] : [])])]),
    ...content.custody.paths.map((path) => path.attestation),
    ...content.facts.map((fact) => fact.attestation),
    ...content.integrations.map((integration) => integration.attestation),
  ];
}

export function validatePublishableContent(input: unknown, now = new Date()): ConciergeRegistryContent {
  const content = ConciergeRegistryContentSchema.parse(input);
  for (const attestation of attestations(content)) {
    if (new Date(attestation.reviewedAt).getTime() > now.getTime()) throw new Error(`Future owner attestation is not publishable: ${attestation.scope}`);
  }
  return content;
}

export function createSnapshot(contentInput: unknown, publisher: string, now = new Date()): ConciergeRegistrySnapshot {
  const content = validatePublishableContent(contentInput, now);
  const contentHash = registryContentHash(content);
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "");
  return ConciergeRegistrySnapshotSchema.parse({
    registryVersion: "3.0.0",
    reviewedAt: content.reviewedAt,
    reviewCadenceDays: content.reviewCadenceDays,
    reviewDueAt: new Date(new Date(content.reviewedAt).getTime() + content.reviewCadenceDays * 86_400_000).toISOString(),
    revision: `rev-${stamp}-${contentHash.slice(7, 19)}`,
    contentHash,
    publishedAt: now.toISOString(),
    publishedBy: publisher,
    content,
  });
}

export function diffSummary(current: ConciergeRegistrySnapshot | null, draft: RegistryDraft | null) {
  if (!draft) return { changed: false, sections: {}, message: "No saved draft." };
  const previous = current?.content;
  const sections = Object.fromEntries((["bonds", "facts", "integrations", "sources"] as const).map((section) => {
    const before = previous?.[section] ?? [];
    const after = draft.content[section];
    return [section, { before: before.length, after: after.length, changed: JSON.stringify(before) !== JSON.stringify(after) }];
  }));
  const custodyBefore = previous?.custody.paths ?? [];
  const custodyAfter = draft.content.custody.paths;
  return { changed: !previous || JSON.stringify(previous) !== JSON.stringify(draft.content), sections: { ...sections, custody: { before: custodyBefore.length, after: custodyAfter.length, changed: JSON.stringify(custodyBefore) !== JSON.stringify(custodyAfter) } } };
}

export async function saveDraft(backend: RegistryBackend, input: unknown, publisher: string, now = new Date()): Promise<RegistryDraft> {
  const content = ConciergeRegistryContentSchema.parse(input);
  const draft = { content, savedAt: now.toISOString(), savedBy: publisher };
  await backend.writeItems({ draft });
  return draft;
}

export async function discardDraft(backend: RegistryBackend): Promise<void> { await backend.writeItems({ draft: null }); }

export async function publishDraft(backend: RegistryBackend, publisher: string, now = new Date()) {
  const state = await backend.readState();
  if (!state.draft) throw new Error("No saved draft to publish.");
  const snapshot = createSnapshot(state.draft.content, publisher, now);
  const blobPathname = await backend.archive(snapshot);
  const revision: RevisionEntry = { revision: snapshot.revision, contentHash: snapshot.contentHash, publishedAt: snapshot.publishedAt, publishedBy: snapshot.publishedBy, blobPathname };
  const revisions = [revision, ...state.revisions].slice(0, 250);
  await backend.writeItems({ publishedSnapshot: snapshot, publicationMetadata: revision, revisionIndex: revisions, draft: null });
  return { snapshot, revision };
}

export async function rollbackToRevision(backend: RegistryBackend, revisionId: string, publisher: string, now = new Date()) {
  const state = await backend.readState();
  const revision = state.revisions.find((item) => item.revision === revisionId);
  if (!revision) throw new Error(`Unknown revision: ${revisionId}`);
  const prior = ConciergeRegistrySnapshotSchema.parse(await backend.readRevision(revision.blobPathname));
  await saveDraft(backend, prior.content, publisher, now);
  return publishDraft(backend, publisher, new Date(now.getTime() + 1));
}
