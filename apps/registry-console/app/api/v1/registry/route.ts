import type { NextRequest } from "next/server";
import { ConciergeRegistrySnapshotSchema, registryContentHash } from "bitcoin-staking-mcp";
import { PUBLIC_PUBLISHER_IDENTITY } from "../../../../lib/publication";
import { registryBackend } from "../../../../lib/store";

function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").map((value) => value.trim()).some((value) => value === "*" || value === etag || value === `W/${etag}`);
}

export async function GET(request: NextRequest) {
  try {
    const state = await registryBackend().readState();
    if (!state.publishedSnapshot) return Response.json({ error: "No registry snapshot has been published." }, { status: 503, headers: { "cache-control": "no-store" } });
    const snapshot = ConciergeRegistrySnapshotSchema.parse(state.publishedSnapshot);
    if (snapshot.contentHash !== registryContentHash(snapshot.content)) throw new Error("Published registry content hash mismatch.");
    const etag = `"${snapshot.contentHash}"`;
    const headers = { etag, "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300", "content-type": "application/json" };
    if (matchesEtag(request.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });
    return new Response(JSON.stringify({ ...snapshot, publishedBy: PUBLIC_PUBLISHER_IDENTITY }), { status: 200, headers });
  } catch {
    return Response.json({ error: "Published registry is unavailable or invalid." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
