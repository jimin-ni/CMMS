import catalogue from "../../../public/heap/models/catalogue.json";
import { itemHalfExtents } from "@/lib/heap/layout";
import { HEAP_POLICY } from "@/lib/heap/policy";

// 가구 위에 얹기의 규칙. 꾸미기(engine/edit.js)가 opts.surfaces 로 받고, 방을 지을 때(engine/index.js)도 쓴다.
// 받침(host): 윗면 높이(tops)를 가진 가구. 모델은 catalogue.json 의 tops (tools/measure-tops.mjs 가 GLB 에서 잰 값),
// 손으로 만드는 가구는 아래 HAND 표 (engine/furniture.js 의 BUILD 치수에서 읽은 값).
// 얹는 것(small): 탁상 달력과, 앉는 가구가 아니면서 바닥 넓이 w×d 가 SMALL_AREA 이하이고 키 h 가 SMALL_H 이하인 모델.
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
  books: { h: 0.32, tops: [0.32] },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const entryOf = (it: Obj) => (it.type === "model" ? BY_ID.get(it.model as string) : undefined);

// 받침이면 그 윗면 높이들 (가구의 밑면에서, 낮은 것부터). 받침이 아니면 null
export function surfaceTops(it: Obj): number[] | null {
  const e = entryOf(it);
  if (e) return e.mount ? null : (e.tops ?? null);
  return HAND[it.type as string]?.tops ?? null;
}

// 가구의 키. 모르면 null
export function itemHeight(it: Obj): number | null {
  const e = entryOf(it);
  if (e) return e.h ?? null;
  return HAND[it.type as string]?.h ?? null;
}

export function isSmallItem(it: Obj): boolean {
  if (it.type === "calendar") return true;
  const e = entryOf(it);
  if (!e || e.mount || e.category === "rug" || SEAT_CATS.has(e.category)) return false;
  return e.w * e.d <= SMALL_AREA && (e.h == null || e.h <= SMALL_H);
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
      if (!(y > 0) || !isSmallItem(it)) return;
      let best: number | null = null;
      out.forEach((h, j) => {
        if (j === i) return;
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

export const surfaces = { surfaceTops, itemHeight, isSmallItem, restingTop, settleItems, REST: SURFACE_REST };
