import catalogue from "../../../public/heap/models/catalogue.json";
import { HEAP_FUNNEL_POLICY, HEAP_POLICY } from "@/lib/heap/policy";
import { checkColors } from "@/lib/heap/parts";
import { checkFn } from "@/lib/heap/slots";

// 방 꾸미기(layout) 검사. 서버 액션이 저장하기 전에 부른다. DB도 repo도 건드리지 않는다.
// 형태는 engine/data.js 와 room-editor.tsx, public/heap/rooms/*/layout.json에서 읽은 것이다.
// 입력을 그대로 저장하지 않고, 검사를 통과한 필드만 새 객체로 옮겨 돌려준다.

export type LayoutCheck =
  | { ok: true; layout: Record<string, unknown> }
  | { ok: false; error: string };

type Obj = Record<string, unknown>;
type Fail = { error: string };
// 방 크기. h 는 벽 높이 (없으면 엔진 기본 2.5)
type Room = { w: number; d: number; h?: number };

// 엔진 BUILD가 직접 만드는 가구. 나머지는 type "model" + 카탈로그 id.
// frame은 벽에 거는 액자다 (기념품 기능을 달 수 있다). calendar는 책상 위 달력이다 (달력 기능을 단다).
// 방 v2 (docs/dev/heap-room-v2.md): 예전의 고정 소품도 가구다.
//   heap 사진 더미(방에 하나까지, style "box" 면 신발상자) · lowTable 좌식 탁자(러그, 방석, 머그째, rug 로 러그 크기)
//   phone 휴대폰 · guestbook 방명록 공책(style "stand" 면 나무 받침째) · screen 벽 스크린 · poster 벽 포스터 · window 창(w, h)
//   projector 영사기 (꾸밈만, 하는 일은 없다. 렌즈가 지역 -z 를 본다)
//   glow 작은 빛: 보이지 않고 빛만 낸다. 늘 켜져 있고 level(1..5, 없으면 3)이 세기다 (engine/furniture.js)
//   globe 스노우 글로브 (방에 하나까지). 누르면 떠올라 출처 목록을 보인다 (engine/fixtures.js, globe.js)
const HAND_TYPES = new Set([
  "bed", "shelf", "plant", "snake", "lamp", "books", "frame", "calendar",
  "heap", "lowTable", "phone", "guestbook", "screen", "poster", "window", "projector", "glow", "globe",
]);
// 작은 빛의 세기 단계
export const GLOW_LEVEL_MIN = 1;
export const GLOW_LEVEL_MAX = 5;
// 벽에 거는 손 가구. 바닥을 차지하지 않고, 액자처럼 뒷벽(z = -d/2, 0도)이나 왼쪽 벽(x = -w/2, 90도)에 붙는다.
// 액자와 달리 높이 y(가운데)를 고른다. 폭과 높이는 엔진(furniture.js, shell.js)이 짓는 틀 포함 크기다. window 는 item.w, item.h 에 틀 0.16 을 더한다.
export const WALL_HAND: Record<string, { w: number; h: number } | null> = {
  screen: { w: 1.74, h: 1.04 },
  poster: { w: 0.74, h: 1.2 },
  window: null,
};
export const isWallHand = (type: unknown): boolean => typeof type === "string" && type in WALL_HAND;
const MODEL_IDS = new Set(catalogue.models.map((model) => model.id));
// 손으로 만드는 가구의 바닥 크기(엔진 단위, 회전 전). engine/furniture.js BUILD의 치수에서 읽은 값이고 room-editor.tsx도 이 표를 쓴다.
// frame은 벽에 걸려서 바닥을 차지하지 않으니 없다. plant는 item.size를 곱한다.
export const HAND_FOOTPRINT: Record<string, { w: number; d: number }> = {
  bed: { w: 2.8, d: 1.4 },
  shelf: { w: 1.6, d: 0.5 },
  plant: { w: 0.7, d: 0.7 },
  snake: { w: 0.4, d: 0.4 },
  lamp: { w: 0.5, d: 0.5 },
  books: { w: 0.45, d: 0.35 },
  calendar: { w: 0.46, d: 0.2 },
  heap: { w: 1.2, d: 0.9 },
  lowTable: { w: 2.6, d: 1.8 },
  phone: { w: 0.2, d: 0.35 },
  guestbook: { w: 0.5, d: 0.36 },
  projector: { w: 0.3, d: 0.42 },
  glow: { w: 0.2, d: 0.2 },
  globe: { w: 0.34, d: 0.34 },
};
const MODEL_BY_ID = new Map(catalogue.models.map((model) => [model.id, model]));
// 불을 켜고 끌 수 있는 가구: 손으로 만드는 lamp, 그리고 카탈로그 category가 lamp인 모델
const LAMP_MODEL_IDS = new Set(catalogue.models.filter((model) => model.category === "lamp").map((model) => model.id));
const WALLS = new Set(["back", "left"]);
const TIME_NAMES = new Set(["auto", "night", "dawn", "morning", "noon", "golden", "dusk"]);
const PALETTE_KEYS = new Set([
  "olive", "accent", "paper", "ink", "wall", "trim", "woodB", "woodDark", "leaf", "leaf2", "leafDark",
]);
const HEX = /^#[0-9a-fA-F]{6}$/;
const FLOOR_BOARDS_MAX = 6;
const BRAND_MAX = 3;
// 영상 하나를 가리키는 키: 플랫폼 이름 + ":" + 플랫폼 안의 ID (heap_reels.platform, external_id)
export const REEL_KEY = /^(youtube|chzzk|twitch|soop|instagram|tiktok):[A-Za-z0-9_:.-]{1,255}$/;

