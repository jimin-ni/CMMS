import { and, desc, eq, exists, gt, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { bubbleMembers, bubbleMessages, bubbleRooms, user } from "@/lib/schema";
import type { Viewer } from "@/lib/session";

// 버블 대화방: 크리에이터 1명이 열고, 구독자 여러 명이 직접 참여한다.
// 크리에이터와 관리자는 방의 모든 메시지를 보고,
// 구독자는 자신의 메시지와 크리에이터의 메시지만 본다.

export type RoomRow = {
  id: string;
  creator_id: string;
  creator_name: string;
  title: string;
  status: "open" | "closed";
  created_at: Date;
  member_count: number;
  // 보는 사람이 참여한 방인지
  joined: boolean;
};

// 클라이언트로 그대로 보내므로 시간은 ISO 문자열로 둔다.
export type MessageRow = {
  id: string;
  sender_id: string;
  sender_name: string;
  body: string | null;
  created_at: string;
  deleted_at: string | null;
  can_delete: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// col이 지금으로부터 ms 안쪽인지
function within(col: AnyPgColumn, ms: number): SQL {
  return sql`${col} > now() - ${ms}::int * interval '1 millisecond'`;
}

function isMember(userId: string): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(bubbleMembers)
      .where(and(eq(bubbleMembers.roomId, bubbleRooms.id), eq(bubbleMembers.userId, userId))),
  );
}

function roomSelect(viewerId: string) {
  return db
    .select({
      id: bubbleRooms.id,
      creator_id: bubbleRooms.creatorId,
      creator_name: user.name,
      title: bubbleRooms.title,
      status: bubbleRooms.status,
      created_at: bubbleRooms.createdAt,
      member_count: db.$count(bubbleMembers, eq(bubbleMembers.roomId, bubbleRooms.id)),
      joined: sql<boolean>`${isMember(viewerId)}`,
    })
    .from(bubbleRooms)
    .innerJoin(user, eq(user.id, bubbleRooms.creatorId));
}

export async function getRoom(roomId: string, viewerId: string): Promise<RoomRow | null> {
  // 주소에서 온 값이 uuid가 아니면 DB 오류 대신 없는 방으로 본다.
  if (!UUID_PATTERN.test(roomId)) return null;
  const rows = await roomSelect(viewerId).where(eq(bubbleRooms.id, roomId));
  return rows[0] ?? null;
}

export function seesAllMessages(room: RoomRow, viewer: Viewer): boolean {
  return viewer.role === "admin" || viewer.id === room.creator_id;
}

export function canAccessRoom(room: RoomRow, viewer: Viewer): boolean {
  return seesAllMessages(room, viewer) || room.joined;
}

export function canSendInRoom(room: RoomRow, viewer: Viewer): boolean {
  // 관리자는 대화에 끼지 않고 보기만 한다.
  return room.status === "open" && (viewer.id === room.creator_id || room.joined);
}

export function canJoinRoom(room: RoomRow, viewer: Viewer): boolean {
  // 구독·결제가 없는 동안은 구독자 누구나 열린 방에 참여할 수 있다.
  return room.status === "open" && viewer.role === "public" && !room.joined;
}

export async function listRoomsFor(viewer: Viewer): Promise<RoomRow[]> {
  if (viewer.role === "admin") {
    return roomSelect(viewer.id).orderBy(desc(bubbleRooms.createdAt));
  }
  // 'open'이 'closed'보다 뒤라서 status 내림차순이면 열린 방이 먼저 온다.
  if (viewer.role === "creator") {
    return roomSelect(viewer.id)
      .where(eq(bubbleRooms.creatorId, viewer.id))
      .orderBy(desc(bubbleRooms.status), desc(bubbleRooms.createdAt));
  }
  // 구독자: 참여한 방(닫힌 방 포함)과 참여할 수 있는 열린 방
  return roomSelect(viewer.id)
    .where(or(eq(bubbleRooms.status, "open"), isMember(viewer.id)))
    .orderBy(desc(bubbleRooms.status), desc(bubbleRooms.createdAt));
}

export async function createRoom(creatorId: string, title: string): Promise<string | null> {
  // 열린 방이 이미 있으면 부분 유니크 인덱스에 걸려 아무것도 만들지 않는다.
  const rows = await db
    .insert(bubbleRooms)
    .values({ creatorId, title })
    .onConflictDoNothing({ target: bubbleRooms.creatorId, where: sql`status = 'open'` })
    .returning({ id: bubbleRooms.id });
  return rows[0]?.id ?? null;
}

export async function joinRoom(roomId: string, userId: string): Promise<void> {
  await db.insert(bubbleMembers).values({ roomId, userId }).onConflictDoNothing();
}

