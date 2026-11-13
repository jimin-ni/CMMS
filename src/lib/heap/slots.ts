import catalogue from "../../../public/heap/models/catalogue.json";
import { HEAP_POLICY } from "@/lib/heap/policy";

// 가구에 붙이는 기능(item.fn)의 종류, 달 수 있는 가구, 값의 검사. 순수 함수만 둔다 (서버 검사와 꾸미기 패널이 함께 쓴다).
// 종류와 허용 가구의 표는 catalogue.json의 slots 한 곳에 있다. 새 기능은 거기에 줄을 더하고 아래 검사를 늘린다.
//
// fn의 모양
//   { kind: "pc", links?: PcLink[] }
//     PcLink = { title, url } 또는 { title, email }. links가 없으면 방의 creator.json 링크로 대신한다 (엔진).
//   { kind: "keepsake", name, date?: "YYYY-MM-DD", caption?, link? }
//     link는 http(s) 주소. 유튜브 게시물이면 엔진이 썸네일을 보여 준다.
//   { kind: "music", url }
//     유튜브 영상 또는 재생목록 주소 하나 (parseMusicUrl이 받는 꼴만). 라디오, 스피커, TV가 달 수 있다. 누르면 방 오른쪽 위에 공식 플레이어가 열린다.
//   { kind: "latest" }
//     TV 화면에 가장 최근 영상의 썸네일을 보여 주고, 누르면 그 영상이 영사기로 간다. 값은 따로 없다.
//   { kind: "calendar", entries?: { date: "YYYY-MM-DD", label }[] }
//     책상 위 달력(손으로 만드는 가구 calendar). 크리에이터가 팬에게 알리는 날짜 목록.

export type SlotKind = "pc" | "keepsake" | "music" | "latest" | "calendar";
export type PcLink = { title: string; url: string } | { title: string; email: string };
export type CalendarEntry = { date: string; label: string };
export type SlotFn =
  | { kind: "pc"; links?: PcLink[] }
  | { kind: "keepsake"; name: string; date?: string; caption?: string; link?: string }
  | { kind: "music"; url: string }
  | { kind: "latest" }
  | { kind: "calendar"; entries?: CalendarEntry[] };

type SlotEntry = { label: string; models: string[]; hand: string[] };
const SLOTS = catalogue.slots as Record<SlotKind, SlotEntry>;

export const SLOT_KINDS = Object.keys(SLOTS) as SlotKind[];
export const slotLabel = (kind: SlotKind): string => SLOTS[kind].label;

// 이 가구가 달 수 있는 기능 종류. type이 model이면 model(카탈로그 id)로, 아니면 type(손으로 만드는 가구)으로 찾는다.
export function slotKindsFor(type: string, model?: string): SlotKind[] {
  return SLOT_KINDS.filter((kind) => (type === "model" ? SLOTS[kind].models.includes(model ?? "") : SLOTS[kind].hand.includes(type)));
}

const chars = (value: string) => [...value].length;
const CONTROL = /[\u0000-\u001f\u007f\s]/;
// 받는 사람 하나. 헤더를 덧붙일 수 있는 글자(쉼표, 세미콜론, 콜론, 꺾쇠, 괄호, 따옴표, % ? # /)는 받지 않는다.
const BAD_MAIL_CHARS = String.raw`\s@,;:<>()\[\]\\"'` + "`" + String.raw`%?#/`;
const EMAIL = new RegExp(`^[^${BAD_MAIL_CHARS}]+@[^${BAD_MAIL_CHARS}]+\\.[^${BAD_MAIL_CHARS}]+$`);
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

type Obj = Record<string, unknown>;
type Fail = { error: string };

function isObj(value: unknown): value is Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function text(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && chars(value) >= min && chars(value) <= max;
}

