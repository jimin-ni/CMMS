import { and, asc, eq, gte, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { heapNoteReplies, heapNotes, heapRooms, user } from "@/lib/schema";
import { HEAP_POLICY, NOTE_FONT_IDS, NOTE_REPLY_FONT_IDS, NOTE_TINT_IDS } from "@/lib/heap/policy";
import type { Fail, HeapChangesPosition } from "@/lib/heap/repo";

// 쪽지 트리의 DB 접근. repo.ts가 길어서 따로 뒀고, 규칙은 repo.ts와 같다 (쿼리는 이 파일에만, 실패는 { ok: false, reason }).
// 방 주인(owner) = heap_rooms.creator_id. 역할 검사는 하지 않고 방 주인인지만 서버에서 확인한다.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

function fail<R extends string>(reason: R): Fail<R> {
  return { ok: false, reason };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_PATTERN.test(value);
const charLength = (value: string) => Array.from(value).length;

// repo.ts와 같은 값. 한국 시간 오늘이 시작된 시각, 그리고 잠금을 얻은 뒤의 실제 시각.
const seoulDayStart = sql`(date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')`;
const clockNow = sql`clock_timestamp()`;
const isoMicros = (column: typeof heapNotes.updatedAt) =>
  sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

// repo.ts의 lockUserInRoom과 같은 잠금. 같은 사용자의 동시 요청을 줄 세운다.
async function lockUserInRoom(tx: Tx, roomId: string, userId: string): Promise<void> {
  await tx.execute(sql`set local lock_timeout = '5s'`);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`heap:note:${roomId}:${userId}`}, 0))`);
}

// 방 하나의 트리 자리(간격, 개수)를 줄 세운다. 사용자 잠금을 먼저 잡고 이 잠금을 잡는다.
async function lockRoomTree(tx: Tx, roomId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`heap:notetree:${roomId}`}, 0))`);
}

// ---------- 타입 ----------

export type HeapNoteReply = { body: string; font: string; createdAt: Date };

// 쪽지 하나. 봉인된 쪽지(sealed)는 body와 reply가 없다. 장식 종류(kind)는 열이 없어서 돌려주지 않는다 (클라이언트가 id 해시로 정한다).
export type HeapNote = {
  id: string;
  // 익명이면 모두에게 null (방 주인에게도)
  name: string | null;
  mine: boolean;
  sealed: boolean;
  // 방 주인이 숨긴 쪽지. 작성자에게만 보인다.
  hidden: boolean;
  body?: string;
  tint: string;
  font: string;
  // 트리 위 자리. 쪽지함에 있으면 둘 다 null.
  y: number | null;
  angle: number | null;
  createdAt: Date;
  reply?: HeapNoteReply;
  // 방 주인에게만 있다. 아직 읽지 않았으면 true.
  unread?: boolean;
};

export type HeapNotesState = { notes: HeapNote[]; noteRevealAt: Date | null; unreadNotes: number };

export type HeapNoteSpot = { y: number; angle: number };
export type HeapNoteInput = {
  body: string;
  tint: string;
  font: string;
  anonymous: boolean;
  // 트리에 걸 자리. 없으면 쪽지함으로 간다.
  spot: HeapNoteSpot | null;
};

// ---------- 검사 (DB를 쓰지 않는다) ----------

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // 줄바꿈은 \n 하나로 맞추고 앞뒤 공백을 다듬는다. NUL은 Postgres가 받지 않는다.
  const text = value.replace(/\r\n?/g, "\n").trim();
  return text.includes("\u0000") ? null : text;
}

