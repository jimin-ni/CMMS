import { resolveMockPlayer, submitScore, type SubmitOutcome } from "@/lib/minigame/mock-store";

const STATUS: Record<SubmitOutcome, number> = {
  ok: 201,
  not_found: 404,
  forbidden: 403,
  duplicate: 409,
};

export async function POST(request: Request, ctx: RouteContext<"/api/minigames/runs/[runId]/score">) {
  const player = resolveMockPlayer(request);
  if (!player) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { runId } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (body?.runId !== runId || !Number.isSafeInteger(body?.score) || body.score < 0) {
    return Response.json({ error: "invalid_result" }, { status: 400 });
  }

  const outcome = submitScore(runId, player.id, body.score);
  return Response.json({ outcome }, { status: STATUS[outcome] });
}
