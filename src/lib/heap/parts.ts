// 가구 하나만 따로 칠하기 (색 묶음 C2): layout.items[i].colors = { 부분: "#RRGGBB" }.
// 부분은 Kenney 모델의 재질 이름을 묶은 것이다. 짝은 engine/palette.js 의 PART_MATS 와 같다.
// 모델마다 가진 부분은 catalogue.json 의 parts 에 있다 (.claude/session-artifacts/heap-poc/tools/measure-parts.mjs 가 GLB 에서 적는다).
// 이 파일은 카탈로그를 읽지 않는다 (꾸미기 화면도 쓰므로): 모델의 부분 목록은 부르는 쪽이 준다.
// 칠하지 않은 부분은 방 팔레트를 따른다: 팔레트를 바꾸면 그 부분도 함께 바뀐다.
// 엔진이 손으로 만드는 가구(침대, 앨범 책장 …)와 그림 한 장으로 칠한 모델(크리스마스 키트)은 칠할 부분이 없다.

export const PART_KEYS = ["wood", "fabric", "pale", "metal", "leaf", "paint"] as const;
export type PartKey = (typeof PART_KEYS)[number];
export type PartColors = Partial<Record<PartKey, string>>;

export const PART_LABEL: Record<PartKey, string> = {
  wood: "나무",
  fabric: "천",
  pale: "밝은 면",
  metal: "금속",
  leaf: "잎",
  paint: "칠한 면",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

// 서버 검사 (layout.ts 의 checkItem). 모델 가구에만, 그 모델이 가진 부분(have: 카탈로그의 parts)에만, #RRGGBB 만. 빈 객체는 받지 않는다 (칠한 것이 없으면 colors 를 빼고 보낸다).
export function checkColors(raw: unknown, type: string, have: readonly string[], at: string): { error: string } | { colors: PartColors } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) {
    return { error: `${at}: 객체여야 해요.` };
  }
  if (type !== "model") return { error: `${at}: 모델 가구에만 쓸 수 있어요.` };
  const out: PartColors = {};
  const entries = Object.entries(raw as Record<string, unknown>);
  if (!entries.length) return { error: `${at}: 비어 있어요.` };
  for (const [key, value] of entries) {
    if (!(PART_KEYS as readonly string[]).includes(key)) return { error: `${at}: 알 수 없는 부분 ${key}` };
    if (!have.includes(key)) return { error: `${at}: 이 모델에는 ${key} 부분이 없어요.` };
    if (typeof value !== "string" || !HEX.test(value)) return { error: `${at}.${key}: #RRGGBB 형식이어야 해요.` };
    out[key as PartKey] = value;
  }
  return { colors: out };
}

