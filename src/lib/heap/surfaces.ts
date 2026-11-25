import catalogue from "../../../public/heap/models/catalogue.json";
import { itemHalfExtents } from "@/lib/heap/layout";
import { HEAP_POLICY } from "@/lib/heap/policy";

// 가구 위에 얹기의 규칙. 꾸미기(engine/edit.js)가 opts.surfaces 로 받고, 방을 지을 때(engine/index.js)도 쓴다.
// 받침(host): 윗면 높이(tops)를 가진 가구. 모델은 catalogue.json 의 tops (tools/measure-tops.mjs 가 GLB 에서 잰 값),
// 손으로 만드는 가구는 아래 HAND 표 (engine/furniture.js 의 BUILD 치수에서 읽은 값).
// 얹는 것(small): 탁상 달력과, 앉는 가구가 아니면서 바닥 넓이 w×d 가 SMALL_AREA 이하이고 키 h 가 SMALL_H 이하인 모델.
// 작지 않은 모델도 받침보다 바닥 넓이가 크지 않으면 얹는다 (canRestOn). 안쪽 칸에는 칸 높이에 들어가는 것만 (fitsOnTop).
// 얹은 물건의 y 는 받침의 y + 받침의 tops 중 하나다. 바닥에서 거꾸로 셈하지 않는다.

type Obj = Record<string, unknown>;
type Entry = { id: string; category: string; w: number; d: number; h?: number; tops?: number[]; mount?: string };