// http(s) 주소만 받는다. 계정 정보가 붙은 주소와 공백·제어 문자가 든 주소는 받지 않는다.
function webUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > HEAP_POLICY.linkUrlMaxChars) return false;
  if (CONTROL.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname !== "" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

// 음악 링크: 유튜브 영상(watch?v=, youtu.be/) 또는 재생목록(playlist?list=) 주소만 받는다. 영상 주소의 list=는 같이 담긴다.
// 반환은 임베드에 쓸 ID들이다. 두 값은 정규식을 통과한 글자뿐이라 엔진이 그대로 주소에 붙여도 된다. 받지 못하는 주소는 null.
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_LIST = /^[A-Za-z0-9_-]{13,64}$/;
const MUSIC_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"];
export function parseMusicUrl(value: unknown): { video: string | null; list: string | null } | null {
  if (!webUrl(value)) return null;
  const url = new URL(value);
  if (url.port !== "") return null;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const query = url.searchParams;
  const rawList = query.get("list");
  if (rawList !== null && !YT_LIST.test(rawList)) return null;
  if (url.hostname === "youtu.be") {
    const m = /^\/([A-Za-z0-9_-]{11})$/.exec(path);
    return m ? { video: m[1], list: rawList } : null;
  }
  if (!MUSIC_HOSTS.includes(url.hostname)) return null;
  if (path === "/watch") {
    const v = query.get("v");
    return v !== null && YT_ID.test(v) ? { video: v, list: rawList } : null;
  }
  if (path === "/playlist") return rawList !== null ? { video: null, list: rawList } : null;
  return null;
}

// mailto 주소: 받는 사람 하나만. ? # 뒤의 제목·본문·헤더는 받지 않는다.
// %로 가린 글자도 한 번 풀어서 본다 (%0d%0a 같은 줄바꿈이나 %3A, %2C, %3F로 헤더를 덧붙이는 것을 막는다).
function mailtoUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > HEAP_POLICY.linkUrlMaxChars || CONTROL.test(value)) return false;
  if (!/^mailto:/i.test(value)) return false;
  const raw = value.slice(7);
  if (raw.includes("?") || raw.includes("#")) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return false;
  }
  return !CONTROL.test(decoded) && EMAIL.test(decoded);
}

// 엔진이 링크를 화면에 걸기 전에 같은 검사를 쓰도록 내보낸다 (서버가 저장 전에 하는 검사와 한 벌).
export const isWebLink = (value: unknown): value is string => webUrl(value);
export const isSafeLink = (value: unknown): value is string => webUrl(value) || mailtoUrl(value);
export const isEmailAddress = (value: unknown): value is string =>
  typeof value === "string" && chars(value) <= HEAP_POLICY.linkEmailMaxChars && !CONTROL.test(value) && EMAIL.test(value);

