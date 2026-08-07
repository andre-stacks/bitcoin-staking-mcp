export function apiError(error: unknown): Response {
  const status = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 400;
  return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
}
