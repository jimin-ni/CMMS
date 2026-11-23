// 브라우저 → 방 메시지의 모양 검사 (docs/dev/presence.md "메시지").
// 모양이 틀리거나 크기·범위를 넘는 메시지는 null. 통과한 메시지는 알려진 필드만 담아 새로 만든다.

export const MAX_BYTES = 512;
const MAX_COORD = 50;
const MAX_PTS = 16;
const MAX_SEAT = 32;

export type PeerState = "walk" | "idle" | "sit" | "busy" | "away";
const STATES: readonly PeerState[] = ["walk", "idle", "sit", "busy", "away"];

export type XZ = [number, number];
export type XYZ = [number, number, number];

export type ClientMsg =
  | { t: "walk"; pts: XZ[] }
  | { t: "pos"; p: XZ; ry: number }
  | { t: "sit"; p: XYZ; ry: number; kind: "seat" | "heap"; seat?: string }
  | { t: "stand"; p: XZ; ry: number }
  | { t: "snap"; p: XZ; ry: number; state: PeerState }
  | { t: "state"; state: PeerState }
  // 다른 사람 숨기기: on 이면 서버가 이 사람에게 다른 사람 소식을 보내지 않는다 (이 사람은 계속 보인다)
  | { t: "mute"; on: boolean };

function coord(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_COORD;
}

function angle(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 100;
}

function xz(v: unknown): XZ | null {
  return Array.isArray(v) && v.length === 2 && coord(v[0]) && coord(v[1]) ? [v[0], v[1]] : null;
}

function xyz(v: unknown): XYZ | null {
  return Array.isArray(v) && v.length === 3 && coord(v[0]) && coord(v[1]) && coord(v[2]) ? [v[0], v[1], v[2]] : null;
}

function state(v: unknown): PeerState | null {
  return STATES.includes(v as PeerState) ? (v as PeerState) : null;
}

export function parseClient(raw: string): ClientMsg | null {
  // 바이트 수가 아니라 글자 수로 먼저 거르고, 한글 같은 여러 바이트 글자는 아래에서 다시 잰다.
  if (raw.length > MAX_BYTES || new TextEncoder().encode(raw).length > MAX_BYTES) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== "object" || m === null || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;

  switch (o.t) {
    case "walk": {
      if (!Array.isArray(o.pts) || o.pts.length === 0 || o.pts.length > MAX_PTS) return null;
      const pts: XZ[] = [];
      for (const p of o.pts) {
        const q = xz(p);
        if (!q) return null;
        pts.push(q);
      }
      return { t: "walk", pts };
    }
    case "pos":
    case "stand": {
      const p = xz(o.p);
      if (!p || !angle(o.ry)) return null;
      return { t: o.t, p, ry: o.ry };
    }
    case "sit": {
      const p = xyz(o.p);
      if (!p || !angle(o.ry) || (o.kind !== "seat" && o.kind !== "heap")) return null;
      if (o.seat === undefined) return { t: "sit", p, ry: o.ry, kind: o.kind };
      if (typeof o.seat !== "string" || o.seat.length === 0 || o.seat.length > MAX_SEAT) return null;
      return { t: "sit", p, ry: o.ry, kind: o.kind, seat: o.seat };
    }
    case "snap": {
      const p = xz(o.p);
      const s = state(o.state);
      if (!p || !angle(o.ry) || !s) return null;
      return { t: "snap", p, ry: o.ry, state: s };
    }
    case "state": {
      const s = state(o.state);
      return s ? { t: "state", state: s } : null;
    }
    case "mute":
      return typeof o.on === "boolean" ? { t: "mute", on: o.on } : null;
    default:
      return null;
  }
}
