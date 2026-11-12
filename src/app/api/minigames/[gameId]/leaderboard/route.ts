import { GLOBAL_BOARD } from "@/lib/minigame/contract";
import { getLeaderboard } from "@/lib/minigame/mock-store";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/minigames/[gameId]/leaderboard">,
) {
  const { gameId } = await ctx.params;
  const board = new URL(request.url).searchParams.get("board") ?? GLOBAL_BOARD;
  return Response.json({ entries: getLeaderboard(gameId, board) });
}