export function parseNoteInput(
  input: unknown,
): { ok: true; value: HeapNoteInput } | Fail<"invalid-note" | "invalid-note-style" | "invalid-note-spot"> {
  if (typeof input !== "object" || input === null) return fail("invalid-note");
  const raw = input as Record<string, unknown>;

  const body = cleanText(raw.body);
  if (body === null || charLength(body) < 1 || charLength(body) > HEAP_POLICY.noteBodyMaxChars) return fail("invalid-note");
  if (body.split("\n").length > HEAP_POLICY.noteBodyMaxLines) return fail("invalid-note");

  if (typeof raw.anonymous !== "boolean") return fail("invalid-note");
  if (typeof raw.tint !== "string" || !Object.hasOwn(NOTE_TINT_IDS, raw.tint)) return fail("invalid-note-style");
  if (typeof raw.font !== "string" || !Object.hasOwn(NOTE_FONT_IDS, raw.font)) return fail("invalid-note-style");

  let spot: HeapNoteSpot | null = null;
  if (raw.spot !== undefined && raw.spot !== null) {
    if (typeof raw.spot !== "object") return fail("invalid-note-spot");
    const { y, angle } = raw.spot as Record<string, unknown>;
    if (typeof y !== "number" || typeof angle !== "number" || !Number.isFinite(y) || !Number.isFinite(angle)) {
      return fail("invalid-note-spot");
    }
    if (y < 0 || y >= HEAP_POLICY.noteTreeHeight || angle < -Math.PI || angle > Math.PI) return fail("invalid-note-spot");
    spot = { y, angle };
  }
  return { ok: true, value: { body, tint: raw.tint, font: raw.font, anonymous: raw.anonymous, spot } };
}

export function parseReplyInput(
  input: unknown,
): { ok: true; value: { body: string; font: string } } | Fail<"invalid-reply" | "invalid-note-style"> {
  if (typeof input !== "object" || input === null) return fail("invalid-reply");
  const raw = input as Record<string, unknown>;
  const body = cleanText(raw.body);
  if (body === null || charLength(body) < 1 || charLength(body) > HEAP_POLICY.noteReplyMaxChars) return fail("invalid-reply");
  if (typeof raw.font !== "string" || !Object.hasOwn(NOTE_REPLY_FONT_IDS, raw.font)) return fail("invalid-note-style");
  return { ok: true, value: { body, font: raw.font } };
}

// 트리 원뿔 위의 두 자리 사이 직선거리(m). 높이 y에서 반지름 = base * (1 - y / height).
function spotDistance(a: HeapNoteSpot, b: HeapNoteSpot): number {
  const { noteTreeHeight: height, noteTreeBaseRadius: base } = HEAP_POLICY;
  const ra = base * (1 - a.y / height);
  const rb = base * (1 - b.y / height);
  return Math.hypot(
    ra * Math.cos(a.angle) - rb * Math.cos(b.angle),
    a.y - b.y,
    ra * Math.sin(a.angle) - rb * Math.sin(b.angle),
  );
}

// ---------- 읽기 ----------

type NoteContext = { creatorId: string; noteRevealAt: Date | null; sealedNow: boolean };

async function noteContext(executor: Executor, roomId: string): Promise<NoteContext | null> {
  const rows = await executor
    .select({
      creatorId: heapRooms.creatorId,
      noteRevealAt: heapRooms.noteRevealAt,
      sealedNow: sql<boolean>`coalesce(${heapRooms.noteRevealAt} > now(), false)`,
    })
    .from(heapRooms)
    .where(eq(heapRooms.id, roomId));
  return rows[0] ?? null;
}

function noteSelect(executor: Executor) {
  return executor
    .select({
      id: heapNotes.id,
      roomId: heapNotes.roomId,
      authorId: heapNotes.authorId,
      authorName: user.name,
      anonymous: heapNotes.anonymous,
      body: heapNotes.body,
      tint: heapNotes.tint,
      font: heapNotes.font,
      posY: heapNotes.posY,
      posAngle: heapNotes.posAngle,
      hiddenAt: heapNotes.hiddenAt,
      ownerReadAt: heapNotes.ownerReadAt,
      createdAt: heapNotes.createdAt,
      replyBody: heapNoteReplies.body,
      replyFont: heapNoteReplies.font,
      replyCreatedAt: heapNoteReplies.createdAt,
      // 변경 읽기 기준점용. 응답에는 싣지 않는다.
      ts: isoMicros(heapNotes.updatedAt),
    })
    .from(heapNotes)
    .leftJoin(user, eq(user.id, heapNotes.authorId))
    .leftJoin(heapNoteReplies, eq(heapNoteReplies.noteId, heapNotes.id));
}

