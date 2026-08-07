import type { NextRequest } from "next/server";
import { assertMutationRequest, requirePublisher } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { rollbackToRevision } from "../../../../lib/publication";
import { registryBackend } from "../../../../lib/store";

export async function POST(request: NextRequest) {
  try { const session = await requirePublisher(request); assertMutationRequest(request, session); const body = await request.json() as { revision?: string }; if (!body.revision) throw new Error("revision is required."); return Response.json(await rollbackToRevision(registryBackend(), body.revision, session.email)); }
  catch (error) { return apiError(error); }
}
