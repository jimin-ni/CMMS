import catalogue from "../../../../public/heap/models/catalogue.json";
import { surfaceTops, itemHeight } from "@/lib/heap/surfaces";

// 받침 시험 방(/dev/surfaces)의 배치. 윗면이 있는 가구(받침)를 한 줄씩 깔고, 받침마다 꼭대기에 시험용 물건 하나,
// 안쪽 칸에는 그 칸에 들어가는 책을 얹는다. 꾸미기로 들어가 아무 물건이나 받침 위로 끌어 보는 방이다.
// set "base": 크리스마스 키트를 뺀 모델과 손 가구, set "holiday": 크리스마스 키트의 받침.

type Obj = Record<string, unknown>;
type Entry = { id: string; category: string; w: number; d: number; h?: number; tops?: number[]; mount?: string };

const ROOM = 12;
const HALF = ROOM / 2;
const GAP = 0.35;
// 앉는 가구와 건물 조각(문틀, 계단, 바닥판, 벽판)은 시험할 받침이 아니다
const SEATS = new Set(Object.keys(catalogue.seats));
const ARCH = /^(doorway|stairs|floor|paneling|holidayCabin|holidayFloor|holidayRocks|holidaySnow(Flat|Bunker|Pile))/;
// 꼭대기에 돌아가며 얹는 물건: 큰 TV부터 작은 화분까지
const PROBES = [
  "televisionVintage", "televisionModern", "computerScreen", "radio", "kitchenMicrowave", "speakerSmall",
  "lampRoundTable", "plantSmall1", "laptop", "pottedPlant", "speaker", "toaster",
];

// set "probe": 서랍과 장 몇 개만, 위에 아무것도 없이 띄엄띄엄. 끌어 놓기 시험(surf-drag.mjs)이 한 받침씩 겨눈다
export const PROBE_HOSTS = [
  "cabinetTelevision", "cabinetBedDrawer", "sideTableDrawers", "kitchenCabinetDrawer", "bathroomCabinetDrawer", "tableCoffee", "bookcaseOpen",
];

function hosts(set: string): Obj[] {
  if (set === "probe") return PROBE_HOSTS.map((id) => ({ type: "model", model: id }));
  const models = (catalogue.models as Entry[]).filter(
    (m) => m.tops && !m.mount && !SEATS.has(m.category) && !ARCH.test(m.id) && (set === "holiday") === (m.category === "크리스마스"),
  );
  const out: Obj[] = models.map((m) => ({ type: "model", model: m.id }));
  if (set !== "holiday") out.push({ type: "shelf" }, { type: "shelf", style: "tall" }, { type: "lowTable" }, { type: "books" });
  return out;
}

const size = (it: Obj) => {
  if (it.type === "model") {
    const m = (catalogue.models as Entry[]).find((e) => e.id === it.model)!;
    return { w: m.w, d: m.d };
  }
  return { shelf: { w: 1.6, d: 0.5 }, lowTable: { w: 2.6, d: 1.8 }, books: { w: 0.45, d: 0.35 } }[it.type as string]!;
};
const r2 = (v: number) => Math.round(v * 100) / 100;

// set "movers": 옮기기 시험(heap-move.mjs)용. 가구 종류마다 하나씩: 좌식 탁자 위의 더미, 위에 물건을 얹은 받침, 조명, 작은 빛, 영사기, 책장, 벽의 창·스크린·포스터
const MOVERS: Obj[] = [
  { type: "lowTable", x: -2, z: 2, rot: 0 },
  { type: "heap", x: -2, z: 2, y: 0.56 },
  { type: "phone", x: -1.2, z: 2.5, y: 0.56, rot: 0 },
  { type: "model", model: "cabinetTelevision", x: 3.5, z: -5.7, rot: 0 },
  { type: "model", model: "televisionModern", x: 3.5, z: -5.7, rot: 0, y: 0.62 },
  { type: "model", model: "books", x: 3.5, z: -5.7, rot: 0, y: 0.16 },
  { type: "model", model: "bookcaseOpen", x: -3.8, z: -5.7, rot: 0 },
  { type: "model", model: "books", x: -3.8, z: -5.7, rot: 0, y: 0.74 },
  { type: "model", model: "lampRoundFloor", x: 1.5, z: -3, rot: 0 },
  { type: "glow", x: 3, z: 1 },
  { type: "projector", x: 0.5, z: 3.5, rot: 0 },
  { type: "shelf", x: -5.7, z: -1.5, rot: 90, style: "low" },
  { type: "plant", x: 4, z: 3, size: 0.8 },
  { type: "window", x: 0.5, z: -6, rot: 0, y: 1.71, w: 1.3, h: 1.2 },
  { type: "screen", x: -1.6, z: -6, rot: 0, y: 1.85 },
  { type: "poster", x: -6, z: 1, rot: 90, y: 1.8 },
];

export function simLayout(set: string): Record<string, unknown> {
  if (set === "movers") {
    return {
      room: { w: ROOM, d: ROOM },
      palette: { wall: "#E6DCC8", trim: "#565344", accent: "#A6613C" },
      door: { wall: "left", at: r2(HALF - 1) },
      items: MOVERS,
    };
  }
  const items: Obj[] = [];
  let x = -HALF + 0.2;
  let z = -HALF + 0.2;
  let rowD = 0;
  let probe = 0;
  const probe0 = set === "probe";
  const list = probe0 ? hosts(set) : hosts(set).sort((a, b) => size(b).d - size(a).d);
  const gap = probe0 ? 0.5 : GAP; // probe: 한 줄에 다 들어가야 앞줄이 뒷줄을 가리지 않는다
  for (const host of list) {
    const { w, d } = size(host);
    if (x + w > HALF - 0.2) { x = -HALF + 0.2; z += rowD + gap + 0.5; rowD = 0; }
    if (z + d > HALF - 1.4) break; // 문 앞과 걸을 자리를 남긴다
    const placed = { ...host, x: r2(x + w / 2), z: r2(z + d / 2), rot: 0 };
    items.push(placed);
    x += w + gap;
    rowD = Math.max(rowD, d);
    if (probe0) continue;
    const tops = surfaceTops(placed) ?? [];
    const top = tops[tops.length - 1];
    if (top != null) items.push({ type: "model", model: PROBES[probe++ % PROBES.length], x: placed.x, z: placed.z, rot: 0, y: r2(top) });
    // 안쪽 칸: 다음 면까지의 틈에 책(키 0.21)이 들어가면 책을 둔다
    tops.slice(0, -1).forEach((t, i) => {
      if (t >= 0.1 && tops[i + 1] - t >= (itemHeight({ type: "model", model: "books" }) ?? 0.21)) {
        items.push({ type: "model", model: "books", x: placed.x, z: placed.z, rot: 0, y: r2(t) });
      }
    });
  }
  // 사진 더미: 바닥 가운데 앞쪽의 좌식 탁자 대신 낮은 받침 없이 바닥에. 더미 옮기기 시험용
  items.push({ type: "heap", x: 0, z: r2(HALF - 0.9), rot: 0 });
  return {
    room: { w: ROOM, d: ROOM },
    palette: { wall: "#E6DCC8", trim: "#565344", accent: "#A6613C" },
    door: { wall: "left", at: r2(HALF - 1) },
    items,
  };
}
