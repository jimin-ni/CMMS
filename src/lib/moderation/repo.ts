// AI 스크리닝 저장 계층 (문서 6~12장). 경고 기록, 자동 차단, 신고, 크리에이터 차단, 검토, 재검토 요청, 열람 기록.
// 모든 권한 조건은 여기 쿼리에 넣는다. 화면에서 버튼을 숨기는 것만으로는 막히지 않는다.
import "server-only";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bubbleMessages,
  bubbleRooms,
  heapGuestbook,
  heapNotes,
  heapRooms,
  moderationAccessLog,
  moderationEvents,
  sanctionAppeals,
  sanctions,
  user,
  userAgeChecks,
} from "@/lib/schema";
import type { Viewer } from "@/lib/session";
import { MODERATION_POLICY } from "./policy";
import type { ScreenResult } from "./screen";
import {
  applyAutoBlock,
  countStrikes as countStrikesWith,
  lockUser,
  planScreen,
  recordScreenEvent,
  takeDownPosts,
  type Executor,
  type PostSurface,
  type SaveNotice,
  type Tx,
} from "./persist";

export { planScreen, recordScreenEvent };
export type { PostSurface, SaveNotice, ScreenPlan, Tx } from "./persist";

const P = MODERATION_POLICY;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── 쓰기 가능 확인 (문서 3-3, 7-3, 9장) ───

export type WriteBlock =
  | { reason: "under_age" }
  | { reason: "sanction"; sanctionId: string; appealed: boolean };

// roomOwnerId: 글을 쓰려는 방의 주인. 그 주인이 건 크리에이터 차단과 자동·전체 차단을 본다.
export async function getWriteBlock(userId: string, roomOwnerId: string): Promise<WriteBlock | null> {
  const [age] = await db
    .select({ ok: userAgeChecks.is14OrOlder })
    .from(userAgeChecks)
    .where(eq(userAgeChecks.userId, userId));
  // 답 기록이 없는 계정은 테스트 계정으로 보고 막지 않는다 (문서 3-3).
  if (age && !age.ok) return { reason: "under_age" };

  // 재검토 요청은 차단 하나당 하나(sanction_id 유니크)라 left join으로 붙여도 행이 늘지 않는다.
  const [active] = await db
    .select({ id: sanctions.id, appealId: sanctionAppeals.id })
    .from(sanctions)
    .leftJoin(sanctionAppeals, eq(sanctionAppeals.sanctionId, sanctions.id))
    .where(
      and(
        eq(sanctions.userId, userId),
        isNull(sanctions.revokedAt),
        or(
          inArray(sanctions.scope, ["auto", "global"]),
          and(eq(sanctions.scope, "owner"), eq(sanctions.roomOwnerId, roomOwnerId)),
        ),
      ),
    )
    .orderBy(desc(sanctions.createdAt))
    .limit(1);
  return active ? { reason: "sanction", sanctionId: active.id, appealed: active.appealId !== null } : null;
}

// ─── 판정 전 도배 방지 (문서 13장) ───

export type PreScreenBlock = { kind: "repeat" } | { kind: "cooldown"; seconds: number } | null;

export async function chatPreScreenBlock(userId: string, normalizedHash: string): Promise<PreScreenBlock> {
  return preScreenBlock("chat", userId, normalizedHash);
}

