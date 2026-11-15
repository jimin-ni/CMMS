import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { heapCreatorChannels, heapReels, heapRooms } from "@/lib/schema";

// 콘텐츠 열람 통계(DECISIONS M). 하루 단위 카운터만 두고 사람별 기록은 남기지 않는다.
// day는 한국 시간 날짜다. 서버에서만 불러 쓴다.

export type HeapOpenKind = "link" | "reel";
export type HeapOpenStats = {
  links: { target: string; opens: number }[];
  reels: { target: string; opens: number; title?: string }[];
};

const seoulToday = sql`(now() at time zone 'Asia/Seoul')::date`;

// 방의 주인 id. 방이 없으면 null.
export async function getRoomCreatorId(roomId: string): Promise<string | null> {
  const [row] = await db
    .select({ creatorId: heapRooms.creatorId })
    .from(heapRooms)
    .where(eq(heapRooms.id, roomId))
    .limit(1);
  return row?.creatorId ?? null;
}

// 오늘(한국 날짜) 카운터를 1 올린다.
export async function recordOpen(roomId: string, kind: HeapOpenKind, target: string): Promise<void> {
  await db.execute(sql`
    insert into heap_open_counts (room_id, day, kind, target, opens)
    values (${roomId}, ${seoulToday}, ${kind}, ${target}, 1)
    on conflict (room_id, day, kind, target)
    do update set opens = heap_open_counts.opens + 1
  `);
}

function layoutLinks(layout: unknown): Set<string> {
  const urls = new Set<string>();
  const items = (layout as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return urls;
  for (const item of items) {
    const fn = (item as { fn?: { kind?: unknown; links?: unknown; link?: unknown } } | null)?.fn;
    if (!fn || typeof fn !== "object") continue;
    if (fn.kind === "pc" && Array.isArray(fn.links)) {
      for (const l of fn.links) {
        const url = (l as { url?: unknown } | null)?.url;
        if (typeof url === "string") urls.add(url);
      }
    } else if (fn.kind === "keepsake" && typeof fn.link === "string") {
      urls.add(fn.link);
    }
  }
  return urls;
}

// 대상이 이 방에 실제로 있는지. link는 저장된 배치(PC 링크 허브, 기념품 링크)나 주인 채널 주소, reel은 이 방의 영상.
export async function isRoomTarget(roomId: string, kind: HeapOpenKind, target: string): Promise<boolean> {
  if (kind === "reel") {
    const idx = target.indexOf(":");
    if (idx < 1) return false;
    const platform = target.slice(0, idx);
    const externalId = target.slice(idx + 1);
    const [row] = await db
      .select({ id: heapReels.id })
      .from(heapReels)
      .where(
        and(
          eq(heapReels.roomId, roomId),
          sql`${heapReels.platform} = ${platform}`,
          eq(heapReels.externalId, externalId),
        ),
      )
      .limit(1);
    return !!row;
  }
  const [room] = await db
    .select({ layout: heapRooms.layout, creatorId: heapRooms.creatorId })
    .from(heapRooms)
    .where(eq(heapRooms.id, roomId))
    .limit(1);
  if (!room) return false;
  if (layoutLinks(room.layout).has(target)) return true;
  const [channel] = await db
    .select({ id: heapCreatorChannels.id })
    .from(heapCreatorChannels)
    .where(and(eq(heapCreatorChannels.creatorId, room.creatorId), eq(heapCreatorChannels.channelUrl, target)))
    .limit(1);
  return !!channel;
}

// 최근 days일(오늘 포함) 열람 수. 많은 순.
export async function listOpenStats(roomId: string, days: 7 | 30): Promise<HeapOpenStats> {
  const result = await db.execute(sql`
    select c.kind, c.target, sum(c.opens)::int as opens, max(r.title) as title
    from heap_open_counts c
    left join heap_reels r
      on c.kind = 'reel' and r.room_id = c.room_id and r.platform || ':' || r.external_id = c.target
    where c.room_id = ${roomId}
      and c.day > ${seoulToday} - ${days}::int
    group by c.kind, c.target
    order by opens desc, c.target asc
  `);
  const rows = result.rows as { kind: HeapOpenKind; target: string; opens: number; title: string | null }[];
  const stats: HeapOpenStats = { links: [], reels: [] };
  for (const row of rows) {
    if (row.kind === "link") stats.links.push({ target: row.target, opens: row.opens });
    else stats.reels.push({ target: row.target, opens: row.opens, ...(row.title ? { title: row.title } : {}) });
  }
  return stats;
}
