import { BUBBLE_POLICY } from "@/lib/bubble/policy";
import { dbNowMs } from "@/lib/bubble/repo";
import { getChatFor, listChatMessages } from "@/lib/bubble/talk-repo";
import { getViewer } from "@/lib/session";

// 버블 대화방 읽기와 같은 규칙으로 기준점을 조금 앞당긴다. 겹친 메시지는 클라이언트가 id로 합친다.
const CURSOR_OVERLAP_MS = 10_000;

// 크리에이터 톡 실시간 읽기: ?since=<cursor> 뒤에 생기거나 삭제된 메시지를 돌려준다.
// 크리에이터이고 이 대화에 참여한 사람만 읽을 수 있다.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const viewer = await getViewer();
  if (!viewer) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { chatId } = await params;
  const chat = await getChatFor(chatId, viewer);
  if (!chat) {
    return Response.json({ error: "이 대화를 볼 수 없어요." }, { status: 403 });
  }

  const sinceParam = new URL(request.url).searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  if (since && Number.isNaN(since.getTime())) {
    return Response.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  const nowMs = await dbNowMs();
  const messages = await listChatMessages(chat.id, viewer, BUBBLE_POLICY.deleteWindowMs, { since });
  return Response.json({
    messages,
    cursor: new Date(nowMs - CURSOR_OVERLAP_MS).toISOString(),
    // 크리에이터 톡은 닫히지 않고, 참여 인원은 머리글에서 다시 그리지 않는다.
    status: "open",
    memberCount: null,
  });
}