// 같은 글 반복(표면마다 그 표면의 내 글)과 위반 직후 대기(표면마다)
export async function preScreenBlock(surface: PostSurface, userId: string, normalizedHash: string): Promise<PreScreenBlock> {
  const since = (col: typeof bubbleMessages.createdAt | typeof heapNotes.createdAt | typeof heapGuestbook.createdAt) =>
    sql`${col} > now() - ${P.repeatWindowMs}::int * interval '1 millisecond'`;
  const repeatQuery =
    surface === "chat"
      ? db
          .select({ one: sql`1` })
          .from(bubbleMessages)
          .where(
            and(
              eq(bubbleMessages.senderId, userId),
              eq(bubbleMessages.normalizedHash, normalizedHash),
              since(bubbleMessages.createdAt),
            ),
          )
      : surface === "note"
        ? db
            .select({ one: sql`1` })
            .from(heapNotes)
            .where(
              and(eq(heapNotes.authorId, userId), eq(heapNotes.normalizedHash, normalizedHash), since(heapNotes.createdAt)),
            )
        : db
            .select({ one: sql`1` })
            .from(heapGuestbook)
            .where(
              and(
                eq(heapGuestbook.userId, userId),
                eq(heapGuestbook.normalizedHash, normalizedHash),
                since(heapGuestbook.createdAt),
              ),
            );
  const [repeat] = await repeatQuery.limit(1);
  if (repeat) return { kind: "repeat" };

  const [last] = await db
    .select({
      msAgo: sql<number>`(extract(epoch from (now() - max(${moderationEvents.createdAt}))) * 1000)::float8`,
    })
    .from(moderationEvents)
    .where(
      and(
        eq(moderationEvents.userId, userId),
        eq(moderationEvents.surface, surface),
        eq(moderationEvents.source, "auto"),
        eq(moderationEvents.countsAsStrike, true),
      ),
    );
  const msAgo = last?.msAgo === null || last?.msAgo === undefined ? null : Number(last.msAgo);
  if (msAgo !== null && msAgo < P.cooldownAfterViolationMs) {
    return { kind: "cooldown", seconds: Math.ceil((P.cooldownAfterViolationMs - msAgo) / 1000) };
  }
  return null;
}

// ─── 경고 수, 자동 차단, 판정 결과 반영 (문서 6~9장) ───
// 코드는 persist.ts에 있다. Render Workflow(사후 재판정)와 같이 쓰기 때문이다. 여기서는 웹 서비스의 db를 붙여 내보낸다.

export async function countStrikes(userId: string, exec: Executor = db): Promise<number> {
  return countStrikesWith(userId, exec);
}

export async function saveChatMessage(args: {
  roomId: string;
  roomOwnerId: string;
  senderId: string;
  body: string;
  result: ScreenResult;
  privileged: boolean;
}): Promise<SaveNotice> {
  const { result } = args;
  return db.transaction(async (tx) => {
    const plan = await planScreen(tx, args.senderId, result, args.privileged);
    const [msg] = await tx
      .insert(bubbleMessages)
      .values({
        roomId: args.roomId,
        senderId: args.senderId,
        body: args.body,
        screenStatus: plan.status,
        screenedAt: sql`now()`,
        normalizedHash: result.normalizedHash,
      })
      .returning({ id: bubbleMessages.id });
    return recordScreenEvent(tx, {
      userId: args.senderId,
      roomOwnerId: args.roomOwnerId,
      surface: "chat",
      targetId: msg.id,
      result,
      plan,
    });
  });
}

// ─── 권한 도우미 (문서 12장) ───

async function chatMessageWithOwner(messageId: string, exec: Executor = db) {
  if (!UUID.test(messageId)) return null;
  const [row] = await exec
    .select({
      id: bubbleMessages.id,
      senderId: bubbleMessages.senderId,
      body: bubbleMessages.body,
      screenStatus: bubbleMessages.screenStatus,
      deletedAt: bubbleMessages.deletedAt,
      roomOwnerId: bubbleRooms.creatorId,
    })
    .from(bubbleMessages)
    .innerJoin(bubbleRooms, eq(bubbleRooms.id, bubbleMessages.roomId))
    .where(eq(bubbleMessages.id, messageId));
  return row ?? null;
}

async function roleOf(userId: string): Promise<string | null> {
  const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId));
  return row ? (row.role ?? "public") : null;
}

// ─── 신고 (문서 8장) ───

