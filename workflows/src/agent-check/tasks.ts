// 에이전트 공통 연결 확인 task. 입력은 []
import { task } from "@renderinc/sdk/workflows";
import { z } from "zod";
import { readQuery } from "../common/db-readonly";
import { askJson, type LlmUsage } from "../common/llm";
import { getWebLogs } from "../common/render-api";

// 테이블 수, 큰 테이블 행 수, 인증 테이블 차단 확인
export const checkDb = task(
  { name: "agentCheck.db", timeoutSeconds: 60 },
  async function checkDb(): Promise<{ tables: number; largest: { table: string; rows: number }[]; authBlocked: boolean }> {
    const [{ count }] = await readQuery<{ count: string }>(
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const largest = await readQuery<{ table: string; rows: string }>(
      "SELECT relname AS table, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 5",
    );
    let authBlocked = false;
    try {
      await readQuery('SELECT 1 FROM "session" LIMIT 1');
    } catch {
      authBlocked = true;
    }
    return { tables: Number(count), largest: largest.map((r) => ({ table: r.table, rows: Number(r.rows) })), authBlocked };
  },
);

// 웹 서비스 최근 로그 20줄
export const checkLogs = task(
  { name: "agentCheck.logs", timeoutSeconds: 60 },
  async function checkLogs(): Promise<{ count: number; hasMore: boolean; lines: string[] }> {
    const { lines, hasMore } = await getWebLogs({ limit: 20 });
    return { count: lines.length, hasMore, lines: lines.map((l) => `${l.timestamp} ${l.level ?? ""} ${l.message}`) };
  },
);

// LLM 1회 호출과 사용량 확인
export const checkLlm = task(
  { name: "agentCheck.llm", timeoutSeconds: 120 },
  async function checkLlm(): Promise<{ answer: { ok: boolean; note: string }; usage: LlmUsage }> {
    const { data, usage } = await askJson({
      system: "You are a connectivity check for a developer tool. Reply in Korean, one short sentence.",
      prompt: "연결 확인입니다. ok를 true로 하고 note에 한 문장 인사를 적어 주세요.",
      schema: z.object({ ok: z.boolean(), note: z.string() }),
      effort: "low",
      maxTokens: 2000,
    });
    return { answer: data, usage };
  },
);
