import { BUBBLE_POLICY } from "@/lib/bubble/policy";
import { canAccessRoom, dbNowMs, getRoom, listMessages, seesAllMessages } from "@/lib/bubble/repo";
import { getViewer } from "@/lib/session";

// 늦게 커밋된 메시지를 놓치지 않도록 다음 요청 기준점을 조금 앞당긴다.
// 겹쳐서 온 메시지는 클라이언트가 id로 합친다.
const CURSOR_OVERLAP_MS = 10_000;

// 실시간 읽기: ?since=<cursor> 뒤에 생기거나 삭제된 메시지를 돌려준다.
// 지금은 클라이언트가 폴링하고, 나중에 같은 주소를 SSE로 바꿀 수 있다.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const viewer = await getViewer();
  if (!viewer) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { roomId } = await params;
  const room = await getRoom(roomId, viewer.id);
  if (!room || !canAccessRoom(room, viewer)) {
    return Response.json({ error: "이 대화방을 볼 수 없어요." }, { status: 403 });
  }

  const sinceParam = new URL(request.url).searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  if (since && Number.isNaN(since.getTime())) {
    return Response.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  // 기준점을 조회보다 먼저 잡아야 조회 중에 생긴 메시지를 다음 요청에서 받는다.
  const nowMs = await dbNowMs();
  const messages = await listMessages(room, viewer, BUBBLE_POLICY.deleteWindowMs, { since });
  return Response.json({
    messages,
    cursor: new Date(nowMs - CURSOR_OVERLAP_MS).toISOString(),
    status: room.status,
    // 참여 인원은 모든 메시지를 보는 사람(크리에이터, 관리자)의 머리글에만 쓴다.
    memberCount: seesAllMessages(room, viewer) ? room.member_count : null,
  });
}