export async function reportChatMessage(messageId: string, viewer: Viewer): Promise<{ ok: boolean; error?: string }> {
  return db.transaction(async (tx) => {
    const msg = await chatMessageWithOwner(messageId, tx);
    if (!msg) return { ok: false, error: "메시지를 찾을 수 없어요." };
    if (viewer.role !== "admin" && viewer.id !== msg.roomOwnerId) return { ok: false, error: "신고할 권한이 없어요." };
    if (msg.senderId === msg.roomOwnerId) return { ok: false, error: "방 주인의 글은 신고할 수 없어요." };
    if (msg.screenStatus !== "published" || msg.deletedAt) return { ok: false, error: "이미 내려간 글이에요." };

    await lockUser(tx, msg.senderId);
    await tx
      .update(bubbleMessages)
      .set({ screenStatus: "removed", statusChangedAt: sql`now()` })
      .where(eq(bubbleMessages.id, msg.id));
    // 글 하나에 기록 하나. 검토에서 풀린 글(hold_review 해제)을 신고하면 그 기록을 신고로 바꾼다.
    await tx
      .insert(moderationEvents)
      .values({
        userId: msg.senderId,
        roomOwnerId: msg.roomOwnerId,
        surface: "chat",
        targetId: msg.id,
        source: "report",
        kind: "abuse",
        countsAsStrike: true,
        reportedBy: viewer.id,
      })
      .onConflictDoUpdate({
        target: [moderationEvents.surface, moderationEvents.targetId],
        set: { source: "report", kind: "abuse", countsAsStrike: true, reportedBy: viewer.id, reviewStatus: "none" },
      });
    await applyAutoBlock(tx, msg.senderId);
    return { ok: true };
  });
}

// ─── 쪽지·방명록 글 (0013) ───

export type HeapSurface = "note" | "guestbook";

// 쪽지·방명록 한 줄과 그 방의 주인. 작성자 id는 서버 안에서만 쓴다 (익명 쪽지도 차단은 실제 작성자에게, #95 2번).
async function heapPostWithOwner(surface: HeapSurface, id: string, exec: Executor = db) {
  if (!UUID.test(id)) return null;
  if (surface === "note") {
    const [row] = await exec
      .select({
        id: heapNotes.id,
        authorId: heapNotes.authorId,
        body: heapNotes.body,
        displayName: heapNotes.displayName,
        screenStatus: heapNotes.screenStatus,
        roomOwnerId: heapRooms.creatorId,
      })
      .from(heapNotes)
      .innerJoin(heapRooms, eq(heapRooms.id, heapNotes.roomId))
      .where(eq(heapNotes.id, id));
    return row
      ? { ...row, text: row.displayName ? `${row.displayName}\n${row.body}` : row.body }
      : null;
  }
  const [row] = await exec
    .select({
      id: heapGuestbook.id,
      authorId: heapGuestbook.userId,
      name: heapGuestbook.name,
      screenStatus: heapGuestbook.screenStatus,
      roomOwnerId: heapRooms.creatorId,
    })
    .from(heapGuestbook)
    .innerJoin(heapRooms, eq(heapRooms.id, heapGuestbook.roomId))
    .where(eq(heapGuestbook.id, id));
  return row ? { ...row, text: row.name } : null;
}

// 쪽지·방명록 판정 상태 바꾸기. 변경 읽기 커서(쪽지 updated_at, 방명록 status_changed_at)도 함께 바꾼다.
async function setHeapStatus(
  tx: Tx,
  surface: HeapSurface,
  id: string,
  to: "published" | "removed",
  from: "published" | "held",
) {
  if (surface === "note") {
    await tx
      .update(heapNotes)
      .set({ screenStatus: to, updatedAt: sql`clock_timestamp()` })
      .where(and(eq(heapNotes.id, id), eq(heapNotes.screenStatus, from)));
  } else {
    await tx
      .update(heapGuestbook)
      .set({ screenStatus: to, statusChangedAt: sql`clock_timestamp()` })
      .where(and(eq(heapGuestbook.id, id), eq(heapGuestbook.screenStatus, from)));
  }
}

