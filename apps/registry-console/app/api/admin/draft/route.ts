import type { NextRequest } from "next/server";
import { assertMutationRequest, requirePublisher } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { discardDraft, saveDraft } from "../../../../lib/publication";
import { registryBackend } from "../../../../lib/store";

export async function PUT(request: NextRequest) {
  try { const session = await requirePublisher(request); assertMutationRequest(request, session); const body = await request.json(); return Response.json(await saveDraft(registryBackend(), body.content, session.email)); }
  catch (error) { return apiError(error); }
}
export async function DELETE(request: NextRequest) {
  try { const session = await requirePublisher(request); assertMutationRequest(request, session); await discardDraft(registryBackend()); return Response.json({ ok: true }); }
  catch (error) { return apiError(error); }
}
