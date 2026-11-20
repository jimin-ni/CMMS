"use server";

// AI 스크리닝 화면 동작: 신고, 차단, 원문 보기, 재검토 요청, 검토 결정.
// 권한은 repo 계층 쿼리에서 다시 확인한다.
import { getViewer } from "@/lib/session";
import {
  blockUser,
  decideEvent,
  decideSanction,
  reportChatMessage,
  requestAppeal,
  revealChatOriginal,
} from "./repo";

export type ModerationActionResult = { ok: true; body?: string } | { ok: false; error: string };

function done(r: { ok: boolean; error?: string }): ModerationActionResult {
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "처리하지 못했어요." };
}

export async function reportMessageAction(messageId: string): Promise<ModerationActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  return done(await reportChatMessage(messageId, viewer));
}

export async function blockUserAction(userId: string): Promise<ModerationActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  return done(await blockUser(String(userId), viewer));
}

export async function revealRemovedAction(messageId: string): Promise<ModerationActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  const body = await revealChatOriginal(String(messageId), viewer);
  return body === null ? { ok: false, error: "원문을 볼 수 없어요." } : { ok: true, body };
}

export async function requestAppealAction(sanctionId: string): Promise<ModerationActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  return done(await requestAppeal(String(sanctionId), viewer.id));
}

export async function decideEventAction(
  eventId: string,
  decision: "dismiss" | "uphold",
): Promise<ModerationActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  if (decision !== "dismiss" && decision !== "uphold") return { ok: false, error: "잘못된 요청이에요." };
  return done(await decideEvent(String(eventId), decision, viewer));
}

export async function decideSanctionAction(
  sanctionId: string,
  decision: "uphold" | "revoke",
): Promise<ModerationActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  if (decision !== "uphold" && decision !== "revoke") return { ok: false, error: "잘못된 요청이에요." };
  return done(await decideSanction(String(sanctionId), decision, viewer));
}