const BY_ID = new Map((catalogue.models as Entry[]).map((m) => [m.id, m]));
const SEAT_CATS = new Set(Object.keys(catalogue.seats));
const SMALL_AREA = 0.4;
const SMALL_H = 1.0;
// 위에 서 있다고 보는 틈. 저장된 러브쑤 방의 조리대 위 물건은 0.9 에 있고 조리대 윗면은 0.84 라 그보다 넉넉하다.
export const SURFACE_REST = 0.08;
// 손으로 만드는 받침: 침대는 매트리스, 앨범 책장은 세 칸과 꼭대기, 책 더미는 맨 위 책
const HAND: Record<string, { h: number; tops: number[] }> = {
  bed: { h: 0.64, tops: [0.48] },
  shelf: { h: 2.225, tops: [0.295, 0.995, 1.695, 2.225] },
  // 낮은 앨범 책장 (shelf 의 기본 모양, engine/furniture.js 의 LOW). 위의 shelf 는 style: "tall"
  shelfLow: { h: 0.92, tops: [0.1, 0.5, 0.92] },
  books: { h: 0.32, tops: [0.32] },
  // 방 v2 (docs/dev/heap-room-v2.md): 좌식 탁자는 받침이다. 나머지는 받침이 아니고 키만 있다
  lowTable: { h: 0.56, tops: [0.56] },
  heap: { h: 0.12, tops: [] },
  heapBox: { h: 0.25, tops: [] },
  phone: { h: 0.02, tops: [] },
  guestbook: { h: 0.04, tops: [] },
  // 방명록 받침대째 (style "stand"): 받침 0.78 위에 공책
  guestbookStand: { h: 0.82, tops: [] },
  // 영사기: 위 릴 꼭대기까지
  projector: { h: 0.42, tops: [] },
  // 작은 빛: 꾸미기의 구슬 꼭대기까지 (engine/furniture.js 의 GLOW_Y + 반지름)
  glow: { h: 0.3, tops: [] },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const entryOf = (it: Obj) => (it.type === "model" ? BY_ID.get(it.model as string) : undefined);
// 손 가구의 표 이름. 낮은 앨범 책장은 따로 잰다
const handKey = (it: Obj) => {
  if (it.type === "shelf") return it.style !== "tall" ? "shelfLow" : "shelf";
  if (it.type === "heap") return it.style === "box" ? "heapBox" : "heap";
  if (it.type === "guestbook") return it.style === "stand" ? "guestbookStand" : "guestbook";
  return it.type as string;
};

// 받침이면 그 윗면 높이들 (가구의 밑면에서, 낮은 것부터). 받침이 아니면 null
export function surfaceTops(it: Obj): number[] | null {
  const e = entryOf(it);
  if (e) return e.mount ? null : (e.tops ?? null);
  const tops = HAND[handKey(it)]?.tops;
  return tops?.length ? tops : null;
}

// 가구의 키. 모르면 null
export function itemHeight(it: Obj): number | null {
  const e = entryOf(it);
  if (e) return e.h ?? null;
  return HAND[handKey(it)]?.h ?? null;
}

export function isSmallItem(it: Obj): boolean {
  // 받침 위에 얹는 손 가구: 달력, 휴대폰, 영사기, 작은 빛, 방명록 공책(받침대째는 바닥에 선다), 사진 더미 (더미는 크지만 탁자에 얹는 것이다)
  if (it.type === "calendar" || it.type === "phone" || it.type === "projector" || it.type === "heap" || it.type === "glow") return true;
  if (it.type === "guestbook") return it.style !== "stand";
  const e = entryOf(it);
  if (!e || e.mount || e.category === "rug" || SEAT_CATS.has(e.category)) return false;
  return e.w * e.d <= SMALL_AREA && (e.h == null || e.h <= SMALL_H);
}

// 받침 위에 얹을 수 없는 모델: 침대와 건물 조각(문틀, 계단, 바닥판, 벽판, 오두막 조각, 바위, 눈 바닥). 앉는 가구, 러그, 벽·천장 가구는 따로 뺀다
const NEVER_ON = /^(doorway|stairs|floor|paneling|holidayCabin|holidayFloor|holidayRocks|holidaySnow(Flat|Bunker|Pile))/;
// 안쪽 칸(위에 다른 면이 있는 면)에 넣을 때 물건의 키가 칸의 높이를 넘어도 되는 만큼
export const SHELF_FIT_SLACK = 0.02;

// 어느 받침 위에든 설 수 있는 것: 작은 가구, 그리고 앉는 가구·러그·벽·천장 가구·침대·건물 조각이 아닌 모델.
// 작지 않은 모델은 받침보다 바닥 넓이가 크지 않을 때만 선다 (canRestOn). 판정 2026-11-25: TV 장 위의 옛날 TV, 탁자 위의 큰 화분
export function canStack(it: Obj): boolean {
  if (isSmallItem(it)) return true;
  const e = entryOf(it);
  return !!e && !e.mount && e.category !== "rug" && e.category !== "bed" && !SEAT_CATS.has(e.category) && !NEVER_ON.test(e.id);
}

const footArea = (it: Obj) => {
  const e = itemHalfExtents({ ...it, rot: 0 });
  return e ? 4 * e.hx * e.hz : Infinity;
};

// kid 를 host 위에 얹을 수 있는가. 작은 가구는 어느 받침에나, 그 밖의 얹을 수 있는 모델은 받침의 바닥 넓이 이하일 때
export function canRestOn(kid: Obj, host: Obj): boolean {
  if (kid === host || !surfaceTops(host) || !canStack(kid)) return false;
  return isSmallItem(kid) || footArea(kid) <= footArea(host);
}

// host 의 n 번째 윗면에 kid 가 들어가는가. 꼭대기는 늘 들어간다. 안쪽 칸은 바로 위 면까지의 틈이 kid 의 키(모르면 0)보다 낮지 않아야 한다
export function fitsOnTop(kid: Obj, host: Obj, n: number): boolean {
  const tops = surfaceTops(host);
  if (!tops || n >= tops.length - 1) return true;
  return (itemHeight(kid) ?? 0) <= tops[n + 1] - tops[n] + SHELF_FIT_SLACK;
}

// kid 가 host 의 어느 윗면에 서 있으면 그 면의 높이(방 바닥에서), 아니면 null.
// 가운데가 받침의 바닥 크기 안에 있고, 밑면과 그 면의 차이가 SURFACE_REST 안이어야 한다. 가장 가까운 면을 고른다.
export function restingTop(kid: Obj, host: Obj): number | null {
  if (kid === host) return null;
  const tops = surfaceTops(host);
  const e = tops && itemHalfExtents(host);
  if (!tops || !e) return null;
  const kx = kid.x as number, kz = kid.z as number, ky = (kid.y as number | undefined) ?? 0;
  if (Math.abs(kx - (host.x as number)) > e.hx || Math.abs(kz - (host.z as number)) > e.hz) return null;
  let best: number | null = null;
  for (const t of tops) {
    const y = r2(((host.y as number | undefined) ?? 0) + t);
    if (Math.abs(ky - y) <= SURFACE_REST && (best === null || Math.abs(ky - y) < Math.abs(ky - best))) best = y;
  }
  return best;
}

// 저장된 목록에서 받침 위에 선 작은 가구를 받침의 윗면에 딱 맞춘다 (러브쑤 방의 0.9 → 0.84).
// 목록을 고치지 않고 새 목록을 돌려준다. 받침이 먼저 내려앉으면 그 위의 것이 따라오도록 몇 번 돈다.
export function settleItems(items: Obj[]): { items: Obj[]; moved: { index: number; from: number; to: number }[] } {
  const out = items.map((it) => ({ ...it }));
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    out.forEach((it, i) => {
      const y = (it.y as number | undefined) ?? 0;
      if (!(y > 0) || !canStack(it)) return;
      let best: number | null = null;
      out.forEach((h, j) => {
        if (j === i || !canRestOn(it, h)) return;
        const t = restingTop(it, h);
        // 서버 한도보다 높은 윗면에는 앉히지 않는다: 저장이 거절된다 (codex)
        if (t !== null && t > HEAP_POLICY.layoutItemYMax) return;
        if (t !== null && (best === null || Math.abs(y - t) < Math.abs(y - best))) best = t;
      });
      if (best !== null && best !== y && best > 0) { it.y = best; changed = true; }
    });
    if (!changed) break;
  }
  const moved = out.flatMap((it, index) => {
    const from = (items[index].y as number | undefined) ?? 0, to = (it.y as number | undefined) ?? 0;
    return from !== to ? [{ index, from, to }] : [];
  });
  return { items: moved.length ? out : items, moved };
}

export const surfaces = { surfaceTops, itemHeight, isSmallItem, canStack, canRestOn, fitsOnTop, restingTop, settleItems, REST: SURFACE_REST };
