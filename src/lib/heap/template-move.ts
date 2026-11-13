import { slotKindsFor, type SlotKind } from "./slots";

// 꾸미기의 템플릿 깔기 (design/editor.md "Themes and templates", 판정 J8): 지금 방에 달린 기능(링크, 기념품, 음악, 최신 영상, 달력)을
// 템플릿의 가구 중 그 기능을 달 수 있는 것으로 옮긴다. 순수 함수다 (화면과 DB 없음).
// 순서: 지금 방의 가구 순서대로, 먼저 같은 모양(type, model)의 빈 가구, 없으면 그 기능을 달 수 있는 아무 빈 가구. 갈 곳이 없는 기능은 버린다
// (템플릿 깔기가 한 걸음이라 되돌리기로 살아난다). 템플릿 가구에 원래 달린 기능은 그대로 두고, 그 가구는 받는 쪽에서 뺀다.

// 방의 틀: 방 크기와 고정된 것(창문, 문, 스크린, 방명록, 포스터, 사진 탁자)의 자리를 담는 레이아웃 열쇠. engine/edit.js 의 SHELL_KEYS 와 같다.
// 템플릿을 깔면 가구, 팔레트와 함께 이것도 템플릿의 것으로 바뀐다 (가구의 자리가 그 방 크기에 맞춰져 있다).
export const SHELL_KEYS = ["room", "window", "door", "screen", "guestbook", "posters", "table"] as const;

export function shellOf(layout: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(SHELL_KEYS.filter((key) => layout[key] !== undefined).map((key) => [key, structuredClone(layout[key])]));
}

export type MoveItem = { type: string; model?: string; fn?: { kind: SlotKind } & Record<string, unknown>; [key: string]: unknown };

export type FnMove = { kind: SlotKind; from: number; to: number };
export type FnDrop = { kind: SlotKind; from: number };

export function moveFunctions(
  current: readonly MoveItem[],
  target: readonly MoveItem[],
): { items: MoveItem[]; moved: FnMove[]; dropped: FnDrop[] } {
  const items = target.map((it) => ({ ...it }));
  const taken = new Set(items.flatMap((it, i) => (it.fn ? [i] : [])));
  const moved: FnMove[] = [];
  const dropped: FnDrop[] = [];
  current.forEach((src, from) => {
    const fn = src.fn;
    if (!fn) return;
    const fits = (it: MoveItem, i: number) => !taken.has(i) && slotKindsFor(it.type, it.model).includes(fn.kind);
    let to = items.findIndex((it, i) => fits(it, i) && it.type === src.type && it.model === src.model);
    if (to < 0) to = items.findIndex(fits);
    if (to < 0) {
      dropped.push({ kind: fn.kind, from });
      return;
    }
    taken.add(to);
    items[to] = { ...items[to], fn: structuredClone(fn) };
    moved.push({ kind: fn.kind, from, to });
  });
  return { items, moved, dropped };
}
