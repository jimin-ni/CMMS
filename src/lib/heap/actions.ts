"use server";

import { heapRequiredError, validateLayout } from "./layout";
import { HEAP_POLICY } from "./policy";
import { HEAP_MESSAGES, type HeapReason } from "./messages";
import { addGuestbookEntry, getRoomBySlug, getRoomOwnerId, recordVisit, saveRoomLayout } from "./repo";
import {
  addNote,
  parseNoteInput,
  deleteOwnNote,
  getNotesState,
  markNoteRead,
  markNotesRead,
  replyToNote,
  setNoteHidden,
  setNoteReveal,
  type HeapNote,
} from "./notes-repo";
import { checkRoomName } from "./slug";
import { getViewer, type Viewer } from "@/lib/session";
import { countLinks } from "@/lib/moderation/contact";
import { noticeFor, type ModerationNotice } from "@/lib/moderation/notice";
import { MODERATION_POLICY, MODERATION_TEXT } from "@/lib/moderation/policy";
import { getWriteBlock, preScreenBlock } from "@/lib/moderation/repo";
import { hashNormalized, type ScreenResult, type Surface } from "@/lib/moderation/screen";
import { screenText } from "@/lib/moderation/server";

// reason은 코드가 분기하는 값이고, message는 화면에 보여 줄 문구다.
export type HeapFail<R extends HeapReason> = { ok: false; reason: R; message: string };

function fail<R extends HeapReason>(reason: R): HeapFail<R> {
  return { ok: false, reason, message: HEAP_MESSAGES[reason] };
}

type ModerationReason = "not-found" | "write-blocked" | "under-age" | "repeat" | "cooldown" | "note-too-many-links";

