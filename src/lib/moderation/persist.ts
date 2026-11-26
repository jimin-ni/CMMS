// AI 스크리닝 저장 로직 중 판정 결과를 DB에 반영하는 부분 (문서 6~9장).
// 웹 서비스(repo.ts)와 Render Workflow(사후 재판정, docs/planning/16-render-workflows.md)가 이 파일 하나를 같이 쓴다.
// 그래서 "server-only", "@/" 별칭, 웹 서비스의 db를 import하지 않는다. DB는 부르는 쪽이 tx나 실행기로 넘긴다.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../schema";
import {
  bubbleMessages,
  bubbleRooms,
  heapGuestbook,
  heapNotes,
  heapRooms,
  moderationAllowlist,
  moderationEvents,
  moderationPatterns,
  moderationTerms,
  sanctions,
} from "../schema";
import { buildLexicon, type Lexicon } from "./lexicon";
import { MODERATION_POLICY } from "./policy";
import type { ScreenResult } from "./screen";

// 글이 저장되는 표면 (moderation_events.surface의 check와 같다). 닉네임은 판정만 하고 기록하지 않는다.
export type PostSurface = "chat" | "note" | "guestbook";

export type ModerationDb = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<ModerationDb["transaction"]>[0]>[0];
export type Executor = ModerationDb | Tx;

const P = MODERATION_POLICY;

// ─── 사전·regex 읽기 (문서 5장) ───

export type ScreenLists = {
  lexicon: Lexicon;
  patterns: { name: string; re: RegExp }[];
  counts: { terms: number; allow: number };
};

export async function loadScreenLists(exec: Executor): Promise<ScreenLists> {
  const [terms, allow, patterns] = await Promise.all([
    exec
      .select({ term: moderationTerms.term, lang: moderationTerms.lang, tag: moderationTerms.tag, version: moderationTerms.version })
      .from(moderationTerms)
      .where(eq(moderationTerms.enabled, true)),
    exec.select({ term: moderationAllowlist.term }).from(moderationAllowlist),
    exec
      .select({ name: moderationPatterns.name, pattern: moderationPatterns.pattern, version: moderationPatterns.version })
      .from(moderationPatterns)
      .where(eq(moderationPatterns.enabled, true)),
  ]);
  // 사전 버전: 들어 있는 항목 버전 중 가장 큰 값과 개수
  const version = terms.length
    ? `${terms.map((t) => t.version).sort().at(-1)}#${terms.length}`
    : "none";
  const compiled: { name: string; re: RegExp }[] = [];
  for (const p of patterns) {
    try {
      compiled.push({ name: p.name, re: new RegExp(p.pattern, "iu") });
    } catch {
      console.warn("[moderation] 잘못된 regex는 건너뜀", p.name);
    }
  }
  return {
    lexicon: buildLexicon(terms, allow.map((a) => a.term), version),
    patterns: compiled,
    counts: { terms: terms.length, allow: allow.length },
  };
}

// ─── 경고 수와 자동 차단 (문서 7장) ───

export async function lockUser(tx: Tx, userId: string) {
  // 같은 사용자의 경고 기록·자동 차단을 한 줄로 세운다. 두 글이 동시에 들어와도 경고 수를 정확히 센다.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"moderation:" + userId}))`);
}

