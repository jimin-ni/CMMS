import { Pool } from "pg";

// 개발 중 핫 리로드로 커넥션이 계속 늘어나지 않도록 전역에 한 번만 만든다.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}