// 보는 사람에게 보이는 메시지만 고르는 조건. 구독자는 자신과 크리에이터의 메시지만 본다.
function visibleTo(room: RoomRow, viewer: Viewer): SQL | undefined {
  if (seesAllMessages(room, viewer)) return undefined;
  return or(eq(bubbleMessages.senderId, viewer.id), eq(bubbleMessages.senderId, room.creator_id));
}

// DB 시각(밀리초). 실시간 읽기의 기준점으로 쓴다.
export async function dbNowMs(): Promise<number> {
  const result = await db.execute<{ ms: number }>(
    sql`select (extract(epoch from now()) * 1000)::float8 as ms`,
  );
  return Number(result.rows[0].ms);
}

export async function listMessages(
  room: RoomRow,
  viewer: Viewer,
  deleteWindowMs: number,
  options: { limit?: number; since?: Date } = {},
): Promise<MessageRow[]> {
  const { limit = 200, since } = options;
  // since가 있으면 그 뒤에 생기거나 삭제된 메시지만 가져온다.
  const changed = since
    ? or(gt(bubbleMessages.createdAt, since), gt(bubbleMessages.deletedAt, since))
    : undefined;

  const rows = await db
    .select({
      id: bubbleMessages.id,
      sender_id: bubbleMessages.senderId,
      sender_name: user.name,
      // 삭제된 메시지는 본문을 가리고 자리만 남긴다.
      body: sql<string | null>`case when ${bubbleMessages.deletedAt} is null then ${bubbleMessages.body} end`,
      created_at: bubbleMessages.createdAt,
      deleted_at: bubbleMessages.deletedAt,
      // 내가 보낸 메시지이고 삭제 가능 시간이 남아 있는지 DB에서 계산한다.
      can_delete: sql<boolean>`(${bubbleMessages.senderId} = ${viewer.id}
        and ${bubbleMessages.deletedAt} is null
        and ${within(bubbleMessages.createdAt, deleteWindowMs)})`,
    })
    .from(bubbleMessages)
    .innerJoin(user, eq(user.id, bubbleMessages.senderId))
    .where(and(eq(bubbleMessages.roomId, room.id), visibleTo(room, viewer), changed))
    .orderBy(desc(bubbleMessages.createdAt))
    .limit(limit);

  // 최근 것부터 잘랐으니 시간순으로 되돌린다.
  return rows.reverse().map((m) => ({
    ...m,
    created_at: m.created_at.toISOString(),
    deleted_at: m.deleted_at?.toISOString() ?? null,
  }));
}

export async function recentMessagesForPreview(room: RoomRow, viewer: Viewer, limit: number) {
  // 미리보기 문맥도 보는 사람에게 보이는 메시지로만 만든다.
  const rows = await db
    .select({ sender_id: bubbleMessages.senderId, body: bubbleMessages.body })
    .from(bubbleMessages)
    .where(
      and(
        eq(bubbleMessages.roomId, room.id),
        isNull(bubbleMessages.deletedAt),
        visibleTo(room, viewer),
      ),
    )
    .orderBy(desc(bubbleMessages.createdAt))
    .limit(limit);
  // 시간순으로 되돌린다.
  return rows.reverse();
}

export async function insertMessage(roomId: string, senderId: string, body: string) {
  const rows = await db
    .insert(bubbleMessages)
    .values({ roomId, senderId, body })
    .returning({ id: bubbleMessages.id });
  return rows[0];
}

export async function getSendStats(senderId: string, windowMs: number) {
  const rows = await db
    .select({
      lastSentMsAgo: sql<number | null>`(extract(epoch from (now() - max(${bubbleMessages.createdAt}))) * 1000)::float8`,
      count: sql<number>`count(*)::int`,
    })
    .from(bubbleMessages)
    .where(and(eq(bubbleMessages.senderId, senderId), within(bubbleMessages.createdAt, windowMs)));
  return {
    lastSentMsAgo: rows[0].lastSentMsAgo === null ? null : Number(rows[0].lastSentMsAgo),
    count: Number(rows[0].count),
  };
}

export async function softDeleteOwnMessage(
  messageId: string,
  senderId: string,
  windowMs: number,
): Promise<boolean> {
  if (!UUID_PATTERN.test(messageId)) return false;
  const rows = await db
    .update(bubbleMessages)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(bubbleMessages.id, messageId),
        eq(bubbleMessages.senderId, senderId),
        isNull(bubbleMessages.deletedAt),
        within(bubbleMessages.createdAt, windowMs),
      ),
    )
    .returning({ id: bubbleMessages.id });
  return rows.length > 0;
}

export async function closeRoom(roomId: string): Promise<boolean> {
  const rows = await db
    .update(bubbleRooms)
    .set({ status: "closed", closedAt: sql`now()` })
    .where(and(eq(bubbleRooms.id, roomId), eq(bubbleRooms.status, "open")))
    .returning({ id: bubbleRooms.id });
  return rows.length > 0;
}
