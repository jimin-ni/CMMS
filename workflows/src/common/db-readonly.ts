// 에이전트용 공유 DB 읽기 전용 연결 (agent_ro). 계정 권한, 읽기 전용 트랜잭션, 쿼리 검사로 세 번 막는다.
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
      // 연결마다 읽기 전용, 쿼리 10초 제한
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
