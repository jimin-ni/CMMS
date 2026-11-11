import { pool } from "@/lib/db";
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

export type MessageRow = {
  id: string;
  sender_id: string;
  sender_name: string;
  body: string | null;
  created_at: Date;
  deleted_at: Date | null;
  can_delete: boolean;
};

// $1 = 보는 사람 id
const ROOM_SELECT = `
  select r.id, r.creator_id, c.name as creator_name, r.title, r.status, r.created_at,
         (select count(*)::int from bubble_members m where m.room_id = r.id) as member_count,
         exists (select 1 from bubble_members m where m.room_id = r.id and m.user_id = $1) as joined
  from bubble_rooms r
  join "user" c on c.id = r.creator_id
`;

export async function getRoom(roomId: string, viewerId: string): Promise<RoomRow | null> {
  const { rows } = await pool.query<RoomRow>(`${ROOM_SELECT} where r.id = $2`, [viewerId, roomId]);
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
    const { rows } = await pool.query<RoomRow>(`${ROOM_SELECT} order by r.created_at desc`, [
      viewer.id,
    ]);
    return rows;
  }
  if (viewer.role === "creator") {
    const { rows } = await pool.query<RoomRow>(
      `${ROOM_SELECT} where r.creator_id = $1 order by r.status desc, r.created_at desc`,
      [viewer.id],
    );
    return rows;
  }
  // 구독자: 참여한 방(닫힌 방 포함)과 참여할 수 있는 열린 방
  const { rows } = await pool.query<RoomRow>(
    `${ROOM_SELECT}
     where r.status = 'open'
        or exists (select 1 from bubble_members m where m.room_id = r.id and m.user_id = $1)
     order by r.status desc, r.created_at desc`,
    [viewer.id],
  );
  return rows;
}

export async function createRoom(creatorId: string, title: string): Promise<string | null> {
  // 열린 방이 이미 있으면 부분 유니크 인덱스에 걸려 아무것도 만들지 않는다.
  const { rows } = await pool.query<{ id: string }>(
    `insert into bubble_rooms (creator_id, title) values ($1, $2)
     on conflict (creator_id) where status = 'open' do nothing
     returning id`,
    [creatorId, title],
  );
  return rows[0]?.id ?? null;
}

export async function joinRoom(roomId: string, userId: string): Promise<void> {
  await pool.query(
    `insert into bubble_members (room_id, user_id) values ($1, $2)
     on conflict do nothing`,
    [roomId, userId],
  );
}

export async function listMessages(
  room: RoomRow,
  viewer: Viewer,
  deleteWindowMs: number,
  limit = 200,
): Promise<MessageRow[]> {
  // 삭제된 메시지는 본문을 가리고 자리만 남긴다.
  // can_delete: 내가 보낸 메시지이고 삭제 가능 시간이 남아 있는지 DB에서 계산한다.
  // $5가 false이면 보는 사람과 크리에이터가 보낸 메시지만 고른다.
  const { rows } = await pool.query<MessageRow>(
    `select * from (
       select m.id, m.sender_id, u.name as sender_name,
              case when m.deleted_at is null then m.body end as body,
              m.created_at, m.deleted_at,
              (m.sender_id = $3 and m.deleted_at is null
                and m.created_at > now() - ($4::text || ' milliseconds')::interval) as can_delete
       from bubble_messages m
       join "user" u on u.id = m.sender_id
       where m.room_id = $1
         and ($5 or m.sender_id = $3 or m.sender_id = $6)
       order by m.created_at desc
       limit $2
     ) recent
     order by created_at asc`,
    [room.id, limit, viewer.id, deleteWindowMs, seesAllMessages(room, viewer), room.creator_id],
  );
  return rows;
}

export async function recentMessagesForPreview(room: RoomRow, viewer: Viewer, limit: number) {
  // 미리보기 문맥도 보는 사람에게 보이는 메시지로만 만든다.
  const { rows } = await pool.query<{ sender_id: string; body: string }>(
    `select m.sender_id, m.body
     from bubble_messages m
     where m.room_id = $1 and m.deleted_at is null
       and ($3 or m.sender_id = $4 or m.sender_id = $5)
     order by m.created_at desc
     limit $2`,
    [room.id, limit, seesAllMessages(room, viewer), viewer.id, room.creator_id],
  );
  // 시간순으로 되돌린다.
  return rows.reverse();
}

export async function insertMessage(roomId: string, senderId: string, body: string) {
  const { rows } = await pool.query<{ id: string }>(
    `insert into bubble_messages (room_id, sender_id, body)
     values ($1, $2, $3) returning id`,
    [roomId, senderId, body],
  );
  return rows[0];
}

export async function getSendStats(senderId: string, windowMs: number) {
  const { rows } = await pool.query<{ last_sent_ms_ago: string | null; count: string }>(
    `select
       (extract(epoch from (now() - max(created_at))) * 1000)::text as last_sent_ms_ago,
       count(*)::text as count
     from bubble_messages
     where sender_id = $1 and created_at > now() - ($2::text || ' milliseconds')::interval`,
    [senderId, windowMs],
  );
  return {
    lastSentMsAgo: rows[0].last_sent_ms_ago === null ? null : Number(rows[0].last_sent_ms_ago),
    count: Number(rows[0].count),
  };
}

export async function softDeleteOwnMessage(
  messageId: string,
  senderId: string,
  windowMs: number,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `update bubble_messages
     set deleted_at = now()
     where id = $1 and sender_id = $2 and deleted_at is null
       and created_at > now() - ($3::text || ' milliseconds')::interval`,
    [messageId, senderId, windowMs],
  );
  return (rowCount ?? 0) > 0;
}

export async function closeRoom(roomId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `update bubble_rooms set status = 'closed', closed_at = now()
     where id = $1 and status = 'open'`,
    [roomId],
  );
  return (rowCount ?? 0) > 0;
}
