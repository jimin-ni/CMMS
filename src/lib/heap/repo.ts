import { and, asc, desc, eq, gte, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
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
import { HEAP_POLICY } from "@/lib/heap/policy";
import type { HeapChannelPlatform, HeapPiecePlatform, ParsedPiece } from "@/lib/heap/platform";

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

// 최근에 올라온 영상부터. 게시 시각을 모르는 영상은 등록 순서를 따른다.
export async function listReels(roomId: string, limit: number = HEAP_POLICY.snapshotReelsMax): Promise<HeapReel[]> {
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
    .where(eq(heapReels.roomId, roomId))
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
    listReels(room.id, HEAP_POLICY.snapshotReelsMax),
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

// 꾸미기 저장. 방 주인만 할 수 있다. layout의 형식은 부르는 쪽이 먼저 검사한다.
export async function saveRoomLayout(
  roomId: string,
  creatorId: string,
  layout: HeapLayout,
): Promise<{ ok: true } | Fail<"not-found" | "not-owner">> {
  const ownership = await roomOwnership(db, roomId, creatorId);
  if (ownership !== "ok") return fail(ownership);
  await db
    .update(heapRooms)
    .set({ layout, updatedAt: sql`now()` })
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
