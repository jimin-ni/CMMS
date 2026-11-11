import { NextResponse } from "next/server";
import { BUBBLE_POLICY, maxCharsFor, validateBody } from "@/lib/bubble/policy";
import { canSendInThread, getThread, recentMessagesForPreview } from "@/lib/bubble/repo";
import { previewReaction } from "@/lib/bubble/ai-preview";
import { getViewer } from "@/lib/session";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { threadId, draft } = (await request.json().catch(() => ({}))) as {
    threadId?: string;
    draft?: string;
  };
  if (!threadId || typeof draft !== "string") {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  const thread = await getThread(threadId);
  if (!thread || !canSendInThread(thread, viewer)) {
    return NextResponse.json({ error: "이 대화방을 볼 수 없어요." }, { status: 403 });
  }

  const check = validateBody(draft, maxCharsFor(viewer.role));
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const recent = await recentMessagesForPreview(thread.id, BUBBLE_POLICY.previewContextMessages);
  const context = recent.map((m) => ({
    role: m.sender_id === thread.creator_id ? ("creator" as const) : ("subscriber" as const),
    body: m.body.slice(0, BUBBLE_POLICY.previewContextCharsPerMessage),
  }));

  const result = await previewReaction(context, check.body);
  return NextResponse.json(result);
}