// 신고 (문서 8장). 채팅 신고와 같은 규칙: 방 주인(자기 방)과 관리자만, 방 주인의 글은 안 됨, 글을 내리고 경고 +1.
export async function reportHeapPost(
  surface: HeapSurface,
  id: string,
  viewer: Viewer,
): Promise<{ ok: boolean; error?: string }> {
  return db.transaction(async (tx) => {
    const post = await heapPostWithOwner(surface, id, tx);
    if (!post) return { ok: false, error: "글을 찾을 수 없어요." };
    if (viewer.role !== "admin" && viewer.id !== post.roomOwnerId) return { ok: false, error: "신고할 권한이 없어요." };
    if (post.authorId === post.roomOwnerId) return { ok: false, error: "방 주인의 글은 신고할 수 없어요." };
    if (post.screenStatus !== "published") return { ok: false, error: "이미 내려간 글이에요." };

    await lockUser(tx, post.authorId);
    await setHeapStatus(tx, surface, post.id, "removed", "published");
    await tx
      .insert(moderationEvents)
      .values({
        userId: post.authorId,
        roomOwnerId: post.roomOwnerId,
        surface,
        targetId: post.id,
        source: "report",
        kind: "abuse",
        countsAsStrike: true,
        reportedBy: viewer.id,
      })
      .onConflictDoUpdate({
        target: [moderationEvents.surface, moderationEvents.targetId],
        set: { source: "report", kind: "abuse", countsAsStrike: true, reportedBy: viewer.id, reviewStatus: "none" },
      });
    await applyAutoBlock(tx, post.authorId);
    return { ok: true };
  });
}

// 쪽지·방명록에서 작성자 차단 (크리에이터 차단·전체 차단, 문서 9장). 화면은 글 id만 안다.
export async function blockHeapAuthor(
  surface: HeapSurface,
  id: string,
  viewer: Viewer,
): Promise<{ ok: boolean; error?: string }> {
  const post = await heapPostWithOwner(surface, id);
  if (!post) return { ok: false, error: "글을 찾을 수 없어요." };
  return blockUser(post.authorId, viewer);
}

// 내려간 쪽지·방명록 원문 보기 (문서 8장, 11-4). 방 주인(자기 방)과 관리자만. 열람을 기록한다.
export async function revealHeapOriginal(surface: HeapSurface, id: string, viewer: Viewer): Promise<string | null> {
  const post = await heapPostWithOwner(surface, id);
  if (!post) return null;
  if (viewer.role !== "admin" && viewer.id !== post.roomOwnerId) return null;
  if (post.screenStatus !== "removed") return null;
  await logAccess(viewer.id, [{ surface, targetId: post.id, eventId: null }]);
  return post.text;
}

// ─── 크리에이터 차단, 전체 차단 (문서 9장) ───

export async function blockUser(targetUserId: string, viewer: Viewer): Promise<{ ok: boolean; error?: string }> {
  if (viewer.role !== "admin" && viewer.role !== "creator") return { ok: false, error: "차단할 권한이 없어요." };
  if (targetUserId === viewer.id) return { ok: false, error: "자기 자신은 차단할 수 없어요." };
  const role = await roleOf(targetUserId);
  if (role === null) return { ok: false, error: "사용자를 찾을 수 없어요." };
  if (role === "admin") return { ok: false, error: "관리자는 차단할 수 없어요." };

  const scope = viewer.role === "admin" ? "global" : "owner";
  const roomOwnerId = scope === "owner" ? viewer.id : null;
  return db.transaction(async (tx) => {
    const created = await tx
      .insert(sanctions)
      .values({ userId: targetUserId, scope, roomOwnerId, createdBy: viewer.id, reason: "manual" })
      .onConflictDoNothing()
      .returning({ id: sanctions.id });
    if (!created.length) return { ok: false, error: "이미 차단한 사용자예요." };
    await takeDownPosts(tx, targetUserId, roomOwnerId);
    return { ok: true };
  });
}

