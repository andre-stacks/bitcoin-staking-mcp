import type { NextRequest } from "next/server";
import { assertMutationRequest, requirePublisher } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { publishDraft } from "../../../../lib/publication";
import { registryBackend } from "../../../../lib/store";

export async function POST(request: NextRequest) {
  try { const session = await requirePublisher(request); assertMutationRequest(request, session); return Response.json(await publishDraft(registryBackend(), session.email)); }
  catch (error) { return apiError(error); }
}
