import { loadDock } from "@/lib/bubble/dock";
import { getViewer } from "@/lib/session";

// 미니룸 채팅 창의 처음 값: ?room=<미니룸 slug>. 이후 메시지는 /api/bubble/rooms/[roomId]/messages 로 폴링한다.
// 로그아웃해도 부른다 (방 주인 이름과 대화방이 열렸는지만 돌려준다).
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("room") ?? "";
  if (!slug) return Response.json({ error: "잘못된 요청이에요." }, { status: 400 });
  const dock = await loadDock(slug, await getViewer());
  if (!dock) return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404 });
  return Response.json(dock, { headers: { "cache-control": "no-store" } });
}
