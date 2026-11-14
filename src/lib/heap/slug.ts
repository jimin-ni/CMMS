import { HEAP_FUNNEL_POLICY } from "@/lib/heap/policy";

// 방 주소(슬러그)와 방 이름 규칙, 닉네임에서 슬러그 제안 만들기. 순수 함수만 둔다 (DB 접근 없음).
// 서버 액션이 저장 전에 다시 검사한다. 최종 중복 검사는 DB의 unique 제약이 한다 (repo.claimRoom).

// 주소에 쓸 수 없는 이름. 앱 경로(/room/me 등)와 겹치거나 운영 계정으로 오해될 만한 이름이다.
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "me", "new", "edit", "admin", "administrator", "api", "app", "auth", "bubble", "creator", "creators",
  "features", "help", "heap", "home", "index", "login", "logout", "minigame", "moderator", "null",
  "official", "root", "room", "rooms", "sample", "search", "settings", "signin", "signout", "signup",
  "sicham", "static", "support", "system", "undefined", "www", "lovesoo", "dname",
]);

export type SlugFailure = "length" | "charset" | "hyphen" | "reserved";

export type SlugCheck = { ok: true; slug: string } | { ok: false; reason: SlugFailure };

// 문구. 화면에 그대로 보여 준다.
export const SLUG_MESSAGES: Record<SlugFailure, string> = {
  length: `주소는 ${HEAP_FUNNEL_POLICY.slugMinChars}자 이상 ${HEAP_FUNNEL_POLICY.slugMaxChars}자 이하로 적어 주세요.`,
  charset: "주소에는 영문 소문자, 숫자, 하이픈(-)만 쓸 수 있어요.",
  hyphen: "하이픈은 처음과 끝에 둘 수 없고 연달아 쓸 수 없어요.",
  reserved: "이 주소는 쓸 수 없어요. 다른 주소를 골라 주세요.",
};

// 입력을 다듬어(앞뒤 공백 제거, 소문자) 규칙에 맞는지 본다. 맞으면 저장할 값(slug)을 돌려준다.
export function checkSlug(input: unknown): SlugCheck {
  if (typeof input !== "string") return { ok: false, reason: "charset" };
  const slug = input.trim().toLowerCase();
  const { slugMinChars, slugMaxChars } = HEAP_FUNNEL_POLICY;
  if (slug.length < slugMinChars || slug.length > slugMaxChars) return { ok: false, reason: "length" };
  if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, reason: "charset" };
  if (slug.startsWith("-") || slug.endsWith("-") || slug.includes("--")) return { ok: false, reason: "hyphen" };
  if (RESERVED_SLUGS.has(slug)) return { ok: false, reason: "reserved" };
  return { ok: true, slug };
}

// 한글 기준 글자 수(코드포인트)
export function charCount(value: string): number {
  return Array.from(value).length;
}

export type NameCheck = { ok: true; name: string } | { ok: false };

// 방 이름: 공백을 다듬고 연속 공백을 하나로 줄인 뒤 1~40자. 제어 문자(줄바꿈 포함)가 있으면 거절한다.
export function checkRoomName(input: unknown): NameCheck {
  if (typeof input !== "string") return { ok: false };
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(input)) return { ok: false };
  const name = input.normalize("NFC").trim().replace(/\s+/g, " ");
  const length = charCount(name);
  if (length < 1 || length > HEAP_FUNNEL_POLICY.roomNameMaxChars) return { ok: false };
  // 보이는 글자가 하나도 없으면 거절한다: 한글 채움 문자(U+3164, U+115F, U+1160, U+FFA0), 점자 빈칸(U+2800), 결합 자소 결합 방지(U+034F) 등 (codex)
  if (!name.replace(/[\sㅤᅟᅠﾠ⠀͏]/gu, "").length) return { ok: false };
  return { ok: true, name };
}

// ---------- 한글 로마자 표기 (국어의 로마자 표기법, 단순형) ----------
// 글자마다 초성·중성·종성을 소리 나는 대로 옮긴다. 음운 변동(연음, 비음화 등)은 적용하지 않는다.
// 슬러그 제안용이라서 이 정도면 충분하고, 크리에이터가 고칠 수 있다.

const INITIALS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const MEDIALS = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];
// 종성은 받침소리(대표음)로 옮긴다: ㄱㄲㅋ→k, ㄷㅅㅆㅈㅊㅌㅎ→t, ㅂㅍ→p, ㄹ→l, ㄴ→n, ㅁ→m, ㅇ→ng. 겹받침은 앞쪽(또는 소리 나는 쪽)을 따른다.
const FINALS = [
  "", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t",
];

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

// 한글 음절은 로마자로, 영문 소문자·숫자는 그대로 두고, 그 밖의 글자는 단어 경계(하이픈)로 본다.
export function romanizeHangul(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      const index = code - HANGUL_BASE;
      const initial = Math.floor(index / 588);
      const medial = Math.floor((index % 588) / 28);
      const final = index % 28;
      out += INITIALS[initial] + MEDIALS[medial] + FINALS[final];
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      out += ch.toLowerCase();
    } else {
      out += "-";
    }
  }
  return out;
}

// 닉네임에서 슬러그 제안을 만든다. 결과는 늘 checkSlug 규칙을 통과한다.
// 쓸 만한 글자가 하나도 없으면 "my-room"을 돌려준다.
export function suggestSlug(nickname: string): string {
  const { slugMinChars, slugMaxChars } = HEAP_FUNNEL_POLICY;
  let slug = romanizeHangul(nickname)
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, slugMaxChars)
    .replace(/-$/, "");
  if (slug.length === 0) return "my-room";
  if (slug.length < slugMinChars) slug = `${slug}-room`.slice(0, slugMaxChars);
  // 예약어면 뒤에 -room을 붙인다 (이미 길면 자른다).
  if (RESERVED_SLUGS.has(slug)) slug = `${slug.slice(0, slugMaxChars - 5)}-room`;
  return checkSlug(slug).ok ? slug : "my-room";
}