export async function countStrikes(userId: string, exec: Executor): Promise<number> {
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

// 차단 범위의 예전 공개 글(채팅, 쪽지, 방명록)을 모두 내린다 (문서 9-2).
export async function takeDownPosts(tx: Tx, userId: string, roomOwnerId: string | null) {
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
  // 힙의 변경 읽기 커서는 잠금 뒤 실제 시각(clock_timestamp)을 쓴다 (heap/repo.ts와 같다).
  const ownerHeapRooms = roomOwnerId
    ? tx.select({ id: heapRooms.id }).from(heapRooms).where(eq(heapRooms.creatorId, roomOwnerId))
    : null;
  await tx
    .update(heapNotes)
    .set({ screenStatus: "removed", updatedAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(heapNotes.authorId, userId),
        eq(heapNotes.screenStatus, "published"),
        ownerHeapRooms ? inArray(heapNotes.roomId, ownerHeapRooms) : undefined,
      ),
    );
  await tx
    .update(heapGuestbook)
    .set({ screenStatus: "removed", statusChangedAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(heapGuestbook.userId, userId),
        eq(heapGuestbook.screenStatus, "published"),
        ownerHeapRooms ? inArray(heapGuestbook.roomId, ownerHeapRooms) : undefined,
      ),
    );
}

// 경고가 생긴 직후 부른다. 3회 이상이고 활성 자동 차단이 없으면 건다.
export async function applyAutoBlock(tx: Tx, userId: string): Promise<{ strikes: number; autoBlocked: boolean }> {
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

// ─── 판정 결과 반영 (문서 4장, 6장) ───

export type SaveNotice =
  | { kind: "published" }
  | { kind: "blocked"; strikes: number; autoBlocked: boolean }
  | { kind: "contact_first" }
  | { kind: "hold_review" }
  | { kind: "hold_self_harm" };

// 판정 결과를 저장 계획으로 바꾼다. 세 표면(채팅, 쪽지, 방명록)이 이 함수 하나를 쓴다.
// 글을 넣는 트랜잭션 안에서 부르고, 같은 트랜잭션에서 글을 plan.status로 넣은 뒤 recordScreenEvent를 부른다.
export type ScreenPlan = {
  status: "published" | "blocked" | "held";
  event: null | {
    kind: "abuse" | "contact" | "self_harm";
    strike: boolean;
    review: "none" | "pending";
  };
  notice: SaveNotice["kind"];
};

export async function planScreen(
  tx: Tx,
  userId: string,
  result: ScreenResult,
  // 방 주인·관리자: 판정 결과와 관계없이 바로 게시하고, 걸리면 사후 확인 기록만 남긴다 (문서 3-2).
  privileged: boolean,
): Promise<ScreenPlan> {
  await lockUser(tx, userId);
  const kindOf = (o: ScreenResult["outcome"]) =>
    o === "contact" ? "contact" : o === "hold_self_harm" ? "self_harm" : "abuse";

  if (result.outcome === "publish") return { status: "published", event: null, notice: "published" };
  if (privileged) {
    return {
      status: "published",
      event: { kind: kindOf(result.outcome), strike: false, review: "pending" },
      notice: "published",
    };
  }
  if (result.outcome === "block") {
    return { status: "blocked", event: { kind: "abuse", strike: true, review: "none" }, notice: "blocked" };
  }
  if (result.outcome === "contact") {
    const [prior] = await tx
      .select({ one: sql`1` })
      .from(moderationEvents)
      .where(and(eq(moderationEvents.userId, userId), eq(moderationEvents.kind, "contact")))
      .limit(1);
    return prior
      ? { status: "blocked", event: { kind: "contact", strike: true, review: "none" }, notice: "blocked" }
      : { status: "blocked", event: { kind: "contact", strike: false, review: "none" }, notice: "contact_first" };
  }
  if (result.outcome === "hold_self_harm") {
    return { status: "held", event: { kind: "self_harm", strike: false, review: "pending" }, notice: "hold_self_harm" };
  }
  return { status: "held", event: { kind: "abuse", strike: false, review: "pending" }, notice: "hold_review" };
}

// 글을 넣은 뒤 같은 트랜잭션에서 부른다. 판정 기록을 남기고, 경고면 자동 차단까지 본다.
export async function recordScreenEvent(
  tx: Tx,
  args: {
    userId: string;
    roomOwnerId: string;
    surface: PostSurface;
    targetId: string;
    result: ScreenResult;
    plan: ScreenPlan;
  },
): Promise<SaveNotice> {
  const { plan, result } = args;
  if (!plan.event) return { kind: "published" };

  await tx.insert(moderationEvents).values({
    userId: args.userId,
    roomOwnerId: args.roomOwnerId,
    surface: args.surface,
    targetId: args.targetId,
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
    const { strikes, autoBlocked } = await applyAutoBlock(tx, args.userId);
    return { kind: "blocked", strikes, autoBlocked };
  }
  return { kind: plan.notice } as SaveNotice;
}
