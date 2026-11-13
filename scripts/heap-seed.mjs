// 힙 미니룸 시드: npm run heap:seed -- --owner <방 id>=<사용자 id> [--owner ...] [--dry-run]
// public/heap/rooms/의 PoC 데이터를 heap_rooms, heap_reels에 넣는다. 다시 실행해도 같은 줄을 고쳐 쓴다.
// 방 주인은 실제 "user" 줄이어야 해서 --owner로 짝지은 방만 넣는다. "user" 테이블은 읽기만 한다.
// --dry-run은 읽기 전용 트랜잭션으로 확인만 하고 쓸 내용을 출력한다.
import { readFileSync } from "node:fs";
import pg from "pg";

const dir = "public/heap/rooms";

function usage(message) {
  if (message) console.error(`오류: ${message}\n`);
  console.error(
    [
      "사용법: npm run heap:seed -- --owner <방 id>=<사용자 id> [--owner ...] [--dry-run]",
      "  --owner    방 주인을 정한다. 짝지은 방만 넣는다. 예: --owner lovesoo=AbC123",
      "  --dry-run  DB에 쓰지 않고 쓸 내용만 보여 준다.",
      `방 id는 ${dir}/index.json에 있는 값이다.`,
    ].join("\n"),
  );
  process.exit(1);
}

function parseArgs(argv) {
  const owners = new Map();
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    let pair;
    if (arg === "--owner") {
      i += 1;
      pair = argv[i];
    } else if (arg.startsWith("--owner=")) {
      pair = arg.slice("--owner=".length);
    } else {
      usage(`모르는 인자: ${arg}`);
    }
    const at = pair ? pair.indexOf("=") : -1;
    if (at < 1 || at === pair.length - 1) usage("--owner는 <방 id>=<사용자 id> 꼴이어야 합니다.");
    const roomId = pair.slice(0, at);
    if (owners.has(roomId)) usage(`방 ${roomId}의 주인을 두 번 정했습니다.`);
    owners.set(roomId, pair.slice(at + 1));
  }
  return { owners, dryRun };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// "3.2만", "5.6천", "611만", "1,234" 같은 조회수 표기를 정수로 바꾼다. 읽지 못하면 null.
function parseViews(text) {
  if (typeof text !== "string") return null;
  const match = /^([\d,]+(?:\.\d+)?)\s*(천|만|억)?/.exec(text.trim());
  if (!match) return null;
  const unit = { 천: 1e3, 만: 1e4, 억: 1e8 }[match[2]] ?? 1;
  return Math.round(Number(match[1].replaceAll(",", "")) * unit);
}

function loadRoom(entry) {
  const creator = readJson(`${dir}/${entry.id}/creator.json`);
  const layout = readJson(`${dir}/${entry.id}/layout.json`);
  const reels = readJson(`${dir}/${entry.id}/reels.json`).map((reel, index) => ({
    external_id: reel.id,
    // 세로 영상은 쇼츠 주소, 가로 영상은 watch 주소
    source_url: reel.wide
      ? `https://www.youtube.com/watch?v=${reel.id}`
      : `https://www.youtube.com/shorts/${reel.id}`,
    title: reel.title ?? "",
    wide: typeof reel.wide === "boolean" ? reel.wide : null,
    view_count: parseViews(reel.views),
    // 등록 시각을 1ms씩 늦춰 reels.json의 순서를 남긴다.
    ord: index,
  }));
  return {
    slug: entry.id,
    name: creator.name ?? entry.name,
    blurb: entry.blurb ?? "",
    layout,
    reels,
  };
}

const { owners, dryRun } = parseArgs(process.argv.slice(2));
if (owners.size === 0) usage("--owner가 하나 이상 필요합니다.");

