"use client";

// 보는 사람의 설정 (설정 화면 /settings). 이 브라우저에만 남는다 (localStorage). 계정에 저장하지 않는다.
// - roomTime: 방의 빛. 엔진(heap/engine/time.js)의 시간 이름을 그대로 쓴다. auto 는 한국 시간의 지금 시각(실시간)이다.
//   heap-room.tsx 가 꾸미기 밖에서 heap:viewtime 으로 엔진에 넘긴다. 아직 고르지 않았으면(null) 방 주인이 정한 시간대 그대로다.
// - language, theme, volume: 고르면 저장만 한다. 아직 화면에 반영하는 곳이 없다 (다국어, 다크 모드, 소리 재생이 아직 없다).
//   예외: volume.music 은 방의 배경음악(heap/room-bgm.tsx)이 쓴다.
import { useSyncExternalStore } from "react";

export const LANGUAGES = ["ko", "en"] as const;
export const THEMES = ["light", "dark"] as const;
export const ROOM_TIMES = ["auto", "morning", "noon", "dusk", "night"] as const;
export const VOLUME_KEYS = ["video", "music", "effects"] as const;

export type Language = (typeof LANGUAGES)[number];
export type Theme = (typeof THEMES)[number];
export type RoomTime = (typeof ROOM_TIMES)[number];
export type VolumeKey = (typeof VOLUME_KEYS)[number];

export type Prefs = {
  language: Language;
  theme: Theme;
  roomTime: RoomTime | null;
  // 0~100
  volume: Record<VolumeKey, number>;
};

export const DEFAULT_PREFS: Prefs = {
  language: "ko",
  theme: "light",
  roomTime: null,
  // 배경음악은 꺼진 채(0) 시작한다. 설정의 소리 쪽에서 키우면 그때부터 튼다 (room-bgm.tsx).
  volume: { video: 80, music: 0, effects: 70 },
};

const KEY = "cmms:prefs";
const CHANGE = "cmms:prefs";

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const level = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : fallback;

// 저장된 글 -> 설정. 깨졌거나 모르는 값은 기본값으로
function parse(raw: string | null): Prefs {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") v = parsed as Record<string, unknown>;
  } catch {
    // 깨진 값
  }
  const vol = (v.volume && typeof v.volume === "object" ? v.volume : {}) as Record<string, unknown>;
  return {
    language: pick(LANGUAGES, v.language, DEFAULT_PREFS.language),
    theme: pick(THEMES, v.theme, DEFAULT_PREFS.theme),
    roomTime: ROOM_TIMES.includes(v.roomTime as RoomTime) ? (v.roomTime as RoomTime) : null,
    volume: {
      video: level(vol.video, DEFAULT_PREFS.volume.video),
      music: level(vol.music, DEFAULT_PREFS.volume.music),
      effects: level(vol.effects, DEFAULT_PREFS.volume.effects),
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

export function setPrefs(patch: Partial<Prefs>) {
  const next = { ...read(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 가득 찼거나 막힘: 이번 방문 동안도 바뀌지 않는다
  }
  window.dispatchEvent(new Event(CHANGE));
}
