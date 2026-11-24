// 방 함께 있기(presence) 입장 티켓. Next가 서명하고 presence 워커(workers/presence)가 검증한다.
// 두 런타임이 같은 파일을 쓰므로 Web Crypto(crypto.subtle)만 쓰고 Node 모듈을 가져오지 않는다.
// 모양: base64url(JSON) + "." + base64url(HMAC-SHA256). 내용은 읽을 수 있으니 사용자 id 원문은 넣지 않는다 (u = userKey).

// 이름 공개 규칙. hidden: 모두에게 "방문자" · creators: 방 주인에게만 이름 · followers: 팔로워에게 이름
// (팔로워 관계 subscriptions 가 아직 없어 지금은 방에 있는 로그인한 사람 모두에게 보인다)
export const NAME_RULES = ["hidden", "creators", "followers"] as const;
export type NameRule = (typeof NAME_RULES)[number];

export type PresenceTicket = {
  // 방 id (heap_rooms.id)
  r: string;
  // userKey(비밀값, 사용자 id). 같은 사람의 두 번째 탭을 알아보는 데에만 쓴다
  u: string;
  // 표시 이름
  n: string;
  // 만료 (유닉스 초)
  exp: number;
  // 한 번만 쓰는 무작위 id
  j: string;
  // 이 방의 주인인가 (Next 가 DB 로 확인해 서명한다. 주인 자리와 주인 표시에 쓴다)
  o: boolean;
  // 이름 공개 규칙
  v: NameRule;
  // 개인 차단(0013 heap_blocks): 이 사람에게 보내지 않을 사람들의 userKey. 없으면 빈 목록과 같다.
  // 티켓은 Sec-WebSocket-Protocol 머리글로 가므로 길이를 HIDE_MAX 개로 묶는다 (최근 차단부터).
  h?: string[];
};

export const HIDE_MAX = 50;

export type VerifyResult = { ok: true; t: PresenceTicket } | { ok: false; why: "format" | "sig" | "expired" | "room" };

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function userKey(secret: string, userId: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`user:${userId}`));
  return toB64url(new Uint8Array(sig).slice(0, 16));
}

export async function signTicket(secret: string, t: PresenceTicket): Promise<string> {
  const body = toB64url(enc.encode(JSON.stringify(t)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${toB64url(new Uint8Array(sig))}`;
}

function isTicket(v: unknown): v is PresenceTicket {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.r === "string" &&
    typeof o.u === "string" &&
    typeof o.n === "string" &&
    typeof o.j === "string" &&
    typeof o.exp === "number" &&
    Number.isFinite(o.exp) &&
    typeof o.o === "boolean" &&
    NAME_RULES.includes(o.v as NameRule) &&
    (o.h === undefined ||
      (Array.isArray(o.h) && o.h.length <= HIDE_MAX && o.h.every((k) => typeof k === "string" && k.length <= 32)))
  );
}

export async function verifyTicket(secret: string, token: string, roomUuid: string, nowSec: number): Promise<VerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, why: "format" };
  const [body, sigText] = parts;
  const sig = fromB64url(sigText);
  if (!body || !sig) return { ok: false, why: "format" };
  // crypto.subtle.verify 는 서명을 일정 시간에 비교한다.
  const good = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, enc.encode(body));
  if (!good) return { ok: false, why: "sig" };
  const raw = fromB64url(body);
  if (!raw) return { ok: false, why: "format" };
  let t: unknown;
  try {
    t = JSON.parse(dec.decode(raw));
  } catch {
    return { ok: false, why: "format" };
  }
  if (!isTicket(t)) return { ok: false, why: "format" };
  if (t.exp < nowSec) return { ok: false, why: "expired" };
  if (t.r !== roomUuid) return { ok: false, why: "room" };
  return { ok: true, t };
}
