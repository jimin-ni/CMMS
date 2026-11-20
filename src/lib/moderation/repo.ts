// AI 스크리닝 저장 계층 (문서 6~12장). 경고 기록, 자동 차단, 신고, 크리에이터 차단, 검토, 재검토 요청, 열람 기록.
// 모든 권한 조건은 여기 쿼리에 넣는다. 화면에서 버튼을 숨기는 것만으로는 막히지 않는다.
import "server-only";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bubbleMessages,
  bubbleRooms,
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

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

export async function chatPreScreenBlock(
  userId: string,
  normalizedHash: string,
): Promise<{ kind: "repeat" } | { kind: "cooldown"; seconds: number } | null> {
  const [repeat] = await db
    .select({ one: sql`1` })
    .from(bubbleMessages)
    .where(
      and(
        eq(bubbleMessages.senderId, userId),
        eq(bubbleMessages.normalizedHash, normalizedHash),
        sql`${bubbleMessages.createdAt} > now() - ${P.repeatWindowMs}::int * interval '1 millisecond'`,
      ),
    )
    .limit(1);
  if (repeat) return { kind: "repeat" };

  const [last] = await db
    .select({
      msAgo: sql<number>`(extract(epoch from (now() - max(${moderationEvents.createdAt}))) * 1000)::float8`,
    })
    .from(moderationEvents)
    .where(
      and(
        eq(moderationEvents.userId, userId),
        eq(moderationEvents.surface, "chat"),
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

// ─── 경고 수와 자동 차단 (문서 7장) ───

async function lockUser(tx: Tx, userId: string) {
  // 같은 사용자의 경고 기록·자동 차단을 한 줄로 세운다. 두 글이 동시에 들어와도 경고 수를 정확히 센다.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"moderation:" + userId}))`);
}

export async function countStrikes(userId: string, exec: Executor = db): Promise<number> {
  const [row] = await exec
    .select({ n: sql<number>`count(*)::int` })
    .from(moderationEvents)
    .where(
      and(
        eq(moderationEvents.userId, userId),
        eq(moderationEvents.countsAsStrike, true),
        isNull(moderationEvents.voidedAt),
      ),
    );
  return Number(row?.n ?? 0);
}

// 차단 범위의 예전 공개 글을 모두 내린다 (문서 9-2). 쪽지·방명록은 연결할 때 여기에 더한다.
async function takeDownPosts(tx: Tx, userId: string, roomOwnerId: string | null) {
  await tx
    .update(bubbleMessages)
    .set({ screenStatus: "removed", statusChangedAt: sql`now()` })
    .where(
      and(
        eq(bubbleMessages.senderId, userId),
        eq(bubbleMessages.screenStatus, "published"),
        isNull(bubbleMessages.deletedAt),
        roomOwnerId
          ? inArray(
              bubbleMessages.roomId,
              tx.select({ id: bubbleRooms.id }).from(bubbleRooms).where(eq(bubbleRooms.creatorId, roomOwnerId)),
            )
          : undefined,
      ),
    );
}

// 경고가 생긴 직후 부른다. 3회 이상이고 활성 자동 차단이 없으면 건다.
async function applyAutoBlock(tx: Tx, userId: string): Promise<{ strikes: number; autoBlocked: boolean }> {
  const strikes = await countStrikes(userId, tx);
  if (strikes < P.autoBlockStrikes) return { strikes, autoBlocked: false };
  const created = await tx
    .insert(sanctions)
    .values({ userId, scope: "auto", reason: `경고 ${strikes}회`, reviewStatus: "pending" })
    .onConflictDoNothing()
    .returning({ id: sanctions.id });
  if (created.length) await takeDownPosts(tx, userId, null);
  return { strikes, autoBlocked: true };
}

// ─── 채팅 글 저장 (문서 4장, 6장) ───

export type SaveNotice =
  | { kind: "published" }
  | { kind: "blocked"; strikes: number; autoBlocked: boolean }
  | { kind: "contact_first" }
  | { kind: "hold_review" }
  | { kind: "hold_self_harm" };

export async function saveChatMessage(args: {
  roomId: string;
  roomOwnerId: string;
  senderId: string;
  body: string;
  result: ScreenResult;
  // 방 주인·관리자: 판정 결과와 관계없이 바로 게시하고, 걸리면 사후 확인 기록만 남긴다 (문서 3-2).
  privileged: boolean;
}): Promise<SaveNotice> {
  const { result } = args;
  return db.transaction(async (tx) => {
    await lockUser(tx, args.senderId);

    type Plan = {
      status: "published" | "blocked" | "held";
      event: null | {
        kind: "abuse" | "contact" | "self_harm";
        strike: boolean;
        review: "none" | "pending";
      };
      notice: SaveNotice["kind"];
    };
    const kindOf = (o: ScreenResult["outcome"]) =>
      o === "contact" ? "contact" : o === "hold_self_harm" ? "self_harm" : "abuse";

    let plan: Plan;
    if (result.outcome === "publish") {
      plan = { status: "published", event: null, notice: "published" };
    } else if (args.privileged) {
      plan = {
        status: "published",
        event: { kind: kindOf(result.outcome), strike: false, review: "pending" },
        notice: "published",
      };
    } else if (result.outcome === "block") {
      plan = { status: "blocked", event: { kind: "abuse", strike: true, review: "none" }, notice: "blocked" };
    } else if (result.outcome === "contact") {
      const [prior] = await tx
        .select({ one: sql`1` })
        .from(moderationEvents)
        .where(and(eq(moderationEvents.userId, args.senderId), eq(moderationEvents.kind, "contact")))
        .limit(1);
      plan = prior
        ? { status: "blocked", event: { kind: "contact", strike: true, review: "none" }, notice: "blocked" }
        : { status: "blocked", event: { kind: "contact", strike: false, review: "none" }, notice: "contact_first" };
    } else if (result.outcome === "hold_self_harm") {
      plan = { status: "held", event: { kind: "self_harm", strike: false, review: "pending" }, notice: "hold_self_harm" };
    } else {
      plan = { status: "held", event: { kind: "abuse", strike: false, review: "pending" }, notice: "hold_review" };
    }

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

    if (!plan.event) return { kind: "published" };

    await tx.insert(moderationEvents).values({
      userId: args.senderId,
      roomOwnerId: args.roomOwnerId,
      surface: "chat",
      targetId: msg.id,
      source: "auto",
      kind: plan.event.kind,
      countsAsStrike: plan.event.strike,
      reasons: result.reasons,
      scores: result.scores,
      openaiStatus: result.openai,
      versions: result.versions,
      reviewStatus: plan.event.review,
    });

    if (plan.notice === "blocked") {
      const { strikes, autoBlocked } = await applyAutoBlock(tx, args.senderId);
      return { kind: "blocked", strikes, autoBlocked };
    }
    return { kind: plan.notice } as SaveNotice;
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
    if (ev.surface !== "chat") return { ok: false, error: "아직 채팅만 검토할 수 있어요." };

    // dismiss: 숨김 글이면 공개로 되돌림. uphold: 공개 글(방 주인 글 사후 확인)이면 내림.
    await tx
      .update(bubbleMessages)
      .set({ screenStatus: decision === "dismiss" ? "published" : "removed", statusChangedAt: sql`now()` })
      .where(
        and(
          eq(bubbleMessages.id, ev.targetId),
          eq(bubbleMessages.screenStatus, decision === "dismiss" ? "held" : "published"),
        ),
      );
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
      messageStatus: bubbleMessages.screenStatus,
      body: bubbleMessages.body,
      roomOwnerId: moderationEvents.roomOwnerId,
    })
    .from(moderationEvents)
    .innerJoin(user, eq(user.id, moderationEvents.userId))
    .leftJoin(
      bubbleMessages,
      and(eq(moderationEvents.surface, "chat"), eq(bubbleMessages.id, moderationEvents.targetId)),
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
    events.filter((e) => e.body !== null).map((e) => ({ surface: "chat" as const, targetId: e.messageId, eventId: e.id })),
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
