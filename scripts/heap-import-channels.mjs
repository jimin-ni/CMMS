// 힙 미니룸 YouTube 채널 가져오기: npm run heap:channels -- [--room <slug>] [--dry-run]
// creator.json의 YouTube 채널 링크(@핸들)를 channels.list(forHandle)로 풀어 heap_creator_channels에 넣고,
// 방의 영상(heap_reels)을 videos.list로 조회해 snippet.channelId가 맞는 채널에 잇는다. 다시 실행해도 같은 결과다.
// 할당량: 핸들 하나에 1유닛, 영상 50개 묶음에 1유닛. search.list는 쓰지 않는다.
// 방 주인의 채널이 아닌 영상은 채널 없이 두고 보고만 한다. API 키는 어디에도 출력하지 않는다.
import { readFileSync } from "node:fs";
import pg from "pg";

const dir = "public/heap/rooms";
const API = "https://www.googleapis.com/youtube/v3";

function usage(message) {
  if (message) console.error(`오류: ${message}\n`);
  console.error(
    [
      "사용법: npm run heap:channels -- [--room <slug>] [--dry-run]",
      "  --room     한 방만 처리한다. 없으면 DB의 모든 방.",
      "  --dry-run  API는 부르되 DB에는 쓰지 않고 계획만 보여 준다.",
    ].join("\n"),
  );
  process.exit(1);
}

function parseArgs(argv) {
  let room = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--room") {
      i += 1;
      room = argv[i];
      if (!room) usage("--room에 슬러그가 필요합니다.");
    } else if (arg.startsWith("--room=")) room = arg.slice("--room=".length);
    else usage(`모르는 인자: ${arg}`);
  }
  return { room, dryRun };
}

let quota = 0;

// 키는 쿼리에만 실리고, 오류 메시지에는 경로와 상태 코드만 남긴다.
async function apiGet(path, params) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY가 없습니다. .env.local을 확인하세요.");
  const query = new URLSearchParams({ ...params, key });
  quota += 1;
  let res;
  try {
    res = await fetch(`${API}/${path}?${query}`);
  } catch {
    throw new Error(`YouTube API ${path} 연결 실패`);
  }
  if (!res.ok) {
    let reason = "";
    try {
      reason = (await res.json())?.error?.errors?.[0]?.reason ?? "";
    } catch {}
    throw new Error(`YouTube API ${path} 실패: HTTP ${res.status} ${reason}`.trim());
  }
  return res.json();
}

// creator.json 링크에서 YouTube @핸들을 뽑는다. 퍼센트 인코딩된 한글 핸들은 풀어 둔다.
function youtubeHandles(links) {
  const handles = [];
  for (const link of links ?? []) {
    if (typeof link.url !== "string") continue;
    let url;
    try {
      url = new URL(link.url);
    } catch {
      continue;
    }
    if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) continue;
    const match = /^\/(@[^/]+)\/?$/.exec(url.pathname);
    if (!match) continue;
    let handle;
    try {
      handle = decodeURIComponent(match[1]);
    } catch {
      continue;
    }
    if (!handles.includes(handle)) handles.push(handle);
  }
  return handles;
}

const { room: onlyRoom, dryRun } = parseArgs(process.argv.slice(2));
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL이 없습니다. .env.local을 확인하세요.");

