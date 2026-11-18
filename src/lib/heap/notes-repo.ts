import { and, asc, eq, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { heapAttempts, heapNoteReplies, heapNotes, heapRooms, user } from "@/lib/schema";
import {
  HEAP_POLICY,
  NOTE_FONT_IDS,
  NOTE_ORNAMENT_COLORS,
  NOTE_ORNAMENT_KINDS,
  NOTE_REPLY_FONT_IDS,
  NOTE_TINT_IDS,
} from "@/lib/heap/policy";
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
const seoulDayKey = sql<string>`to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD')`;
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

// fontSize: 0009. null 은 자동 맞춤.
export type HeapNoteReply = { body: string; font: string; fontSize: number | null; createdAt: Date };

// 쪽지 하나. 봉인된 쪽지(sealed)는 body와 reply가 없다. 장식(ornament)이 null 인 옛 쪽지는 클라이언트가 id 해시로 정한다.
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
  // 0009. null 은 예전 동작 (자동 글자 크기, id 에서 정한 장식).
  fontSize: number | null;
  ornament: string | null;
  ornamentColor: string | null;
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
  // 작성자가 적은 이름. null 이면 익명 (anonymous 와 같이 움직인다).
  displayName: string | null;
  fontSize: number | null;
  ornament: string | null;
  ornamentColor: string | null;
  // 트리에 걸 자리. 없으면 쪽지함으로 간다.
  spot: HeapNoteSpot | null;
  // 클라이언트가 정한 쪽지 id (uuid). 쓰기 판에서 접힌 장식이 id 로 정해지므로, 같은 id 를 써야 걸린 장식과 같다. 없거나 이미 있으면 서버가 정한다.
  id: string | null;
};

// ---------- 검사 (DB를 쓰지 않는다) ----------

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // 줄바꿈은 \n 하나로 맞추고 앞뒤 공백을 다듬는다. NUL은 Postgres가 받지 않는다.
  const text = value.replace(/\r\n?/g, "\n").trim();
  return text.includes("\u0000") ? null : text;
}

// 글자 크기 (쪽지와 답장 공통): 없으면 null(자동), 정수가 0009 의 check 범위 밖이면 거절, 안이면 정책 범위로 맞춘다.
function parseFontSize(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isInteger(value)) return { ok: false };
  if (value < HEAP_POLICY.noteFontAbsMin || value > HEAP_POLICY.noteFontAbsMax) return { ok: false };
  return { ok: true, value: Math.min(HEAP_POLICY.noteFontMax, Math.max(HEAP_POLICY.noteFontMin, value)) };
}

export function parseNoteInput(
  input: unknown,
): { ok: true; value: HeapNoteInput } | Fail<"invalid-note" | "invalid-note-name" | "invalid-note-style" | "invalid-note-spot"> {
  if (typeof input !== "object" || input === null) return fail("invalid-note");
  const raw = input as Record<string, unknown>;

  const body = cleanText(raw.body);
  if (body === null || charLength(body) < 1 || charLength(body) > HEAP_POLICY.noteBodyMaxChars) return fail("invalid-note");
  if (body.split("\n").length > HEAP_POLICY.noteBodyMaxLines) return fail("invalid-note");

  // 옛 클라이언트: anonymous 만 보낸다. 새 클라이언트: displayName 을 보내면 anonymous 는 그 값이 정한다.
  let displayName: string | null = null;
  let anonymous: boolean;
  if (raw.displayName !== undefined) {
    if (raw.displayName !== null && typeof raw.displayName !== "string") return fail("invalid-note");
    // 줄바꿈·탭은 빈칸으로, 보이지 않는 제어 문자와 방향 바꾸기 문자(\p{Cc}, \p{Cf})는 지운다 (이름이 거꾸로 보이게 꾸미는 것을 막는다)
    const name =
      raw.displayName === null
        ? ""
        : raw.displayName.normalize("NFC").replace(/[\r\n\t]+/g, " ").replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
    if (charLength(name) > HEAP_POLICY.noteNameMaxChars) return fail("invalid-note-name");
    displayName = name === "" ? null : name;
    anonymous = displayName === null;
  } else {
    if (typeof raw.anonymous !== "boolean") return fail("invalid-note");
    anonymous = raw.anonymous;
  }

  const size = parseFontSize(raw.fontSize);
  if (!size.ok) return fail("invalid-note-style");
  const fontSize = size.value;
  let ornament: string | null = null;
  if (raw.ornament !== undefined && raw.ornament !== null) {
    if (typeof raw.ornament !== "string" || !(NOTE_ORNAMENT_KINDS as readonly string[]).includes(raw.ornament)) return fail("invalid-note-style");
    ornament = raw.ornament;
  }
  let ornamentColor: string | null = null;
  if (raw.ornamentColor !== undefined && raw.ornamentColor !== null) {
    if (typeof raw.ornamentColor !== "string") return fail("invalid-note-style");
    const hex = raw.ornamentColor.toLowerCase();
    if (!(NOTE_ORNAMENT_COLORS as readonly string[]).includes(hex)) return fail("invalid-note-style");
    ornamentColor = hex;
  }
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
  const id = isUuid(raw.id) ? raw.id.toLowerCase() : null;
  return {
    ok: true,
    value: { body, tint: raw.tint, font: raw.font, anonymous, displayName, fontSize, ornament, ornamentColor, spot, id },
  };
}