// 크리에이터가 검토할 수 있는 자동 차단: 경고 중 하나 이상이 자기 방에서 나온 것 (문서 11-2)
function autoSanctionInOwnerScope(ownerId: string) {
  return sql`exists (select 1 from ${moderationEvents}
    where ${moderationEvents.userId} = ${sanctions.userId}
      and ${moderationEvents.roomOwnerId} = ${ownerId}
      and ${moderationEvents.countsAsStrike})`;
}

function sanctionScopeFor(viewer: Viewer) {
  if (viewer.role === "admin") return undefined;
  return or(
    and(eq(sanctions.scope, "owner"), eq(sanctions.roomOwnerId, viewer.id)),
    and(eq(sanctions.scope, "auto"), autoSanctionInOwnerScope(viewer.id)),
  );
}

export async function decideSanction(
  sanctionId: string,
  decision: "uphold" | "revoke",
  viewer: Viewer,
): Promise<{ ok: boolean; error?: string }> {
  if (!UUID.test(sanctionId)) return { ok: false, error: "잘못된 요청이에요." };
  if (viewer.role !== "admin" && viewer.role !== "creator") return { ok: false, error: "권한이 없어요." };
  const set =
    decision === "revoke"
      ? { revokedAt: sql`now()`, revokedBy: viewer.id }
      : { reviewStatus: "upheld" as const, reviewedBy: viewer.id, reviewedAt: sql`now()` };
  const rows = await db
    .update(sanctions)
    .set(set)
    .where(and(eq(sanctions.id, sanctionId), isNull(sanctions.revokedAt), sanctionScopeFor(viewer)))
    .returning({ id: sanctions.id });
  if (!rows.length) return { ok: false, error: "처리할 수 없는 차단이에요." };
  // 재검토 요청이 있었다면 처리됨으로 바꾼다.
  await db.update(sanctionAppeals).set({ status: "reviewed" }).where(eq(sanctionAppeals.sanctionId, sanctionId));
  return { ok: true };
}

// ─── 재검토 요청 (문서 10-2) ───

export async function requestAppeal(sanctionId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!UUID.test(sanctionId)) return { ok: false, error: "잘못된 요청이에요." };
  const [s] = await db
    .select({ id: sanctions.id })
    .from(sanctions)
    .where(and(eq(sanctions.id, sanctionId), eq(sanctions.userId, userId), isNull(sanctions.revokedAt)));
  if (!s) return { ok: false, error: "재검토를 요청할 차단이 없어요." };
  const rows = await db
    .insert(sanctionAppeals)
    .values({ sanctionId, userId })
    .onConflictDoNothing()
    .returning({ id: sanctionAppeals.id });
  return rows.length ? { ok: true } : { ok: false, error: "이미 재검토를 요청했어요." };
}

// ─── 검토: 숨김 해제·유지, 방 주인 글 사후 제재 (문서 6-3, 11-3) ───

