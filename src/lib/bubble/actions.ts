"use server";

import { BUBBLE_POLICY, maxCharsFor, validateBody } from "./policy";
import {
  canSendInThread,
  closeThread,
  createOrGetThread,
  findSubscriberByName,
  getSendStats,
  getThread,
  insertMessage,
  softDeleteOwnMessage,
} from "./repo";
import { getViewer } from "@/lib/session";

export type ActionResult = { ok: true; threadId?: string } | { ok: false; error: string };

export async function openThreadAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  if (viewer.role !== "creator") {
    return { ok: false, error: "크리에이터만 대화방을 열 수 있어요." };
  }

  const nickname = String(formData.get("nickname") ?? "").trim();
  if (!nickname) return { ok: false, error: "구독자 닉네임을 입력해 주세요." };

  const subscriber = await findSubscriberByName(nickname);
  if (!subscriber) return { ok: false, error: "해당 닉네임의 구독자를 찾을 수 없어요." };

  const threadId = await createOrGetThread(viewer.id, subscriber.id);
  return { ok: true, threadId };
}

export async function sendMessageAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };

  const threadId = String(formData.get("threadId") ?? "");
  const thread = await getThread(threadId);
  if (!thread) return { ok: false, error: "대화방을 찾을 수 없어요." };
  if (!canSendInThread(thread, viewer)) return { ok: false, error: "이 대화방에서는 메시지를 보낼 수 없어요." };
  if (thread.status === "closed") return { ok: false, error: "닫힌 대화방입니다." };

  const check = validateBody(String(formData.get("body") ?? ""), maxCharsFor(viewer.role));
  if (!check.ok) return check;

  // 도배 방지: 연속 전송 간격과 시간창당 개수
  const stats = await getSendStats(viewer.id, BUBBLE_POLICY.windowMs);
  if (stats.lastSentMsAgo !== null && stats.lastSentMsAgo < BUBBLE_POLICY.minIntervalMs) {
    const wait = Math.ceil((BUBBLE_POLICY.minIntervalMs - stats.lastSentMsAgo) / 1000);
    return { ok: false, error: `${wait}초 뒤에 다시 보낼 수 있어요.` };
  }
  if (stats.count >= BUBBLE_POLICY.maxPerWindow) {
    return { ok: false, error: "메시지를 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요." };
  }

  await insertMessage(thread.id, viewer.id, check.body);
  return { ok: true };
}

export async function deleteMessageAction(messageId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };

  const deleted = await softDeleteOwnMessage(messageId, viewer.id, BUBBLE_POLICY.deleteWindowMs);
  if (!deleted) {
    return { ok: false, error: "삭제할 수 없어요. 보낸 지 10분이 지났거나 이미 삭제되었어요." };
  }
  return { ok: true };
}

export async function closeThreadAction(threadId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };

  const thread = await getThread(threadId);
  if (!thread) return { ok: false, error: "대화방을 찾을 수 없어요." };
  // 대화방을 닫을 수 있는 사람은 해당 방의 크리에이터와 관리자뿐이다.
  const allowed = viewer.role === "admin" || viewer.id === thread.creator_id;
  if (!allowed) return { ok: false, error: "대화방을 닫을 권한이 없어요." };

  const closed = await closeThread(thread.id);
  if (!closed) return { ok: false, error: "이미 닫힌 대화방이에요." };
  return { ok: true };
}
