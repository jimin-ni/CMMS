// 버블 테이블 마이그레이션 실행: npm run db:bubble
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL이 없습니다. .env.local을 확인하세요.");
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(readFileSync("db/migrations/0001_bubble.sql", "utf8"));
  console.log("버블 마이그레이션 완료");
} finally {
  await client.end();
}
