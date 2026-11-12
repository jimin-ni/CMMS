import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// 개발 중 핫 리로드로 커넥션이 계속 늘어나지 않도록 전역에 한 번만 만든다.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}

// 앱의 DB 접근은 이 db를 쓴다. 쿼리는 각 기능의 repo 파일에만 둔다.
export const db = drizzle({ client: pool, schema });
