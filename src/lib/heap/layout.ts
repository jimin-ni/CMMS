import catalogue from "../../../public/heap/models/catalogue.json";
import { HEAP_POLICY } from "@/lib/heap/policy";
import { checkFn } from "@/lib/heap/slots";

// 방 꾸미기(layout) 검사. 서버 액션이 저장하기 전에 부른다. DB도 repo도 건드리지 않는다.
// 형태는 room-engine.js 1번 구역과 room-editor.tsx, public/heap/rooms/*/layout.json에서 읽은 것이다.
// 입력을 그대로 저장하지 않고, 검사를 통과한 필드만 새 객체로 옮겨 돌려준다.

export type LayoutCheck =
  | { ok: true; layout: Record<string, unknown> }
  | { ok: false; error: string };

type Obj = Record<string, unknown>;
type Fail = { error: string };

// 엔진 BUILD가 직접 만드는 가구. 나머지는 type "model" + 카탈로그 id.
// frame은 벽에 거는 액자다 (기념품 기능을 달 수 있다).
const HAND_TYPES = new Set(["bed", "shelf", "plant", "snake", "lamp", "books", "frame"]);
const MODEL_IDS = new Set(catalogue.models.map((model) => model.id));
const WALLS = new Set(["back", "left"]);
const TIME_NAMES = new Set(["auto", "night", "dawn", "morning", "noon", "golden", "dusk"]);
const PALETTE_KEYS = new Set([
  "olive", "accent", "paper", "ink", "wall", "trim", "woodB", "woodDark", "leaf", "leaf2", "leafDark",
]);
const HEX = /^#[0-9a-fA-F]{6}$/;
const FLOOR_BOARDS_MAX = 6;

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
  const bad = unknownKey(raw, ["type", "x", "z", "rot", "size", "model", "tint", "y", "fn"]);
  if (bad) return { error: `${at}: 알 수 없는 필드 ${bad}` };

  const { type, x, z, rot, size, model, tint, y, fn } = raw;
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

// 벽 액자는 꾸미기가 놓는 자리에만 둘 수 있다: 뒷벽(z = -d/2, 0도) 또는 왼쪽 벽(x = -w/2, 90도), 벽을 따라 모서리에서 margin 이상,
// 높이는 frameY. 방 크기가 없으면 엔진 기본(8 x 8)으로 본다. 그 밖의 자리에 걸면 바닥을 뚫거나 방 한가운데에 떠 있게 된다.
function checkFrames(items: Obj[] | undefined, room: { w: number; d: number } | undefined): string | null {
  const w = room?.w ?? 8, d = room?.d ?? 8, margin = HEAP_POLICY.frameWallMargin, eps = 0.01;
  for (let i = 0; i < (items?.length ?? 0); i++) {
    const it = items![i];
    if (it.type !== "frame") continue;
    const x = it.x as number, z = it.z as number, rot = ((it.rot as number | undefined) ?? 0);
    const y = (it.y as number | undefined) ?? HEAP_POLICY.frameY;
    const at = `items[${i}]`;
    if (Math.abs(y - HEAP_POLICY.frameY) > eps) return `${at}: 액자 높이가 올바르지 않아요.`;
    const onBack = Math.abs(z + d / 2) <= eps && rot === 0 && x >= -w / 2 + margin - eps && x <= w / 2 - margin + eps;
    const onLeft = Math.abs(x + w / 2) <= eps && rot === 90 && z >= -d / 2 + margin - eps && z <= d / 2 - margin + eps;
    if (!onBack && !onLeft) return `${at}: 액자는 뒷벽이나 왼쪽 벽에 붙여 걸어야 해요.`;
  }
  return null;
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
  const frameError = checkFrames(out.items as Obj[] | undefined, out.room as { w: number; d: number } | undefined);
  if (frameError) return fail(frameError);
  // 엔진이 가드 없이 읽는 필드: table.x/z, screen.wall/at. 빠진 layout은 방을 그리다 멈춘다.
  if (!out.table) return fail("table이 필요해요.");
  if (!out.screen) return fail("screen이 필요해요.");
  return { ok: true, layout: out };
}