type NoteRow = Awaited<ReturnType<ReturnType<typeof noteSelect>["limit"]>>[number];

// 보는 사람에게 보이지 않는 쪽지(남이 숨긴 쪽지)는 null.
function toNote(row: NoteRow, ctx: NoteContext, viewerId: string | null): HeapNote | null {
  const mine = viewerId !== null && row.authorId === viewerId;
  const owner = viewerId !== null && viewerId === ctx.creatorId;
  // 숨긴 쪽지는 작성자와 방 주인(되돌리기용)에게만 보인다.
  if (row.hiddenAt !== null && !mine && !owner) return null;
  const sealed = ctx.sealedNow && !mine;
  const note: HeapNote = {
    id: row.id,
    name: row.anonymous ? null : row.authorName,
    mine,
    sealed,
    hidden: row.hiddenAt !== null,
    tint: row.tint,
    font: row.font,
    y: row.posY,
    angle: row.posAngle,
    createdAt: row.createdAt,
  };
  if (!sealed) {
    note.body = row.body;
    if (row.replyBody !== null && row.replyFont !== null && row.replyCreatedAt !== null) {
      note.reply = { body: row.replyBody, font: row.replyFont, createdAt: row.replyCreatedAt };
    }
  }
  if (viewerId !== null && viewerId === ctx.creatorId) note.unread = row.ownerReadAt === null;
  return note;
}

// 방 주인이 아직 읽지 않은 쪽지 수 (숨긴 쪽지 제외). 방 주인이 아니면 0.
export async function countUnreadNotes(roomId: string, viewerId: string | null): Promise<number> {
  if (viewerId === null || !isUuid(roomId)) return 0;
  return db.$count(
    heapNotes,
    and(
      eq(heapNotes.roomId, roomId),
      isNull(heapNotes.ownerReadAt),
      isNull(heapNotes.hiddenAt),
      sql`exists (select 1 from ${heapRooms} where ${heapRooms.id} = ${heapNotes.roomId} and ${heapRooms.creatorId} = ${viewerId})`,
    ),
  );
}

// 방의 쪽지 전부 (만든 순서). 숨긴 쪽지는 작성자와 방 주인에게만, 봉인 중이면 작성자 말고는 sealed 표시만.
export async function listNotes(roomId: string, viewerId: string | null): Promise<HeapNote[]> {
  if (!isUuid(roomId)) return [];
  const ctx = await noteContext(db, roomId);
  if (!ctx) return [];
  const visible =
    viewerId === null
      ? isNull(heapNotes.hiddenAt)
      : viewerId === ctx.creatorId
        ? undefined
        : or(isNull(heapNotes.hiddenAt), eq(heapNotes.authorId, viewerId));
  const rows = await noteSelect(db)
    .where(and(eq(heapNotes.roomId, roomId), visible))
    .orderBy(asc(heapNotes.createdAt), asc(heapNotes.id));
  return rows.flatMap((row) => toNote(row, ctx, viewerId) ?? []);
}

// 방 화면의 첫 읽기용 묶음.
export async function getNotesState(roomId: string, viewerId: string | null): Promise<HeapNotesState> {
  if (!isUuid(roomId)) return { notes: [], noteRevealAt: null, unreadNotes: 0 };
  const [notes, ctx, unreadNotes] = await Promise.all([
    listNotes(roomId, viewerId),
    noteContext(db, roomId),
    countUnreadNotes(roomId, viewerId),
  ]);
  return { notes, noteRevealAt: ctx?.noteRevealAt ?? null, unreadNotes };
}

