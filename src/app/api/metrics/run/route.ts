export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Best-effort telemetry endpoint. The client intentionally ignores failures;
  // accept the event so production does not log noisy 404s when simulations run.
  await request.json().catch(() => null);
  return new Response(null, { status: 204 });
}
