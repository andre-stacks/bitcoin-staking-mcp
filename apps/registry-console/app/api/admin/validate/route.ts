import type { NextRequest } from "next/server";
import { assertMutationRequest, requirePublisher } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { validatePublishableContent } from "../../../../lib/publication";

export async function POST(request: NextRequest) {
  try { const session = await requirePublisher(request); assertMutationRequest(request, session); const body = await request.json(); const content = validatePublishableContent(body.content); return Response.json({ valid: true, counts: { bonds: content.bonds.length, custody: content.custody.paths.length, facts: content.facts.length, integrations: content.integrations.length, sources: content.sources.length } }); }
  catch (error) { return apiError(error); }
}