// 실시간 읽기용. (updated_at, id)가 from보다 큰 쪽지를 limit개까지. 지금 보이지 않는 것(남이 숨긴 쪽지)은 removedNoteIds로 돌려준다.
// 지운 쪽지는 행이 없어서 여기에 나오지 않는다.
export async function listNoteChanges(
  roomId: string,
  viewerId: string | null,
  from: HeapChangesPosition,
  limit: number,
): Promise<{
  notes: HeapNote[];
  removedNoteIds: string[];
  positions: HeapChangesPosition[];
  noteRevealAt: Date | null;
  unreadNotes: number;
}> {
  const ctx = await noteContext(db, roomId);
  if (!ctx) return { notes: [], removedNoteIds: [], positions: [], noteRevealAt: null, unreadNotes: 0 };
  const [rows, unreadNotes] = await Promise.all([
    noteSelect(db)
      .where(
        and(
          eq(heapNotes.roomId, roomId),
          sql`(${heapNotes.updatedAt}, ${heapNotes.id}) > (${from.ts}::timestamptz, ${from.id}::uuid)`,
        ),
      )
      .orderBy(asc(heapNotes.updatedAt), asc(heapNotes.id))
      .limit(limit),
    countUnreadNotes(roomId, viewerId),
  ]);
  const notes: HeapNote[] = [];
  const removedNoteIds: string[] = [];
  for (const row of rows) {
    const note = toNote(row, ctx, viewerId);
    if (note) notes.push(note);
    else removedNoteIds.push(row.id);
  }
  return {
    notes,
    removedNoteIds,
    positions: rows.map((row) => ({ ts: row.ts, id: row.id })),
    noteRevealAt: ctx.noteRevealAt,
    unreadNotes,
  };
}

async function loadNote(executor: Executor, noteId: string, viewerId: string): Promise<HeapNote | null> {
  const rows = await noteSelect(executor).where(eq(heapNotes.id, noteId));
  if (!rows[0]) return null;
  const ctx = await noteContext(executor, rows[0].roomId);
  return ctx ? toNote(rows[0], ctx, viewerId) : null;
}

// ---------- 쓰기 ----------

// 쪽지 남기기. 로그인한 사람만(부르는 쪽이 확인한다). 하루 제한과 트리 자리 검사를 한 잠금 안에서 한다.
// 트리가 가득 차 있으면 답장 없는 가장 오래된 걸린 쪽지를 쪽지함으로 내리고 그 id를 evictedId로 돌려준다.
// 내릴 쪽지가 없으면(모두 답장이 있으면) 새 쪽지가 쪽지함으로 간다.
export async function addNote(
  userId: string,
  roomId: string,
  rawInput: unknown,
): Promise<
  | { ok: true; note: HeapNote; evictedId: string | null }
  | Fail<"not-found" | "invalid-note" | "invalid-note-style" | "invalid-note-spot" | "note-spot-taken" | "notes-per-day">