const client = new pg.Client({ connectionString: url });
let failed = false;
try {
  await client.connect();
  await client.query(dryRun ? "begin read only" : "begin");

  const roomRows = await client.query(
    `select id, slug, creator_id from heap_rooms
     where ($1::text is null or slug = $1) order by created_at, slug`,
    [onlyRoom],
  );
  if (roomRows.rows.length === 0) {
    throw new Error(onlyRoom ? `방 ${onlyRoom}이(가) DB에 없습니다.` : "DB에 방이 없습니다.");
  }

  for (const room of roomRows.rows) {
    console.log(`\n${dryRun ? "[dry-run] " : ""}방 ${room.slug} (주인 ${room.creator_id})`);

    let creator;
    try {
      creator = JSON.parse(readFileSync(`${dir}/${room.slug}/creator.json`, "utf8"));
    } catch {
      console.log("  creator.json 없음: 건너뜁니다.");
      continue;
    }

    // 1) 핸들 → 채널
    const channels = new Map(); // UC… → { title, url }
    for (const handle of youtubeHandles(creator.links)) {
      const data = await apiGet("channels", { part: "snippet", forHandle: handle });
      const item = data.items?.[0];
      if (!item) {
        console.log(`  핸들 ${handle}: 채널을 찾지 못함`);
        continue;
      }
      const title = String(item.snippet?.title ?? "").slice(0, 100);
      channels.set(item.id, { title, url: `https://www.youtube.com/channel/${item.id}` });
      console.log(`  핸들 ${handle} → ${item.id} "${title}"`);
    }

    // 2) 채널 upsert (dry-run이면 쓰지 않는다)
    const channelRowIds = new Map(); // UC… → heap_creator_channels.id
    for (const [externalId, channel] of channels) {
      if (dryRun) {
        console.log(`  채널 upsert 예정: youtube ${externalId} "${channel.title}"`);
        continue;
      }
      const saved = await client.query(
        `insert into heap_creator_channels (creator_id, platform, external_id, channel_url, title)
         values ($1, 'youtube', $2, $3, $4)
         on conflict (creator_id, platform, external_id) do update
           set channel_url = excluded.channel_url, title = excluded.title, updated_at = now()
         returning id, (xmax = 0) as created`,
        [room.creator_id, externalId, channel.url, channel.title],
      );
      channelRowIds.set(externalId, saved.rows[0].id);
      console.log(`  채널 ${saved.rows[0].created ? "새로 만듦" : "고침"}: "${channel.title}"`);
    }

    // 3) 영상 → 채널 ID
    const reels = await client.query(
      "select external_id from heap_reels where room_id = $1 and platform = 'youtube' order by external_id",
      [room.id],
    );
    const ids = reels.rows.map((row) => row.external_id);
    const channelOfVideo = new Map();
    for (let i = 0; i < ids.length; i += 50) {
      const data = await apiGet("videos", { part: "snippet", id: ids.slice(i, i + 50).join(",") });
      for (const item of data.items ?? []) channelOfVideo.set(item.id, item.snippet?.channelId ?? null);
    }

    // 4) 잇기
    const perChannel = new Map();
    const foreign = new Map(); // 방 주인 채널이 아닌 영상: 채널 ID → 개수
    const missing = [];
    for (const id of ids) {
      const channelId = channelOfVideo.get(id);
      if (!channelId) missing.push(id);
      else if (channels.has(channelId)) {
        if (!perChannel.has(channelId)) perChannel.set(channelId, []);
        perChannel.get(channelId).push(id);
      } else foreign.set(channelId, (foreign.get(channelId) ?? 0) + 1);
    }

    for (const [channelId, videoIds] of perChannel) {
      const title = channels.get(channelId).title;
      if (dryRun) {
        console.log(`  잇기 예정: "${title}" <- 영상 ${videoIds.length}개`);
        continue;
      }
      const result = await client.query(
        `update heap_reels set channel_id = $3, updated_at = now()
         where room_id = $1 and platform = 'youtube' and external_id = any($2::text[])
           and channel_id is distinct from $3`,
        [room.id, videoIds, channelRowIds.get(channelId)],
      );
      console.log(`  이음: "${title}" <- 새로 ${result.rowCount}개 (대상 ${videoIds.length}개)`);
    }

    const matched = [...perChannel.values()].reduce((sum, list) => sum + list.length, 0);
    const foreignTotal = [...foreign.values()].reduce((sum, count) => sum + count, 0);
    console.log(
      `  영상 ${ids.length}개: 채널에 맞음 ${matched}, 방 주인 채널이 아님 ${foreignTotal}, API에 없음 ${missing.length}`,
    );
    for (const [channelId, count] of foreign) console.log(`    주인 채널 아님: ${channelId} ${count}개`);
    if (missing.length > 0) console.log(`    API에 없음(삭제·비공개 가능): ${missing.join(", ")}`);
  }

  await client.query(dryRun ? "rollback" : "commit");
  console.log(
    `\n${dryRun ? "dry-run 끝: DB에 아무것도 쓰지 않았습니다." : "채널 가져오기 완료"} (API 할당량 약 ${quota}유닛)`,
  );
} catch (error) {
  await client.query("rollback").catch(() => {});
  failed = true;
  console.error(`채널 가져오기 실패: ${error instanceof Error ? error.message : error}`);
} finally {
  await client.end();
}
if (failed) process.exit(1);
