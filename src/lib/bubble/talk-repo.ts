import { and, asc, desc, eq, exists, gt, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  creatorAvatars,
  creatorChatMembers,
  creatorChatMessages,
  creatorChats,
  user,
} from "@/lib/schema";
import { avatarUrl } from "@/lib/creator/avatar";
import type { Viewer } from "@/lib/session";
import { UUID_PATTERN, within, type MessageRow } from "./repo";

// 크리에이터 톡: 크리에이터끼리만 쓰는 1:1 또는 그룹 대화.
// 대화를 만들 때 참여자 모두의 역할을 DB에서 확인하고, 읽고 쓸 때마다 보는 사람의 역할과 참여 여부를 확인한다.

// 다른 크리에이터에게는 프로필 사진과 닉네임만 보여준다. 성격(페르소나)은 본인과 AI 미리보기만 쓴다.
export type CreatorCard = {
  id: string;
  name: string;
  avatar_url: string | null;
};

export type ChatRow = {
  id: string;
  title: string | null;
  // 보는 사람을 뺀 참여자 이름 (이름순)
  other_names: string[];
  member_count: number;
  last_message_at: Date | null;
  // 1:1 대화면 상대의 프로필 사진. 그룹 대화와 사진이 없는 경우 null.
  avatar_url: string | null;
};

export function canUseTalk(viewer: Viewer): boolean {
  return viewer.role === "creator";
}

// LIKE 패턴의 특수 문자를 글자 그대로 찾도록 바꾼다.
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listCreators(viewer: Viewer, query: string, limit: number): Promise<CreatorCard[]> {
  const q = query.trim();
  const rows = await db
    .select({ id: user.id, name: user.name, avatar_at: creatorAvatars.updatedAt })
    .from(user)
    .leftJoin(creatorAvatars, eq(creatorAvatars.userId, user.id))
    .where(
      and(
        eq(user.role, "creator"),
        ne(user.id, viewer.id),
        q ? ilike(user.name, `%${escapeLike(q)}%`) : undefined,
      ),
    )
    .orderBy(asc(user.name))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, name: r.name, avatar_url: avatarUrl(r.id, r.avatar_at) }));
}

// 넘겨받은 id가 모두 크리에이터인지 확인하고, 실제 크리에이터 id만 돌려준다.
export async function filterCreatorIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.id, ids), eq(user.role, "creator")));
  return rows.map((r) => r.id);
}

function directKeyOf(a: string, b: string): string {
  return [a, b].sort().join(":");
}

// 1:1 대화는 두 사람 사이에 하나만 둔다. 이미 있으면 그 대화를 돌려준다.
export async function findOrCreateDirectChat(viewerId: string, otherId: string): Promise<string> {
  const directKey = directKeyOf(viewerId, otherId);
  return db.transaction(async (tx) => {
    const created = await tx
      .insert(creatorChats)
      .values({ directKey, createdBy: viewerId })
      .onConflictDoNothing({ target: creatorChats.directKey })
      .returning({ id: creatorChats.id });
    if (created[0]) {
      await tx.insert(creatorChatMembers).values([
        { chatId: created[0].id, userId: viewerId },
        { chatId: created[0].id, userId: otherId },
      ]);
      return created[0].id;
    }
    const existing = await tx
      .select({ id: creatorChats.id })
      .from(creatorChats)
      .where(eq(creatorChats.directKey, directKey));
    return existing[0].id;
  });
}

export async function createGroupChat(
  viewerId: string,
  memberIds: string[],
  title: string | null,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [chat] = await tx
      .insert(creatorChats)
      .values({ title, createdBy: viewerId })
      .returning({ id: creatorChats.id });
    await tx
      .insert(creatorChatMembers)
      .values([viewerId, ...memberIds].map((userId) => ({ chatId: chat.id, userId })));
    return chat.id;
  });
}

function isChatMember(userId: string) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(creatorChatMembers)
      .where(and(eq(creatorChatMembers.chatId, creatorChats.id), eq(creatorChatMembers.userId, userId))),
  );
}

// select 목록 안의 sql 조각에서는 Drizzle이 열 이름만 쓰므로("id"), 서브쿼리에서 헷갈리지 않게 테이블 이름을 붙인다.
const CHAT_ID = sql`${creatorChats}.${sql.identifier("id")}`;
const LAST_MESSAGE_AT = sql`(select max(cm.created_at) from ${creatorChatMessages} cm where cm.chat_id = ${CHAT_ID})`;

function chatSelect(viewerId: string) {
  return db
    .select({
      id: creatorChats.id,
      title: creatorChats.title,
      other_names: sql<string[]>`coalesce((
        select array_agg(u.name order by u.name)
        from ${creatorChatMembers} m join ${user} u on u.id = m.user_id
        where m.chat_id = ${CHAT_ID} and m.user_id <> ${viewerId}
      ), '{}')`,
      member_count: db.$count(creatorChatMembers, eq(creatorChatMembers.chatId, creatorChats.id)),
      last_message_at: sql<Date | null>`${LAST_MESSAGE_AT}`.mapWith(creatorChatMessages.createdAt),
      // 1:1 대화의 상대 id와 상대 프로필 사진 수정 시각
      direct_other_id: sql<string | null>`case when ${creatorChats.directKey} is not null then (
        select m.user_id from ${creatorChatMembers} m
        where m.chat_id = ${CHAT_ID} and m.user_id <> ${viewerId} limit 1
      ) end`,
      direct_other_avatar_at: sql<Date | null>`case when ${creatorChats.directKey} is not null then (
        select a.updated_at from ${creatorAvatars} a join ${creatorChatMembers} m on m.user_id = a.user_id
        where m.chat_id = ${CHAT_ID} and m.user_id <> ${viewerId} limit 1
      ) end`.mapWith(creatorAvatars.updatedAt),
    })
    .from(creatorChats);
}