export async function decideEvent(
  eventId: string,
  decision: "dismiss" | "uphold",
  viewer: Viewer,
): Promise<{ ok: boolean; error?: string }> {
  if (!UUID.test(eventId)) return { ok: false, error: "잘못된 요청이에요." };
  return db.transaction(async (tx) => {
    const [ev] = await tx
      .select({
        id: moderationEvents.id,
        userId: moderationEvents.userId,
        roomOwnerId: moderationEvents.roomOwnerId,
        kind: moderationEvents.kind,
        surface: moderationEvents.surface,
        targetId: moderationEvents.targetId,
        reviewStatus: moderationEvents.reviewStatus,
      })
      .from(moderationEvents)
      .where(eq(moderationEvents.id, eventId))
      .for("update");
    if (!ev || ev.reviewStatus !== "pending") return { ok: false, error: "검토할 기록이 아니에요." };
    // 방 주인은 자기 방의 오탐 위험 숨김(hold_review)만. 자해 글과 방 주인 자신의 글은 관리자만.
    const ownerMayDecide = ev.roomOwnerId === viewer.id && ev.kind === "abuse" && ev.userId !== viewer.id;
    if (viewer.role !== "admin" && !ownerMayDecide) return { ok: false, error: "권한이 없어요." };
    // dismiss: 숨김 글이면 공개로 되돌림. uphold: 공개 글(방 주인 글 사후 확인)이면 내림.
    const to = decision === "dismiss" ? "published" : "removed";
    const from = decision === "dismiss" ? "held" : "published";
    if (ev.surface === "chat") {
      await tx
        .update(bubbleMessages)
        .set({ screenStatus: to, statusChangedAt: sql`now()` })
        .where(and(eq(bubbleMessages.id, ev.targetId), eq(bubbleMessages.screenStatus, from)));
    } else {
      await setHeapStatus(tx, ev.surface, ev.targetId, to, from);
    }
    await tx
      .update(moderationEvents)
      .set({ reviewStatus: decision === "dismiss" ? "dismissed" : "upheld", reviewedBy: viewer.id, reviewedAt: sql`now()` })
      .where(eq(moderationEvents.id, ev.id));
    return { ok: true };
  });
}

// ─── 원문 보기 (문서 8장, 11-4) ───

export async function revealChatOriginal(messageId: string, viewer: Viewer): Promise<string | null> {
  const msg = await chatMessageWithOwner(messageId);
  if (!msg) return null;
  if (viewer.role !== "admin" && viewer.id !== msg.roomOwnerId) return null;
  if (msg.screenStatus !== "removed") return null;
  await logAccess(viewer.id, [{ surface: "chat", targetId: msg.id, eventId: null }]);
  return msg.body;
}

async function logAccess(
  viewerId: string,
  items: { surface: "chat" | "note" | "guestbook"; targetId: string; eventId: string | null }[],
) {
  if (!items.length) return;
  await db.insert(moderationAccessLog).values(items.map((i) => ({ viewerId, ...i })));
}

// ─── 검토 화면 목록 (문서 11-2) ───

export type ReviewEvent = {
  id: string;
  userId: string;
  userName: string;
  surface: string;
  source: "auto" | "report";
  kind: "abuse" | "contact" | "self_harm";
  countsAsStrike: boolean;
  reasons: string[];
  reviewStatus: string;
  createdAt: string;
  messageId: string;
  messageStatus: string | null;
  body: string | null;
  // 방 주인 자신의 글을 사후 확인하는 기록인지
  ownerPost: boolean;
};

export type ReviewSanction = {
  id: string;
  userId: string;
  userName: string;
  scope: "owner" | "auto" | "global";
  reason: string | null;
  reviewStatus: string;
  createdAt: string;
  strikes: number;
  appealed: boolean;
};

export type ReviewData = {
  events: ReviewEvent[];
  selfHarmPendingCount: number;
  sanctions: ReviewSanction[];
};

