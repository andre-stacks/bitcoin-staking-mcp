import { ConciergeRegistrySnapshotSchema, isReviewCurrent, registryContentHash, reviewDueAt } from "bitcoin-staking-mcp";
import { registryBackend } from "../../../../lib/store";

export async function GET() {
  try {
    const state = await registryBackend().readState();
    if (!state.publishedSnapshot) return Response.json({ status: "unavailable", reason: "No registry snapshot has been published." }, { status: 503, headers: { "cache-control": "no-store" } });
    const snapshot = ConciergeRegistrySnapshotSchema.parse(state.publishedSnapshot);
    if (snapshot.contentHash !== registryContentHash(snapshot.content)) throw new Error("Published registry content hash mismatch.");
    const now = new Date();
    const fresh = isReviewCurrent(snapshot.reviewedAt, now, snapshot.reviewCadenceDays);
    return Response.json({ status: fresh ? "current" : "needs_review", revision: snapshot.revision, contentHash: snapshot.contentHash, publishedAt: snapshot.publishedAt, reviewedAt: snapshot.reviewedAt, reviewDueAt: reviewDueAt(snapshot.reviewedAt, snapshot.reviewCadenceDays), checkedAt: now.toISOString() }, { status: fresh ? 200 : 503, headers: { "cache-control": "public, max-age=0, s-maxage=60" } });
  } catch {
    return Response.json({ status: "unavailable", reason: "Published registry is invalid." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
