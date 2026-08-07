import type { NextRequest } from "next/server";
import { ConciergeRegistrySnapshotSchema } from "bitcoin-staking-mcp";
import { registryBackend } from "../../../../lib/store";

export async function GET(request: NextRequest) {
  const state = await registryBackend().readState();
  if (!state.publishedSnapshot) return Response.json({ error: "No registry snapshot has been published." }, { status: 503, headers: { "cache-control": "no-store" } });
  const snapshot = ConciergeRegistrySnapshotSchema.parse(state.publishedSnapshot);
  const etag = `"${snapshot.contentHash}"`;
  const headers = { etag, "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300", "content-type": "application/json" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(JSON.stringify(snapshot), { status: 200, headers });
}