type ChatSelectRow = Awaited<ReturnType<typeof chatSelect>>[number];

function toChatRow({ direct_other_id, direct_other_avatar_at, ...chat }: ChatSelectRow): ChatRow {
  return {
    ...chat,
    avatar_url: direct_other_id ? avatarUrl(direct_other_id, direct_other_avatar_at) : null,
  };
}

export async function listChatsFor(viewer: Viewer): Promise<ChatRow[]> {
  const rows = await chatSelect(viewer.id)
    .where(isChatMember(viewer.id))
    .orderBy(desc(sql`coalesce(${LAST_MESSAGE_AT}, ${creatorChats.createdAt})`));
  return rows.map(toChatRow);
}

// 보는 사람이 참여한 대화만 돌려준다. 참여하지 않았거나 크리에이터가 아니면 null.
export async function getChatFor(chatId: string, viewer: Viewer): Promise<ChatRow | null> {
  if (!canUseTalk(viewer) || !UUID_PATTERN.test(chatId)) return null;
  const rows = await chatSelect(viewer.id).where(
    and(eq(creatorChats.id, chatId), isChatMember(viewer.id)),
  );
  return rows[0] ? toChatRow(rows[0]) : null;
}

export function chatDisplayName(chat: ChatRow): string {
  return chat.title ?? (chat.other_names.join(", ") || "나만 남은 대화");
}

export async function listChatMessages(
  chatId: string,
  viewer: Viewer,
  deleteWindowMs: number,
  options: { limit?: number; since?: Date } = {},
): Promise<MessageRow[]> {
  const { limit = 200, since } = options;
  const changed = since
    ? or(gt(creatorChatMessages.createdAt, since), gt(creatorChatMessages.deletedAt, since))
    : undefined;

  const rows = await db
    .select({
      id: creatorChatMessages.id,
      sender_id: creatorChatMessages.senderId,
      sender_name: user.name,
      sender_avatar_at: creatorAvatars.updatedAt,
      body: sql<string | null>`case when ${creatorChatMessages.deletedAt} is null then ${creatorChatMessages.body} end`,
      created_at: creatorChatMessages.createdAt,
      deleted_at: creatorChatMessages.deletedAt,
      can_delete: sql<boolean>`(${creatorChatMessages.senderId} = ${viewer.id}
        and ${creatorChatMessages.deletedAt} is null
        and ${within(creatorChatMessages.createdAt, deleteWindowMs)})`,
    })
    .from(creatorChatMessages)
    .innerJoin(user, eq(user.id, creatorChatMessages.senderId))
    .leftJoin(creatorAvatars, eq(creatorAvatars.userId, creatorChatMessages.senderId))
    .where(and(eq(creatorChatMessages.chatId, chatId), changed))
    .orderBy(desc(creatorChatMessages.createdAt))
    .limit(limit);

  return rows.reverse().map(({ sender_avatar_at, ...m }) => ({
    ...m,
    sender_avatar_url: avatarUrl(m.sender_id, sender_avatar_at),
    created_at: m.created_at.toISOString(),
    deleted_at: m.deleted_at?.toISOString() ?? null,
  }));
}

export async function insertChatMessage(chatId: string, senderId: string, body: string) {
  await db.insert(creatorChatMessages).values({ chatId, senderId, body });
}

export async function getChatSendStats(senderId: string, windowMs: number) {
  const rows = await db
    .select({
      lastSentMsAgo: sql<number | null>`(extract(epoch from (now() - max(${creatorChatMessages.createdAt}))) * 1000)::float8`,
      count: sql<number>`count(*)::int`,
    })
    .from(creatorChatMessages)
    .where(and(eq(creatorChatMessages.senderId, senderId), within(creatorChatMessages.createdAt, windowMs)));
  return {
    lastSentMsAgo: rows[0].lastSentMsAgo === null ? null : Number(rows[0].lastSentMsAgo),
    count: Number(rows[0].count),
  };
}

export async function softDeleteOwnChatMessage(
  messageId: string,
  senderId: string,
  windowMs: number,
): Promise<boolean> {
  if (!UUID_PATTERN.test(messageId)) return false;
  const rows = await db
    .update(creatorChatMessages)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(creatorChatMessages.id, messageId),
        eq(creatorChatMessages.senderId, senderId),
        isNull(creatorChatMessages.deletedAt),
        within(creatorChatMessages.createdAt, windowMs),
      ),
    )
    .returning({ id: creatorChatMessages.id });
  return rows.length > 0;
}
