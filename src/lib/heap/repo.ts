import { and, asc, desc, eq, gte, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import {
  bubbleRooms,
  heapCreatorChannels,
  heapGuestbook,
  heapPieceVotes,
  heapPieces,
  heapReels,
  heapRooms,
  heapVisits,
  user,
} from "@/lib/schema";
import { HEAP_FUNNEL_POLICY, HEAP_POLICY } from "@/lib/heap/policy";
import type { HeapChannelPlatform, HeapPiecePlatform, ParsedPiece } from "@/lib/heap/platform";
import { allocateCaps, classifyReel, REEL_CLASSES, type ReelClass, type ReelCounts } from "@/lib/heap/caps";
import { REEL_KEY } from "@/lib/heap/layout";
import { likePattern } from "@/lib/heap/search";
import type { ImportCandidate } from "@/lib/heap/import";

// 힙 미니룸의 DB 접근은 전부 이 파일에 둔다. 서버에서만 불러 쓴다 (Server Component, Server Action, Route Handler).
// 역할(creator, admin) 검사는 부르는 쪽이 하고, 여기서는 데이터로 알 수 있는 것만 검사한다
// (방 주인인지, 조각 상태가 맞는지, 하루 제한을 넘었는지).
// 예상할 수 있는 실패는 { ok: false, reason }으로 돌려주고, 코드 실수일 때만 던진다.

export type HeapLayout = Record<string, unknown>;

export type HeapRoom = {
  id: string;
  slug: string;
  name: string;
  blurb: string;
  layout: HeapLayout;
  voteThreshold: number;
  creatorId: string;
  creatorName: string;
  // 크리에이터가 자기 방에 마지막으로 다녀간 시각 ("주인 다녀감")
  creatorVisitedAt: Date | null;
  updatedAt: Date;
};

export type HeapRoomLink = { slug: string; name: string; blurb: string };

export type HeapReel = {
  id: string;
  platform: HeapChannelPlatform;
  externalId: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  title: string;
  wide: boolean | null;
  viewCount: number | null;
  publishedAt: Date | null;
  // 연결된 채널의 이름. 채널을 모르면 null.
  channelTitle: string | null;
};

export type HeapPieceStatus = "pending" | "rejected" | "voting" | "landed" | "lifted";

export type HeapPiece = {
  id: string;
  platform: HeapPiecePlatform;
  externalId: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  title: string;
  wide: boolean | null;
  note: string;
  status: HeapPieceStatus;
  // 제출한 계정이 지워졌으면 둘 다 null
  submitterId: string | null;
  submitterName: string | null;
  votes: number;
  // 보는 사람이 이 조각에 투표했는지. 로그인하지 않았으면 false.
  voted: boolean;
  createdAt: Date;
  landedAt: Date | null;
  updatedAt: Date;
};

export type HeapGuestbookEntry = { id: string; name: string; createdAt: Date };

export type HeapVisitCounts = { today: number; total: number };

export type HeapChannel = {
  id: string;
  platform: HeapChannelPlatform;
  externalId: string;
  channelUrl: string;
  title: string;
};

export type HeapRoomSnapshot = {
  room: HeapRoom;
  // 조회를 시작한 DB 시각. 실시간 읽기의 첫 기준점으로 쓴다.
  serverTime: Date;
  reels: HeapReel[];
  // 더미 위에 안착한 조각. 최근에 안착한 것부터.
  landed: HeapPiece[];
  // 투표 중인 조각. 최근에 올라온 것부터.
  voting: HeapPiece[];
  guestbook: HeapGuestbookEntry[];
  visits: HeapVisitCounts;
  channels: HeapChannel[];
};

export type HeapRoomChanges = {
  // 조회를 시작한 DB 시각. 다음 요청의 기준점으로 쓴다.
  serverTime: Date;
  voteThreshold: number;
  creatorVisitedAt: Date | null;
  // since 뒤에 생긴 방명록
  guestbook: HeapGuestbookEntry[];
  // since 뒤에 바뀐 조각 중 지금 보이는 것(voting, landed)
  pieces: HeapPiece[];
  // since 뒤에 바뀌어 더는 보이지 않는 조각(lifted, rejected, pending)
  removedPieceIds: string[];
  visits: HeapVisitCounts;
  // 다음 요청의 기준점. 방명록과 조각이 각자 자리를 가진다.
  nextCursor: HeapChangesCursor;
  // 한쪽 목록이 한 번의 상한(changesPageSize)에 닿았다. 받은 기준점으로 이어서 읽어야 한다.
  more: boolean;
};

// (시각, id) 한 지점. 시각은 DB의 마이크로초까지 담은 UTC ISO 문자열이라 페이지 경계에서 줄이 겹치거나 빠지지 않는다.
export type HeapChangesPosition = { ts: string; id: string };
export type HeapChangesCursor = { guestbook: HeapChangesPosition; pieces: HeapChangesPosition };

export const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export type Fail<R extends string> = { ok: false; reason: R };

function fail<R extends string>(reason: R): Fail<R> {
  return { ok: false, reason };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 주소에서 온 값이 uuid가 아니면 DB 오류 대신 없는 것으로 본다.
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

// 한글 기준 글자 수(코드포인트). SQL의 char_length와 같은 값이다.
function charLength(value: string): number {
  return Array.from(value).length;
}

// 한국 시간 기준 오늘 날짜와 오늘이 시작된 시각
const seoulToday = sql`(now() at time zone 'Asia/Seoul')::date`;
const seoulDayStart = sql`(date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')`;

// 조각의 상태 시각에는 트랜잭션 시작 시각(now()) 대신 실제 시각을 쓴다.
// 행 잠금을 기다린 트랜잭션이 더 이른 시각을 적어 순서가 뒤집히는 일을 줄인다.
const clockNow = sql`clock_timestamp()`;

// 같은 사용자가 같은 방에 동시에 보낸 요청을 줄 세운다. 하루 제한을 세고 넣는 사이에 끼어들지 못하게 한다.
async function lockUserInRoom(tx: Tx, kind: string, roomId: string, userId: string): Promise<void> {
  const key = `heap:${kind}:${roomId}:${userId}`;
  // 잠금 대기를 실시간 읽기의 겹침(changesCursorOverlapMs, 10초)보다 짧게 묶는다.
  // 그래야 늦게 커밋된 줄이 커서 뒤로 밀려 영영 안 읽히는 일이 없다.
  await tx.execute(sql`set local lock_timeout = '5s'`);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

async function roomOwnership(
  executor: Executor,
  roomId: string,
  creatorId: string,
): Promise<"ok" | "not-found" | "not-owner"> {
  if (!isUuid(roomId)) return "not-found";
  const rows = await executor
    .select({ creatorId: heapRooms.creatorId })
    .from(heapRooms)
    .where(eq(heapRooms.id, roomId));
  if (!rows[0]) return "not-found";
  return rows[0].creatorId === creatorId ? "ok" : "not-owner";
}

// ---------- 읽기 ----------

function roomSelect() {
  return db
    .select({
      id: heapRooms.id,
      slug: heapRooms.slug,
      name: heapRooms.name,
      blurb: heapRooms.blurb,
      layout: heapRooms.layout,
      voteThreshold: heapRooms.voteThreshold,
      creatorId: heapRooms.creatorId,
      creatorName: user.name,
      creatorVisitedAt: heapRooms.creatorVisitedAt,
      updatedAt: heapRooms.updatedAt,
      // 조회 시점의 DB 시각. 기준점을 다른 조회보다 먼저 잡는 데 쓴다.
      serverTime: sql`now()`.mapWith(heapRooms.updatedAt),
    })
    .from(heapRooms)
    .innerJoin(user, eq(user.id, heapRooms.creatorId));
}

async function roomWithClock(slug: string): Promise<{ room: HeapRoom; serverTime: Date } | null> {
  const rows = await roomSelect().where(eq(heapRooms.slug, slug));
  if (!rows[0]) return null;
  const { serverTime, ...room } = rows[0];
  return { room, serverTime };
}

export async function getRoomBySlug(slug: string): Promise<HeapRoom | null> {
  return (await roomWithClock(slug))?.room ?? null;
}

// 문에 붙는 방 목록
export async function listRooms(): Promise<HeapRoomLink[]> {
  return db
    .select({ slug: heapRooms.slug, name: heapRooms.name, blurb: heapRooms.blurb })
    .from(heapRooms)
    .orderBy(asc(heapRooms.createdAt), asc(heapRooms.slug));
}

// 문에 붙은 방 목록에 찍는 점: 이 사람의 마지막 방문(heap_visits의 가장 늦은 visit_day) 뒤에 바뀐 방의 slug.
// 바뀐 것 = 방 꾸미기 저장(heap_rooms.updated_at), 새로 들어온 영상(heap_reels.created_at), 안착한 팬 조각(heap_pieces.landed_at).
// 방문 기록이 하루 단위(한국 시간)라서 방문한 날 안에 생긴 변화는 점이 되지 않고, 그 다음 날 한국 시간 0시부터의 변화가 점이 된다.
// 방문한 적 없는 방은 기준이 없어서 점을 찍지 않는다. 읽기만 하고 아무것도 쓰지 않는다.
// 이 사람의 방문만 방별로 묶어 시작하고(seen), 방마다 "다음 날 0시"의 시각(after)을 만들어 timestamptz 열과 직접 비교한다 (열에 함수를 씌우지 않는다).
export async function listChangedRoomSlugs(viewerId: string): Promise<string[]> {
  const result = await db.execute<{ slug: string }>(sql`
    with seen as (
      select v.room_id, ((max(v.visit_day) + 1)::timestamp at time zone 'Asia/Seoul') as after
      from heap_visits v
      where v.user_id = ${viewerId}
      group by v.room_id
    )
    select r.slug
    from seen s
    join heap_rooms r on r.id = s.room_id
    where r.updated_at >= s.after
      or exists (select 1 from heap_reels x where x.room_id = s.room_id and x.created_at >= s.after)
      or exists (select 1 from heap_pieces p where p.room_id = s.room_id and p.status = 'landed' and p.landed_at >= s.after)
  `);
  return result.rows.map((row) => row.slug);
}

// heap_reels 한 줄을 가리키는 키 "<platform>:<external_id>". 방 layout의 excludedReels가 이 키를 쓴다.
const reelKeySql = sql<string>`${heapReels.platform} || ':' || ${heapReels.externalId}`;

// layout에서 힙에서 뺀 영상 키만 꺼낸다 (형식이 맞는 문자열만).
export function excludedReelKeys(layout: HeapLayout): string[] {
  const list = layout.excludedReels;
  return Array.isArray(list) ? list.filter((key): key is string => typeof key === "string" && REEL_KEY.test(key)) : [];
}

// 최근에 올라온 영상부터. 게시 시각을 모르는 영상은 등록 순서를 따른다.
// excluded: 힙에서 뺀 영상의 "<platform>:<externalId>" 키 (방 layout의 excludedReels). 이 영상은 읽지 않는다.
export async function listReels(
  roomId: string,
  limit: number = HEAP_POLICY.snapshotReelsMax,
  excluded: readonly string[] = [],
): Promise<HeapReel[]> {
  if (!isUuid(roomId)) return [];
  return db
    .select({
      id: heapReels.id,
      platform: heapReels.platform,
      externalId: heapReels.externalId,
      sourceUrl: heapReels.sourceUrl,
      thumbnailUrl: heapReels.thumbnailUrl,
      title: heapReels.title,
      wide: heapReels.wide,
      viewCount: heapReels.viewCount,
      publishedAt: heapReels.publishedAt,
      channelTitle: heapCreatorChannels.title,
    })
    .from(heapReels)
    .leftJoin(heapCreatorChannels, eq(heapCreatorChannels.id, heapReels.channelId))
    .where(
      and(
        eq(heapReels.roomId, roomId),
        excluded.length > 0 ? notInArray(reelKeySql, [...excluded]) : undefined,
      ),
    )
    .orderBy(
      sql`${heapReels.publishedAt} desc nulls last`,
      desc(heapReels.createdAt),
      asc(heapReels.id),
    )
    .limit(limit);
}

function pieceSelect<E extends Record<string, SQL.Aliased | SQL>>(
  executor: Executor,
  viewerId: string | null,
  extra?: E,
) {
  return executor
    .select({
      ...(extra ?? ({} as E)),
      id: heapPieces.id,
      platform: heapPieces.platform,
      externalId: heapPieces.externalId,
      sourceUrl: heapPieces.sourceUrl,
      thumbnailUrl: heapPieces.thumbnailUrl,
      title: heapPieces.title,
      wide: heapPieces.wide,
      note: heapPieces.note,
      status: heapPieces.status,
      submitterId: heapPieces.submitterId,
      submitterName: user.name,
      votes: sql<number>`count(${heapPieceVotes.userId})::int`,
      // viewerId가 null이면 비교 결과가 null이라 false가 된다.
      voted: sql<boolean>`coalesce(bool_or(${heapPieceVotes.userId} = ${viewerId}::text), false)`,
      createdAt: heapPieces.createdAt,
      landedAt: heapPieces.landedAt,
      updatedAt: heapPieces.updatedAt,
    })
    .from(heapPieces)
    .leftJoin(user, eq(user.id, heapPieces.submitterId))
    .leftJoin(heapPieceVotes, eq(heapPieceVotes.pieceId, heapPieces.id))
    .groupBy(heapPieces.id, user.id);
}

function byLandedDesc(a: HeapPiece, b: HeapPiece): number {
  return (b.landedAt?.getTime() ?? 0) - (a.landedAt?.getTime() ?? 0);
}

export async function listLandedPieces(roomId: string): Promise<HeapPiece[]> {
  if (!isUuid(roomId)) return [];
  return pieceSelect(db, null)
    .where(and(eq(heapPieces.roomId, roomId), eq(heapPieces.status, "landed")))
    .orderBy(desc(heapPieces.landedAt), asc(heapPieces.id))
    .limit(HEAP_POLICY.snapshotPiecesMax);
}

export async function listVotingPieces(roomId: string, viewerId: string | null): Promise<HeapPiece[]> {
  if (!isUuid(roomId)) return [];
  return pieceSelect(db, viewerId)
    .where(and(eq(heapPieces.roomId, roomId), eq(heapPieces.status, "voting")))
    .orderBy(desc(heapPieces.createdAt), asc(heapPieces.id))
    .limit(HEAP_POLICY.snapshotPiecesMax);
}

function guestbookSelect(roomId: string, extra?: SQL) {
  return db
    .select({ id: heapGuestbook.id, name: heapGuestbook.name, createdAt: heapGuestbook.createdAt })
    .from(heapGuestbook)
    .where(and(eq(heapGuestbook.roomId, roomId), extra))
    .orderBy(desc(heapGuestbook.createdAt), asc(heapGuestbook.id));
}

// 최근 것부터 limit개
export async function listGuestbook(roomId: string, limit: number): Promise<HeapGuestbookEntry[]> {
  if (!isUuid(roomId)) return [];
  return guestbookSelect(roomId).limit(limit);
}

// TODAY는 한국 시간 날짜 기준
export async function getVisitCounts(roomId: string): Promise<HeapVisitCounts> {
  if (!isUuid(roomId)) return { today: 0, total: 0 };
  const rows = await db
    .select({
      today: sql<number>`(count(*) filter (where ${heapVisits.visitDay} = ${seoulToday}))::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(heapVisits)
    .where(eq(heapVisits.roomId, roomId));
  return { today: Number(rows[0].today), total: Number(rows[0].total) };
}

export async function listCreatorChannels(creatorId: string): Promise<HeapChannel[]> {
  return db
    .select({
      id: heapCreatorChannels.id,
      platform: heapCreatorChannels.platform,
      externalId: heapCreatorChannels.externalId,
      channelUrl: heapCreatorChannels.channelUrl,
      title: heapCreatorChannels.title,
    })
    .from(heapCreatorChannels)
    .where(eq(heapCreatorChannels.creatorId, creatorId))
    .orderBy(asc(heapCreatorChannels.platform), asc(heapCreatorChannels.createdAt));
}

// 방 주인의 열린 버블 대화방 id. 버블 테이블을 읽기만 하고 버블 코드는 거치지 않는다.
// 크리에이터는 열린 방을 하나만 가질 수 있다 (bubble_rooms_one_open_per_creator). 없으면 null.
export async function getOpenBubbleRoomId(creatorId: string): Promise<string | null> {
  const rows = await db
    .select({ id: bubbleRooms.id })
    .from(bubbleRooms)
    .where(and(eq(bubbleRooms.creatorId, creatorId), eq(bubbleRooms.status, "open")))
    .limit(1);
  return rows[0]?.id ?? null;
}

// 방 화면이 처음 그릴 때 필요한 것 전부. 방을 먼저 읽고(1번), 나머지 5개 조회를 한꺼번에 보낸다.
export async function getRoomSnapshot(
  slug: string,
  viewerId: string | null,
): Promise<HeapRoomSnapshot | null> {
  const found = await roomWithClock(slug);
  if (!found) return null;
  const { room, serverTime } = found;

  // 영상과 조각은 상한만큼만 읽는다 (최근 것이 남는다). 조각은 안착한 것과 투표 중인 것을 따로 센다.
  const [reels, landed, voting, guestbook, visits, channels] = await Promise.all([
    listReels(room.id, HEAP_POLICY.snapshotReelsMax, excludedReelKeys(room.layout)),
    pieceSelect(db, viewerId)
      .where(and(eq(heapPieces.roomId, room.id), eq(heapPieces.status, "landed")))
      .orderBy(desc(heapPieces.landedAt), asc(heapPieces.id))
      .limit(HEAP_POLICY.snapshotPiecesMax),
    pieceSelect(db, viewerId)
      .where(and(eq(heapPieces.roomId, room.id), eq(heapPieces.status, "voting")))
      .orderBy(desc(heapPieces.createdAt), asc(heapPieces.id))
      .limit(HEAP_POLICY.snapshotPiecesMax),
    listGuestbook(room.id, HEAP_POLICY.guestbookPageSize),
    getVisitCounts(room.id),
    listCreatorChannels(room.creatorId),
  ]);

  return {
    room,
    serverTime,
    reels,
    landed: landed.sort(byLandedDesc),
    voting,
    guestbook,
    visits,
    channels,
  };
}

// 실시간 읽기(?since=)용. since 뒤에 생긴 방명록, 바뀐 조각, 지금의 방문 수를 돌려준다.
// 늦게 커밋된 변경을 놓치지 않도록 부르는 쪽이 다음 기준점을 serverTime보다 조금 앞당기고,
// 겹쳐서 온 줄은 클라이언트가 id로 합친다 (버블의 메시지 읽기와 같은 방식).
// 목록은 (시각, id) 오름차순으로 changesPageSize개씩 끊어 읽는다. since는 방명록과 조각 각각의 기준 지점이다.
// 한도에 닿은 목록은 마지막 줄에서 이어 가고, 다 읽은 목록은 서버 시각 - 겹침으로 옮긴다.
// 너무 오래된 기준점은 changesMaxLookbackMs 안으로 당긴다.
const isoMicros = (column: SQL | typeof heapGuestbook.createdAt | typeof heapPieces.updatedAt) =>
  sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export async function getRoomChangesSince(
  roomId: string,
  since: HeapChangesCursor,
  viewerId: string | null = null,
): Promise<HeapRoomChanges | null> {
  if (!isUuid(roomId)) return null;
  // 기준점을 조회보다 먼저 잡는다.
  const rooms = await db
    .select({
      voteThreshold: heapRooms.voteThreshold,
      creatorVisitedAt: heapRooms.creatorVisitedAt,
      serverTime: sql`now()`.mapWith(heapRooms.updatedAt),
    })
    .from(heapRooms)
    .where(eq(heapRooms.id, roomId));
  if (!rooms[0]) return null;

  const { serverTime, ...roomInfo } = rooms[0];
  const floorMs = serverTime.getTime() - HEAP_POLICY.changesMaxLookbackMs;
  const clamp = (pos: HeapChangesPosition): HeapChangesPosition =>
    new Date(pos.ts).getTime() < floorMs ? { ts: new Date(floorMs).toISOString(), id: ZERO_UUID } : pos;
  const from = { guestbook: clamp(since.guestbook), pieces: clamp(since.pieces) };
  const pageSize = HEAP_POLICY.changesPageSize;

  const [guestbookRows, changedRows, visits] = await Promise.all([
    db
      .select({
        id: heapGuestbook.id,
        name: heapGuestbook.name,
        createdAt: heapGuestbook.createdAt,
        ts: isoMicros(heapGuestbook.createdAt),
      })
      .from(heapGuestbook)
      .where(
        and(
          eq(heapGuestbook.roomId, roomId),
          sql`(${heapGuestbook.createdAt}, ${heapGuestbook.id}) > (${from.guestbook.ts}::timestamptz, ${from.guestbook.id}::uuid)`,
        ),
      )
      .orderBy(asc(heapGuestbook.createdAt), asc(heapGuestbook.id))
      .limit(pageSize),
    pieceSelect(db, viewerId, { ts: isoMicros(heapPieces.updatedAt) })
      .where(
        and(
          eq(heapPieces.roomId, roomId),
          sql`(${heapPieces.updatedAt}, ${heapPieces.id}) > (${from.pieces.ts}::timestamptz, ${from.pieces.id}::uuid)`,
        ),
      )
      .orderBy(asc(heapPieces.updatedAt), asc(heapPieces.id))
      .limit(pageSize),
    getVisitCounts(roomId),
  ]);

  // 늦게 커밋된 변경을 놓치지 않도록 다 읽은 목록의 기준점은 서버 시각보다 조금 앞당긴다. 받는 쪽은 id로 합친다.
  const caughtUpMs = serverTime.getTime() - HEAP_POLICY.changesCursorOverlapMs;
  const advance = (
    rows: { ts: string; id: string }[],
    previous: HeapChangesPosition,
  ): HeapChangesPosition => {
    if (rows.length >= pageSize) return { ts: rows[rows.length - 1].ts, id: rows[rows.length - 1].id };
    return caughtUpMs > new Date(previous.ts).getTime() ? { ts: new Date(caughtUpMs).toISOString(), id: ZERO_UUID } : previous;
  };

  // 기준점용 ts 열은 응답에 싣지 않는다.
  const guestbook: HeapGuestbookEntry[] = guestbookRows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
  }));
  const changed: HeapPiece[] = changedRows.map((row) => {
    const piece: Partial<typeof row> = { ...row };
    delete piece.ts;
    return piece as HeapPiece;
  });
  const visible = (piece: HeapPiece) => piece.status === "voting" || piece.status === "landed";
  return {
    ...roomInfo,
    serverTime,
    guestbook,
    pieces: changed.filter(visible),
    removedPieceIds: changed.filter((piece) => !visible(piece)).map((piece) => piece.id),
    visits,
    nextCursor: { guestbook: advance(guestbookRows, from.guestbook), pieces: advance(changedRows, from.pieces) },
    more: guestbookRows.length >= pageSize || changedRows.length >= pageSize,
  };
}

// ---------- 쓰기 ----------

// 방문 기록. 한국 시간 기준으로 사용자당 하루 한 줄이라 여러 번 불러도 한 번만 남는다.
// 방 주인이 오면 "주인 다녀감" 시각도 새로 찍는다.
export async function recordVisit(
  roomId: string,
  userId: string,
): Promise<{ ok: true; firstToday: boolean } | Fail<"not-found">> {
  if (!isUuid(roomId)) return fail("not-found");
  const rooms = await db
    .select({ creatorId: heapRooms.creatorId })
    .from(heapRooms)
    .where(eq(heapRooms.id, roomId));
  if (!rooms[0]) return fail("not-found");

  // visit_day는 DB 기본값(한국 시간 오늘)을 쓴다.
  const inserted = await db
    .insert(heapVisits)
    .values({ roomId, userId })
    .onConflictDoNothing()
    .returning({ userId: heapVisits.userId });
  if (rooms[0].creatorId === userId) {
    await db.update(heapRooms).set({ creatorVisitedAt: sql`now()` }).where(eq(heapRooms.id, roomId));
  }
  return { ok: true, firstToday: inserted.length > 0 };
}

export async function addGuestbookEntry(
  roomId: string,
  userId: string,
  name: string,
): Promise<
  { ok: true; entry: HeapGuestbookEntry } | Fail<"not-found" | "invalid-name" | "rate-limited">
> {
  if (!isUuid(roomId)) return fail("not-found");
  const trimmed = name.trim();
  const length = charLength(trimmed);
  if (length < 1 || length > HEAP_POLICY.guestbookNameMaxChars) return fail("invalid-name");

  return db.transaction(async (tx) => {
    const rooms = await tx.select({ id: heapRooms.id }).from(heapRooms).where(eq(heapRooms.id, roomId));
    if (!rooms[0]) return fail("not-found");

    await lockUserInRoom(tx, "guestbook", roomId, userId);
    const today = await tx.$count(
      heapGuestbook,
      and(
        eq(heapGuestbook.roomId, roomId),
        eq(heapGuestbook.userId, userId),
        gte(heapGuestbook.createdAt, seoulDayStart),
      ),
    );
    if (today >= HEAP_POLICY.guestbookEntriesPerDay) return fail("rate-limited");

    const [entry] = await tx
      .insert(heapGuestbook)
      // 트랜잭션 시작 시각(now()) 대신 잠금을 얻은 뒤의 시각을 찍는다. 실시간 읽기 커서와 맞추기 위해서다.
      .values({ roomId, userId, name: trimmed, createdAt: sql`clock_timestamp()` })
      .returning({ id: heapGuestbook.id, name: heapGuestbook.name, createdAt: heapGuestbook.createdAt });
    return { ok: true as const, entry };
  });
}

// 꾸미기 저장. 방 주인만 할 수 있다. layout의 형식과 방 이름(name)의 규칙은 부르는 쪽이 먼저 검사한다 (layout.ts, slug.ts의 checkRoomName).
// name을 주면 같은 update에서 방 이름도 바꾼다: 레이아웃과 이름은 함께 저장되거나 함께 실패한다.
export async function saveRoomLayout(
  roomId: string,
  creatorId: string,
  layout: HeapLayout,
  name?: string,
): Promise<{ ok: true } | Fail<"not-found" | "not-owner">> {
  const ownership = await roomOwnership(db, roomId, creatorId);
  if (ownership !== "ok") return fail(ownership);
  // 힙에서 뺀 영상 목록(excludedReels)은 서버만 고친다. 클라이언트가 보낸 값은 버리고, DB에 있는 값을 그대로 남긴다.
  // 오래된 꾸미기 화면이 저장하면서 뺀 영상을 되살리는 일을 막는다.
  const { excludedReels: _ignored, ...fromClient } = layout;
  void _ignored;
  await db
    .update(heapRooms)
    .set({
      layout: sql`${JSON.stringify(fromClient)}::jsonb || case when ${heapRooms.layout} -> 'excludedReels' is not null then jsonb_build_object('excludedReels', ${heapRooms.layout} -> 'excludedReels') else '{}'::jsonb end`,
      ...(name === undefined ? {} : { name }),
      updatedAt: sql`now()`,
    })
    .where(and(eq(heapRooms.id, roomId), eq(heapRooms.creatorId, creatorId)));
  return { ok: true };
}

// 팬 조각 제출. parsed는 parsePieceUrl이 돌려준 값이어야 한다.
// 안전 필터는 아직 없어서 바로 투표(voting) 상태로 넣는다. 필터가 생기면 pending으로 넣고 필터가 넘긴다.
// 같은 방에 같은 출처가 이미 있으면(걷어낸 조각 포함) duplicate.
export async function submitPiece(
  roomId: string,
  userId: string,
  parsed: ParsedPiece,
  note: string,
): Promise<
  | { ok: true; piece: HeapPiece }
  | Fail<"not-found" | "invalid-note" | "rate-limited" | "duplicate">
> {
  if (!isUuid(roomId)) return fail("not-found");
  const trimmed = note.trim();
  if (charLength(trimmed) > HEAP_POLICY.pieceNoteMaxChars) return fail("invalid-note");

  return db.transaction(async (tx) => {
    const rooms = await tx.select({ id: heapRooms.id }).from(heapRooms).where(eq(heapRooms.id, roomId));
    if (!rooms[0]) return fail("not-found");

    await lockUserInRoom(tx, "piece", roomId, userId);
    const today = await tx.$count(
      heapPieces,
      and(
        eq(heapPieces.roomId, roomId),
        eq(heapPieces.submitterId, userId),
        gte(heapPieces.createdAt, seoulDayStart),
      ),
    );
    if (today >= HEAP_POLICY.pieceSubmitsPerDay) return fail("rate-limited");

    const inserted = await tx
      .insert(heapPieces)
      .values({
        roomId,
        submitterId: userId,
        platform: parsed.platform,
        externalId: parsed.externalId,
        sourceUrl: parsed.sourceUrl,
        thumbnailUrl: parsed.thumbnailUrl,
        wide: parsed.wide,
        note: trimmed,
        status: "voting",
      })
      .onConflictDoNothing({
        target: [heapPieces.roomId, heapPieces.platform, heapPieces.externalId],
      })
      .returning({ id: heapPieces.id });
    if (!inserted[0]) return fail("duplicate");

    const [piece] = await pieceSelect(tx, userId).where(eq(heapPieces.id, inserted[0].id));
    return { ok: true as const, piece };
  });
}

// 투표. 한 트랜잭션에서 방 행(공유 잠금) → 조각 행(for update) 순서로 잠근 뒤 표를 넣고 센다.
// 표 수가 방의 vote_threshold에 닿으면 그 자리에서 안착시킨다. 같은 사람이 다시 눌러도 표는 하나다.
// setVoteThreshold도 방 → 조각 순서로 잠그므로 서로 교착하지 않고, 기준이 바뀌는 도중의 표를 놓치지 않는다.
export async function votePiece(
  pieceId: string,
  userId: string,
): Promise<{ ok: true; votes: number; landed: boolean } | Fail<"not-found" | "wrong-status">> {
  if (!isUuid(pieceId)) return fail("not-found");

  return db.transaction(async (tx) => {
    const rooms = await tx
      .select({ voteThreshold: heapRooms.voteThreshold })
      .from(heapRooms)
      .where(
        inArray(
          heapRooms.id,
          tx.select({ id: heapPieces.roomId }).from(heapPieces).where(eq(heapPieces.id, pieceId)),
        ),
      )
      .for("share");
    if (!rooms[0]) return fail("not-found");

    const pieces = await tx
      .select({ status: heapPieces.status })
      .from(heapPieces)
      .where(eq(heapPieces.id, pieceId))
      .for("update");
    if (!pieces[0]) return fail("not-found");
    if (pieces[0].status !== "voting") return fail("wrong-status");

    const inserted = await tx
      .insert(heapPieceVotes)
      .values({ pieceId, userId })
      .onConflictDoNothing()
      .returning({ pieceId: heapPieceVotes.pieceId });
    const votes = await tx.$count(heapPieceVotes, eq(heapPieceVotes.pieceId, pieceId));

    const landed = votes >= rooms[0].voteThreshold;
    if (landed) {
      await tx
        .update(heapPieces)
        .set({ status: "landed", landedAt: clockNow, updatedAt: clockNow })
        .where(eq(heapPieces.id, pieceId));
    } else if (inserted.length > 0) {
      // 표 수가 바뀌었으니 실시간 읽기가 이 조각을 다시 가져가게 한다.
      await tx.update(heapPieces).set({ updatedAt: clockNow }).where(eq(heapPieces.id, pieceId));
    }
    return { ok: true as const, votes, landed };
  });
}

// 크리에이터가 조각을 걷어낸다. 방 주인만, 투표 중이거나 안착한 조각만.
export async function liftPiece(
  pieceId: string,
  creatorId: string,
): Promise<{ ok: true } | Fail<"not-found" | "not-owner" | "wrong-status">> {
  if (!isUuid(pieceId)) return fail("not-found");

  return db.transaction(async (tx) => {
    const pieces = await tx
      .select({ status: heapPieces.status, creatorId: heapRooms.creatorId })
      .from(heapPieces)
      .innerJoin(heapRooms, eq(heapRooms.id, heapPieces.roomId))
      .where(eq(heapPieces.id, pieceId))
      .for("update", { of: heapPieces });
    if (!pieces[0]) return fail("not-found");
    if (pieces[0].creatorId !== creatorId) return fail("not-owner");
    if (pieces[0].status !== "voting" && pieces[0].status !== "landed") return fail("wrong-status");

    await tx
      .update(heapPieces)
      .set({
        status: "lifted",
        // check 제약: lifted_at은 landed_at보다 이르면 안 된다. greatest는 null을 건너뛴다.
        liftedAt: sql`greatest(clock_timestamp(), ${heapPieces.landedAt})`,
        updatedAt: clockNow,
      })
      .where(eq(heapPieces.id, pieceId));
    return { ok: true as const };
  });
}

// 안착 기준을 바꾼다. 방 주인만. 새 기준을 이미 채운 투표 중 조각은 같은 트랜잭션에서 안착시킨다.
export async function setVoteThreshold(
  roomId: string,
  creatorId: string,
  threshold: number,
): Promise<
  | { ok: true; voteThreshold: number; landedPieceIds: string[] }
  | Fail<"not-found" | "not-owner" | "invalid-threshold">
> {
  if (
    !Number.isInteger(threshold) ||
    threshold < HEAP_POLICY.voteThresholdMin ||
    threshold > HEAP_POLICY.voteThresholdMax
  ) {
    return fail("invalid-threshold");
  }

  return db.transaction(async (tx) => {
    const ownership = await roomOwnership(tx, roomId, creatorId);
    if (ownership !== "ok") return fail(ownership);

    // 이 update가 방 행을 잠가, 진행 중인 투표가 끝난 뒤에 아래 안착 판정이 돈다.
    await tx
      .update(heapRooms)
      .set({ voteThreshold: threshold, updatedAt: sql`now()` })
      .where(eq(heapRooms.id, roomId));

    const landed = await tx
      .update(heapPieces)
      .set({ status: "landed", landedAt: clockNow, updatedAt: clockNow })
      .where(
        and(
          eq(heapPieces.roomId, roomId),
          eq(heapPieces.status, "voting"),
          inArray(
            heapPieces.id,
            tx
              .select({ id: heapPieceVotes.pieceId })
              .from(heapPieceVotes)
              .groupBy(heapPieceVotes.pieceId)
              .having(sql`count(*) >= ${threshold}`),
          ),
        ),
      )
      .returning({ id: heapPieces.id });

    return {
      ok: true as const,
      voteThreshold: threshold,
      landedPieceIds: landed.map((piece) => piece.id),
    };
  });
}

// ---------- 시드·동기화 ----------

export type HeapRoomInput = {
  slug: string;
  creatorId: string;
  name: string;
  blurb: string;
  layout: HeapLayout;
};

// 슬러그 기준으로 방을 만들거나 고친다. 주인은 바꾸지 않는다.
// 슬러그를 다른 사람이 쓰고 있으면 slug-taken, 이 크리에이터에게 다른 방이 있으면 creator-has-room.
export async function upsertRoom(
  input: HeapRoomInput,
): Promise<{ ok: true; roomId: string; created: boolean } | Fail<"slug-taken" | "creator-has-room">> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: heapRooms.id, slug: heapRooms.slug, creatorId: heapRooms.creatorId })
      .from(heapRooms)
      .where(or(eq(heapRooms.slug, input.slug), eq(heapRooms.creatorId, input.creatorId)));
    if (existing.some((room) => room.slug === input.slug && room.creatorId !== input.creatorId)) {
      return fail("slug-taken");
    }
    if (existing.some((room) => room.creatorId === input.creatorId && room.slug !== input.slug)) {
      return fail("creator-has-room");
    }

    if (existing[0]) {
      await tx
        .update(heapRooms)
        .set({ name: input.name, blurb: input.blurb, layout: input.layout, updatedAt: sql`now()` })
        .where(eq(heapRooms.id, existing[0].id));
      return { ok: true as const, roomId: existing[0].id, created: false };
    }
    const [created] = await tx.insert(heapRooms).values(input).returning({ id: heapRooms.id });
    return { ok: true as const, roomId: created.id, created: true };
  });
}

export type HeapReelInput = {
  platform: HeapChannelPlatform;
  externalId: string;
  sourceUrl: string;
  title: string;
  wide: boolean | null;
  viewCount: number | null;
  thumbnailUrl?: string | null;
  publishedAt?: Date | null;
  channelId?: string | null;
};

// 영상을 넣고, 이미 있는 영상은 제목·가로 여부·조회수만 새로 고친다. 돌려주는 값은 처리한 줄 수.
export async function upsertReels(roomId: string, reels: HeapReelInput[]): Promise<number> {
  if (reels.length === 0) return 0;
  const rows = await db
    .insert(heapReels)
    .values(reels.map((reel) => ({ ...reel, roomId })))
    .onConflictDoUpdate({
      target: [heapReels.roomId, heapReels.platform, heapReels.externalId],
      set: {
        title: sql`excluded.title`,
        wide: sql`excluded.wide`,
        viewCount: sql`excluded.view_count`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: heapReels.id });
  return rows.length;
}

export type HeapChannelInput = {
  creatorId: string;
  platform: HeapChannelPlatform;
  externalId: string;
  channelUrl: string;
  title: string;
};

// 크리에이터 채널을 넣거나 고친다. (creator_id, platform, external_id)가 같으면 주소와 이름만 새로 고친다.
export async function upsertCreatorChannel(
  input: HeapChannelInput,
): Promise<{ id: string; created: boolean }> {
  const [row] = await db
    .insert(heapCreatorChannels)
    .values(input)
    .onConflictDoUpdate({
      target: [heapCreatorChannels.creatorId, heapCreatorChannels.platform, heapCreatorChannels.externalId],
      set: { channelUrl: sql`excluded.channel_url`, title: sql`excluded.title`, updatedAt: sql`now()` },
    })
    .returning({
      id: heapCreatorChannels.id,
      // 새로 넣은 줄만 xmax가 0이다.
      created: sql<boolean>`(xmax = 0)`,
    });
  return row;
}

// 방의 영상을 채널에 잇는다. 영상 ID(external_id)로 찾고, 이미 같은 채널이면 건드리지 않는다.
// 채널은 방 주인의 것이어야 한다. 아니면 아무것도 잇지 않고 0을 돌려준다. 돌려주는 값은 새로 이은 줄 수.
export async function linkReelsToChannel(
  roomId: string,
  channelId: string,
  videoIds: string[],
): Promise<number> {
  if (videoIds.length === 0 || !isUuid(roomId) || !isUuid(channelId)) return 0;
  const owned = await db
    .select({ id: heapCreatorChannels.id })
    .from(heapCreatorChannels)
    .innerJoin(heapRooms, eq(heapRooms.creatorId, heapCreatorChannels.creatorId))
    .where(and(eq(heapCreatorChannels.id, channelId), eq(heapRooms.id, roomId)));
  if (!owned[0]) return 0;
  const rows = await db
    .update(heapReels)
    .set({ channelId, updatedAt: sql`now()` })
    .where(
      and(
        eq(heapReels.roomId, roomId),
        eq(heapReels.platform, "youtube"),
        inArray(heapReels.externalId, videoIds),
        sql`${heapReels.channelId} is distinct from ${channelId}`,
      ),
    )
    .returning({ id: heapReels.id });
  return rows.length;
}

// ---------- 크리에이터 깔때기: 방 만들기 ----------

export type HeapOwnRoom = { id: string; slug: string; name: string };

// 이 크리에이터의 방. 없으면 null. creator_id가 unique라서 한 줄이다.
export async function getRoomByCreator(creatorId: string): Promise<HeapOwnRoom | null> {
  const rows = await db
    .select({ id: heapRooms.id, slug: heapRooms.slug, name: heapRooms.name })
    .from(heapRooms)
    .where(eq(heapRooms.creatorId, creatorId))
    .limit(1);
  return rows[0] ?? null;
}

// 방을 만든다. 주소 중복과 "이미 방이 있음"의 최종 판단은 DB의 unique 제약이 한다:
// slug와 creator_id 어느 쪽이 부딪혀도 insert가 조용히 비켜 가고, 어느 쪽이었는지는 다시 읽어서 가린다.
// 검사(역할, 슬러그 규칙, 템플릿)는 부르는 쪽이 먼저 한다.
export async function claimRoom(input: {
  creatorId: string;
  slug: string;
  name: string;
  layout: HeapLayout;
}): Promise<{ ok: true; roomId: string; slug: string } | Fail<"slug-taken" | "already-has-room">> {
  const rows = await db
    .insert(heapRooms)
    .values({ creatorId: input.creatorId, slug: input.slug, name: input.name, blurb: "", layout: input.layout })
    .onConflictDoNothing()
    .returning({ id: heapRooms.id, slug: heapRooms.slug });
  if (rows[0]) return { ok: true, roomId: rows[0].id, slug: rows[0].slug };
  const own = await getRoomByCreator(input.creatorId);
  return fail(own ? "already-has-room" : "slug-taken");
}

// base 대신 쓸 만한 빈 주소 하나(base-2 ~ base-9). 모두 차 있으면 null.
export async function suggestFreeSlug(base: string): Promise<string | null> {
  const max = HEAP_FUNNEL_POLICY.slugMaxChars;
  const stem = base.slice(0, max - 2).replace(/-$/, "");
  const candidates = [2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${stem}-${n}`);
  const taken = await db
    .select({ slug: heapRooms.slug })
    .from(heapRooms)
    .where(inArray(heapRooms.slug, candidates));
  const used = new Set(taken.map((row) => row.slug));
  return candidates.find((slug) => !used.has(slug)) ?? null;
}

// ---------- 크리에이터 깔때기: 방 목록 (/rooms) ----------

export type HeapRoomCard = { slug: string; name: string; blurb: string; creatorName: string };

const cardSelect = () =>
  db
    .select({ slug: heapRooms.slug, name: heapRooms.name, blurb: heapRooms.blurb, creatorName: user.name })
    .from(heapRooms)
    .innerJoin(user, eq(user.id, heapRooms.creatorId));

// 따라가는 방: 이 사람이 참여한 버블 대화방(bubble_members)을 연 크리에이터의 방. 본인 방은 뺀다. 최근에 바뀐 방부터.
// 그런 방이 하나도 없으면 방문 기록(heap_visits)이 있는 방을 최근 방문 순으로 돌려준다. 읽기만 한다.
export async function listFollowedRooms(
  viewerId: string,
  limit: number = HEAP_FUNNEL_POLICY.roomsFollowedMax,
): Promise<{ source: "joined" | "visited"; rooms: HeapRoomCard[] }> {
  const joined = await cardSelect()
    .where(
      and(
        sql`${heapRooms.creatorId} <> ${viewerId}`,
        sql`exists (
          select 1 from ${bubbleRooms} b
          join bubble_members m on m.room_id = b.id
          where b.creator_id = ${heapRooms.creatorId} and m.user_id = ${viewerId}
        )`,
      ),
    )
    .orderBy(desc(heapRooms.updatedAt), asc(heapRooms.slug))
    .limit(limit);
  if (joined.length > 0) return { source: "joined", rooms: joined };

  const visited = await cardSelect()
    .innerJoin(
      sql`(select room_id, max(visit_day) as last_day from heap_visits where user_id = ${viewerId} group by room_id) as v`,
      sql`v.room_id = ${heapRooms.id}`,
    )
    .orderBy(sql`v.last_day desc`, asc(heapRooms.slug))
    .limit(limit);
  return { source: "visited", rooms: visited };
}

// 추천 방. slugs의 순서를 지키고, 없는 방은 건너뛴다.
export async function listFeaturedRooms(slugs: readonly string[]): Promise<HeapRoomCard[]> {
  const wanted = slugs.slice(0, HEAP_FUNNEL_POLICY.roomsFeaturedMax);
  if (wanted.length === 0) return [];
  const rows = await cardSelect().where(inArray(heapRooms.slug, wanted));
  return wanted.flatMap((slug) => rows.filter((row) => row.slug === slug));
}

// 크리에이터 닉네임과 방 이름의 부분 일치(대소문자 무시). query는 normalizeSearchQuery를 거친 값이어야 한다.
// 검색어는 파라미터로만 보내고 %, _, \는 글자 그대로 찾는다. 결과 수는 roomsSearchMax로 끊는다.
export async function searchRooms(query: string): Promise<HeapRoomCard[]> {
  const pattern = likePattern(query);
  return cardSelect()
    .where(or(sql`${user.name} ilike ${pattern}`, sql`${heapRooms.name} ilike ${pattern}`))
    .orderBy(asc(heapRooms.name), asc(heapRooms.slug))
    .limit(HEAP_FUNNEL_POLICY.roomsSearchMax);
}

// ---------- 크리에이터 깔때기: 영상 가져오기와 빼기 ----------

// 같은 크리에이터의 가져오기를 한 번에 하나만 돌린다. 락을 못 잡으면 locked: false (이미 가져오는 중).
// 세션 advisory lock을 전용 연결에 잡고 run이 끝날 때까지 쥔다. 연결이 끊기면 락도 풀린다.
export async function withImportLock<T>(
  creatorId: string,
  run: () => Promise<T>,
): Promise<{ locked: true; value: T } | { locked: false }> {
  const key = `heap:import:${creatorId}`;
  const client = await pool.connect();
  let broken = false;
  try {
    const got = await client.query<{ ok: boolean }>("select pg_try_advisory_lock(hashtextextended($1, 0)) as ok", [key]);
    if (!got.rows[0]?.ok) return { locked: false };
    try {
      return { locked: true, value: await run() };
    } finally {
      // 락을 못 풀었으면 이 연결을 풀에 돌려보내지 않고 닫는다.
      await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", [key]).catch(() => {
        broken = true;
      });
    }
  } finally {
    client.release(broken);
  }
}

// 이 크리에이터의 마지막 가져오기 시각. 채널을 연결할 때 channels 행의 updated_at이 갱신되므로 그 최댓값이다. 없으면 null.
export async function getLastImportAt(creatorId: string): Promise<Date | null> {
  const rows = await db
    .select({ at: sql<string | null>`max(${heapCreatorChannels.updatedAt})` })
    .from(heapCreatorChannels)
    .where(eq(heapCreatorChannels.creatorId, creatorId));
  const at = rows[0]?.at;
  return at ? new Date(at) : null;
}

// 연결하려는 채널의 상태: 이미 내가 연결했는지, 다른 크리에이터가 연결했는지, 내 같은 플랫폼 채널이 몇 개인지.
export async function getChannelState(
  creatorId: string,
  platform: HeapChannelPlatform,
  externalId: string,
): Promise<{ mine: boolean; heldByOther: boolean; mineCount: number }> {
  const rows = await db
    .select({ creatorId: heapCreatorChannels.creatorId, externalId: heapCreatorChannels.externalId })
    .from(heapCreatorChannels)
    .where(
      and(
        eq(heapCreatorChannels.platform, platform),
        or(eq(heapCreatorChannels.creatorId, creatorId), eq(heapCreatorChannels.externalId, externalId)),
      ),
    );
  return {
    mine: rows.some((row) => row.creatorId === creatorId && row.externalId === externalId),
    heldByOther: rows.some((row) => row.creatorId !== creatorId && row.externalId === externalId),
    mineCount: rows.filter((row) => row.creatorId === creatorId).length,
  };
}

// 채널을 이 크리에이터에게 연결한다 (이미 연결했으면 주소와 이름만 새로 고친다). 확인과 넣기를 한 트랜잭션에서 하고,
// 같은 채널에 대한 트랜잭션을 advisory lock으로 줄 세운다. heap_creator_channels의 unique 키에 creator_id가 들어 있어서
// 락이 없으면 두 크리에이터가 같은 채널을 동시에 넣을 수 있다. 늦은 쪽은 먼저 넣은 쪽을 보고 channel-taken을 받는다.
export async function claimCreatorChannel(
  input: HeapChannelInput,
  maxPerCreator: number,
): Promise<{ ok: true; id: string } | Fail<"channel-taken" | "channel-limit">> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`heap:channel:${input.platform}:${input.externalId}`}, 0))`,
    );
    const rows = await tx
      .select({ creatorId: heapCreatorChannels.creatorId, externalId: heapCreatorChannels.externalId })
      .from(heapCreatorChannels)
      .where(
        and(
          eq(heapCreatorChannels.platform, input.platform),
          or(eq(heapCreatorChannels.creatorId, input.creatorId), eq(heapCreatorChannels.externalId, input.externalId)),
        ),
      );
    if (rows.some((row) => row.creatorId !== input.creatorId && row.externalId === input.externalId)) {
      return fail("channel-taken");
    }
    const mine = rows.some((row) => row.creatorId === input.creatorId && row.externalId === input.externalId);
    if (!mine && rows.filter((row) => row.creatorId === input.creatorId).length >= maxPerCreator) {
      return fail("channel-limit");
    }
    const [saved] = await tx
      .insert(heapCreatorChannels)
      .values(input)
      .onConflictDoUpdate({
        target: [heapCreatorChannels.creatorId, heapCreatorChannels.platform, heapCreatorChannels.externalId],
        set: { channelUrl: sql`excluded.channel_url`, title: sql`excluded.title`, updatedAt: sql`now()` },
      })
      .returning({ id: heapCreatorChannels.id });
    return { ok: true as const, id: saved.id };
  });
}

export type ImportReelsResult = {
  added: Record<"shorts" | "long", number>;
  refreshed: number;
  // 상한 때문에 넣지 않은 새 영상 수
  skippedByCap: number;
  // 크리에이터가 힙에서 빼 둔 영상이라 건너뛴 수
  skippedExcluded: number;
  // 이 가져오기 뒤, 힙에 보이는 영상 수 (갈래별)
  visible: ReelCounts;
};

// 후보(candidates: 최근 순)를 방에 넣는다. 한 트랜잭션에서 방 행을 잠그고 다음 순서로 한다.
// 1) 크리에이터가 힙에서 뺀 영상은 건너뛴다. 2) 이미 있는 영상은 제목·조회수·채널만 새로 고친다 (가로 여부와 등록 시각은 두지 않는다).
// 3) 새 영상은 갈래별 상한(allocateCaps)이 허락하는 만큼 최근 것부터 넣는다. 이미 상한을 넘은 갈래는 새로 넣지 않을 뿐 지우지 않는다.
// 같은 후보로 다시 불러도 결과가 같다.
export async function importReels(input: {
  roomId: string;
  creatorId: string;
  channelId: string;
  candidates: ImportCandidate[];
}): Promise<ImportReelsResult | Fail<"no-room">> {
  return db.transaction(async (tx) => {
    const roomRows = await tx
      .select({ id: heapRooms.id, layout: heapRooms.layout })
      .from(heapRooms)
      .where(and(eq(heapRooms.id, input.roomId), eq(heapRooms.creatorId, input.creatorId)))
      .for("update");
    const room = roomRows[0];
    if (!room) return fail("no-room");

    const excluded = new Set(excludedReelKeys(room.layout));
    const existing = await tx
      .select({ platform: heapReels.platform, externalId: heapReels.externalId, wide: heapReels.wide })
      .from(heapReels)
      .where(eq(heapReels.roomId, room.id));
    const existingKeys = new Set(existing.map((reel) => `${reel.platform}:${reel.externalId}`));

    // 지금 힙에 보이는 영상의 갈래별 수 (뺀 영상은 세지 않는다)
    const have: ReelCounts = { shorts: 0, long: 0, instagram: 0 };
    for (const reel of existing) {
      if (!excluded.has(`${reel.platform}:${reel.externalId}`)) have[classifyReel(reel)] += 1;
    }

    let skippedExcluded = 0;
    const fresh: Record<ReelClass, ImportCandidate[]> = { shorts: [], long: [], instagram: [] };
    const refresh: ImportCandidate[] = [];
    for (const candidate of input.candidates) {
      const key = `youtube:${candidate.externalId}`;
      if (excluded.has(key)) skippedExcluded += 1;
      else if (existingKeys.has(key)) refresh.push(candidate);
      else fresh[classifyReel({ platform: "youtube", wide: candidate.wide })].push(candidate);
    }

    const available: ReelCounts = {
      shorts: have.shorts + fresh.shorts.length,
      long: have.long + fresh.long.length,
      instagram: have.instagram + fresh.instagram.length,
    };
    const allocation = allocateCaps(available);
    const chosen: ImportCandidate[] = [];
    const added = { shorts: 0, long: 0 };
    let skippedByCap = 0;
    for (const cls of REEL_CLASSES) {
      const slots = Math.max(0, allocation[cls] - have[cls]);
      const take = fresh[cls].slice(0, slots);
      skippedByCap += fresh[cls].length - take.length;
      chosen.push(...take);
      if (cls !== "instagram") added[cls] = take.length;
    }

    const rows = [...chosen, ...refresh].map((candidate) => ({
      roomId: room.id,
      channelId: input.channelId,
      platform: "youtube" as const,
      externalId: candidate.externalId,
      sourceUrl: candidate.sourceUrl,
      title: candidate.title,
      wide: candidate.wide,
      viewCount: candidate.viewCount,
      publishedAt: candidate.publishedAt,
    }));
    for (let i = 0; i < rows.length; i += 100) {
      await tx
        .insert(heapReels)
        .values(rows.slice(i, i + 100))
        .onConflictDoUpdate({
          target: [heapReels.roomId, heapReels.platform, heapReels.externalId],
          // 이미 있는 줄은 달라진 것만 고친다. 가로 여부(wide)와 등록 시각(created_at)은 그대로 둔다.
          set: {
            title: sql`excluded.title`,
            viewCount: sql`excluded.view_count`,
            channelId: sql`excluded.channel_id`,
            publishedAt: sql`coalesce(${heapReels.publishedAt}, excluded.published_at)`,
            updatedAt: sql`now()`,
          },
          setWhere: sql`${heapReels.title} is distinct from excluded.title
            or ${heapReels.viewCount} is distinct from excluded.view_count
            or ${heapReels.channelId} is distinct from excluded.channel_id
            or ${heapReels.publishedAt} is null`,
        });
    }

    const visible: ReelCounts = { ...have };
    visible.shorts += added.shorts;
    visible.long += added.long;
    return { added, refreshed: refresh.length, skippedByCap, skippedExcluded, visible };
  });
}

// 영상 하나를 힙에서 빼거나(excluded: true) 되돌린다. 방 주인만, 자기 방의 영상만 할 수 있다.
// 영상 행은 지우지 않는다. 방 layout의 excludedReels 목록("<platform>:<external_id>")에 키를 넣고 뺀다.
// 읽기 쪽(listReels)이 목록에 있는 영상을 걸러 내고, 가져오기도 뺀 영상은 다시 넣지 않는다.
// 이 목록은 서버만 고친다 (saveRoomLayout이 클라이언트 값을 버린다). 방이 바뀐 것으로 치지 않아 updated_at은 올리지 않는다.
export async function setReelExcluded(
  creatorId: string,
  reelId: string,
  excluded: boolean,
): Promise<{ ok: true; changed: boolean } | Fail<"no-room" | "reel-not-found" | "excluded-full">> {
  if (!isUuid(reelId)) return fail("reel-not-found");
  return db.transaction(async (tx) => {
    const roomRows = await tx
      .select({ id: heapRooms.id, layout: heapRooms.layout })
      .from(heapRooms)
      .where(eq(heapRooms.creatorId, creatorId))
      .for("update");
    const room = roomRows[0];
    if (!room) return fail("no-room");
    const reelRows = await tx
      .select({ platform: heapReels.platform, externalId: heapReels.externalId })
      .from(heapReels)
      .where(and(eq(heapReels.id, reelId), eq(heapReels.roomId, room.id)));
    const reel = reelRows[0];
    const key = reel ? `${reel.platform}:${reel.externalId}` : "";
    if (!reel || !REEL_KEY.test(key)) return fail("reel-not-found");

    const list = excludedReelKeys(room.layout);
    const has = list.includes(key);
    if (excluded === has) return { ok: true as const, changed: false };
    if (excluded && list.length >= HEAP_FUNNEL_POLICY.excludedReelsMax) return fail("excluded-full");
    const next = excluded ? [...list, key] : list.filter((item) => item !== key);
    await tx
      .update(heapRooms)
      .set({ layout: sql`jsonb_set(${heapRooms.layout}, '{excludedReels}', ${JSON.stringify(next)}::jsonb, true)` })
      .where(eq(heapRooms.id, room.id));
    return { ok: true as const, changed: true };
  });
}

export type HeapExcludedReel = { id: string; platform: HeapChannelPlatform; title: string; sourceUrl: string };

// 힙에서 뺀 영상 목록 (되돌리기 화면용). 이 크리에이터 방의 것만, 최근 순으로 돌려준다.
export async function listExcludedReels(creatorId: string): Promise<HeapExcludedReel[]> {
  const room = await db
    .select({ id: heapRooms.id, layout: heapRooms.layout })
    .from(heapRooms)
    .where(eq(heapRooms.creatorId, creatorId))
    .limit(1);
  if (!room[0]) return [];
  const keys = excludedReelKeys(room[0].layout);
  if (keys.length === 0) return [];
  return db
    .select({ id: heapReels.id, platform: heapReels.platform, title: heapReels.title, sourceUrl: heapReels.sourceUrl })
    .from(heapReels)
    .where(and(eq(heapReels.roomId, room[0].id), inArray(reelKeySql, keys)))
    .orderBy(sql`${heapReels.publishedAt} desc nulls last`, asc(heapReels.id))
    .limit(HEAP_FUNNEL_POLICY.excludedReelsMax);
}
