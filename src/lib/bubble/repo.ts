import { pool } from "@/lib/db";
import type { Viewer } from "@/lib/session";

export type ThreadRow = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  creator_name: string;
  subscriber_name: string;
  status: "open" | "closed";
  created_at: Date;
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

const THREAD_SELECT = `
  select t.id, t.creator_id, t.subscriber_id, t.status, t.created_at,
         c.name as creator_name, s.name as subscriber_name
  from bubble_threads t
  join "user" c on c.id = t.creator_id
  join "user" s on s.id = t.subscriber_id
`;

export async function findSubscriberByName(name: string) {
  const { rows } = await pool.query<{ id: string; name: string }>(
    `select id, name from "user"
     where name = $1 and coalesce(role, 'public') = 'public'
     limit 1`,
    [name],
  );
  return rows[0] ?? null;
}

export async function createOrGetThread(creatorId: string, subscriberId: string): Promise<string> {
  // 같은 크리에이터와 구독자 조합이면 기존 방 id를 돌려준다.
  const { rows } = await pool.query<{ id: string }>(
    `insert into bubble_threads (creator_id, subscriber_id)
     values ($1, $2)
     on conflict (creator_id, subscriber_id) do update set creator_id = excluded.creator_id
     returning id`,
    [creatorId, subscriberId],
  );
  return rows[0].id;
}

export async function getThread(threadId: string): Promise<ThreadRow | null> {
  const { rows } = await pool.query<ThreadRow>(`${THREAD_SELECT} where t.id = $1`, [threadId]);
  return rows[0] ?? null;
}

export function canAccessThread(thread: ThreadRow, viewer: Viewer): boolean {
  return (
    viewer.role === "admin" ||
    viewer.id === thread.creator_id ||
    viewer.id === thread.subscriber_id
  );
}

export function canSendInThread(thread: ThreadRow, viewer: Viewer): boolean {
  // 관리자는 대화에 끼지 않고 보기만 한다.
  return viewer.id === thread.creator_id || viewer.id === thread.subscriber_id;
}

export async function listThreadsFor(viewer: Viewer): Promise<ThreadRow[]> {
  if (viewer.role === "admin") {
    const { rows } = await pool.query<ThreadRow>(`${THREAD_SELECT} order by t.created_at desc`);
    return rows;
  }
  const { rows } = await pool.query<ThreadRow>(
    `${THREAD_SELECT}
     where t.creator_id = $1 or t.subscriber_id = $1
     order by t.created_at desc`,
    [viewer.id],
  );
  return rows;
}

export async function listMessages(
  threadId: string,
  viewerId: string,
  deleteWindowMs: number,
  limit = 200,
): Promise<MessageRow[]> {
  // 삭제된 메시지는 본문을 가리고 자리만 남긴다.
  // can_delete: 내가 보낸 메시지이고 삭제 가능 시간이 남아 있는지 DB에서 계산한다.
  const { rows } = await pool.query<MessageRow>(
    `select m.id, m.sender_id, u.name as sender_name,
            case when m.deleted_at is null then m.body end as body,
            m.created_at, m.deleted_at,
            (m.sender_id = $3 and m.deleted_at is null
              and m.created_at > now() - ($4::text || ' milliseconds')::interval) as can_delete
     from bubble_messages m
     join "user" u on u.id = m.sender_id
     where m.thread_id = $1
     order by m.created_at asc
     limit $2`,
    [threadId, limit, viewerId, deleteWindowMs],
  );
  return rows;
}

export async function recentMessagesForPreview(threadId: string, limit: number) {
  const { rows } = await pool.query<{ sender_id: string; creator_id: string; body: string }>(
    `select m.sender_id, t.creator_id, m.body
     from bubble_messages m
     join bubble_threads t on t.id = m.thread_id
     where m.thread_id = $1 and m.deleted_at is null
     order by m.created_at desc
     limit $2`,
    [threadId, limit],
  );
  // 시간순으로 되돌린다.
  return rows.reverse();
}

export async function insertMessage(threadId: string, senderId: string, body: string) {
  const { rows } = await pool.query<{ id: string }>(
    `insert into bubble_messages (thread_id, sender_id, body)
     values ($1, $2, $3) returning id`,
    [threadId, senderId, body],
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

export async function closeThread(threadId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `update bubble_threads set status = 'closed', closed_at = now()
     where id = $1 and status = 'open'`,
    [threadId],
  );
  return (rowCount ?? 0) > 0;
}
