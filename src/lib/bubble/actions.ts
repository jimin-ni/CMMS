"use server";

import { BUBBLE_POLICY, maxCharsFor, validateBody } from "./policy";
import {
  canJoinRoom,
  canSendInRoom,
  closeRoom,
  createRoom,
  getRoom,
  getSendStats,
  joinRoom,
  softDeleteOwnMessage,
} from "./repo";
import { getViewer } from "@/lib/session";
import { countLinks } from "@/lib/moderation/contact";
import { MODERATION_POLICY, MODERATION_TEXT } from "@/lib/moderation/policy";
import { chatPreScreenBlock, getWriteBlock, saveChatMessage, type SaveNotice } from "@/lib/moderation/repo";
import { hashNormalized } from "@/lib/moderation/screen";
import { screenText } from "@/lib/moderation/server";

// 판정 결과 안내. 보낸 사람에게만 보인다. refresh가 true면 입력창 상태(쓰기 차단)를 서버에서 다시 그린다.
export type ModerationNotice = { tone: "warn" | "info" | "care"; text: string; refresh?: boolean };

export type ActionResult =
  | { ok: true; roomId?: string; notice?: ModerationNotice }
  | { ok: false; error: string; refresh?: boolean };

// DB 제약(1~50자)과 같은 값
const TITLE_MAX = 50;

export async function openRoomAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  if (viewer.role !== "creator") {
    return { ok: false, error: "크리에이터만 대화방을 열 수 있어요." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "대화방 이름을 입력해 주세요." };
  if (Array.from(title).length > TITLE_MAX) {
    return { ok: false, error: `대화방 이름은 ${TITLE_MAX}자까지 쓸 수 있어요.` };
  }

  const roomId = await createRoom(viewer.id, title);
  if (!roomId) {
    return { ok: false, error: "이미 열린 대화방이 있어요. 닫은 뒤에 새로 열 수 있어요." };
  }
  return { ok: true, roomId };
}

export async function joinRoomAction(roomId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };

  const room = await getRoom(roomId, viewer.id);
  if (!room) return { ok: false, error: "대화방을 찾을 수 없어요." };
  if (room.joined) return { ok: true, roomId: room.id };
  if (!canJoinRoom(room, viewer)) return { ok: false, error: "이 대화방에는 참여할 수 없어요." };

  await joinRoom(room.id, viewer.id);
  return { ok: true, roomId: room.id };
}

export async function sendMessageAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };

  const room = await getRoom(String(formData.get("roomId") ?? ""), viewer.id);
  if (!room) return { ok: false, error: "대화방을 찾을 수 없어요." };
  if (room.status === "closed") return { ok: false, error: "닫힌 대화방입니다." };
  if (!canSendInRoom(room, viewer)) return { ok: false, error: "이 대화방에서는 메시지를 보낼 수 없어요." };

  const check = validateBody(String(formData.get("body") ?? ""), maxCharsFor(viewer.role));
  if (!check.ok) return check;

  // 방 주인과 관리자는 판정 후 바로 게시하고, 판정용 도배 방지와 쓰기 차단을 받지 않는다 (문서 3-2).
  const privileged = viewer.role === "admin" || viewer.id === room.creator_id;
  if (!privileged) {
    const block = await getWriteBlock(viewer.id, room.creator_id);
    if (block) {
      return {
        ok: false,
        error: block.reason === "under_age" ? MODERATION_TEXT.underAge : MODERATION_TEXT.writeBlocked,
        refresh: true,
      };
    }
  }

  // 도배 방지: 연속 전송 간격과 시간창당 개수
  const stats = await getSendStats(viewer.id, BUBBLE_POLICY.windowMs);
  if (stats.lastSentMsAgo !== null && stats.lastSentMsAgo < BUBBLE_POLICY.minIntervalMs) {
    const wait = Math.ceil((BUBBLE_POLICY.minIntervalMs - stats.lastSentMsAgo) / 1000);
    return { ok: false, error: `${wait}초 뒤에 다시 보낼 수 있어요.` };
  }
  if (stats.count >= BUBBLE_POLICY.maxPerWindow) {
    return { ok: false, error: "메시지를 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요." };
  }

  const normalizedHash = hashNormalized(check.body);
  if (!privileged) {
    if (countLinks(check.body) > MODERATION_POLICY.maxLinksPerPost) {
      return { ok: false, error: MODERATION_TEXT.tooManyLinks };
    }
    const pre = await chatPreScreenBlock(viewer.id, normalizedHash);
    if (pre?.kind === "repeat") return { ok: false, error: MODERATION_TEXT.repeat };
    if (pre?.kind === "cooldown") return { ok: false, error: MODERATION_TEXT.cooldown(pre.seconds) };
  }

  // 먼저 판정하고 그다음 저장한다. 위반 글은 다른 사람에게 한 번도 보이지 않는다.
  const result = await screenText({ text: check.body, surface: "chat", authorId: viewer.id });
  const saved = await saveChatMessage({
    roomId: room.id,
    roomOwnerId: room.creator_id,
    senderId: viewer.id,
    body: check.body,
    result,
    privileged,
  });
  return { ok: true, notice: noticeFor(saved) };
}

function noticeFor(saved: SaveNotice): ModerationNotice | undefined {
  switch (saved.kind) {
    case "published":
      return undefined;
    case "blocked":
      return saved.autoBlocked
        ? { tone: "warn", text: `${MODERATION_TEXT.blocked(saved.strikes)} ${MODERATION_TEXT.nowBlocked}`, refresh: true }
        : { tone: "warn", text: MODERATION_TEXT.blocked(saved.strikes) };
    case "contact_first":
      return { tone: "info", text: MODERATION_TEXT.contactFirst };
    case "hold_review":
      return { tone: "info", text: MODERATION_TEXT.holdReview };
    case "hold_self_harm":
      return { tone: "care", text: MODERATION_TEXT.selfHarm };
  }
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

export async function closeRoomAction(roomId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };

  const room = await getRoom(roomId, viewer.id);
  if (!room) return { ok: false, error: "대화방을 찾을 수 없어요." };
  // 대화방을 닫을 수 있는 사람은 해당 방의 크리에이터와 관리자뿐이다.
  const allowed = viewer.role === "admin" || viewer.id === room.creator_id;
  if (!allowed) return { ok: false, error: "대화방을 닫을 권한이 없어요." };

  const closed = await closeRoom(room.id);
  if (!closed) return { ok: false, error: "이미 닫힌 대화방이에요." };
  return { ok: true };
}
