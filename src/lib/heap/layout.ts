import catalogue from "../../../public/heap/models/catalogue.json";
import { HEAP_FUNNEL_POLICY, HEAP_POLICY } from "@/lib/heap/policy";
import { checkFn } from "@/lib/heap/slots";

// 방 꾸미기(layout) 검사. 서버 액션이 저장하기 전에 부른다. DB도 repo도 건드리지 않는다.
// 형태는 engine/data.js 와 room-editor.tsx, public/heap/rooms/*/layout.json에서 읽은 것이다.
// 입력을 그대로 저장하지 않고, 검사를 통과한 필드만 새 객체로 옮겨 돌려준다.

export type LayoutCheck =
  | { ok: true; layout: Record<string, unknown> }
  | { ok: false; error: string };

type Obj = Record<string, unknown>;
type Fail = { error: string };

// 엔진 BUILD가 직접 만드는 가구. 나머지는 type "model" + 카탈로그 id.
// frame은 벽에 거는 액자다 (기념품 기능을 달 수 있다). calendar는 책상 위 달력이다 (달력 기능을 단다).
const HAND_TYPES = new Set(["bed", "shelf", "plant", "snake", "lamp", "books", "frame", "calendar"]);
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
  const bad = unknownKey(raw, ["type", "x", "z", "rot", "size", "model", "tint", "y", "fn", "lit"]);
  if (bad) return { error: `${at}: 알 수 없는 필드 ${bad}` };

  const { type, x, z, rot, size, model, tint, y, fn, lit } = raw;
  if (typeof type !== "string" || !(type === "model" || HAND_TYPES.has(type))) {
    return { error: `${at}: 알 수 없는 가구 종류` };
  }
  const max = HEAP_POLICY.layoutCoordMax;
  if (!num(x, -max, max) || !num(z, -max, max)) return { error: `${at}: 좌표가 범위를 벗어났어요.` };

  const item: Obj = { type, x, z };
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
function boundsError(it: Obj, room: { w: number; d: number } | undefined): string | null {
  const w = room?.w ?? 8, d = room?.d ?? 8, eps = 0.05;
  if (it.type === "frame") return null;
  const e = itemHalfExtents(it);
  if (!e) return null;
  if (Math.abs(it.x as number) + e.hx > w / 2 + eps || Math.abs(it.z as number) + e.hz > d / 2 + eps) {
    return "가구가 방 밖으로 나가요.";
  }
  return null;
}

// 앉는 가구(의자, 소파)는 사진 탁자와 겹치면 그 자리에 앉을 길이 막힌다. 탁자는 고정이라 서버가 거른다.
// 러그는 바닥에 앉는 자리라서 여기서는 보지 않는다 (탁자 밑에 깔 수 있다. 앉을 자리가 탁자 밑이면 엔진이 앉히지 않는다).
const SEAT_CATEGORIES = new Set(
  Object.entries(catalogue.seats as Record<string, { floor?: boolean }>)
    .filter(([, rule]) => !rule.floor)
    .map(([category]) => category),
);
function seatError(it: Obj, table: { x: number; z: number }): string | null {
  const eps = 0.01;
  if (it.type !== "model") return null;
  const model = MODEL_BY_ID.get(it.model as string);
  if (!model || !SEAT_CATEGORIES.has(model.category)) return null;
  const e = itemHalfExtents(it);
  if (!e) return null;
  if (
    Math.abs((it.x as number) - table.x) < e.hx + HEAP_POLICY.tableW / 2 - eps &&
    Math.abs((it.z as number) - table.z) < e.hz + HEAP_POLICY.tableD / 2 - eps
  ) {
    return "의자와 소파는 사진 탁자와 겹치게 둘 수 없어요.";
  }
  return null;
}