// 방 화면(누구나 보는 페이지)에 넘기는 layout. 힙에서 뺀 영상 목록(excludedReels)은 뺀다: 방문자에게 뺀 영상의 ID가 드러난다.
// 엔진과 꾸미기는 이 값을 쓰지 않는다. 방 주인의 채널 탭은 repo.ts 의 listOwnerReels 로 읽는다.
export function publicLayout(layout: Record<string, unknown>): Record<string, unknown> {
  const { excludedReels: _hidden, ...rest } = layout;
  void _hidden;
  return rest;
}

function isObj(value: unknown): value is Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function num(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

// 허용한 키만 있는지. 모르는 키가 있으면 그 이름을 돌려준다.
function unknownKey(obj: Obj, allowed: readonly string[]): string | null {
  return Object.keys(obj).find((key) => !allowed.includes(key)) ?? null;
}

function checkItem(raw: unknown, index: number): Fail | { item: Obj } {
  const at = `items[${index}]`;
  if (!isObj(raw)) return { error: `${at}: 객체가 아니에요.` };
  const bad = unknownKey(raw, ["type", "x", "z", "rot", "size", "model", "tint", "y", "fn", "lit", "colors", "plant", "style", "rug", "w", "h", "level"]);
  if (bad) return { error: `${at}: 알 수 없는 필드 ${bad}` };

  const { type, x, z, rot, size, model, tint, y, fn, lit, colors, plant, style, rug, w, h, level } = raw;
  // plant: 앨범 책장(shelf) 위 화분을 둘지. false 만 저장한다 (없으면 둔다)
  if (plant !== undefined && (type !== "shelf" || typeof plant !== "boolean")) return { error: `${at}: plant는 shelf에만 true/false로 쓸 수 있어요.` };
  if (typeof type !== "string" || !(type === "model" || HAND_TYPES.has(type))) {
    return { error: `${at}: 알 수 없는 가구 종류` };
  }
  const max = HEAP_POLICY.layoutCoordMax;
  if (!num(x, -max, max) || !num(z, -max, max)) return { error: `${at}: 좌표가 범위를 벗어났어요.` };

  // style: 앨범 책장(shelf)은 없거나 "low" 면 낮은 두 칸 책장, "tall" 이면 키 큰 책장 (engine/furniture.js).
  // 사진 더미(heap)는 없으면 흩어진 더미, "box" 면 열린 신발상자 안의 더미 (engine/heap.js). 방명록(guestbook)은 "stand" 면 나무 받침째
  const STYLES: Record<string, string[]> = { shelf: ["low", "tall"], heap: ["box"], guestbook: ["stand"] };
  if (style !== undefined && !STYLES[type]?.includes(style as string)) {
    return { error: at + ': style이 올바르지 않아요 (shelf는 "low"나 "tall", heap은 "box", guestbook은 "stand").' };
  }
  const item: Obj = { type, x, z };
  if (plant === false) item.plant = false;
  if (style !== undefined) item.style = style;
  // rug: 좌식 탁자(lowTable)의 러그 크기 { w, d }. 없으면 엔진의 3.8 x 2.9
  if (rug !== undefined) {
    const { layoutRugMin: lo, layoutRugMax: hi } = HEAP_POLICY;
    if (type !== "lowTable" || !isObj(rug) || unknownKey(rug, ["w", "d"]) || !num(rug.w, lo, hi) || !num(rug.d, lo, hi)) {
      return { error: at + ": rug는 lowTable에만 { w, d }로 써요." };
    }
    item.rug = { w: rug.w, d: rug.d };
  }
  // w, h: 창(window)의 폭과 높이. 창에는 둘 다 있어야 한다 (엔진이 벽에 구멍을 낸다)
  if (type === "window") {
    if (!num(w, 0.3, 3) || !num(h, 0.3, 2)) return { error: at + ": 창은 w(0.3~3)와 h(0.3~2)가 있어야 해요." };
    item.w = w;
    item.h = h;
  } else if (w !== undefined || h !== undefined) {
    return { error: at + ": w, h는 창(window)에만 써요." };
  }
  // 벽에 거는 손 가구(screen, poster, window)는 가운데 높이 y가 있어야 한다. 범위는 wallHandError가 벽 높이로 본다
  if (isWallHand(type) && y === undefined) return { error: at + ": 벽에 거는 가구는 높이(y)가 있어야 해요." };
  if (type === "model") {
    if (typeof model !== "string" || !MODEL_IDS.has(model)) return { error: `${at}: 카탈로그에 없는 모델` };
    item.model = model;
  } else if (model !== undefined) {
    return { error: `${at}: model은 type이 model일 때만 쓸 수 있어요.` };
  }
  if (rot !== undefined) {
    if (!num(rot, -3600, 3600)) return { error: `${at}: rot가 올바르지 않아요.` };
    item.rot = rot;
  }
  if (size !== undefined) {
    if (!num(size, HEAP_POLICY.layoutItemSizeMin, HEAP_POLICY.layoutItemSizeMax)) {
      return { error: `${at}: size가 범위를 벗어났어요.` };
    }
    item.size = size;
  }
  if (y !== undefined) {
    if (!num(y, 0, HEAP_POLICY.layoutItemYMax)) return { error: `${at}: y가 범위를 벗어났어요.` };
    item.y = y;
  }
  if (tint !== undefined) {
    if (typeof tint !== "boolean") return { error: `${at}: tint는 true/false여야 해요.` };
    item.tint = tint;
  }
  if (lit !== undefined) {
    // 조명 스위치. 없으면 켜진 것으로 본다 (밤에 불이 들어온다). false면 늘 꺼져 있다.
    if (typeof lit !== "boolean") return { error: `${at}: lit는 true/false여야 해요.` };
    if (!(type === "lamp" || (type === "model" && LAMP_MODEL_IDS.has(item.model as string)))) {
      return { error: `${at}: lit는 조명에만 쓸 수 있어요.` };
    }
    item.lit = lit;
  }
  if (level !== undefined) {
    // 작은 빛(glow)의 세기. 정수 단계만
    if (type !== "glow") return { error: `${at}: level은 작은 빛에만 쓸 수 있어요.` };
    if (!Number.isInteger(level) || (level as number) < GLOW_LEVEL_MIN || (level as number) > GLOW_LEVEL_MAX) {
      return { error: `${at}: level은 ${GLOW_LEVEL_MIN}~${GLOW_LEVEL_MAX} 사이 정수여야 해요.` };
    }
    item.level = level;
  }
  if (colors !== undefined) {
    // 가구 하나만 따로 칠한 색 (색 묶음 C2, parts.ts). 모델 가구에만, 그 모델이 가진 부분에만
    const have = type === "model" ? (MODEL_BY_ID.get(item.model as string) as { parts?: string[] } | undefined)?.parts ?? [] : [];
    const r = checkColors(colors, type, have, `${at}.colors`);
    if ("error" in r) return r;
    item.colors = r.colors;
  }
  if (fn !== undefined) {
    // 가구에 붙는 기능. 그 가구가 달 수 있는 종류인지는 catalogue.json의 slots로 본다.
    const r = checkFn(fn, type, item.model as string | undefined, `${at}.fn`);
    if ("error" in r) return r;
    item.fn = r.fn;
  }
  return { item };
}

// 벽에 붙는 것: { wall, at, ...extra }. extra는 이름과 범위.
// extra의 필드는 모두 필수다 (엔진이 가드 없이 읽는다).
function checkWallPart(
  name: string,
  raw: unknown,
  extra: Record<string, [number, number]>,
): Fail | { part: Obj } {
  if (!isObj(raw)) return { error: `${name}: 객체가 아니에요.` };
  const bad = unknownKey(raw, ["wall", "at", ...Object.keys(extra)]);
  if (bad) return { error: `${name}: 알 수 없는 필드 ${bad}` };
  if (typeof raw.wall !== "string" || !WALLS.has(raw.wall)) return { error: `${name}: wall이 올바르지 않아요.` };
  const max = HEAP_POLICY.layoutCoordMax;
  if (!num(raw.at, -max, max)) return { error: `${name}: at이 범위를 벗어났어요.` };
  const part: Obj = { wall: raw.wall, at: raw.at };
  for (const [key, [lo, hi]] of Object.entries(extra)) {
    if (!num(raw[key], lo, hi)) return { error: `${name}: ${key}가 없거나 범위를 벗어났어요.` };
    part[key] = raw[key];
  }
  return { part };
}

// 가구 하나가 바닥에서 차지하는 직사각형의 반쪽 크기(회전한 뒤, 축에 맞춘 경계). 바닥 크기를 모르는 가구는 null이다.
export function itemHalfExtents(item: Obj): { hx: number; hz: number } | null {
  let w: number;
  let d: number;
  if (item.type === "model") {
    const model = MODEL_BY_ID.get(item.model as string);
    if (!model) return null;
    ({ w, d } = model);
  } else {
    const hand = HAND_FOOTPRINT[item.type as string];
    if (!hand) return null;
    const k = item.type === "plant" ? ((item.size as number | undefined) ?? 1) : 1;
    w = hand.w * k;
    d = hand.d * k;
  }
  const angle = (((item.rot as number | undefined) ?? 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  return { hx: (w * c + d * s) / 2, hz: (w * s + d * c) / 2 };
}

// 가구는 바닥 크기째로 방 안에 있어야 한다. 좌표 범위(layoutCoordMax)만 보면 6 x 6 방에서도 방 밖에 놓을 수 있다.
// 방 크기가 없으면 엔진 기본(8 x 8)으로 본다. 벽 액자는 벽 자리 검사(frameError)가 따로 본다.
// 아래 세 검사는 가구 하나를 보고 서버 문구(번호 없이) 또는 null을 돌려준다. 목록 전체는 firstError가 돈다.
function boundsError(it: Obj, room: Room | undefined): string | null {
  const w = room?.w ?? 8, d = room?.d ?? 8, eps = 0.05;
  if (it.type === "frame" || isWallHand(it.type)) return null;
  const e = itemHalfExtents(it);
  if (!e) return null;
  if (Math.abs(it.x as number) + e.hx > w / 2 + eps || Math.abs(it.z as number) + e.hz > d / 2 + eps) {
    return "가구가 방 밖으로 나가요.";
  }
  return null;
}

// 벽에 거는 손 가구(screen, poster, window): 액자처럼 뒷벽(z = -d/2, 0도) 또는 왼쪽 벽(x = -w/2, 90도)에 붙고,
// 벽을 따라 폭째로 벽 안에 든다 (모서리에서 0.05). 높이: 아래 끝이 바닥 위 0.3 이상, 위 끝이 벽 윗선 0.08 아래 (러브쑤 시안 2 의 포스터 1.8 이 든다).
// 벽 높이는 room.h, 없으면 엔진 기본 2.5 (scene.js). 방 크기가 없으면 엔진 기본(8 x 8)으로 본다.
function wallHandError(it: Obj, room: Room | undefined): string | null {
  if (!isWallHand(it.type)) return null;
  const w = room?.w ?? 8, d = room?.d ?? 8, wallH = room?.h ?? 2.5, eps = 0.01;
  const size = WALL_HAND[it.type as string] ?? { w: (it.w as number) + 0.16, h: (it.h as number) + 0.16 }; // 창은 틀(0.08 씩)을 더한다
  const x = it.x as number, z = it.z as number, rot = ((it.rot as number | undefined) ?? 0), y = it.y as number;
  const onBack = Math.abs(z + d / 2) <= eps && rot === 0 && Math.abs(x) + size.w / 2 <= w / 2 - 0.05 + eps;
  const onLeft = Math.abs(x + w / 2) <= eps && rot === 90 && Math.abs(z) + size.w / 2 <= d / 2 - 0.05 + eps;
  if (!onBack && !onLeft) return "벽에 거는 가구는 뒷벽이나 왼쪽 벽 안에 붙여 걸어야 해요.";
  if (y - size.h / 2 < 0.3 - eps || y + size.h / 2 > wallH - 0.08 + eps) return "벽에 거는 가구의 높이가 벽 안에 들지 않아요.";
  return null;
}

// 벽 액자는 꾸미기가 놓는 자리에만 둘 수 있다: 뒷벽(z = -d/2, 0도) 또는 왼쪽 벽(x = -w/2, 90도), 벽을 따라 모서리에서 margin 이상,
// 높이는 frameY. 방 크기가 없으면 엔진 기본(8 x 8)으로 본다. 그 밖의 자리에 걸면 바닥을 뚫거나 방 한가운데에 떠 있게 된다.
function frameError(it: Obj, room: Room | undefined): string | null {
  const w = room?.w ?? 8, d = room?.d ?? 8, margin = HEAP_POLICY.frameWallMargin, eps = 0.01;
  if (it.type !== "frame") return null;
  const x = it.x as number, z = it.z as number, rot = ((it.rot as number | undefined) ?? 0);
  const y = (it.y as number | undefined) ?? HEAP_POLICY.frameY;
  if (Math.abs(y - HEAP_POLICY.frameY) > eps) return "액자 높이가 올바르지 않아요.";
  const onBack = Math.abs(z + d / 2) <= eps && rot === 0 && x >= -w / 2 + margin - eps && x <= w / 2 - margin + eps;
  const onLeft = Math.abs(x + w / 2) <= eps && rot === 90 && z >= -d / 2 + margin - eps && z <= d / 2 - margin + eps;
  if (!onBack && !onLeft) return "액자는 뒷벽이나 왼쪽 벽에 붙여 걸어야 해요.";
  return null;
}

// 벽에 거는 모델(catalogue.json 의 mount 가 "wall": 상부장, 후드, 거울, 벽 조명, 리스, 전구 줄)은 뒷벽에 0도로 또는 왼쪽 벽에 90도로,
// 등을 벽에 붙여(바닥 크기의 뒷면이 벽에 닿게) 건다. 높이 y 는 있어야 하고 범위(0..layoutItemYMax)는 checkItem 이 본다.
// 모델의 키는 서버가 모르므로 천장을 뚫는지는 보지 않는다 (꾸미기가 모델 크기로 막는다). 허용 오차는 액자와 같다.
// 천장에 다는 것(mount "ceiling")과 벽 조각(mount "structure")은 여기서 보지 않는다.
const WALL_MOUNT_IDS = new Set(catalogue.models.filter((model) => "mount" in model && model.mount === "wall").map((model) => model.id));
function wallMountError(it: Obj, room: Room | undefined): string | null {
  if (it.type !== "model" || !WALL_MOUNT_IDS.has(it.model as string)) return null;
  const w = room?.w ?? 8, d = room?.d ?? 8, eps = 0.01;
  if (it.y === undefined) return "벽에 거는 가구는 높이가 있어야 해요.";
  const e = itemHalfExtents(it);
  if (!e) return null;
  const x = it.x as number, z = it.z as number, rot = ((it.rot as number | undefined) ?? 0);
  const onBack = rot === 0 && Math.abs(z - (-d / 2 + e.hz)) <= eps;
  const onLeft = rot === 90 && Math.abs(x - (-w / 2 + e.hx)) <= eps;
  if (!onBack && !onLeft) return "벽에 거는 가구는 뒷벽이나 왼쪽 벽에 등을 붙여 걸어야 해요.";
  return null;
}

// 목록 전체에 검사 하나를 돈다. 처음 걸린 가구의 번호를 붙여 돌려준다.
function firstError(items: Obj[] | undefined, check: (it: Obj) => string | null): string | null {
  for (let i = 0; i < (items?.length ?? 0); i++) {
    const error = check(items![i]);
    if (error) return `items[${i}]: ${error}`;
  }
  return null;
}

// 가구 하나의 자리가 서버의 자리 검사(액자 자리, 벽 가구 자리, 방 안)를 통과하는지.
// 걸리면 서버와 같은 문구(번호 없이)를, 통과하면 null을 돌려준다. 꾸미기(engine/edit.js)가 옮기는 동안 이것으로 미리 본다.
// 필드 모양은 보지 않는다 (validateLayout이 본다). 예전의 세 번째 인자(사진 탁자 자리)는 탁자가 가구가 되며 쓰지 않는다.
export function itemPlacementError(item: Obj, room: Room | undefined, _table?: unknown): string | null {
  void _table;
  return frameError(item, room) ?? wallMountError(item, room) ?? wallHandError(item, room) ?? boundsError(item, room);
}

// 온보딩 방(HEAP_POLICY.onboardingRoomSlug)에는 사진 더미가 늘 있어야 한다. 저장 액션(actions.ts)이 그 방에만 부른다.
export function heapRequiredError(layout: Record<string, unknown>): string | null {
  const items = Array.isArray(layout.items) ? (layout.items as Obj[]) : [];
  return items.some((it) => it?.type === "heap") ? null : "이 방에는 사진 더미가 있어야 해요.";
}

export function validateLayout(input: unknown): LayoutCheck {
  const fail = (error: string): LayoutCheck => ({ ok: false, error });
  if (!isObj(input)) return fail("layout이 객체가 아니에요.");

  let size: number;
  try {
    size = new TextEncoder().encode(JSON.stringify(input)).length;
  } catch {
    return fail("layout을 직렬화할 수 없어요.");
  }
  if (size > HEAP_POLICY.layoutMaxBytes) return fail("layout이 너무 커요.");

  const out: Obj = {};
  for (const [key, value] of Object.entries(input)) {
    switch (key) {
      case "room": {
        if (!isObj(value) || unknownKey(value, ["w", "d", "h"])) return fail("room: 형식이 올바르지 않아요.");
        const { layoutRoomMin: lo, layoutRoomMax: hi } = HEAP_POLICY;
        if (!num(value.w, lo, hi) || !num(value.d, lo, hi)) return fail("room: 크기가 범위를 벗어났어요.");
        const room: Obj = { w: value.w, d: value.d };
        if (value.h !== undefined) {
          if (!num(value.h, HEAP_POLICY.layoutWallHMin, HEAP_POLICY.layoutWallHMax)) return fail("room: 벽 높이가 범위를 벗어났어요.");
          room.h = value.h;
        }
        out.room = room;
        break;
      }
      case "palette": {
        if (!isObj(value)) return fail("palette: 객체가 아니에요.");
        const palette: Obj = {};
        for (const [name, color] of Object.entries(value)) {
          if (name === "floor") {
            const ok = Array.isArray(color) && color.length >= 1 && color.length <= FLOOR_BOARDS_MAX &&
              color.every((c) => typeof c === "string" && HEX.test(c));
            if (!ok) return fail("palette.floor: #RRGGBB 목록이어야 해요.");
            palette.floor = [...(color as string[])];
            continue;
          }
          if (!PALETTE_KEYS.has(name)) return fail(`palette: 알 수 없는 색 이름 ${name}`);
          if (typeof color !== "string" || !HEX.test(color)) return fail(`palette.${name}: #RRGGBB 형식이어야 해요.`);
          palette[name] = color;
        }
        out.palette = palette;
        break;
      }
      case "ground": {
        // 방 밑 땅의 색 (engine/scene.js). 방이 허공에 뜨지 않고 놓여 보이게 한다. 없으면 땅이 없다
        if (!isObj(value) || unknownKey(value, ["colour"]) || typeof value.colour !== "string" || !HEX.test(value.colour)) {
          return fail("ground: { colour: #RRGGBB } 형식이어야 해요.");
        }
        out.ground = { colour: value.colour };
        break;
      }
      case "backdrop": {
        // 방 뒤의 배경. { mode: "time" }(시간 따라, 없을 때와 같다) 또는 { mode: "colour", top, bottom? } (bottom이 있으면 위에서 아래로 그라데이션)
        if (!isObj(value) || typeof value.mode !== "string") return fail("backdrop: 형식이 올바르지 않아요.");
        if (value.mode === "time") {
          if (unknownKey(value, ["mode"])) return fail("backdrop: 형식이 올바르지 않아요.");
          // 시간 따라는 배경이 없는 것과 같다. 저장하지 않아서 꾸미기가 한 가지 모양(색 배경 | 없음)만 다루게 한다 (codex)
          break;
        }
        if (value.mode !== "colour" || unknownKey(value, ["mode", "top", "bottom"])) return fail("backdrop: 형식이 올바르지 않아요.");
        if (typeof value.top !== "string" || !HEX.test(value.top)) return fail("backdrop.top: #RRGGBB 형식이어야 해요.");
        const backdrop: Obj = { mode: "colour", top: value.top };
        if (value.bottom !== undefined) {
          if (typeof value.bottom !== "string" || !HEX.test(value.bottom)) return fail("backdrop.bottom: #RRGGBB 형식이어야 해요.");
          backdrop.bottom = value.bottom;
        }
        out.backdrop = backdrop;
        break;
      }
      case "brand": {
        // 주인이 넣은 브랜드 색 1~3개. 내 색 팔레트(brand-palette.ts)를 만든 재료이고 배경 색 칩으로도 쓴다
        // every 는 빈 칸(new Array(1))을 건너뛰므로 번호마다 직접 본다 (codex)
        let ok = Array.isArray(value) && value.length >= 1 && value.length <= BRAND_MAX;
        if (ok) for (let i = 0; i < (value as unknown[]).length; i++) {
          const c = (value as unknown[])[i];
          if (!(i in (value as unknown[])) || typeof c !== "string" || !HEX.test(c)) { ok = false; break; }
        }
        if (!ok) return fail("brand: #RRGGBB 1~3개여야 해요.");
        out.brand = [...(value as string[])];
        break;
      }
      case "door": {
        // 문: 꼭 있어야 하는 단 하나 (다른 방으로 가는 길). 방 v2 에서 예전의 window, screen, guestbook, posters, table 은 가구다
        const r = checkWallPart("door", value, {});
        if ("error" in r) return fail(r.error);
        out.door = r.part;
        break;
      }
      case "time": {
        const ok = typeof value === "string" ? TIME_NAMES.has(value) : num(value, 0, 24);
        if (!ok) return fail("time이 올바르지 않아요.");
        out.time = value;
        break;
      }
      case "items": {
        if (!Array.isArray(value)) return fail("items: 배열이 아니에요.");
        if (value.length > HEAP_POLICY.layoutMaxItems) return fail("items: 가구가 너무 많아요.");
        const items: Obj[] = [];
        let trees = 0;
        let heaps = 0;
        let globes = 0;
        for (let i = 0; i < value.length; i++) {
          const r = checkItem(value[i], i);
          if ("error" in r) return fail(r.error);
          if (r.item.type === "heap" && ++heaps > 1) return fail(`items[${i}]: 사진 더미는 방에 하나까지예요.`);
          if (r.item.type === "globe" && ++globes > 1) return fail(`items[${i}]: 스노우 글로브는 방에 하나까지예요.`);
          if ((r.item.fn as { kind?: string } | undefined)?.kind === "tree" && ++trees > HEAP_POLICY.treesPerRoom) {
            return fail(`items[${i}].fn: 쪽지 트리는 방에 ${HEAP_POLICY.treesPerRoom}개까지예요.`);
          }
          items.push(r.item);
        }
        out.items = items;
        break;
      }
      case "excludedReels": {
        // 힙에서 뺀 영상의 "<platform>:<externalId>" 목록. 서버만 고치는 값이다 (repo.setReelExcluded, saveRoomLayout이 지킨다).
        if (!Array.isArray(value) || value.length > HEAP_FUNNEL_POLICY.excludedReelsMax) {
          return fail("excludedReels: 목록이 올바르지 않아요.");
        }
        if (!value.every((key) => typeof key === "string" && REEL_KEY.test(key))) {
          return fail("excludedReels: 항목 형식이 올바르지 않아요.");
        }
        out.excludedReels = [...new Set(value as string[])];
        break;
      }
      default:
        // 시드 파일의 "_note"처럼 밑줄로 시작하는 메모만 문자열로 허용한다.
        if (key.startsWith("_") && typeof value === "string" && value.length <= 500) {
          out[key] = value;
          break;
        }
        return fail(`알 수 없는 필드 ${key}`);
    }
  }
  // 벽 액자는 방 크기를 알아야 위치를 볼 수 있어서 모든 필드를 읽은 뒤에 본다.
  const items = out.items as Obj[] | undefined;
  const room = out.room as Room | undefined;
  const frameFail = firstError(items, (it) => frameError(it, room));
  if (frameFail) return fail(frameFail);
  const wallFail = firstError(items, (it) => wallMountError(it, room));
  if (wallFail) return fail(wallFail);
  const wallHandFail = firstError(items, (it) => wallHandError(it, room));
  if (wallHandFail) return fail(wallHandFail);
  const boundsFail = firstError(items, (it) => boundsError(it, room));
  if (boundsFail) return fail(boundsFail);
  // 꼭 있어야 하는 것은 문 하나다 (방 v2). 나머지는 모두 가구라 없어도 된다.
  if (!out.door) return fail("door가 필요해요.");
  return { ok: true, layout: out };
}
