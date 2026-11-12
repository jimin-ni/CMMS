import { NextResponse } from "next/server";
import { BUBBLE_POLICY, maxCharsFor, validateBody } from "@/lib/bubble/policy";
import { canSendInRoom, getRoom, recentMessagesForPreview } from "@/lib/bubble/repo";
import { previewReaction } from "@/lib/bubble/ai-preview";
import { getPersona } from "@/lib/creator/profile";
import { getViewer } from "@/lib/session";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { roomId, draft } = (await request.json().catch(() => ({}))) as {
    roomId?: string;
    draft?: string;
  };
  if (!roomId || typeof draft !== "string") {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  const room = await getRoom(roomId, viewer.id);
  if (!room || !canSendInRoom(room, viewer)) {
    return NextResponse.json({ error: "이 대화방을 볼 수 없어요." }, { status: 403 });
  }
  // 크리에이터의 예상 반응을 미리 보는 기능이라 구독자만 쓴다.
  if (viewer.role !== "public" || viewer.id === room.creator_id) {
    return NextResponse.json({ error: "구독자만 반응 미리보기를 쓸 수 있어요." }, { status: 403 });
  }

  const check = validateBody(draft, maxCharsFor(viewer.role));
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  // 구독자에게는 자신과 크리에이터의 메시지만 문맥으로 쓴다. 다른 구독자 메시지는 넘기지 않는다.
  const recent = await recentMessagesForPreview(room, viewer, BUBBLE_POLICY.previewContextMessages);
  const context = recent.map((m) => ({
    role: m.sender_id === room.creator_id ? ("creator" as const) : ("subscriber" as const),
    body: m.body.slice(0, BUBBLE_POLICY.previewContextCharsPerMessage),
  }));

  const persona = await getPersona(room.creator_id);
  const result = await previewReaction(persona, context, check.body);
  return NextResponse.json(result);
}
