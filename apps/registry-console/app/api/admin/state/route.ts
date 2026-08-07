import type { NextRequest } from "next/server";
import { requirePublisher } from "../../../../lib/auth";
import { apiError } from "../../../../lib/http";
import { seedSnapshot } from "../../../../lib/seed";
import { registryBackend } from "../../../../lib/store";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePublisher(request);
    const state = await registryBackend().readState();
    return Response.json({ session, ...state, editorContent: state.draft?.content ?? state.publishedSnapshot?.content ?? seedSnapshot.content }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
