"use server";

import { BUBBLE_POLICY, validateBody } from "./policy";
import type { ActionResult } from "./actions";
import {
  canUseTalk,
  createGroupChat,
  filterCreatorIds,
  findOrCreateDirectChat,
  getChatFor,
  getChatSendStats,
  insertChatMessage,
  softDeleteOwnChatMessage,
} from "./talk-repo";
import { getViewer } from "@/lib/session";

export type StartChatResult = { ok: true; chatId: string } | { ok: false; error: string };

// DB 제약(1~50자)과 같은 값
const TITLE_MAX = 50;

// 크리에이터 톡 시작. 고른 사람이 1명이면 1:1 대화, 2명 이상이면 그룹 대화를 만든다.
export async function startChatAction(
  _prev: StartChatResult | null,
  formData: FormData,
): Promise<StartChatResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  if (!canUseTalk(viewer)) return { ok: false, error: "크리에이터만 크리에이터 톡을 쓸 수 있어요." };

  const picked = [
    ...new Set(formData.getAll("memberId").map(String).filter((id) => id && id !== viewer.id)),
  ];
  if (picked.length === 0) return { ok: false, error: "대화할 크리에이터를 골라 주세요." };
  if (picked.length + 1 > BUBBLE_POLICY.talkMaxMembers) {
    return { ok: false, error: `대화에는 나를 포함해 ${BUBBLE_POLICY.talkMaxMembers}명까지 들어갈 수 있어요.` };
  }

  // 역할은 화면이 아니라 DB 기준으로 다시 확인한다. 크리에이터가 아닌 사람이 섞이면 대화를 만들지 않는다.
  const creators = await filterCreatorIds(picked);
  if (creators.length !== picked.length) {
    return { ok: false, error: "크리에이터만 초대할 수 있어요." };
  }

  if (creators.length === 1) {
    return { ok: true, chatId: await findOrCreateDirectChat(viewer.id, creators[0]) };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (Array.from(title).length > TITLE_MAX) {
    return { ok: false, error: `대화 이름은 ${TITLE_MAX}자까지 쓸 수 있어요.` };
  }
  return { ok: true, chatId: await createGroupChat(viewer.id, creators, title || null) };
}

export async function sendChatMessageAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };

  const chat = await getChatFor(String(formData.get("chatId") ?? ""), viewer);
  if (!chat) return { ok: false, error: "이 대화에서는 메시지를 보낼 수 없어요." };

  const check = validateBody(String(formData.get("body") ?? ""), BUBBLE_POLICY.creatorMaxChars);
  if (!check.ok) return check;

  // 도배 방지: 버블과 같은 규칙
  const stats = await getChatSendStats(viewer.id, BUBBLE_POLICY.windowMs);
  if (stats.lastSentMsAgo !== null && stats.lastSentMsAgo < BUBBLE_POLICY.minIntervalMs) {
    const wait = Math.ceil((BUBBLE_POLICY.minIntervalMs - stats.lastSentMsAgo) / 1000);
    return { ok: false, error: `${wait}초 뒤에 다시 보낼 수 있어요.` };
  }
  if (stats.count >= BUBBLE_POLICY.maxPerWindow) {
    return { ok: false, error: "메시지를 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요." };
  }

  await insertChatMessage(chat.id, viewer.id, check.body);
  return { ok: true };
}

export async function deleteChatMessageAction(messageId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  if (!canUseTalk(viewer)) return { ok: false, error: "크리에이터만 크리에이터 톡을 쓸 수 있어요." };

  const deleted = await softDeleteOwnChatMessage(messageId, viewer.id, BUBBLE_POLICY.deleteWindowMs);
  if (!deleted) {
    return { ok: false, error: "삭제할 수 없어요. 보낸 지 10분이 지났거나 이미 삭제되었어요." };
  }
  return { ok: true };
}
