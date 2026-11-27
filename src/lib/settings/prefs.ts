"use client";

// 보는 사람의 설정 (설정 화면 /settings). 이 브라우저에만 남는다 (localStorage). 계정에 저장하지 않는다.
// - roomTime: 방의 빛. 엔진(heap/engine/time.js)의 시간 이름을 그대로 쓴다. auto 는 한국 시간의 지금 시각(실시간)이다.
//   heap-room.tsx 가 꾸미기 밖에서 heap:viewtime 으로 엔진에 넘긴다. 아직 고르지 않았으면(null) 방 주인이 정한 시간대 그대로다.
// - language: 화면 글의 언어 (ko 한국어, en 영어). useLanguage() 로 읽는다. 지금 반영하는 곳: 설정, 마이페이지, 수첩 틀(book.tsx),
//   로그인, 회원가입. 화면마다 { ko, en } 글 묶음을 두고 고른다. localStorage 값이라 서버 렌더는 기본값(ko)으로 그리고, 영어를 고른 사람은 뜬 뒤 바뀐다.
// - 테마(라이트/다크)는 지웠다 (2026-11-27). 예전에 저장된 theme 값은 읽을 때 버린다.
// - 소리 크기 설정(volume)과 방 배경음악은 지웠다. 예전에 저장된 volume 값은 읽을 때 버린다.
// - presence: 방 함께 있기 (heap-room.tsx, docs/dev/presence.md). show 는 이름 공개 규칙(입장 티켓에 서명된다),
//   hideMe 는 나를 숨김(연결하지 않는다. 다른 사람도 보이지 않는다), hideOthers 는 다른 사람 숨김(나는 계속 보인다).
import { useSyncExternalStore } from "react";

export const LANGUAGES = ["ko", "en"] as const;
export const ROOM_TIMES = ["auto", "morning", "noon", "dusk", "night"] as const;
export const NAME_SHOWS = ["hidden", "creators", "followers"] as const;

export type Language = (typeof LANGUAGES)[number];
export type RoomTime = (typeof ROOM_TIMES)[number];
export type NameShow = (typeof NAME_SHOWS)[number];
export type PresencePrefs = { show: NameShow; hideMe: boolean; hideOthers: boolean };

export type Prefs = {
  language: Language;
  roomTime: RoomTime | null;
  presence: PresencePrefs;
};

export const DEFAULT_PREFS: Prefs = {
  language: "ko",
  roomTime: null,
  // 이름은 기본으로 가린다 (모두에게 "방문자")
  presence: { show: "hidden", hideMe: false, hideOthers: false },
};

const KEY = "cmms:prefs";
const CHANGE = "cmms:prefs";

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

// 저장된 글 -> 설정. 깨졌거나 모르는 값은 기본값으로
function parse(raw: string | null): Prefs {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") v = parsed as Record<string, unknown>;
  } catch {
    // 깨진 값
  }
  const pres = (v.presence && typeof v.presence === "object" ? v.presence : {}) as Record<string, unknown>;
  return {
    language: pick(LANGUAGES, v.language, DEFAULT_PREFS.language),
    roomTime: ROOM_TIMES.includes(v.roomTime as RoomTime) ? (v.roomTime as RoomTime) : null,
    presence: {
      show: pick(NAME_SHOWS, pres.show, DEFAULT_PREFS.presence.show),
      hideMe: pres.hideMe === true,
      hideOthers: pres.hideOthers === true,
    },
  };
}

// useSyncExternalStore 는 같은 값이면 같은 객체를 받아야 한다: 저장된 글이 같으면 앞의 객체를 돌려준다
let cache: { raw: string | null; prefs: Prefs } = { raw: null, prefs: DEFAULT_PREFS };
function read(): Prefs {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // 막힌 저장소 (사생활 보호 창 등): 기본값
  }
  if (raw !== cache.raw) cache = { raw, prefs: parse(raw) };
  return cache.prefs;
}

function subscribe(onChange: () => void) {
  // 같은 탭은 CHANGE, 다른 탭은 storage 이벤트로 안다
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_PREFS);
}

export function useLanguage(): Language {
  return usePrefs().language;
}

export function setPrefs(patch: Partial<Prefs>) {
  const next = { ...read(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 가득 찼거나 막힘: 이번 방문 동안도 바뀌지 않는다
  }
  window.dispatchEvent(new Event(CHANGE));
}
