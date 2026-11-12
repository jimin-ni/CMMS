// 버블 테이블 마이그레이션 실행: npm run db:bubble
// db/migrations/의 SQL 파일을 이름 순서대로, 아직 적용하지 않은 것만 실행한다.
// 적용 기록은 bubble_migrations 테이블에 남는다.
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL이 없습니다. .env.local을 확인하세요.");
}

const dir = "db/migrations";
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(
    `create table if not exists bubble_migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  const { rows } = await client.query("select name from bubble_migrations");
  const applied = new Set(rows.map((row) => row.name));

  for (const name of files) {
    if (applied.has(name)) continue;
    // 파일 하나를 트랜잭션 하나로 실행한다. 실패하면 그 파일은 적용되지 않는다.
    await client.query("begin");
    try {
      await client.query(readFileSync(`${dir}/${name}`, "utf8"));
      await client.query("insert into bubble_migrations (name) values ($1)", [name]);
      await client.query("commit");
      console.log(`적용: ${name}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  console.log("버블 마이그레이션 완료");
} finally {
  await client.end();
}
