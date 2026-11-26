// 에이전트용 공유 DB 읽기 전용 연결 (15 문서 5-1).
// AGENT_DATABASE_URL은 Render Internal URL + agent_ro 계정. 재판정용 DATABASE_URL(moderation_worker)과 다르다.
// 막는 곳이 셋이다: 계정 권한(DB), 연결마다 읽기 전용 트랜잭션, 아래 쿼리 검사.
import { Pool, type QueryResultRow } from "pg";
import { requireEnv } from "./config";

// 비밀번호 해시, 세션 토큰, 인증 코드가 있는 테이블. "user"는 DB 권한이 id, role 열만 허용한다.
const BLOCKED_TABLE = /\b(?:from|join|table|into|update)\s+(?:"?public"?\.)?"?(account|session|verification)"?(?![\w])/i;

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: requireEnv("AGENT_DATABASE_URL"),
      max: 3,
      // 계정 설정과 별도로 연결마다 한 번 더 읽기 전용으로 둔다. 느린 쿼리는 10초에서 끊는다.
      options: "-c default_transaction_read_only=on -c statement_timeout=10000",
    });
  }
  return pool;
}

export function assertAllowedQuery(sql: string): void {
  const hit = BLOCKED_TABLE.exec(sql);
  if (hit) throw new Error(`인증 테이블(${hit[1]})은 에이전트가 읽을 수 없습니다`);
}

export async function readQuery<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  assertAllowedQuery(sql);
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}