const index = readJson(`${dir}/index.json`);
for (const roomId of owners.keys()) {
  if (!index.some((entry) => entry.id === roomId)) usage(`${dir}/index.json에 없는 방: ${roomId}`);
}
// heap_rooms.creator_id가 유니크라 한 사람이 방 두 개의 주인이 될 수 없다.
if (new Set(owners.values()).size !== owners.size) usage("한 사용자를 방 두 개의 주인으로 정할 수 없습니다.");

const rooms = index
  .filter((entry) => owners.has(entry.id))
  .map((entry) => ({ ...loadRoom(entry), creatorId: owners.get(entry.id) }));

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL이 없습니다. .env.local을 확인하세요.");
}

const client = new pg.Client({ connectionString: url });
let failed = false;
try {
  await client.connect();
  await client.query(dryRun ? "begin read only" : "begin");

  // 주인으로 정한 사용자가 실제로 있는지 본다.
  const ownerIds = rooms.map((room) => room.creatorId);
  const users = await client.query('select id from "user" where id = any($1::text[])', [ownerIds]);
  const known = new Set(users.rows.map((row) => row.id));
  const missing = ownerIds.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new Error(`"user" 테이블에 없는 사용자: ${missing.join(", ")}`);
  }

  // 슬러그나 주인이 이미 다른 방에 묶여 있으면 멈춘다. 주인은 시드로 바꾸지 않는다.
  const existing = await client.query(
    "select slug, creator_id from heap_rooms where slug = any($1::text[]) or creator_id = any($2::text[])",
    [rooms.map((room) => room.slug), ownerIds],
  );
  for (const room of rooms) {
    for (const row of existing.rows) {
      if (row.slug === room.slug && row.creator_id !== room.creatorId) {
        throw new Error(`방 ${room.slug}은(는) 이미 다른 사용자의 방입니다.`);
      }
      if (row.creator_id === room.creatorId && row.slug !== room.slug) {
        throw new Error(`사용자 ${room.creatorId}에게 이미 다른 방(${row.slug})이 있습니다.`);
      }
    }
  }

  for (const room of rooms) {
    const exists = existing.rows.some((row) => row.slug === room.slug);
    const unread = room.reels.filter((reel) => reel.view_count === null).length;
    console.log(
      [
        `${dryRun ? "[dry-run] " : ""}방 ${room.slug} (${room.name})`,
        `  주인: ${room.creatorId}`,
        `  heap_rooms: ${exists ? "고쳐 씀 (name, blurb, layout을 덮어씀)" : "새로 만듦"}`,
        `  heap_reels: ${room.reels.length}줄 넣거나 고쳐 씀 (조회수를 읽지 못한 줄 ${unread})`,
      ].join("\n"),
    );
    if (dryRun) continue;

    const saved = await client.query(
      `insert into heap_rooms (creator_id, slug, name, blurb, layout)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (slug) do update
         set name = excluded.name, blurb = excluded.blurb, layout = excluded.layout, updated_at = now()
       returning id`,
      [room.creatorId, room.slug, room.name, room.blurb, JSON.stringify(room.layout)],
    );
    await client.query(
      `insert into heap_reels (room_id, platform, external_id, source_url, title, wide, view_count, created_at)
       select $1::uuid, 'youtube', r.external_id, r.source_url, r.title, r.wide, r.view_count,
              now() - r.ord * interval '1 millisecond'
       from jsonb_to_recordset($2::jsonb)
         as r(external_id text, source_url text, title text, wide boolean, view_count bigint, ord int)
       on conflict (room_id, platform, external_id) do update
         set title = excluded.title, wide = excluded.wide, view_count = excluded.view_count, updated_at = now()`,
      [saved.rows[0].id, JSON.stringify(room.reels)],
    );
  }

  await client.query(dryRun ? "rollback" : "commit");
  console.log(dryRun ? "dry-run 끝: 아무것도 쓰지 않았습니다." : "힙 시드 완료");
} catch (error) {
  await client.query("rollback").catch(() => {});
  failed = true;
  console.error(`시드 실패: ${error instanceof Error ? error.message : error}`);
} finally {
  await client.end();
}
if (failed) process.exit(1);