export function parseReplyInput(
  input: unknown,
): { ok: true; value: { body: string; font: string; fontSize: number | null } } | Fail<"invalid-reply" | "invalid-note-style"> {
  if (typeof input !== "object" || input === null) return fail("invalid-reply");
  const raw = input as Record<string, unknown>;
  const body = cleanText(raw.body);
  if (body === null || charLength(body) < 1 || charLength(body) > HEAP_POLICY.noteReplyMaxChars) return fail("invalid-reply");
  if (typeof raw.font !== "string" || !Object.hasOwn(NOTE_REPLY_FONT_IDS, raw.font)) return fail("invalid-note-style");
  const size = parseFontSize(raw.fontSize);
  if (!size.ok) return fail("invalid-note-style");
  return { ok: true, value: { body, font: raw.font, fontSize: size.value } };
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

// ownerEarly: 방 주인이 공개일 전에도 쪽지를 읽고 숨길 수 있는가. 트리 기능 값 { kind: "tree", earlyModeration } 에서 서버가 읽는다 (없으면 true).
type NoteContext = { creatorId: string; noteRevealAt: Date | null; sealedNow: boolean; ownerEarly: boolean };

// 저장된 레이아웃의 트리 기능에서 이른 검토 설정을 읽는다. 명시적으로 false 일 때만 끈다.
function hasTree(layout: unknown): boolean {
  const items = typeof layout === "object" && layout !== null ? (layout as { items?: unknown }).items : null;
  if (!Array.isArray(items)) return false;
  return items.some((item) => {
    const fn = typeof item === "object" && item !== null ? (item as { fn?: unknown }).fn : null;
    return typeof fn === "object" && fn !== null && (fn as { kind?: unknown }).kind === "tree";
  });
}

function earlyModerationOf(layout: unknown): boolean {
  const items = typeof layout === "object" && layout !== null ? (layout as { items?: unknown }).items : null;
  if (!Array.isArray(items)) return true;
  for (const item of items) {
    const fn = typeof item === "object" && item !== null ? (item as { fn?: unknown }).fn : null;
    if (typeof fn === "object" && fn !== null && (fn as { kind?: unknown }).kind === "tree") {
      return (fn as { earlyModeration?: unknown }).earlyModeration !== false;
    }
  }
  return true;
}

async function noteContext(executor: Executor, roomId: string): Promise<NoteContext | null> {
  const rows = await executor
    .select({
      creatorId: heapRooms.creatorId,
      noteRevealAt: heapRooms.noteRevealAt,
      sealedNow: sql<boolean>`coalesce(${heapRooms.noteRevealAt} > now(), false)`,
      layout: heapRooms.layout,
    })
    .from(heapRooms)
    .where(eq(heapRooms.id, roomId));
  if (!rows[0]) return null;
  const { layout, ...rest } = rows[0];
  return { ...rest, ownerEarly: earlyModerationOf(layout) };
}

function noteSelect(executor: Executor) {
  return executor
    .select({
      id: heapNotes.id,
      roomId: heapNotes.roomId,
      authorId: heapNotes.authorId,
      authorName: user.name,
      anonymous: heapNotes.anonymous,
      displayName: heapNotes.displayName,
      fontSize: heapNotes.fontSize,
      ornament: heapNotes.ornament,
      ornamentColor: heapNotes.ornamentColor,
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
      replyFontSize: heapNoteReplies.fontSize,
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
  // 봉인 중에는 작성자 말고는 닫혀 있다. 방 주인은 이른 검토가 켜져 있을 때만 읽는다 (서버가 레이아웃에서 읽은 값).
  const sealed = ctx.sealedNow && !mine && !(owner && ctx.ownerEarly);
  const note: HeapNote = {
    id: row.id,
    // 작성자가 적은 이름이 있으면 그것, 없으면 익명이 아닌 옛 쪽지만 계정 이름
    name: row.displayName ?? (row.anonymous ? null : row.authorName),
    mine,
    sealed,
    hidden: row.hiddenAt !== null,
    tint: row.tint,
    font: row.font,
    fontSize: row.fontSize,
    ornament: row.ornament,
    ornamentColor: row.ornamentColor,
    y: row.posY,
    angle: row.posAngle,
    createdAt: row.createdAt,
  };
  if (!sealed) {
    note.body = row.body;
    if (row.replyBody !== null && row.replyFont !== null && row.replyCreatedAt !== null) {
      note.reply = { body: row.replyBody, font: row.replyFont, fontSize: row.replyFontSize, createdAt: row.replyCreatedAt };
    }
  }
  // 방 주인에게만. 방 주인이 쓴 쪽지는 읽을 것이 아니라서 읽지 않음이 아니다.
  if (owner) note.unread = row.ownerReadAt === null && !mine;
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
      ne(heapNotes.authorId, viewerId),
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
  | Fail<"not-found" | "no-tree" | "invalid-note" | "invalid-note-name" | "invalid-note-style" | "invalid-note-spot" | "note-spot-taken" | "notes-per-day">
> {
  if (!isUuid(roomId)) return fail("not-found");
  const parsed = parseNoteInput(rawInput);
  if (!parsed.ok) return parsed;
  const input = parsed.value;

  return db.transaction(async (tx) => {
    const rooms = await tx.select({ id: heapRooms.id, layout: heapRooms.layout }).from(heapRooms).where(eq(heapRooms.id, roomId));
    if (!rooms[0]) return fail("not-found");
    // 트리가 없는 방에는 새 쪽지를 받지 않는다. 읽기와 숨기기는 그대로 둔다: 트리를 나중에 치워도 주인이 옛 쪽지를 다룰 수 있게.
    if (!hasTree(rooms[0].layout)) return fail("no-tree");

    await lockUserInRoom(tx, roomId, userId);
    await lockRoomTree(tx, roomId);

    // 하루 제한은 쓴 횟수로 센다 (heap_attempts). 쪽지를 지워도 줄지 않는다. 읽기만 먼저 하고, 올리는 일은 아래 삽입 바로 앞에서 한다:
    // 자리 검사에서 실패하면 이 트랜잭션은 그대로 끝나므로 그 전에 올리면 헛되이 센다.
    const [{ day }] = (await tx.execute<{ day: string }>(sql`select ${seoulDayKey} as day`)).rows;
    const counterKey = `note-day:${roomId}:${userId}:${day}`;
    const used = await tx
      .select({ count: heapAttempts.count })
      .from(heapAttempts)
      .where(eq(heapAttempts.key, counterKey));
    if ((used[0]?.count ?? 0) >= HEAP_POLICY.notesPerDay) return fail("notes-per-day");

    let spot = input.spot;
    let evictId: string | null = null;
    if (spot) {
      const hung = await tx
        .select({ id: heapNotes.id, y: heapNotes.posY, angle: heapNotes.posAngle })
        .from(heapNotes)
        .where(and(eq(heapNotes.roomId, roomId), isNotNull(heapNotes.posY)));
      let others = hung;
      if (hung.length >= HEAP_POLICY.noteTreeMax) {
        const oldest = await tx
          .select({ id: heapNotes.id })
          .from(heapNotes)
          .leftJoin(heapNoteReplies, eq(heapNoteReplies.noteId, heapNotes.id))
          .where(and(eq(heapNotes.roomId, roomId), isNotNull(heapNotes.posY), isNull(heapNoteReplies.noteId)))
          .orderBy(asc(heapNotes.createdAt), asc(heapNotes.id))
          .limit(1);
        if (oldest[0]) {
          evictId = oldest[0].id;
          others = hung.filter((row) => row.id !== evictId);
        } else {
          spot = null;
        }
      }
      if (spot) {
        const wanted = spot;
        const tooClose = others.some(
          (row) =>
            row.y !== null &&
            row.angle !== null &&
            spotDistance(wanted, { y: row.y, angle: row.angle }) < HEAP_POLICY.noteSpacing,
        );
        // 실패하면 아무것도 바꾸지 않았다: 내릴 쪽지는 아래에서 내린다.
        if (tooClose) return fail("note-spot-taken");
      }
    }

    if (evictId) {
      await tx
        .update(heapNotes)
        .set({ posY: null, posAngle: null, updatedAt: clockNow })
        .where(eq(heapNotes.id, evictId));
    }
    // 쓴 횟수를 올린다. 이미 한도면 행이 바뀌지 않아 아무것도 돌아오지 않는다 (사용자 잠금 안이라 위의 읽기와 어긋나지 않지만 한 번 더 막는다).
    const bumped = await tx
      .insert(heapAttempts)
      .values({ key: counterKey, count: 1 })
      .onConflictDoUpdate({
        target: heapAttempts.key,
        set: { count: sql`${heapAttempts.count} + 1` },
        setWhere: lt(heapAttempts.count, HEAP_POLICY.notesPerDay),
      })
      .returning({ count: heapAttempts.count });
    if (!bumped[0]) return fail("notes-per-day");
    // 지난 날의 제한 행은 쓸 때마다 조금씩 치운다.
    await tx.execute(
      sql`delete from heap_attempts where key like 'note-day:%' and window_start < now() - interval '3 days'`,
    );
    const evictedId = evictId;

    // 클라이언트가 정한 id 는 아직 없을 때만 쓴다 (겹치면 서버가 정한다)
    let chosenId: string | null = null;
    if (input.id) {
      const taken = await tx.select({ id: heapNotes.id }).from(heapNotes).where(eq(heapNotes.id, input.id));
      if (!taken[0]) chosenId = input.id;
    }
    const [created] = await tx
      .insert(heapNotes)
      // 잠금을 얻은 뒤의 시각을 찍는다. 실시간 읽기 커서와 맞추기 위해서다 (방명록과 같다).
      .values({
        ...(chosenId ? { id: chosenId } : {}),
        roomId,
        authorId: userId,
        body: input.body,
        tint: input.tint,
        font: input.font,
        anonymous: input.anonymous,
        displayName: input.displayName,
        fontSize: input.fontSize,
        ornament: input.ornament,
        ornamentColor: input.ornamentColor,
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
  const { body, font, fontSize } = parsed.value;

  return db.transaction(async (tx) => {
    const owner = await ownerOfNote(tx, noteId, userId);
    if (!owner.ok) return owner;
    if (owner.sealedNow) return fail("notes-sealed");

    await tx
      .insert(heapNoteReplies)
      .values({ noteId, authorId: userId, body, font, fontSize, createdAt: clockNow, updatedAt: clockNow })
      .onConflictDoUpdate({ target: heapNoteReplies.noteId, set: { body, font, fontSize, updatedAt: clockNow } });
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

// 방 주인이 쪽지 하나를 읽었다고 표시한다 (주인이 그 쪽지를 열었을 때). 봉인 중이거나 숨긴 쪽지는 표시하지 않는다 (marked: 0).
export async function markNoteRead(
  userId: string,
  noteId: string,
): Promise<{ ok: true; marked: number } | Fail<"note-not-found" | "not-owner">> {
  const owner = await ownerOfNote(db, noteId, userId);
  if (!owner.ok) return owner;
  if (owner.sealedNow) return { ok: true, marked: 0 };
  const rows = await db
    .update(heapNotes)
    .set({ ownerReadAt: clockNow, updatedAt: clockNow })
    .where(and(eq(heapNotes.id, noteId), isNull(heapNotes.ownerReadAt), isNull(heapNotes.hiddenAt)))
    .returning({ id: heapNotes.id });
  return { ok: true, marked: rows.length };
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

export type HeapNoteCounts = { received: number; unread: number; replied: number };

// 마이페이지의 쪽지 수: 받은 쪽지(방 주인이 쓴 것과 숨긴 것 빼고), 그중 안 읽은 것, 답장한 것.
// 방 주인인지는 부르는 쪽이 정한다 (자기 방 id 만 넘긴다).
export async function getNoteCounts(roomId: string, ownerId: string): Promise<HeapNoteCounts> {
  if (!isUuid(roomId)) return { received: 0, unread: 0, replied: 0 };
  const rows = await db
    .select({
      received: sql<number>`count(*)::int`,
      unread: sql<number>`(count(*) filter (where ${heapNotes.ownerReadAt} is null))::int`,
      replied: sql<number>`count(${heapNoteReplies.noteId})::int`,
    })
    .from(heapNotes)
    .leftJoin(heapNoteReplies, eq(heapNoteReplies.noteId, heapNotes.id))
    .where(and(eq(heapNotes.roomId, roomId), isNull(heapNotes.hiddenAt), ne(heapNotes.authorId, ownerId)));
  const row = rows[0];
  return { received: Number(row.received), unread: Number(row.unread), replied: Number(row.replied) };
}