function realDate(value: string): boolean {
  const m = DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return y >= 1900 && date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function checkLink(raw: unknown, at: string): Fail | { link: PcLink } {
  if (!isObj(raw)) return { error: `${at}: 객체가 아니에요.` };
  const { title } = raw;
  if (!text(title, 1, HEAP_POLICY.linkTitleMaxChars)) {
    return { error: `${at}: 제목은 1~${HEAP_POLICY.linkTitleMaxChars}자여야 해요.` };
  }
  const keys = Object.keys(raw);
  if (keys.length !== 2 || !(("url" in raw) !== ("email" in raw))) return { error: `${at}: 제목과 url(또는 email) 하나만 있어야 해요.` };
  if ("url" in raw) {
    if (!(webUrl(raw.url) || mailtoUrl(raw.url))) return { error: `${at}: 주소는 http(s) 또는 mailto여야 해요.` };
    return { link: { title, url: raw.url as string } };
  }
  const { email } = raw;
  if (!isEmailAddress(email)) return { error: `${at}: 이메일 주소가 올바르지 않아요.` };
  return { link: { title, email } };
}

// 기능 값을 검사해 통과한 필드만 새 객체로 돌려준다. 이 가구가 그 종류를 달 수 있는지도 함께 본다.
export function checkFn(raw: unknown, type: string, model: string | undefined, at: string): Fail | { fn: SlotFn } {
  if (!isObj(raw)) return { error: `${at}: 객체가 아니에요.` };
  const kind = raw.kind;
  if (typeof kind !== "string" || !SLOT_KINDS.includes(kind as SlotKind)) return { error: `${at}: 알 수 없는 기능 종류` };
  if (!slotKindsFor(type, model).includes(kind as SlotKind)) return { error: `${at}: 이 가구에는 ${slotLabel(kind as SlotKind)} 기능을 달 수 없어요.` };

  if (kind === "pc") {
    const bad = Object.keys(raw).find((key) => key !== "kind" && key !== "links");
    if (bad) return { error: `${at}: 알 수 없는 필드 ${bad}` };
    if (raw.links === undefined) return { fn: { kind: "pc" } };
    if (!Array.isArray(raw.links) || raw.links.length > HEAP_POLICY.pcLinksMax) {
      return { error: `${at}: 링크는 ${HEAP_POLICY.pcLinksMax}개까지예요.` };
    }
    const links: PcLink[] = [];
    for (let i = 0; i < raw.links.length; i++) {
      const r = checkLink(raw.links[i], `${at}.links[${i}]`);
      if ("error" in r) return r;
      links.push(r.link);
    }
    return { fn: { kind: "pc", links } };
  }

  if (kind === "music") {
    const bad = Object.keys(raw).find((key) => key !== "kind" && key !== "url");
    if (bad) return { error: `${at}: 알 수 없는 필드 ${bad}` };
    if (!parseMusicUrl(raw.url)) return { error: `${at}: 유튜브 영상이나 재생목록 주소여야 해요.` };
    return { fn: { kind: "music", url: raw.url as string } };
  }

  if (kind === "latest") {
    const bad = Object.keys(raw).find((key) => key !== "kind");
    if (bad) return { error: `${at}: 알 수 없는 필드 ${bad}` };
    return { fn: { kind: "latest" } };
  }

  if (kind === "calendar") {
    const bad = Object.keys(raw).find((key) => key !== "kind" && key !== "entries");
    if (bad) return { error: `${at}: 알 수 없는 필드 ${bad}` };
    if (raw.entries === undefined) return { fn: { kind: "calendar" } };
    if (!Array.isArray(raw.entries) || raw.entries.length > HEAP_POLICY.calendarEntriesMax) {
      return { error: `${at}: 날짜는 ${HEAP_POLICY.calendarEntriesMax}개까지예요.` };
    }
    const entries: CalendarEntry[] = [];
    for (let i = 0; i < raw.entries.length; i++) {
      const e: unknown = raw.entries[i];
      const here = `${at}.entries[${i}]`;
      if (!isObj(e)) return { error: `${here}: 객체가 아니에요.` };
      const extra = Object.keys(e).find((key) => key !== "date" && key !== "label");
      if (extra) return { error: `${here}: 알 수 없는 필드 ${extra}` };
      if (typeof e.date !== "string" || !realDate(e.date)) return { error: `${here}: 날짜는 YYYY-MM-DD 형식의 실제 날짜여야 해요.` };
      if (!text(e.label, 1, HEAP_POLICY.calendarLabelMaxChars)) {
        return { error: `${here}: 설명은 1~${HEAP_POLICY.calendarLabelMaxChars}자여야 해요.` };
      }
      entries.push({ date: e.date, label: e.label });
    }
    return { fn: { kind: "calendar", entries } };
  }

  // keepsake
  const bad = Object.keys(raw).find((key) => !["kind", "name", "date", "caption", "link"].includes(key));
  if (bad) return { error: `${at}: 알 수 없는 필드 ${bad}` };
  if (!text(raw.name, 1, HEAP_POLICY.keepsakeNameMaxChars)) {
    return { error: `${at}: 이름은 1~${HEAP_POLICY.keepsakeNameMaxChars}자여야 해요.` };
  }
  const fn: Extract<SlotFn, { kind: "keepsake" }> = { kind: "keepsake", name: raw.name };
  if (raw.date !== undefined) {
    if (typeof raw.date !== "string" || !realDate(raw.date)) return { error: `${at}: 날짜는 YYYY-MM-DD 형식의 실제 날짜여야 해요.` };
    fn.date = raw.date;
  }
  if (raw.caption !== undefined) {
    if (!text(raw.caption, 1, HEAP_POLICY.keepsakeCaptionMaxChars)) {
      return { error: `${at}: 설명은 1~${HEAP_POLICY.keepsakeCaptionMaxChars}자여야 해요.` };
    }
    fn.caption = raw.caption;
  }
  if (raw.link !== undefined) {
    if (!webUrl(raw.link)) return { error: `${at}: 링크는 http(s) 주소여야 해요.` };
    fn.link = raw.link;
  }
  return { fn };
}