> {
  if (!isUuid(roomId)) return fail("not-found");
  const parsed = parseNoteInput(rawInput);
  if (!parsed.ok) return parsed;
  const input = parsed.value;

  return db.transaction(async (tx) => {
    const rooms = await tx.select({ id: heapRooms.id }).from(heapRooms).where(eq(heapRooms.id, roomId));
    if (!rooms[0]) return fail("not-found");

    await lockUserInRoom(tx, roomId, userId);
    await lockRoomTree(tx, roomId);

    const today = await tx.$count(
      heapNotes,
      and(eq(heapNotes.roomId, roomId), eq(heapNotes.authorId, userId), gte(heapNotes.createdAt, seoulDayStart)),
    );
    if (today >= HEAP_POLICY.notesPerDay) return fail("notes-per-day");

    let spot = input.spot;
    let evictedId: string | null = null;
    if (spot) {
      let hung = await tx
        .select({ id: heapNotes.id, y: heapNotes.posY, angle: heapNotes.posAngle })
        .from(heapNotes)
        .where(and(eq(heapNotes.roomId, roomId), isNotNull(heapNotes.posY)));
      if (hung.length >= HEAP_POLICY.noteTreeMax) {
        const oldest = await tx
          .select({ id: heapNotes.id })
          .from(heapNotes)
          .leftJoin(heapNoteReplies, eq(heapNoteReplies.noteId, heapNotes.id))
          .where(and(eq(heapNotes.roomId, roomId), isNotNull(heapNotes.posY), isNull(heapNoteReplies.noteId)))
          .orderBy(asc(heapNotes.createdAt), asc(heapNotes.id))
          .limit(1);
        if (oldest[0]) {
          const movedId = oldest[0].id;
          evictedId = movedId;
          await tx
            .update(heapNotes)
            .set({ posY: null, posAngle: null, updatedAt: clockNow })
            .where(eq(heapNotes.id, movedId));
          hung = hung.filter((row) => row.id !== movedId);
        } else {
          spot = null;
        }
      }
      if (spot) {
        const wanted = spot;
        const tooClose = hung.some(
          (row) =>
            row.y !== null &&
            row.angle !== null &&
            spotDistance(wanted, { y: row.y, angle: row.angle }) < HEAP_POLICY.noteSpacing,
        );
        if (tooClose) return fail("note-spot-taken");
      }
    }

    const [created] = await tx
      .insert(heapNotes)
      // 잠금을 얻은 뒤의 시각을 찍는다. 실시간 읽기 커서와 맞추기 위해서다 (방명록과 같다).
      .values({
        roomId,
        authorId: userId,
        body: input.body,
        tint: input.tint,
        font: input.font,
        anonymous: input.anonymous,
        posY: spot?.y ?? null,
        posAngle: spot?.angle ?? null,
        createdAt: clockNow,
        updatedAt: clockNow,
      })
      .returning({ id: heapNotes.id });
    const note = await loadNote(tx, created.id, userId);
    if (!note) throw new Error("note vanished after insert");
    return { ok: true as const, note, evictedId };
  });
}

// 내가 쓴 쪽지 지우기. 완전히 지운다 (답장도 함께).
export async function deleteOwnNote(
  userId: string,
  noteId: string,
): Promise<{ ok: true } | Fail<"note-not-found" | "not-author">> {
  if (!isUuid(noteId)) return fail("note-not-found");
  const rows = await db.select({ authorId: heapNotes.authorId }).from(heapNotes).where(eq(heapNotes.id, noteId));
  if (!rows[0]) return fail("note-not-found");
  if (rows[0].authorId !== userId) return fail("not-author");
  await db.delete(heapNotes).where(and(eq(heapNotes.id, noteId), eq(heapNotes.authorId, userId)));
  return { ok: true };
}

// 쪽지가 있는 방의 주인인지 확인한다.
async function ownerOfNote(
  executor: Executor,
  noteId: string,
  userId: string,
): Promise<{ ok: true; roomId: string; sealedNow: boolean } | Fail<"note-not-found" | "not-owner">> {
  if (!isUuid(noteId)) return fail("note-not-found");
  const rows = await executor
    .select({
      roomId: heapNotes.roomId,
      creatorId: heapRooms.creatorId,
      sealedNow: sql<boolean>`coalesce(${heapRooms.noteRevealAt} > now(), false)`,
    })
    .from(heapNotes)
    .innerJoin(heapRooms, eq(heapRooms.id, heapNotes.roomId))
    .where(eq(heapNotes.id, noteId));
  if (!rows[0]) return fail("note-not-found");
  if (rows[0].creatorId !== userId) return fail("not-owner");
  return { ok: true, roomId: rows[0].roomId, sealedNow: rows[0].sealedNow };
}

