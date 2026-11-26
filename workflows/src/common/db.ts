// 공유 DB 연결. DATABASE_URL은 Render Internal URL + moderation_worker 계정 (docs/planning/16-render-workflows.md 5장).
// task 인스턴스마다 처음 쓸 때 한 번 만든다.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../../src/lib/schema";
import type { ModerationDb } from "../../../src/lib/moderation/persist";
import { requireEnv } from "./config";

let db: ModerationDb | null = null;

export function getDb(): ModerationDb {
  if (!db) {
    const pool = new Pool({ connectionString: requireEnv("DATABASE_URL"), max: 5 });
    db = drizzle({ client: pool, schema });
  }
  return db;
}
