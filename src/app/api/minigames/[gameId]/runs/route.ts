import { GLOBAL_BOARD } from "@/lib/minigame/contract";
import { openRun, resolveMockPlayer } from "@/lib/minigame/mock-store";

export async function POST(request: Request, ctx: RouteContext<"/api/minigames/[gameId]/runs">) {
  const player = resolveMockPlayer(request);
  if (!player) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { gameId } = await ctx.params;
  return Response.json(openRun(gameId, GLOBAL_BOARD, player.id), { status: 201 });
}
