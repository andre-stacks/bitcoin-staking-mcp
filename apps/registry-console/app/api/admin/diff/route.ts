import type { NextRequest } from "next/server";
import { requirePublisher } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { diffSummary } from "../../../../lib/publication";
import { registryBackend } from "../../../../lib/store";

export async function GET(request: NextRequest) {
  try { await requirePublisher(request); const state = await registryBackend().readState(); return Response.json(diffSummary(state.publishedSnapshot, state.draft), { headers: { "cache-control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
