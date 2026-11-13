"use server";

import { validateLayout } from "./layout";
import { HEAP_MESSAGES, type HeapReason } from "./messages";
import { addGuestbookEntry, recordVisit, saveRoomLayout } from "./repo";
import { getViewer } from "@/lib/session";

// reason은 코드가 분기하는 값이고, message는 화면에 보여 줄 문구다.
export type HeapFail<R extends HeapReason> = { ok: false; reason: R; message: string };

function fail<R extends HeapReason>(reason: R): HeapFail<R> {
  return { ok: false, reason, message: HEAP_MESSAGES[reason] };
}

// 방 방문 기록. 로그인하지 않았으면 아무것도 하지 않는다 (오류가 아니다).
export async function recordVisitAction(
  roomId: string,
): Promise<
  { ok: true; recorded: false } | { ok: true; recorded: true; firstToday: boolean } | HeapFail<"not-found">
> {
  const viewer = await getViewer();
  if (!viewer) return { ok: true, recorded: false };
  if (typeof roomId !== "string") return fail("not-found");

  const result = await recordVisit(roomId, viewer.id);
  if (!result.ok) return fail(result.reason);
  return { ok: true, recorded: true, firstToday: result.firstToday };
}

export type GuestbookEntryDto = { id: string; name: string; createdAt: string };

export async function addGuestbookAction(
  roomId: string,
  name: string,
): Promise<
  | { ok: true; entry: GuestbookEntryDto }
  | HeapFail<"not-signed-in" | "not-found" | "invalid-name" | "rate-limited">
> {
  const viewer = await getViewer();
  if (!viewer) return fail("not-signed-in");
  if (typeof roomId !== "string") return fail("not-found");
  if (typeof name !== "string") return fail("invalid-name");

  const result = await addGuestbookEntry(roomId, viewer.id, name);
  if (!result.ok) return fail(result.reason);
  const { entry } = result;
  return { ok: true, entry: { id: entry.id, name: entry.name, createdAt: entry.createdAt.toISOString() } };
}

// 꾸미기 저장. 방 주인만. 형식 검사는 서버에서 다시 한다 (클라이언트 값을 믿지 않는다).
export async function saveLayoutAction(
  roomId: string,
  layout: unknown,
): Promise<
  | { ok: true }
  | HeapFail<"not-signed-in" | "not-found" | "not-owner">
  | (HeapFail<"invalid-layout"> & { detail: string })
> {
  const viewer = await getViewer();
  if (!viewer) return fail("not-signed-in");
  if (typeof roomId !== "string") return fail("not-found");

  const check = validateLayout(layout);
  if (!check.ok) return { ...fail("invalid-layout"), detail: check.error };

  const result = await saveRoomLayout(roomId, viewer.id, check.layout);
  if (!result.ok) return fail(result.reason);
  return { ok: true };
}
