import {
  ConciergeRegistryContentSchema,
  ConciergeRegistrySnapshotSchema,
  registryContentHash,
  type ConciergeRegistryContent,
  type ConciergeRegistrySnapshot,
} from "bitcoin-staking-mcp";
import type { RegistryBackend, RegistryDraft, RevisionEntry } from "./store";

function jsonObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Draft content must be a JSON object.");
  return input as Record<string, unknown>;
}

function draftContent(input: unknown): Record<string, unknown> {
  const content = jsonObject(input);
  for (const section of ["bonds", "facts", "integrations", "sources"] as const) {
    if (!Array.isArray(content[section])) throw new Error(`Draft ${section} must be an array.`);
  }
  if (!content.custody || typeof content.custody !== "object" || Array.isArray(content.custody)) throw new Error("Draft custody must be an object.");
  if (typeof content.reviewedAt !== "string") throw new Error("Draft reviewedAt must be a string.");
  return content;
}

function sectionValue(input: unknown, section: "bonds" | "facts" | "integrations" | "sources" | "custody"): unknown {
  const content = jsonObject(input);
  if (section !== "custody") return content[section] ?? [];
  return content.custody && typeof content.custody === "object" && !Array.isArray(content.custody)
    ? (content.custody as Record<string, unknown>).paths ?? []
    : undefined;
}

function sectionCount(value: unknown): number | null { return Array.isArray(value) ? value.length : null; }

interface DiffSection { before: number; after: number | null; changed: boolean }
export interface RegistryDiff { changed: boolean; sections: Partial<Record<"bonds" | "facts" | "integrations" | "sources" | "custody", DiffSection>>; message?: string }

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
  if (new Date(content.reviewedAt).getTime() > now.getTime()) throw new Error("Future registry review timestamp is not publishable.");
  for (const attestation of attestations(content)) {
    if (new Date(attestation.reviewedAt).getTime() > now.getTime()) throw new Error(`Future owner attestation is not publishable: ${attestation.scope}`);
  }
  return content;
}

export function createSnapshot(contentInput: unknown, now = new Date()): ConciergeRegistrySnapshot {
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
    publishedBy: "Stacks Labs registry team",
    content,
  });
}

async function archiveIdempotently(backend: RegistryBackend, snapshot: ConciergeRegistrySnapshot): Promise<string> {
  try {
    return await backend.archive(snapshot);
  } catch (archiveError) {
    const pathname = `revisions/${snapshot.revision}.json`;
    try {
      const existing = ConciergeRegistrySnapshotSchema.parse(await backend.readRevision(pathname));
      if (JSON.stringify(existing) === JSON.stringify(snapshot)) return pathname;
    } catch {
      // Preserve the original archive failure when the object does not exist or is invalid.
    }
    throw archiveError;
  }
}

export function diffSummary(current: ConciergeRegistrySnapshot | null, draft: RegistryDraft | null): RegistryDiff {
  if (!draft) return { changed: false, sections: {}, message: "No saved draft." };
  const previous = current?.content;
  const sections = Object.fromEntries((["bonds", "facts", "integrations", "sources"] as const).map((section) => {
    const before = previous?.[section] ?? [];
    const after = sectionValue(draft.content, section);
    return [section, { before: before.length, after: sectionCount(after), changed: JSON.stringify(before) !== JSON.stringify(after) }];
  })) as Record<"bonds" | "facts" | "integrations" | "sources", DiffSection>;
  const custodyBefore = previous?.custody.paths ?? [];
  const custodyAfter = sectionValue(draft.content, "custody");
  return { changed: !previous || JSON.stringify(previous) !== JSON.stringify(draft.content), sections: { ...sections, custody: { before: custodyBefore.length, after: sectionCount(custodyAfter), changed: JSON.stringify(custodyBefore) !== JSON.stringify(custodyAfter) } } };
}

export async function saveDraft(backend: RegistryBackend, input: unknown, publisher: string, now = new Date()): Promise<RegistryDraft> {
  const content = structuredClone(draftContent(input));
  const draft = { content, savedAt: now.toISOString(), savedBy: publisher };
  await backend.writeItems({ draft });
  return draft;
}

export async function discardDraft(backend: RegistryBackend): Promise<void> { await backend.writeItems({ draft: null }); }

async function publishContent(
  backend: RegistryBackend,
  state: Awaited<ReturnType<RegistryBackend["readState"]>>,
  content: unknown,
  publisher: string,
  now: Date,
) {
  const snapshot = createSnapshot(content, now);
  const priorRevision = state.publishedSnapshot && !state.revisions.some((item) => item.revision === state.publishedSnapshot?.revision)
    ? {
        revision: state.publishedSnapshot.revision,
        contentHash: state.publishedSnapshot.contentHash,
        publishedAt: state.publishedSnapshot.publishedAt,
        publishedBy: state.publishedSnapshot.publishedBy,
        blobPathname: await archiveIdempotently(backend, state.publishedSnapshot),
      }
    : null;
  const blobPathname = await archiveIdempotently(backend, snapshot);
  const revision: RevisionEntry = { revision: snapshot.revision, contentHash: snapshot.contentHash, publishedAt: snapshot.publishedAt, publishedBy: publisher, blobPathname };
  const revisions = [revision, ...(priorRevision ? [priorRevision] : []), ...state.revisions]
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.revision === entry.revision) === index);
  await backend.writeItems({ publishedSnapshot: snapshot, publicationMetadata: revision, revisionIndex: revisions, draft: null });
  return { snapshot, revision };
}

export async function publishDraft(backend: RegistryBackend, publisher: string, now = new Date()) {
  const state = await backend.readState();
  if (!state.draft) throw new Error("No saved draft to publish.");
  return publishContent(backend, state, state.draft.content, publisher, now);
}

export async function rollbackToRevision(backend: RegistryBackend, revisionId: string, publisher: string, now = new Date()) {
  const state = await backend.readState();
  const revision = state.revisions.find((item) => item.revision === revisionId);
  if (!revision) throw new Error(`Unknown revision: ${revisionId}`);
  const prior = ConciergeRegistrySnapshotSchema.parse(await backend.readRevision(revision.blobPathname));
  // Rollback must be a single Global Config mutation. Global Config reads are
  // eventually consistent, so saving a draft and immediately rereading it can
  // observe the pre-write state and fail even though the draft write succeeded.
  return publishContent(backend, state, prior.content, publisher, new Date(now.getTime() + 1));
}