export async function listForReview(viewer: Viewer, limit = 100): Promise<ReviewData> {
  const isAdmin = viewer.role === "admin";
  const eventScope = isAdmin
    ? undefined
    : and(
        eq(moderationEvents.roomOwnerId, viewer.id),
        // 자해 글은 건수만, 방 주인 자신의 글 사후 확인은 관리자만 본다.
        sql`${moderationEvents.kind} <> 'self_harm'`,
        sql`${moderationEvents.userId} <> ${viewer.id}`,
      );

  const rows = await db
    .select({
      id: moderationEvents.id,
      userId: moderationEvents.userId,
      userName: user.name,
      surface: moderationEvents.surface,
      source: moderationEvents.source,
      kind: moderationEvents.kind,
      countsAsStrike: moderationEvents.countsAsStrike,
      reasons: moderationEvents.reasons,
      reviewStatus: moderationEvents.reviewStatus,
      createdAt: moderationEvents.createdAt,
      messageId: moderationEvents.targetId,
      // 채팅, 쪽지(표시 이름 + 본문), 방명록(이름) 중 그 기록의 글
      messageStatus: sql<string | null>`coalesce(${bubbleMessages.screenStatus}, ${heapNotes.screenStatus}, ${heapGuestbook.screenStatus})`,
      body: sql<string | null>`coalesce(${bubbleMessages.body},
        case when ${heapNotes.id} is null then null
             when ${heapNotes.displayName} is null then ${heapNotes.body}
             else ${heapNotes.displayName} || chr(10) || ${heapNotes.body} end,
        ${heapGuestbook.name})`,
      roomOwnerId: moderationEvents.roomOwnerId,
    })
    .from(moderationEvents)
    .innerJoin(user, eq(user.id, moderationEvents.userId))
    .leftJoin(
      bubbleMessages,
      and(eq(moderationEvents.surface, "chat"), eq(bubbleMessages.id, moderationEvents.targetId)),
    )
    .leftJoin(heapNotes, and(eq(moderationEvents.surface, "note"), eq(heapNotes.id, moderationEvents.targetId)))
    .leftJoin(
      heapGuestbook,
      and(eq(moderationEvents.surface, "guestbook"), eq(heapGuestbook.id, moderationEvents.targetId)),
    )
    .where(eventScope)
    .orderBy(desc(moderationEvents.createdAt))
    .limit(limit);

  const [selfHarm] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(moderationEvents)
    .where(
      and(
        eq(moderationEvents.kind, "self_harm"),
        eq(moderationEvents.reviewStatus, "pending"),
        isAdmin ? undefined : eq(moderationEvents.roomOwnerId, viewer.id),
      ),
    );

  const sanctionRows = await db
    .select({
      id: sanctions.id,
      userId: sanctions.userId,
      userName: user.name,
      scope: sanctions.scope,
      reason: sanctions.reason,
      reviewStatus: sanctions.reviewStatus,
      createdAt: sanctions.createdAt,
      appealId: sanctionAppeals.id,
      strikes: sql<number>`(select count(*)::int from ${moderationEvents}
        where ${moderationEvents.userId} = ${sanctions.userId}
          and ${moderationEvents.countsAsStrike} and ${moderationEvents.voidedAt} is null)`,
    })
    .from(sanctions)
    .innerJoin(user, eq(user.id, sanctions.userId))
    .leftJoin(sanctionAppeals, eq(sanctionAppeals.sanctionId, sanctions.id))
    .where(and(isNull(sanctions.revokedAt), sanctionScopeFor(viewer)))
    .orderBy(desc(sanctions.createdAt))
    .limit(limit);

  const events: ReviewEvent[] = rows.map(({ roomOwnerId, ...r }) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    ownerPost: r.userId === roomOwnerId,
  }));
  await logAccess(
    viewer.id,
    events
      .filter((e) => e.body !== null)
      .map((e) => ({ surface: e.surface as PostSurface, targetId: e.messageId, eventId: e.id })),
  );

  return {
    events,
    selfHarmPendingCount: Number(selfHarm?.n ?? 0),
    sanctions: sanctionRows.map(({ appealId, ...s }) => ({
      ...s,
      appealed: appealId !== null,
      createdAt: s.createdAt.toISOString(),
      strikes: Number(s.strikes),
    })),
  };
}

// ─── 14세 확인 (문서 3-3) ───

// 처음 한 번만 저장한다. 이미 답이 있으면 그대로 둔다.
export async function recordAgeCheck(userId: string, is14OrOlder: boolean): Promise<void> {
  await db.insert(userAgeChecks).values({ userId, is14OrOlder }).onConflictDoNothing();
}