// 쪽지·방명록 쓰기 전 확인과 판정 (문서 3-2, 9장, 13장). 버블 채팅 전송(bubble/actions.ts)과 같은 순서다:
// 쓰기 차단 → 링크 수 → 같은 글 반복·위반 직후 대기 → 판정. 판정은 DB 트랜잭션 밖에서 한다 (OpenAI 호출이 느릴 수 있다).
// 방 주인과 관리자는 확인을 건너뛰고 판정 후 바로 게시된다 (걸리면 사후 확인 기록만).
async function screenForHeap(
  viewer: Viewer,
  roomId: string,
  surface: Extract<Surface, "note" | "guestbook">,
  text: string,
): Promise<{ ok: true; screening: { result: ScreenResult; privileged: boolean } } | HeapFail<ModerationReason>> {
  const ownerId = await getRoomOwnerId(roomId);
  if (!ownerId) return fail("not-found");
  const privileged = viewer.role === "admin" || viewer.id === ownerId;
  if (!privileged) {
    const block = await getWriteBlock(viewer.id, ownerId);
    if (block) return fail(block.reason === "under_age" ? "under-age" : "write-blocked");
    if (surface === "note" && countLinks(text) > MODERATION_POLICY.maxLinksPerPost) return fail("note-too-many-links");
    const pre = await preScreenBlock(surface, viewer.id, hashNormalized(text));
    if (pre?.kind === "repeat") return fail("repeat");
    if (pre?.kind === "cooldown") {
      return { ok: false, reason: "cooldown", message: MODERATION_TEXT.cooldown(pre.seconds) };
    }
  }
  const result = await screenText({ text, surface, authorId: viewer.id });
  return { ok: true, screening: { result, privileged } };
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
  | { ok: true; entry: GuestbookEntryDto; notice?: ModerationNotice }
  | HeapFail<"not-signed-in" | "invalid-name" | "rate-limited" | ModerationReason>
> {
  const viewer = await getViewer();
  if (!viewer) return fail("not-signed-in");
  if (typeof roomId !== "string") return fail("not-found");
  if (typeof name !== "string") return fail("invalid-name");
  const trimmed = name.trim();
  const length = Array.from(trimmed).length;
  if (length < 1 || length > HEAP_POLICY.guestbookNameMaxChars) return fail("invalid-name");

  const gate = await screenForHeap(viewer, roomId, "guestbook", trimmed);
  if (!gate.ok) return gate;
  const result = await addGuestbookEntry(roomId, viewer.id, trimmed, gate.screening);
  if (!result.ok) return fail(result.reason);
  const { entry } = result;
  return {
    ok: true,
    entry: { id: entry.id, name: entry.name, createdAt: entry.createdAt.toISOString() },
    notice: noticeFor(result.notice),
  };
}

// 꾸미기 저장. 방 주인만. 형식 검사는 서버에서 다시 한다 (클라이언트 값을 믿지 않는다).
// name: 바꾼 방 이름 (바꾸지 않았으면 undefined). 방 만들기 화면과 같은 규칙(checkRoomName)으로 검사하고, 레이아웃과 한 번에 저장한다.
// 이름이 틀리면 레이아웃도 저장하지 않는다. 레이아웃 저장과 마찬가지로 횟수 제한은 없다 (방 주인만 쓰고, 쓰는 줄은 방 하나다).
export async function saveLayoutAction(
  roomId: string,
  layout: unknown,
  name?: unknown,
): Promise<
  | { ok: true }
  | HeapFail<"not-signed-in" | "not-found" | "not-owner" | "invalid-room-name">
  | (HeapFail<"invalid-layout"> & { detail: string })
> {
  const viewer = await getViewer();
  if (!viewer) return fail("not-signed-in");
  if (typeof roomId !== "string") return fail("not-found");

  let newName: string | undefined;
  if (name !== undefined) {
    const named = checkRoomName(name);
    if (!named.ok) return fail("invalid-room-name");
    newName = named.name;
  }

  const check = validateLayout(layout);
  if (!check.ok) return { ...fail("invalid-layout"), detail: check.error };
  // 온보딩 방은 사진 더미를 뺄 수 없다 (방 v2: 다른 방은 더미 없이도 된다)
  const onboarding = await getRoomBySlug(HEAP_POLICY.onboardingRoomSlug);
  if (onboarding?.id === roomId) {
    const heapFail = heapRequiredError(check.layout);
    if (heapFail) return { ...fail("invalid-layout"), detail: heapFail };
  }

  const result = await saveRoomLayout(roomId, viewer.id, check.layout, newName);
  if (!result.ok) return fail(result.reason);
  return { ok: true };
}

// ---------- 쪽지 트리 ----------
// 쪽지 규칙(글자 수, 일일 제한, 간격)과 검사는 notes-repo.ts가 서버에서 한다. 여기서는 로그인과 인자 형식만 본다.
// 돌려주는 쪽지의 날짜는 문자열(ISO)이다.

export type HeapNoteDto = Omit<HeapNote, "createdAt" | "reply"> & {
  createdAt: string;
  reply?: { body: string; font: string; fontSize: number | null; createdAt: string };
};

function toNoteDto(note: HeapNote): HeapNoteDto {
  const { createdAt, reply, ...rest } = note;
  return {
    ...rest,
    createdAt: createdAt.toISOString(),
    ...(reply ? { reply: { ...reply, createdAt: reply.createdAt.toISOString() } } : {}),
  };
}

// 쪽지 남기기. input = { body, tint, font, displayName?, fontSize?, ornament?, ornamentColor?, spot?: { y, angle } | null } (옛 클라이언트는 anonymous)
export async function addNoteAction(
  roomId: string,
  input: unknown,
): Promise<
  | { ok: true; note: HeapNoteDto; evictedId: string | null; notice?: ModerationNotice }
  | HeapFail<
      | "not-signed-in"
      | ModerationReason
      | "invalid-note"
      | "invalid-note-name"
      | "invalid-note-style"
      | "invalid-note-spot"
      | "note-spot-taken"
      | "notes-per-day"
      | "no-tree"
    >
> {
  const viewer = await getViewer();
  if (!viewer) return fail("not-signed-in");
  if (typeof roomId !== "string") return fail("not-found");

  const parsed = parseNoteInput(input);
  if (!parsed.ok) return fail(parsed.reason);
  // 표시 이름과 본문을 함께 판정한다 (문서 4장). 익명 쪽지도 판정한다.
  const text = [parsed.value.displayName, parsed.value.body].filter(Boolean).join("\n");
  const gate = await screenForHeap(viewer, roomId, "note", text);
  if (!gate.ok) return gate;
  const result = await addNote(viewer.id, roomId, input, gate.screening);
  if (!result.ok) return fail(result.reason);
  return { ok: true, note: toNoteDto(result.note), evictedId: result.evictedId, notice: noticeFor(result.notice) };
}

// 내가 쓴 쪽지 지우기
export async function deleteNoteAction(
  noteId: string,
): Promise<{ ok: true } | HeapFail<"not-signed-in" | "note-not-found" | "not-author">> {
  const viewer = await getViewer();
  if (!viewer) return fail("not-signed-in");
  if (typeof noteId !== "string") return fail("note-not-found");

  const result = await deleteOwnNote(viewer.id, noteId);
  if (!result.ok) return fail(result.reason);
  return { ok: true };
}

// 방 주인의 답장. input = { body, font, fontSize? }
export async function replyNoteAction(
  noteId: string,
  input: unknown,
): Promise<
  | { ok: true; note: HeapNoteDto }
  | HeapFail<"not-signed-in" | "note-not-found" | "not-owner" | "notes-sealed" | "invalid-reply" | "invalid-note-style">
> {
  const viewer = await getViewer();
  if (!viewer) return fail("not-signed-in");
  if (typeof noteId !== "string") return fail("note-not-found");

  const result = await replyToNote(viewer.id, noteId, input);
  if (!result.ok) return fail(result.reason);
  return { ok: true, note: toNoteDto(result.note) };
}

// 방 주인이 쪽지를 숨기거나 되살린다.
export async function setNoteHiddenAction(
  noteId: string,
  hidden: boolean,
): Promise<{ ok: true } | HeapFail<"not-signed-in" | "note-not-found" | "not-owner">> {
  const viewer = await getViewer();
  if (!viewer) return fail("not-signed-in");
  if (typeof noteId !== "string" || typeof hidden !== "boolean") return fail("note-not-found");

  const result = await setNoteHidden(viewer.id, noteId, hidden);
  if (!result.ok) return fail(result.reason);
  return { ok: true };
}

// 방 주인이 쪽지를 읽었다고 표시한다.
export async function markNotesReadAction(
  roomId: string,
): Promise<{ ok: true; marked: number } | HeapFail<"not-signed-in" | "not-found" | "not-owner">> {
  const viewer = await getViewer();
  if (!viewer) return fail("not-signed-in");
  if (typeof roomId !== "string") return fail("not-found");

  const result = await markNotesRead(viewer.id, roomId);
  if (!result.ok) return fail(result.reason);
  return { ok: true, marked: result.marked };
}

// 방 주인이 쪽지 하나를 열었다: 그 쪽지만 읽은 것으로 표시한다.
export async function markNoteReadAction(
  noteId: string,
): Promise<{ ok: true; marked: number } | HeapFail<"not-signed-in" | "note-not-found" | "not-owner">> {
  const viewer = await getViewer();
  if (!viewer) return fail("not-signed-in");
  if (typeof noteId !== "string") return fail("note-not-found");

  const result = await markNoteRead(viewer.id, noteId);
  if (!result.ok) return fail(result.reason);
  return { ok: true, marked: result.marked };
}

// 쪽지 전부를 보는 사람 기준으로 다시 읽는다 (공개 시각이 되었거나 바뀌었을 때 엔진이 부른다). 로그인하지 않아도 된다.
export async function refetchNotesAction(
  roomId: string,
): Promise<
  { ok: true; notes: HeapNoteDto[]; noteRevealAt: string | null; unreadNotes: number } | HeapFail<"not-found">
> {
  if (typeof roomId !== "string") return fail("not-found");
  const viewer = await getViewer();
  const state = await getNotesState(roomId, viewer?.id ?? null);
  return {
    ok: true,
    notes: state.notes.map(toNoteDto),
    noteRevealAt: state.noteRevealAt?.toISOString() ?? null,
    unreadNotes: state.unreadNotes,
  };
}

// 쪽지 공개 시각. revealAt은 ISO 문자열이고 null이면 봉인을 푼다.
export async function setNoteRevealAction(
  roomId: string,
  revealAt: string | null,
): Promise<
  | { ok: true; noteRevealAt: string | null }
  | HeapFail<"not-signed-in" | "not-found" | "not-owner" | "invalid-reveal">
> {
  const viewer = await getViewer();
  if (!viewer) return fail("not-signed-in");
  if (typeof roomId !== "string") return fail("not-found");
  if (revealAt !== null && typeof revealAt !== "string") return fail("invalid-reveal");

  const result = await setNoteReveal(viewer.id, roomId, revealAt === null ? null : new Date(revealAt));
  if (!result.ok) return fail(result.reason);
  return { ok: true, noteRevealAt: result.noteRevealAt?.toISOString() ?? null };
}