// 방 주인의 답장. 쪽지 하나에 하나라서 다시 보내면 덮어쓴다. 봉인 중에는 열 수 없으니 답장도 못 한다.
export async function replyToNote(
  userId: string,
  noteId: string,
  rawInput: unknown,
): Promise<
  | { ok: true; note: HeapNote }
  | Fail<"note-not-found" | "not-owner" | "notes-sealed" | "invalid-reply" | "invalid-note-style">
> {
  const parsed = parseReplyInput(rawInput);
  if (!parsed.ok) return parsed;
  const { body, font } = parsed.value;

  return db.transaction(async (tx) => {
    const owner = await ownerOfNote(tx, noteId, userId);
    if (!owner.ok) return owner;
    if (owner.sealedNow) return fail("notes-sealed");

    await tx
      .insert(heapNoteReplies)
      .values({ noteId, authorId: userId, body, font, createdAt: clockNow, updatedAt: clockNow })
      .onConflictDoUpdate({ target: heapNoteReplies.noteId, set: { body, font, updatedAt: clockNow } });
    // 답장한 쪽지는 읽은 것이다.
    await tx
      .update(heapNotes)
      .set({ ownerReadAt: sql`coalesce(${heapNotes.ownerReadAt}, clock_timestamp())`, updatedAt: clockNow })
      .where(eq(heapNotes.id, noteId));
    const note = await loadNote(tx, noteId, userId);
    if (!note) throw new Error("note vanished after reply");
    return { ok: true as const, note };
  });
}

// 방 주인이 쪽지를 숨기거나 되살린다. 숨긴 쪽지는 작성자 말고는 보이지 않는다.
export async function setNoteHidden(
  userId: string,
  noteId: string,
  hidden: boolean,
): Promise<{ ok: true } | Fail<"note-not-found" | "not-owner">> {
  const owner = await ownerOfNote(db, noteId, userId);
  if (!owner.ok) return owner;
  await db
    .update(heapNotes)
    .set({ hiddenAt: hidden ? clockNow : null, updatedAt: clockNow })
    .where(eq(heapNotes.id, noteId));
  return { ok: true };
}

// 방 주인이 쪽지를 읽었다고 표시한다. 봉인 중에는 열 수 없으니 아무것도 하지 않는다 (marked: 0).
export async function markNotesRead(
  userId: string,
  roomId: string,
): Promise<{ ok: true; marked: number } | Fail<"not-found" | "not-owner">> {
  if (!isUuid(roomId)) return fail("not-found");
  const ctx = await noteContext(db, roomId);
  if (!ctx) return fail("not-found");
  if (ctx.creatorId !== userId) return fail("not-owner");
  if (ctx.sealedNow) return { ok: true, marked: 0 };
  const rows = await db
    .update(heapNotes)
    .set({ ownerReadAt: clockNow, updatedAt: clockNow })
    .where(and(eq(heapNotes.roomId, roomId), isNull(heapNotes.ownerReadAt), isNull(heapNotes.hiddenAt)))
    .returning({ id: heapNotes.id });
  return { ok: true, marked: rows.length };
}

// 쪽지 공개 시각. null이면 봉인을 풀고, 과거 시각도 같은 뜻이다.
export async function setNoteReveal(
  userId: string,
  roomId: string,
  revealAt: Date | null,
): Promise<{ ok: true; noteRevealAt: Date | null } | Fail<"not-found" | "not-owner" | "invalid-reveal">> {
  if (!isUuid(roomId)) return fail("not-found");
  if (revealAt !== null && Number.isNaN(revealAt.getTime())) return fail("invalid-reveal");
  const ctx = await noteContext(db, roomId);
  if (!ctx) return fail("not-found");
  if (ctx.creatorId !== userId) return fail("not-owner");
  await db.update(heapRooms).set({ noteRevealAt: revealAt }).where(eq(heapRooms.id, roomId));
  return { ok: true, noteRevealAt: revealAt };
}