// 벽 액자는 꾸미기가 놓는 자리에만 둘 수 있다: 뒷벽(z = -d/2, 0도) 또는 왼쪽 벽(x = -w/2, 90도), 벽을 따라 모서리에서 margin 이상,
// 높이는 frameY. 방 크기가 없으면 엔진 기본(8 x 8)으로 본다. 그 밖의 자리에 걸면 바닥을 뚫거나 방 한가운데에 떠 있게 된다.
function frameError(it: Obj, room: { w: number; d: number } | undefined): string | null {
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
function wallMountError(it: Obj, room: { w: number; d: number } | undefined): string | null {
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

// 가구 하나의 자리가 서버의 자리 검사(액자 자리, 방 안, 앉는 가구와 사진 탁자)를 통과하는지.
// 걸리면 서버와 같은 문구(번호 없이)를, 통과하면 null을 돌려준다. 꾸미기(engine/edit.js)가 옮기는 동안 이것으로 미리 본다.
// 필드 모양은 보지 않는다 (validateLayout이 본다).
export function itemPlacementError(
  item: Obj,
  room: { w: number; d: number } | undefined,
  table: { x: number; z: number },
): string | null {
  return frameError(item, room) ?? wallMountError(item, room) ?? boundsError(item, room) ?? seatError(item, table);
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
        if (!isObj(value) || unknownKey(value, ["w", "d"])) return fail("room: 형식이 올바르지 않아요.");
        const { layoutRoomMin: lo, layoutRoomMax: hi } = HEAP_POLICY;
        if (!num(value.w, lo, hi) || !num(value.d, lo, hi)) return fail("room: 크기가 범위를 벗어났어요.");
        out.room = { w: value.w, d: value.d };
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
      case "window": {
        const r = checkWallPart("window", value, { w: [0.3, 6], h: [0.3, 3], y: [0, HEAP_POLICY.layoutItemYMax] });
        if ("error" in r) return fail(r.error);
        out.window = r.part;
        break;
      }
      case "door":
      case "screen":
      case "guestbook": {
        const r = checkWallPart(key, value, {});
        if ("error" in r) return fail(r.error);
        out[key] = r.part;
        break;
      }
      case "posters": {
        if (!isObj(value) || unknownKey(value, ["wall", "at"])) return fail("posters: 형식이 올바르지 않아요.");
        if (typeof value.wall !== "string" || !WALLS.has(value.wall)) return fail("posters: wall이 올바르지 않아요.");
        const at = value.at;
        const max = HEAP_POLICY.layoutCoordMax;
        if (!Array.isArray(at) || at.length > HEAP_POLICY.layoutPostersMax || !at.every((u) => num(u, -max, max))) {
          return fail("posters: at이 올바르지 않아요.");
        }
        out.posters = { wall: value.wall, at: [...at] };
        break;
      }
      case "table": {
        if (!isObj(value) || unknownKey(value, ["x", "z", "projector"])) return fail("table: 형식이 올바르지 않아요.");
        const max = HEAP_POLICY.layoutCoordMax;
        if (!num(value.x, -max, max) || !num(value.z, -max, max)) return fail("table: 좌표가 범위를 벗어났어요.");
        const table: Obj = { x: value.x, z: value.z };
        if (value.projector !== undefined) {
          if (value.projector !== "left" && value.projector !== "right") return fail("table: projector가 올바르지 않아요.");
          table.projector = value.projector;
        }
        out.table = table;
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
        for (let i = 0; i < value.length; i++) {
          const r = checkItem(value[i], i);
          if ("error" in r) return fail(r.error);
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
  const room = out.room as { w: number; d: number } | undefined;
  const frameFail = firstError(items, (it) => frameError(it, room));
  if (frameFail) return fail(frameFail);
  const wallFail = firstError(items, (it) => wallMountError(it, room));
  if (wallFail) return fail(wallFail);
  const boundsFail = firstError(items, (it) => boundsError(it, room));
  if (boundsFail) return fail(boundsFail);
  // 엔진이 가드 없이 읽는 필드: table.x/z, screen.wall/at. 빠진 layout은 방을 그리다 멈춘다.
  if (!out.table) return fail("table이 필요해요.");
  if (!out.screen) return fail("screen이 필요해요.");
  const table = out.table as { x: number; z: number };
  const seatFail = firstError(items, (it) => seatError(it, table));
  if (seatFail) return fail(seatFail);
  return { ok: true, layout: out };
}
