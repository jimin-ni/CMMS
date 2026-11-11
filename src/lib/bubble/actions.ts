"use server";

import { BUBBLE_POLICY, maxCharsFor, validateBody } from "./policy";
import {
  canJoinRoom,
  canSendInRoom,
  closeRoom,
  createRoom,
  getRoom,
  getSendStats,
  insertMessage,
  joinRoom,
  softDeleteOwnMessage,
} from "./repo";
import { getViewer } from "@/lib/session";

export type ActionResult = { ok: true; roomId?: string } | { ok: false; error: string };

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

  // 도배 방지: 연속 전송 간격과 시간창당 개수
  const stats = await getSendStats(viewer.id, BUBBLE_POLICY.windowMs);
  if (stats.lastSentMsAgo !== null && stats.lastSentMsAgo < BUBBLE_POLICY.minIntervalMs) {
    const wait = Math.ceil((BUBBLE_POLICY.minIntervalMs - stats.lastSentMsAgo) / 1000);
    return { ok: false, error: `${wait}초 뒤에 다시 보낼 수 있어요.` };
  }
  if (stats.count >= BUBBLE_POLICY.maxPerWindow) {
    return { ok: false, error: "메시지를 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요." };
  }

  await insertMessage(room.id, viewer.id, check.body);
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
