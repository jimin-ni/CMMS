// AI 스크리닝 사후 재판정 task. 판정과 저장은 웹 서비스와 같은 코드를 쓴다.
import { task } from "@renderinc/sdk/workflows";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { bubbleMessages } from "../../../src/lib/schema";
import { loadScreenLists, recheckChatMessage, type RecheckOutcome } from "../../../src/lib/moderation/persist";
import { screen } from "../../../src/lib/moderation/screen";
import { getDb } from "../common/db";
import { moderateForRecheck } from "./moderate";

const SWEEP_BATCH = 50;
const SWEEP_PARALLEL = 10;
// 웹 서비스가 막 요청한 글은 recheck가 곧 처리하므로, sweep은 조금 지난 글만 본다.
const SWEEP_MIN_AGE_SECONDS = 60;

export const recheck = task(
  {
    name: "moderation.recheck",
    timeoutSeconds: 60,
    retry: { maxRetries: 3, waitDurationMs: 1000, backoffScaling: 2 },
  },
  async function recheck(_ctx, surface: string, messageId: string): Promise<RecheckOutcome> {
    if (surface !== "chat") throw new Error(`아직 버블(chat)만 재판정합니다: ${surface}`);
    const db = getDb();
    const lists = await loadScreenLists(db);
    const outcome = await recheckChatMessage(db, messageId, (text, authorId) =>
      screen(
        { text, surface: "chat", authorId },
        { lexicon: lists.lexicon, extraPatterns: lists.patterns, moderate: moderateForRecheck },
      ),
    );
    console.log(`[recheck] chat ${messageId}: ${outcome.kind}`);
    // OpenAI를 또 못 불렀으면 실패로 끝내 Render가 다시 시도하게 한다. 시도 수는 DB에 남는다.
    if (outcome.kind === "retry") throw new Error(`OpenAI 재판정 실패 (${outcome.attempts}회째)`);
    return outcome;
  },
);

export const sweep = task(
  { name: "moderation.sweep", timeoutSeconds: 600, retry: { maxRetries: 1, waitDurationMs: 5000, backoffScaling: 2 } },
  async function sweep(ctx) {
    const db = getDb();
    const rows = await db
      .select({ id: bubbleMessages.id })
      .from(bubbleMessages)
      .where(
        and(
          eq(bubbleMessages.recheckStatus, "pending"),
          lt(bubbleMessages.createdAt, sql`now() - ${SWEEP_MIN_AGE_SECONDS}::int * interval '1 second'`),
        ),
      )
      .orderBy(asc(bubbleMessages.createdAt))
      .limit(SWEEP_BATCH);

    const counts: Record<string, number> = {};
    let errors = 0;
    for (let i = 0; i < rows.length; i += SWEEP_PARALLEL) {
      const batch = rows.slice(i, i + SWEEP_PARALLEL);
      const settled = await Promise.allSettled(batch.map((r) => ctx.run(recheck, "chat", r.id)));
      for (const s of settled) {
        if (s.status === "fulfilled") counts[s.value.kind] = (counts[s.value.kind] ?? 0) + 1;
        else errors += 1;
      }
    }
    return { found: rows.length, counts, errors };
  },
);
