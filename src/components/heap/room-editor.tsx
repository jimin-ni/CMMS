"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { saveLayoutAction } from "@/lib/heap/actions";
import { HEAP_FUNNEL_POLICY, HEAP_POLICY } from "@/lib/heap/policy";
import { checkFn, slotKindsFor, type PcLink, type SlotFn, type SlotKind } from "@/lib/heap/slots";
import { charCount, checkRoomName } from "@/lib/heap/slug";
import { HEAP_TEMPLATES, type HeapTemplate } from "@/lib/heap/templates";
import { moveFunctions, shellOf, SHELL_KEYS, type MoveItem } from "@/lib/heap/template-move";
import type { HeapOwnerData, SavedRoom } from "./heap-room";
import { ChannelTab } from "./channel-tab";
import { StatsTab } from "./stats-tab";
import type { ChecklistAction } from "./setup-checklist";
import { FnForm, canCarryFn, isLamp, itemLabel, newFn, type Item, type Model } from "./fn-form";
import { ColourPane, type Backdrop } from "./colour-pane";
import { PieceColour } from "./piece-colour";

// 꾸미기 화면. 방 주인이 방 안에서 가구를 놓고 옮긴 뒤 저장한다 (design/editor.md, B1~B9).
// B8: 방 이름 고치기(위 막대의 이름을 누른다, 저장 한 번에 레이아웃과 함께 간다), 팔로워로 보기(V), 저장 안 된 채 창을 닫을 때의 브라우저 경고,
//     저장 전으로(이번 방문에서 저장하기 바로 전의 모습을 다시 깐다, 되돌릴 수 있다). B9: 템플릿 탭, 체크리스트(setup-checklist.tsx)의 단추.
// 가구를 집고 끌고 돌리는 일, 팔레트, 모양 바꾸기, 되돌리기 기록은 엔진(engine/edit.js)이 한다. 이 컴포넌트는 그 위의 단추들이다:
// 위 막대(되돌리기, 위에서 보기, 맞추기, ⋯ 메뉴(시간, 처음으로, 저장 전으로, 팔로워로 보기), 저장, 나가기), 아래 독(가구 · 기능 · 색·무늬 · 템플릿 · 채널 탭),
// 고른 가구 위의 막대, 가구 아래의 기능 말풍선, 기능 표, 알림.
// 엔진과는 방 루트 요소의 이벤트로만 이야기한다: heap:get 으로 한 번 읽고, heap:editcmd 로 시키고, heap:editstate 로 듣고,
// heap:thumb 으로 가구 그림을 받는다 (engine/dock-thumbs.js). 말풍선과 기능 표의 자리는 엔진이 프레임마다 정한다.

type TimeChoice = string | number;
// heap:get 이 돌려주는 값 중 여기서 쓰는 것 (engine/editor-bridge.js)
type RoomState = {
  room: { w: number; d: number };
  // DB에 저장된 layout 전체. 저장할 때 여기에 items, time, room, palette를 덮어 쓴다.
  layout: Record<string, unknown>;
  catalogue: { models: Model[] } | null;
  // creator.json의 링크 목록과 링크트리 주소. PC를 처음 만들 때 채워 넣는 데 쓴다.
  creatorLinks: { title: string; url?: string; email?: string }[];
  linktree: string | null;
};
// heap:editstate (engine/edit.js)
type EditState = {
  on: boolean;
  items: Item[];
  sel: number | null;
  time: TimeChoice;
  moving: { isNew: boolean; label: string } | null;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  notice: { text: string; undo: boolean; seq: number } | null;
  // layout.palette (null이면 기본 올리브 오후) · look: 이 마운트가 칠한 색 (그림 캐시의 열쇠) · mount: 엔진 마운트 번호
  palette: Record<string, unknown> | null;
  // layout.backdrop (null이면 시간 따라) · layout.brand (주인이 넣은 브랜드 색, null이면 없음)
  backdrop: Backdrop;
  brand: string[] | null;
  look: string;
  mount: number;
  // 방금 내려놓은 새 가구. 기능을 달 수 있으면 말풍선을 연다.
  placed: { index: number; seq: number } | null;
  // 방의 틀(템플릿)을 바꾸느라 방을 다시 띄우는 중. 팔레트와 배경은 다시 띄우지 않고 칠한다
  busy: boolean;
  // 카메라 (engine/edit-camera.js): plan 은 위에서 보기, fitted 는 확대나 이동 없이 맞춘 구도인지
  view: { plan: boolean; fitted: boolean };
  // 방의 틀(방 크기, 창문, 문 …) · 꾸미는 중인 방 이름 · 저장된 방 이름 · 팔로워로 보기 중
  shell: Record<string, unknown>;
  name: string;
  savedName: string;
  preview: boolean;
  // 고른 가구의 부분마다 지금 보이는 색 (색 묶음 C2, engine/furniture.js 의 partColours). 고른 것이 없으면 null
  partColours: Record<string, string> | null;
};

const HAND_PREFIX = "hand:";
const RECENT_KEY = "heap-editor-recent";
const RECENT_MAX = 12;

const TIMES: [string, string][] = [
  ["auto", "자동"],
  ["dawn", "새벽"],
  ["morning", "아침"],
  ["noon", "낮"],
  ["golden", "노을"],
  ["dusk", "해질녘"],
  ["night", "밤"],
];

// 카탈로그의 category 를 묶어 보여 주는 순서. 모델이 없는 묶음은 나오지 않고, 여기 없는 category 는 소품으로 간다.
const GROUPS = [
  { label: "침대", cats: ["bed"] },
  { label: "책상·탁자", cats: ["table"] },
  { label: "의자·소파", cats: ["chair", "sofa"] },
  { label: "책장", cats: ["shelf"] },
  { label: "주방", cats: ["kitchen"] },
  { label: "조명", cats: ["lamp"] },
  { label: "음향", cats: ["audio"] },
  { label: "화분", cats: ["plant"] },
  { label: "러그", cats: ["rug"] },
  { label: "화면", cats: ["screen"] },
  { label: "소품", cats: ["decor"] },
  { label: "크리스마스", cats: ["크리스마스"] },
];
const KNOWN = GROUPS.flatMap((g) => g.cats);
const groupOf = (m: Model) => GROUPS.find((g) => g.cats.includes(m.category)) ?? (m.category === "hand" ? null : GROUPS[10]);
// 엔진이 직접 만드는 가구(벽 액자, 책상 달력, 방 v2 의 방 소품)는 카탈로그에 없어서 한 묶음으로 따로 낸다. 그림은 없고 이름만 보인다
// (사진 더미는 일반 폴라로이드 그림, HAND_PIC). 방 v2: 사진 더미, 탁자, 휴대폰, 방명록, 스크린, 포스터, 창은 모두 가구다 (docs/dev/heap-room-v2.md).
const HAND_MODELS: Model[] = [
  { id: `${HAND_PREFIX}heap`, label: "사진 더미", category: "hand" },
  { id: `${HAND_PREFIX}heapBox`, label: "신발상자 더미", category: "hand" },
  { id: `${HAND_PREFIX}lowTable`, label: "좌식 탁자", category: "hand" },
  { id: `${HAND_PREFIX}phone`, label: "휴대폰", category: "hand" },
  { id: `${HAND_PREFIX}guestbook`, label: "방명록", category: "hand" },
  { id: `${HAND_PREFIX}guestbookStand`, label: "방명록 받침대", category: "hand" },
  { id: `${HAND_PREFIX}screen`, label: "스크린", category: "hand" },
  { id: `${HAND_PREFIX}poster`, label: "포스터", category: "hand" },
  { id: `${HAND_PREFIX}window`, label: "창문", category: "hand" },
  { id: `${HAND_PREFIX}projector`, label: "영사기", category: "hand" },
  { id: `${HAND_PREFIX}frame`, label: "벽 액자", category: "hand" },
  { id: `${HAND_PREFIX}calendar`, label: "탁상 달력", category: "hand" },
  { id: `${HAND_PREFIX}glow`, label: "작은 빛", category: "hand" },
];
const HAND_GROUP = "방 소품";
// 독의 손 가구 id → 커서에 붙일 항목 (x, z, rot 는 엔진이 정한다). 없는 id 는 { type: id } 다.
// 벽에 거는 스크린, 포스터, 창의 높이는 엔진이 정한다 (edit.js 의 handDefaultY). 액자는 HEAP_POLICY.frameY 에 건다.
const HAND_TEMPLATE: Record<string, Partial<Item>> = {
  heapBox: { type: "heap", style: "box" },
  guestbookStand: { type: "guestbook", style: "stand" },
  window: { type: "window", w: 1.3, h: 1.2 },
  frame: { type: "frame", y: HEAP_POLICY.frameY },
  calendar: { type: "calendar", fn: { kind: "calendar", entries: [] } },
  glow: { type: "glow", level: 3 },
};
const HEAP_IDS = new Set([`${HAND_PREFIX}heap`, `${HAND_PREFIX}heapBox`]);
// 벽을 따라 움직이고 높이를 바꾸는 손 가구 (벽 가구 모델처럼 ▲▼ 단추를 보인다)
const WALL_HANDS = new Set(["screen", "poster", "window"]);
// 사진 더미는 방에 놓였을 때만 더미나 상자 모양이다. 메뉴에서는 일반 폴라로이드 그림이다.
const POLAROID_PIC =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="rotate(-8 32 32)"><rect x="14" y="8" width="36" height="44" rx="1.5" fill="#F3EADB" stroke="#565344" stroke-width="2"/><rect x="18" y="12" width="28" height="26" fill="#A6613C"/><circle cx="38" cy="19" r="4" fill="#F3EADB" opacity="0.8"/><path d="M18 38 L27 27 L34 34 L39 29 L46 38 Z" fill="#565344"/></g></svg>',
  );
// 창문은 벽 구멍과 틀을 방의 틀(shell.js)이 짓고 가구 묶음은 비어 있어 엔진이 찍을 것이 없다. 그래서 그림을 그려 둔다.
const WINDOW_PIC =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="12" y="8" width="40" height="46" fill="#E9DCC4" stroke="#565344" stroke-width="3"/><rect x="16" y="12" width="14" height="18" fill="#F6D9A8"/><rect x="34" y="12" width="14" height="18" fill="#F6D9A8"/><rect x="16" y="34" width="14" height="16" fill="#EFC98F"/><rect x="34" y="34" width="14" height="16" fill="#EFC98F"/><rect x="9" y="52" width="46" height="4" fill="#A6613C"/></svg>',
  );
// 엔진이 찍지 않고 그림을 쓰는 방 소품. 나머지 방 소품은 엔진이 방과 같은 BUILD 로 지어 찍는다 (dock-thumbs.js)
const HAND_PIC: Record<string, string> = {
  [`${HAND_PREFIX}heap`]: POLAROID_PIC,
  [`${HAND_PREFIX}heapBox`]: POLAROID_PIC,
  [`${HAND_PREFIX}window`]: WINDOW_PIC,
};
// 독의 손 가구 id → 엔진이 지을 항목 모양 (자리는 원점)
const handItemOf = (id: string): Partial<Item> => {
  const key = id.slice(HAND_PREFIX.length);
  return { ...(HAND_TEMPLATE[key] ?? { type: key }), x: 0, z: 0 } as Partial<Item>;
};
// 카탈로그 이름을 바꿔 부르는 모델 (방 v2: 받침 하나의 원탁을 카페 탁자로)
const LABEL_OVERRIDE: Record<string, string> = { tableRound: "카페 탁자" };

// 다섯 기능: 독의 기능 탭 순서, 짧은 이름, 칸의 표시, 기본 모양 (붙일 가구가 없을 때 커서에 올린다)
const FN_ORDER: SlotKind[] = ["music", "latest", "pc", "keepsake", "calendar", "tree"];
const FN_NAME: Record<SlotKind, string> = { music: "음악", latest: "최신 영상", pc: "PC 링크", keepsake: "기념품", calendar: "달력", tree: "쪽지 트리" };
const FN_GLYPH: Record<SlotKind, string> = { music: "♪", latest: "▶", pc: "↗", keepsake: "★", calendar: "▦", tree: "✦" };
const FN_DEFAULT: Record<SlotKind, string> = { music: "radio", latest: "televisionModern", pc: "laptop", keepsake: `${HAND_PREFIX}frame`, calendar: `${HAND_PREFIX}calendar`, tree: "holidayTreeDecorated" };

const NOTICE_MS = 6000;

const kindsOfId = (id: string): SlotKind[] =>
  id.startsWith(HAND_PREFIX) ? slotKindsFor(id.slice(HAND_PREFIX.length)) : slotKindsFor("model", id);
const fnKey = (fn: SlotFn | undefined) => JSON.stringify(fn ?? null);

// 최근에 꺼낸 가구 (이 브라우저에만 남는다). 저장소를 못 쓰면 빈 목록으로 시작한다.
function readRecent(): string[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function writeRecent(ids: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    /* 저장소를 못 쓰는 창: 최근 목록은 이 화면에서만 산다 */
  }
}

// 가구 그림. 엔진에 heap:thumb 으로 부탁하고, 이 마운트가 칠한 색(look)과 모델 id 로 기억한다.
// 마운트가 바뀌면(팔레트를 칠하면) 그리던 부탁은 버려지므로, 기다리는 표는 마운트 번호로 나눈다.
// 그림은 지금 마운트의 것만 둔다: 마운트(팔레트)가 바뀌면 옛 그림과 기다리던 표를 버린다.
// 부탁마다 token 을 넘기고, 이 effect 가 정리되면 token.live 를 끈다: 엔진은 꺼진 부탁을 그리지 않고, 늦게 온 그림은 받지 않는다.
function useThumbs(rootRef: RefObject<HTMLDivElement | null>, look: string, mount: number, ids: string[]) {
  const scope = `${mount}|${look}`;
  const [pics, setPics] = useState<{ scope: string; map: Record<string, string | null> }>({ scope, map: {} });
  const pending = useRef<{ scope: string; ids: Set<string> }>({ scope, ids: new Set() });
  // 그림이 따로 있는 방 소품(HAND_PIC)은 부탁하지 않는다. 나머지 방 소품은 항목 모양(item)을 함께 보내 엔진이 지어 찍는다
  const want = ids.filter((id) => !(id in HAND_PIC)).join(",");
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !look || !want) return;
    if (pending.current.scope !== scope) pending.current = { scope, ids: new Set() };
    const mine = pending.current, token = { live: true }, asked: string[] = [];
    for (const id of want.split(",")) {
      if (mine.ids.has(id)) continue;
      mine.ids.add(id);
      asked.push(id);
      root.dispatchEvent(
        new CustomEvent("heap:thumb", {
          detail: {
            id,
            token,
            item: id.startsWith(HAND_PREFIX) ? handItemOf(id) : undefined,
            cb: (url: string | null) => {
              if (!token.live) return;
              asked.splice(asked.indexOf(id), 1);
              setPics((prev) => {
                const map = prev.scope === scope ? prev.map : {};
                return id in map ? (prev.scope === scope ? prev : { scope, map }) : { scope, map: { ...map, [id]: url } };
              });
            },
          },
        }),
      );
    }
    return () => {
      token.live = false;
      for (const id of asked) mine.ids.delete(id); // 끝나지 않은 부탁은 다음에 다시 할 수 있게
    };
  }, [rootRef, look, scope, want]);
  return (id: string): string | null | undefined => (pics.scope === scope ? pics.map[id] : undefined);
}

// 가구 칸 하나: 그림(오기 전에는 빈 자리), 이름, 달 수 있는 기능의 표시.
function Tile({ m, pic, pressed, disabled, onPick }: { m: Model; pic: string | null | undefined; pressed: boolean; disabled: boolean; onPick: () => void }) {
  const kinds = kindsOfId(m.id);
  const fnText = kinds.map((k) => FN_NAME[k]).join(", ");
  return (
    <button type="button" className="ed-tile" aria-pressed={pressed} disabled={disabled} onClick={onPick} title={kinds.length ? `${m.label} · 기능: ${fnText}` : m.label}>
      {/* 그림은 엔진이 그린 data: 주소라 next/image 가 할 일이 없다 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {pic ? <img src={pic} alt="" draggable={false} /> : <span className="ed-pic" aria-hidden="true" />}
      <span className="ed-name">{m.label}</span>
      {kinds.length > 0 && (
        <span className="ed-tag" aria-label={`기능: ${fnText}`}>
          {kinds.map((k) => FN_GLYPH[k]).join(" ")}
        </span>
      )}
    </button>
  );
}

export function RoomEditor({
  rootRef,
  roomUuid,
  roomName,
  onClose,
  preview,
  setPreview,
  action,
  beforeSave,
  onSaved,
  owner,
  noteRevealAt,
  onRevealSaved,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  roomUuid: string;
  // 저장된 방 이름. 엔진의 상태가 오기 전에만 보인다.
  roomName: string;
  onClose: () => void;
  preview: boolean;
  setPreview: (v: boolean) => void;
  // 체크리스트가 시킨 일 (heap-room.tsx). seq 가 바뀔 때마다 한 번 한다.
  action: { kind: ChecklistAction; seq: number } | null;
  // 이번 방문에서 마지막으로 저장하기 바로 전의 모습 (저장 전으로). 없으면 null.
  beforeSave: SavedRoom | null;
  onSaved: (prev: SavedRoom, next: SavedRoom) => void;
  // 방 주인의 채널과 영상 (채널 탭)
  owner: HeapOwnerData | null;
  // 쪽지 공개 시각(ISO, 없으면 null)과 공개일 칸이 저장한 뒤의 알림. 공개일은 꾸미기 저장과 따로 바로 저장된다 (fn-form.tsx).
  noteRevealAt: string | null;
  onRevealSaved: (iso: string | null) => void;
}) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [st, setSt] = useState<EditState | null>(null);
  const [tab, setTab] = useState<"furn" | "fn" | "pal" | "tpl" | "ch" | "st">("furn");
  // 위 막대의 ⋯ 메뉴 (시간, 처음으로, 저장 전으로, 팔로워로 보기). left 는 메뉴를 펼칠 자리(방 루트 기준 px)
  const [menu, setMenu] = useState<{ left: number } | null>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  // 위 막대에서 고치는 중인 방 이름 (null 이면 고치지 않는다)과 그 이름이 왜 안 되는지
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState("");
  // 이 화면이 띄우는 알림 (템플릿, 저장 전으로). 엔진의 알림은 방을 다시 띄우면 지워져서 따로 둔다. undo 면 되돌리기 단추가 붙는다.
  const [note, setNote] = useState<{ text: string; undo: boolean; seq: number } | null>(null);
  const noteSeq = useRef(0);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [cat, setCat] = useState<string>(() => (readRecent().length ? "recent" : GROUPS[0].label));
  const [query, setQuery] = useState("");
  const [armedId, setArmedId] = useState<string | null>(null);
  // 열린 기능 말풍선 (가구 번호). 고른 가구가 바뀌면 닫힌다.
  const [bubbleFor, setBubbleFor] = useState<number | null>(null);
  // 올바르지 않아 아직 저장하지 않은 기능 값. base 는 그때의 가구 기능이다: 되돌리기 등으로 가구 쪽이 바뀌면 이 값은 버린다.
  const [draft, setDraft] = useState<{ index: number; fn: SlotFn; base: string; error: string } | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  // 고른 가구 위 막대의 「색」 창 (piece-colour.tsx)
  const [paintOpen, setPaintOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [goneSeq, setGoneSeq] = useState(0);
  // 기능 탭에서 "놓기"로 꺼낸 가구에 내려놓자마자 달 기능
  const pendingKind = useRef<SlotKind | null>(null);
  const placedSeq = useRef(0);
  const onPlaced = useRef<(index: number, items: Item[]) => void>(() => {});
  // 이 편집기가 살아 있는지. 닫히거나 다른 방으로 바뀐 뒤 늦게 끝난 저장은 아무것도 바꾸지 않는다.
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const send = useCallback(
    (type: string, detail: unknown) => rootRef.current?.dispatchEvent(new CustomEvent(type, { detail })),
    [rootRef],
  );
  const cmd = useCallback((detail: Record<string, unknown>) => send("heap:editcmd", detail), [send]);

  // 엔진의 편집 상태를 듣는다. heap-room.tsx의 effect가 heap:edit 을 보내기 전에 붙는다 (자식 effect가 먼저 돈다).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onState = (e: Event) => {
      const next = (e as CustomEvent<EditState>).detail;
      setSt(next);
      if (!next.moving) setArmedId(null);
      if (next.dirty) setSaveNote("");
      if (next.placed && next.placed.seq !== placedSeq.current) {
        placedSeq.current = next.placed.seq;
        const { index } = next.placed, items = next.items;
        queueMicrotask(() => onPlaced.current(index, items));
      }
    };
    root.addEventListener("heap:editstate", onState);
    let alive = true;
    root.dispatchEvent(
      new CustomEvent("heap:get", {
        detail: (state: RoomState) => {
          if (alive) setRoom(state);
        },
      }),
    );
    return () => {
      alive = false;
      root.removeEventListener("heap:editstate", onState);
    };
  }, [rootRef]);

  // 알림은 새 것이 올 때 보이고 6초 뒤(또는 되돌리기를 누르면) 사라진다. 사라진 알림의 번호를 기억한다.
  const noticeSeq = st?.notice?.seq ?? 0;
  useEffect(() => {
    if (!noticeSeq) return;
    const t = window.setTimeout(() => setGoneSeq(noticeSeq), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [noticeSeq]);
  const [goneNote, setGoneNote] = useState(0);
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setGoneNote(note.seq), NOTICE_MS + 2000);
    return () => window.clearTimeout(t);
  }, [note]);
  // 엔진의 알림이 이 화면의 알림보다 새것이면 그것을 보여 준다 (번호는 엔진과 이 화면이 따로 센다)
  const engineNotice = st?.notice && st.notice.seq !== goneSeq ? st.notice : null;
  const localNote = note && note.seq !== goneNote ? note : null;
  const shownNotice = engineNotice ?? localNote;

  const models = useMemo(
    () => (room?.catalogue?.models ?? []).map((m) => (LABEL_OVERRIDE[m.id] ? { ...m, label: LABEL_OVERRIDE[m.id] } : m)),
    [room?.catalogue?.models],
  );
  // 독에 내놓는 모델: 벽 조각(catalogue.json 의 mount "structure")은 뺀다. 벽에 거는 것("wall")과 천장에 다는 것("ceiling")은 엔진이 벽과 천장에 붙인다.
  // 이미 방에 놓인 것은 그대로 그려지고 고르고 옮기고 넣을 수 있다 (이름은 models 전체에서 찾는다).
  const placeable = models.filter((m) => m.mount !== "structure");
  const items = useMemo(() => st?.items ?? [], [st?.items]);
  const sel = st?.sel ?? null;
  const selItem = sel != null ? items[sel] : undefined;
  // 고른 가구가 어디에 거는 것인지 ("wall" | "ceiling" | undefined). 벽 가구는 돌리지 않고 높이를 바꾼다.
  const mountOf = (it: Item | undefined) => (it?.type === "model" ? models.find((m) => m.id === it.model)?.mount : undefined);
  const selMount = mountOf(selItem);
  // 벽을 따라 움직이고 높이를 바꾸는 것: 벽 가구 모델과 방 v2 의 스크린, 포스터, 창
  const selWall = selMount === "wall" || (!!selItem && WALL_HANDS.has(selItem.type));
  // 사진 더미는 방에 하나까지 (layout.ts). 있으면 독의 더미는 고를 수 없다
  const heapTaken = items.some((it) => it.type === "heap");
  const busy = !!st?.busy;
  const bubbleOpen = bubbleFor != null && bubbleFor === sel && !!selItem && !st?.moving && !busy && canCarryFn(selItem);
  // 고른 가구가 바뀌면 모양 바꾸기 목록도 닫는다 (렌더 중에 앞의 값과 견준다)
  const [swapSel, setSwapSel] = useState<number | null>(null);
  if (swapSel !== sel) {
    setSwapSel(sel);
    setSwapOpen(false);
    setPaintOpen(false);
  }
  // 고른 가구가 칠할 수 있는 부분 (카탈로그의 parts). Kenney 모델만 갖는다
  const selParts = selItem?.type === "model" ? (models.find((m) => m.id === selItem.model)?.parts ?? []) : [];
  const paintShown = paintOpen && !!selItem && selParts.length > 0 && !st?.moving && !busy;

  // PC를 처음 만들 때 채우는 링크: creator.json의 목록 + 링크트리. 칸 수와 글자 수 한도에 맞춰 자른다.
  const prefill = useCallback((): PcLink[] => {
    const links: PcLink[] = [];
    for (const L of room?.creatorLinks ?? []) {
      const title = [...L.title].slice(0, HEAP_POLICY.linkTitleMaxChars).join("");
      if (L.email) links.push({ title, email: L.email });
      else if (L.url) links.push({ title, url: L.url });
    }
    if (room?.linktree) links.push({ title: "Linktree", url: room.linktree });
    return links.slice(0, HEAP_POLICY.pcLinksMax);
  }, [room]);

  // 기능 값 하나를 받는다. 서버와 같은 검사(checkFn)를 통과한 값만 엔진에 넣고, 아니면 말풍선이 들고 있는다.
  const applyFn = useCallback(
    (index: number, item: Item, fn: SlotFn | undefined) => {
      if (fn === undefined) {
        cmd({ op: "fn", index, fn: undefined });
        setDraft(null);
        return;
      }
      const r = checkFn(fn, item.type, item.model, "fn");
      const treeTaken = fn.kind === "tree" && items.some((o, i) => i !== index && o.fn?.kind === "tree");
      if (treeTaken) setDraft({ index, fn, base: fnKey(item.fn), error: `쪽지 트리는 방에 ${HEAP_POLICY.treesPerRoom}개까지예요.` });
      else if ("error" in r) setDraft({ index, fn, base: fnKey(item.fn), error: r.error.replace(/^fn[^:]*:\s*/, "") });
      else {
        cmd({ op: "fn", index, fn: r.fn });
        setDraft(null);
      }
    },
    [cmd, items],
  );

  // 가구를 고르고 말풍선을 연다. kind 를 주면 기능이 없는 가구에 그 기능을 바로 단다 (값이 비어 있으면 말풍선이 들고 있는다).
  const openBubble = useCallback(
    (index: number, item: Item, kind?: SlotKind) => {
      cmd({ op: "select", index });
      setBubbleFor(index);
      setDraft(null);
      if (kind && !item.fn && slotKindsFor(item.type, item.model).includes(kind)) applyFn(index, item, newFn(kind, prefill));
    },
    [cmd, applyFn, prefill],
  );

  // 새 가구를 내려놓으면: 기능 탭에서 꺼낸 것은 그 기능을 달고, 기능을 달 수 있는 가구면 말풍선을 연다.
  useEffect(() => {
    onPlaced.current = (index, list) => {
      const it = list[index];
      const kind = pendingKind.current;
      pendingKind.current = null;
      if (!it || !canCarryFn(it)) return;
      openBubble(index, it, kind ?? undefined);
    };
  });

  // 서버에는 layout 전체를 보낸다. DB의 기존 layout에 편집한 items, time, palette 와 방의 틀(방 크기, 창문, 문 …)을 덮어 쓴다.
  // 힙에서 뺀 영상 목록(excludedReels)은 보내지 않는다: 채널 탭이 이 방문 중에 바꿨을 수 있고, 서버(saveRoomLayout)가 DB의 목록을 그대로 남긴다.
  // 방 이름을 고쳤으면 같은 저장에 이름을 실어 보낸다: 서버는 레이아웃과 이름을 한 번에 저장하거나 둘 다 저장하지 않는다.
  const save = useCallback(async (): Promise<boolean> => {
    if (saving || !room || !st || st.busy) return false;
    setSaving(true);
    setSaveNote("");
    // links 가 없는 PC 는 엔진이 정적 creator.json 링크를 대신 보여 준다. 서버가 검증하지 못하는 링크라 열람 집계가 버려지므로, 저장할 때 그 링크를 PC 의 links 로 옮겨 적는다.
    const fallback = prefill();
    const items = fallback.length ? st.items.map((it) => (it.fn?.kind === "pc" && it.fn.links === undefined ? { ...it, fn: { ...it.fn, links: fallback } } : it)) : st.items;
    const layout: Record<string, unknown> = { ...room.layout, items, time: st.time };
    delete layout.excludedReels;
    for (const key of SHELL_KEYS) delete layout[key];
    Object.assign(layout, st.shell);
    if (!layout.room) layout.room = { w: room.room.w, d: room.room.d };
    if (st.palette) layout.palette = st.palette;
    else delete layout.palette;
    if (st.backdrop) layout.backdrop = st.backdrop;
    else delete layout.backdrop;
    if (st.brand) layout.brand = st.brand;
    else delete layout.brand;
    const name = st.name !== st.savedName ? st.name : undefined;
    const prev: SavedRoom = { layout: room.layout, name: st.savedName };
    try {
      const result = await saveLayoutAction(roomUuid, layout, name);
      if (!alive.current) return false;
      if (result.ok) {
        // 엔진의 기준(버리고 나가기의 목표)을 방금 저장한 상태로 옮긴다. 엔진은 다른 방의 roomUuid 면 버린다.
        send("heap:saved", { roomUuid, layout, name: st.name });
        setRoom({ ...room, layout });
        onSaved(prev, { layout, name: st.name });
        setSaveNote("저장했어요");
        return true;
      }
      // 서버가 돌려주는 detail은 "items[26].fn.links[6]: 이메일 주소가 …" 꼴이다. 크리에이터에게는 가구 번호를 뺀 말만 보여 주고 전체는 콘솔에 남긴다.
      if ("detail" in result) console.warn("[heap-room] 저장 거절", result.detail);
      setSaveNote("detail" in result ? `${result.message} (${result.detail.replace(/^items\[\d+\][^:]*:\s*/, "")})` : result.message);
    } catch {
      if (alive.current) setSaveNote("저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
    } finally {
      if (alive.current) setSaving(false);
    }
    return false;
  }, [saving, room, st, roomUuid, send, onSaved, prefill]);

  // Ctrl+S 는 저장. 브라우저의 페이지 저장은 막는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        // 기능 양식에 입력하는 중에는 저장하지 않는다 (덜 쓴 값은 아직 엔진에 없다)
        const t = e.target as HTMLElement | null;
        if (t && t.closest("input, textarea, select, [contenteditable]")) return;
        if (st?.dirty) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, st?.dirty]);

  // 저장 안 된 변경이 있는 동안 창을 닫거나 새로 고치면 브라우저가 묻는다 (판정 J9). 앱 안의 나가기는 아래 대화창이 묻는다.
  const dirty = !!st?.dirty;
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  // 팔로워로 보기: 켜고 끄는 것을 엔진에 알린다. 보는 동안 아무 키나 누르면 돌아온다 (그 키는 다른 데로 가지 않는다).
  // V 는 꾸미기에서 팔로워로 보기를 켠다 (글자를 쓰는 칸에서는 아니다).
  useEffect(() => {
    if (st) cmd({ op: "preview", value: preview });
  }, [cmd, preview, st?.mount]); // eslint-disable-line react-hooks/exhaustive-deps -- 다시 마운트한 엔진에도 다시 알린다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (preview) {
        if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        setPreview(false);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "v") return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest("input, textarea, select, [contenteditable], .ed-bubble")) return;
      if (st?.busy) return;
      e.preventDefault();
      setPreview(true);
    };
    window.addEventListener("keydown", onKey, { capture: preview });
    return () => window.removeEventListener("keydown", onKey, { capture: preview });
  }, [preview, setPreview, st?.busy]);

  // ⋯ 메뉴는 바깥을 누르거나 Esc, 창 크기가 바뀌면 닫는다
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest(".ed-menu") || t.closest(".ed-more"))) return;
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    const onResize = () => setMenu(null);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [menu]);

  const leave = () => {
    if (st?.dirty) setLeaving(true);
    else onClose();
  };
  const discardAndLeave = () => {
    cmd({ op: "discard" });
    onClose();
  };
  const saveAndLeave = async () => {
    if (await save()) onClose();
    else setLeaving(false);
  };

  // 카탈로그 항목(또는 손으로 만드는 가구)을 커서에 올린다. fn 이 있으면 그 기능을 단 채로 놓인다.
  // 높이(y)는 주지 않는다: 작은 가구는 엔진(edit.js)이 커서 아래 가구의 윗면을 재어 올리고, 벽·천장 가구는 모델의 키로 정한다.
  const arm = (m: Model, fn?: SlotFn) => {
    if (armedId === m.id && !fn) {
      cmd({ op: "cancel" });
      setArmedId(null);
      return;
    }
    const hand = m.id.startsWith(HAND_PREFIX) ? m.id.slice(HAND_PREFIX.length) : null;
    const template: Item = hand
      ? { type: hand, ...HAND_TEMPLATE[hand], x: 0, z: 0, rot: 0 }
      : { type: "model", model: m.id, x: 0, z: 0, rot: 0, ...(fn ? { fn } : {}) };
    setArmedId(m.id);
    setBubbleFor(null);
    setDraft(null);
    const next = [m.id, ...recent.filter((id) => id !== m.id)].slice(0, RECENT_MAX);
    setRecent(next);
    writeRecent(next);
    cmd({ op: "arm", template });
  };

  // ---------- 방 이름 ----------
  // 방 만들기 화면과 같은 규칙(checkRoomName). 맞으면 한 걸음으로 엔진에 넣고, 틀리면 칸을 열어 둔 채 까닭을 보여 준다.
  const shownName = st?.name ?? roomName;
  const startName = () => {
    setNameDraft(shownName);
    setNameErr("");
  };
  const commitName = (value: string, keepOpen: boolean) => {
    const r = checkRoomName(value);
    if (!r.ok) {
      if (keepOpen) setNameErr(`방 이름은 1자 이상 ${HEAP_FUNNEL_POLICY.roomNameMaxChars}자 이하로, 줄바꿈 없이 적어 주세요.`);
      else setNameDraft(null); // 칸을 떠나면 틀린 값은 버리고 원래 이름으로 둔다
      return;
    }
    if (r.name !== shownName) cmd({ op: "name", value: r.name });
    setNameDraft(null);
    setNameErr("");
  };

  // ---------- 가구 목록: 칩, 찾기, 최근 ----------
  const groups = GROUPS.map((g) => ({
    label: g.label,
    models: placeable.filter((m) => g.cats.includes(m.category) || (g.cats.includes("decor") && !KNOWN.includes(m.category))),
  })).filter((g) => g.models.length > 0);
  groups.push({ label: HAND_GROUP, models: HAND_MODELS });
  const allModels = [...placeable, ...HAND_MODELS];
  const byId = new Map(allModels.map((m) => [m.id, m]));
  const q = query.trim().toLowerCase();
  // 찾기: 이름(한국어 또는 영어), 모델 id 의 낱말, 묶음 이름. 낱말마다 모두 맞아야 한다 ("의자" 는 의자·소파 묶음 전체를 찾는다).
  const hay = (m: Model) =>
    `${m.label} ${m.id.replace(HAND_PREFIX, "").replace(/([a-z])([A-Z0-9])/g, "$1 $2")} ${groupOf(m)?.label ?? HAND_GROUP}`.toLowerCase();
  const shownModels: Model[] = q
    ? allModels.filter((m) => q.split(/\s+/).every((w) => hay(m).includes(w)))
    : cat === "recent"
      ? recent.flatMap((id) => byId.get(id) ?? [])
      : (groups.find((g) => g.label === cat) ?? groups[0]).models;

  // ---------- 모양 바꾸기 ----------
  // 같은 기능을 달 수 있는 다른 모양. 기능이 달려 있으면 그 기능, 없으면 이 가구가 달 수 있는 기능 중 하나라도 같은 것.
  const swapChoices: Model[] = (() => {
    if (!selItem || selItem.type === "frame" || selItem.type === "calendar") return [];
    const need = selItem.fn ? [selItem.fn.kind] : slotKindsFor(selItem.type, selItem.model);
    if (!need.length) return [];
    const fits = (kinds: SlotKind[]) => kinds.some((k) => need.includes(k));
    // 벽·천장 가구는 같은 자리에 거는 것끼리만 바꾼다 (엔진의 swap 도 막는다)
    const list = placeable.filter((m) => m.id !== selItem.model && m.mount === selMount && fits(slotKindsFor("model", m.id)));
    if (selItem.type !== "shelf" && !selMount && fits(slotKindsFor("shelf"))) list.push({ id: `${HAND_PREFIX}shelf`, label: "앨범 책장", category: "shelf" });
    return list;
  })();

  // 기능 하나를 시작한다 (기능 탭의 단추, 체크리스트의 링크 놓기·기념품 놓기): 붙어 있으면 그 가구를 고르고 말풍선을 연다.
  // 없으면 달 수 있는 빈 가구에 달고, 그것도 없으면 기본 모양(dfltId)을 그 기능을 단 채 커서에 올린다.
  const fnAct = (k: SlotKind, dfltId: string = FN_DEFAULT[k]) => {
    const have = items.findIndex((it) => it.fn?.kind === k);
    const can = items.findIndex((it) => !it.fn && slotKindsFor(it.type, it.model).includes(k));
    const dflt = byId.get(dfltId);
    if (have >= 0) openBubble(have, items[have]);
    else if (can >= 0) openBubble(can, items[can], k);
    else if (dflt) {
      pendingKind.current = k === "latest" || k === "calendar" || k === "tree" ? null : k;
      arm(dflt, k === "latest" ? { kind: "latest" } : k === "tree" ? { kind: "tree" } : undefined);
    }
  };

  // ---------- 템플릿 (판정 J8) ----------
  // 가구, 팔레트, 방의 틀을 템플릿의 것으로 바꾸는 한 걸음. 지금 달린 기능은 템플릿의 맞는 가구로 옮기고, 갈 곳이 없으면 버린다 (되돌리기로 살아난다).
  const applyTemplate = (t: HeapTemplate) => {
    const target = Array.isArray(t.layout.items) ? (t.layout.items as MoveItem[]) : [];
    const { items: next, moved, dropped } = moveFunctions(items as MoveItem[], target);
    const nextItems = next as Item[];
    const movedText = moved.map((m) => `${FN_NAME[m.kind]} → ${itemLabel(nextItems[m.to], models)}`).join(", ");
    const droppedText = dropped.map((d) => FN_NAME[d.kind]).join(", ");
    cmd({ op: "load", layout: { items: next, palette: t.layout.palette ?? null, shell: shellOf(t.layout) } });
    setBubbleFor(null);
    setDraft(null);
    setNote({
      text: [`「${t.label}」 템플릿을 깔았어요`, movedText && `옮긴 기능: ${movedText}`, droppedText && `놓을 곳이 없어 뺀 기능: ${droppedText}`]
        .filter(Boolean)
        .join(" · "),
      undo: true,
      seq: ++noteSeq.current,
    });
  };

  // ---------- 저장 전으로 (판정 J10) ----------
  const loadBeforeSave = () => {
    if (!beforeSave) return;
    const l = beforeSave.layout;
    cmd({
      op: "load",
      layout: {
        items: Array.isArray(l.items) ? l.items : [],
        palette: l.palette ?? null,
        shell: shellOf(l),
        time: l.time ?? "auto",
        backdrop: l.backdrop ?? null,
        brand: l.brand ?? null,
      },
      name: beforeSave.name,
    });
    setBubbleFor(null);
    setDraft(null);
    setNote({ text: "저장하기 전 모습을 불러왔어요 · 저장하면 팔로워에게 보여요", undo: true, seq: ++noteSeq.current });
  };

  // ---------- 체크리스트의 단추 (setup-checklist.tsx) ----------
  // 꾸미기를 막 연 경우에는 엔진의 상태와 가구 목록이 온 뒤에 한다. 같은 일(seq)은 한 번만.
  const doneAction = useRef(0);
  const ready = !!st && !!room?.catalogue && !busy;
  const runAction = useRef<(k: ChecklistAction) => void>(() => {});
  useEffect(() => {
    runAction.current = (k) => {
      if (k === "name") startName();
      else if (k === "palette") setTab("pal");
      else if (k === "channel") setTab("ch");
      else if (k === "pc") {
        setTab("fn");
        fnAct("pc", "desk"); // 판정 J4: PC 기능을 단 책상
      } else if (k === "keepsake") {
        setTab("fn");
        fnAct("keepsake");
      }
    };
  });
  useEffect(() => {
    if (!action || !ready || action.seq === doneAction.current) return;
    doneAction.current = action.seq;
    runAction.current(action.kind);
  }, [action, ready]);

  const look = st?.look ?? "";
  const thumbIds = [
    ...(tab === "furn" ? shownModels.map((m) => m.id) : []),
    ...(swapOpen ? swapChoices.map((m) => m.id) : []),
  ];
  const thumb = useThumbs(rootRef, look, st?.mount ?? 0, thumbIds);

  const time = st?.time ?? "auto";
  const timeLabel = TIMES.find(([key]) => key === time)?.[1] ?? `${time}시`;
  const nextTime = () => cmd({ op: "time", value: TIMES[(TIMES.findIndex(([key]) => key === time) + 1) % TIMES.length][0] });
  const saveState = busy
    ? "방을 다시 짓는 중…"
    : saving
      ? "저장하는 중…"
      : saveNote
        ? saveNote
        : st?.dirty
          ? "저장 안 된 변경이 있어요"
          : "저장됨";

  const hint = st?.moving
    ? st.moving.isNew
      ? "눌러서 놓기 · Shift+클릭 계속 놓기 · R 돌리기 · Alt 스냅 끄기 · Esc 취소"
      : "놓을 곳에서 떼기 · R 돌리기 · Alt 스냅 끄기 · 아래 목록에 놓으면 넣기"
    : selItem
      ? selWall
        ? "벽을 따라 끌기 · 다른 벽으로 끌면 그 벽에 걸려요 · PageUp/PageDown 높이 · Del 넣기 · Esc 고르기 취소"
        : "끌어서 옮기기 · R 돌리기 · Del 넣기 · Ctrl+D 복제 · Esc 고르기 취소"
      : "가구를 눌러 고르고 끌어서 옮겨요 · 휠 확대 · 오른쪽 끌기 이동 · T 위에서 보기 · 0 맞추기";

  // 말풍선에 보이는 기능: 들고 있는 값(올바르지 않은 것)이 있으면 그것, 아니면 가구에 달린 것
  const liveDraft = draft && bubbleOpen && draft.index === sel && selItem && draft.base === fnKey(selItem.fn) ? draft : null;
  const shownItem: Item | undefined = selItem && (liveDraft ? { ...selItem, fn: liveDraft.fn } : selItem);
  const selKinds = selItem ? slotKindsFor(selItem.type, selItem.model) : [];
  const closeBubble = () => {
    setBubbleFor(null);
    setDraft(null);
  };

  // 팔로워로 보기: 꾸미기 화면을 모두 숨기고 돌아가기 단추 하나만 둔다 (heap-room.css 의 .previewing)
  if (preview) {
    return (
      <div className="ed-preview" role="status">
        <span>팔로워에게 보이는 모습이에요 · 저장하지 않은 변경도 보여요 · 아무 키나 누르면 돌아가요</span>
        <button className="btn small" type="button" onClick={() => setPreview(false)}>
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="ed-top" role="toolbar" aria-label="꾸미기">
        <b>꾸미기</b>
        {nameDraft === null ? (
          <button className="ed-room" type="button" onClick={startName} disabled={busy} title="눌러서 방 이름 바꾸기 · 저장하면 팔로워에게 보여요">
            {shownName}
          </button>
        ) : (
          <span className="ed-name">
            <input
              autoFocus
              value={nameDraft}
              aria-label="방 이름"
              aria-invalid={!!nameErr}
              onChange={(e) => {
                setNameDraft(e.target.value);
                setNameErr("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName(nameDraft, true);
                else if (e.key === "Escape") {
                  setNameDraft(null);
                  setNameErr("");
                }
              }}
              onBlur={() => commitName(nameDraft, false)}
            />
            <small className={charCount(nameDraft.trim()) > HEAP_FUNNEL_POLICY.roomNameMaxChars ? "ed-bad" : undefined}>
              {charCount(nameDraft.trim())}/{HEAP_FUNNEL_POLICY.roomNameMaxChars}
            </small>
            {nameErr && (
              <span className="ed-name-err" role="alert">
                {nameErr}
              </span>
            )}
          </span>
        )}
        <button className="btn ghost small" type="button" disabled={!st?.canUndo || busy} onClick={() => cmd({ op: "undo" })} title="Ctrl+Z">
          되돌리기
        </button>
        <button className="btn ghost small" type="button" disabled={!st?.canRedo || busy} onClick={() => cmd({ op: "redo" })} title="Ctrl+Shift+Z">
          다시 하기
        </button>
        <button className="btn ghost small" type="button" aria-pressed={!!st?.view?.plan} disabled={busy} onClick={() => cmd({ op: "plan" })} title="위에서 보기 (T)">
          위에서
        </button>
        {/* 확대하거나 옮긴 뒤에만 보인다: 좁은 창에서 위 막대가 넘치지 않게 */}
        {st?.view?.fitted === false && (
          <button className="btn ghost small" type="button" disabled={busy} onClick={() => cmd({ op: "fit" })} title="방 전체 보기 (Home 또는 0)">
            맞추기
          </button>
        )}
        <button
          ref={menuBtn}
          className="btn ghost small ed-more"
          type="button"
          aria-haspopup="menu"
          aria-expanded={!!menu}
          disabled={busy}
          onClick={() => {
            if (menu) return setMenu(null);
            const b = menuBtn.current?.getBoundingClientRect();
            const r = rootRef.current?.getBoundingClientRect();
            setMenu({ left: b && r ? Math.max(8, Math.min(b.left - r.left, r.width - 228)) : 8 });
          }}
          title="시간, 처음으로, 저장 전으로, 팔로워로 보기"
          aria-label="더 보기"
        >
          ⋯
        </button>
        <span className="ed-sp" />
        <span className={st?.dirty && !saveNote ? "ed-save dirty" : "ed-save"} role="status">
          {saveState}
        </span>
        <button className="btn small" type="button" disabled={saving || busy || !st?.dirty} onClick={() => void save()} title="Ctrl+S">
          저장
        </button>
        <button className="btn ghost small" type="button" disabled={busy} onClick={leave}>
          나가기
        </button>
      </div>

      {menu && (
        <div className="ed-menu" role="menu" aria-label="더 보기" style={{ left: menu.left }}>
          {/* 시간은 누를 때마다 다음 시간으로 간다. 메뉴는 열어 둔다 */}
          <button type="button" role="menuitem" disabled={busy} onClick={nextTime}>
            시간 · {timeLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!st?.dirty || busy}
            onClick={() => {
              cmd({ op: "reset" });
              setMenu(null);
            }}
            title="마지막으로 저장한 모습으로"
          >
            처음으로
          </button>
          {beforeSave && (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                loadBeforeSave();
                setMenu(null);
              }}
              title="이번에 저장하기 바로 전의 모습을 다시 깔아요 · 되돌릴 수 있어요"
            >
              저장 전으로
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setMenu(null);
              setPreview(true);
            }}
            title="팔로워에게 보이는 모습 (V)"
          >
            팔로워로 보기 <kbd>V</kbd>
          </button>
        </div>
      )}

      {leaving && (
        <div className="ed-leave panel" role="dialog" aria-label="저장하지 않은 변경">
          <div className="panel-body">
            <p className="note">저장하지 않은 변경이 있어요. 저장하지 않으면 팔로워에게는 지난번 모습이 보여요.</p>
            <div className="row">
              <button className="btn small" type="button" disabled={saving} onClick={() => void saveAndLeave()}>
                저장하고 나가기
              </button>
              <button className="btn ghost small" type="button" onClick={discardAndLeave}>
                버리고 나가기
              </button>
              <button className="btn ghost small" type="button" onClick={() => setLeaving(false)}>
                계속 꾸미기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 기능 표: 기능이 달린 가구에는 채운 표, 달 수 있는 빈 가구에는 (기능 탭이 열렸거나 고른 가구일 때) 점선 +. 자리는 엔진이 정한다. */}
      {!st?.moving && !busy && (
        <div className="ed-badges">
          {items.map((it, i) => {
            if (!canCarryFn(it)) return null;
            const set = !!it.fn;
            if (!set && tab !== "fn" && sel !== i) return null;
            return (
              <button
                key={i}
                type="button"
                className={set ? "ed-badge set" : "ed-badge"}
                data-badge={i}
                style={{ visibility: "hidden" }}
                title={set ? `${itemLabel(it, models)} · ${FN_NAME[it.fn!.kind]}` : `${itemLabel(it, models)}에 기능 달기`}
                onClick={() => openBubble(i, it)}
              >
                {set ? FN_GLYPH[it.fn!.kind] : "+"}
              </button>
            );
          })}
        </div>
      )}

      {selItem && !st?.moving && !busy && (
        <div id="ed-bar" className="ed-bar" role="toolbar" aria-label={`${itemLabel(selItem, models)} 고치기`}>
          <span className="lbl">{itemLabel(selItem, models)}</span>
          {selItem.type !== "frame" && !selWall && (
            <button type="button" onClick={() => cmd({ op: "rotate", dir: 1 })} title="R">
              회전
            </button>
          )}
          {selWall && (
            <>
              <button type="button" onClick={() => cmd({ op: "lift", dir: 1 })} title="높이 올리기 (PageUp)" aria-label="높이 올리기">
                ▲
              </button>
              <button type="button" onClick={() => cmd({ op: "lift", dir: -1 })} title="높이 내리기 (PageDown)" aria-label="높이 내리기">
                ▼
              </button>
            </>
          )}
          <button type="button" onClick={() => cmd({ op: "copy" })} title="Ctrl+D">
            복제
          </button>
          {isLamp(selItem, models) && (
            <button type="button" aria-pressed={selItem.lit !== false} onClick={() => cmd({ op: "lit" })} title="꺼 둔 조명은 밤에도 꺼져 있어요">
              {selItem.lit === false ? "불 켜기" : "불 끄기"}
            </button>
          )}
          {selItem.type === "glow" && (
            <>
              <button type="button" onClick={() => cmd({ op: "level", dir: -1 })} aria-label="빛 약하게" title="빛 약하게">
                −
              </button>
              <span className="lbl" aria-live="polite">
                빛 {selItem.level ?? 3}/5
              </span>
              <button type="button" onClick={() => cmd({ op: "level", dir: 1 })} aria-label="빛 세게" title="빛 세게">
                +
              </button>
            </>
          )}
          {selKinds.length > 0 && (
            <button type="button" className="fn" aria-pressed={bubbleOpen} onClick={() => (bubbleOpen ? closeBubble() : setBubbleFor(sel))}>
              기능
            </button>
          )}
          {selParts.length > 0 && (
            <button
              type="button"
              aria-expanded={paintOpen}
              title="이 가구만 다른 색으로"
              onClick={() => {
                // 열 때 지금 보이는 색을 다시 받는다 (방금 놓은 가구는 고를 때 모델이 아직 읽히지 않았을 수 있다)
                if (!paintOpen && sel != null) cmd({ op: "select", index: sel });
                setPaintOpen(!paintOpen);
                setSwapOpen(false);
              }}
            >
              색
            </button>
          )}
          {swapChoices.length > 0 && (
            <button
              type="button"
              aria-expanded={swapOpen}
              onClick={() => {
                setSwapOpen(!swapOpen);
                setPaintOpen(false);
              }}
            >
              모양 바꾸기
            </button>
          )}
          <button type="button" onClick={() => cmd({ op: "remove" })} title="Del">
            넣기
          </button>
          {paintOpen && sel != null && selParts.length > 0 && (
            <PieceColour
              index={sel}
              parts={selParts}
              colors={selItem.colors}
              shown={st?.partColours ?? null}
              palette={st?.palette ?? null}
              brand={st?.brand ?? null}
              cmd={cmd}
            />
          )}
          {swapOpen && sel != null && (
            <div className="ed-swap" role="list" aria-label="같은 기능을 달 수 있는 모양">
              {swapChoices.map((m) => (
                <Tile
                  key={m.id}
                  m={m}
                  pic={thumb(m.id)}
                  pressed={false}
                  disabled={busy}
                  onPick={() => {
                    const hand = m.id.startsWith(HAND_PREFIX) ? m.id.slice(HAND_PREFIX.length) : null;
                    cmd({ op: "swap", index: sel, to: hand ? { type: hand } : { type: "model", model: m.id } });
                    setSwapOpen(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <div id="ed-why" className="ed-why" hidden />
      {/* 안내와 알림은 한 줄기로 쌓는다: 알림이 길어 줄이 바뀌어도 안내 위에 겹치지 않는다 */}
      <div className="ed-float">
      {!bubbleOpen && !paintShown && <p className="ed-hint">{hint}</p>}
      {shownNotice && (
        <div className="ed-toast" role="status">
          <span>{shownNotice.text}</span>
          {shownNotice.undo && (
            <button
              type="button"
              onClick={() => {
                cmd({ op: "undo" });
                if (shownNotice === engineNotice) setGoneSeq(shownNotice.seq);
                else setGoneNote(shownNotice.seq);
              }}
            >
              되돌리기
            </button>
          )}
        </div>
      )}
      </div>

      {bubbleOpen && shownItem && selItem && sel != null && (
        <div
          id="ed-bubble"
          className="ed-bubble"
          data-index={sel}
          role="dialog"
          aria-label={`${itemLabel(selItem, models)} 기능`}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeBubble();
          }}
        >
          <div className="ed-bubble-head">
            {selKinds.length > 1 && shownItem.fn && (
              <span className="ed-kinds">
                {selKinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="ed-chip"
                    aria-pressed={shownItem.fn?.kind === k}
                    onClick={() => shownItem.fn?.kind !== k && applyFn(sel, selItem, newFn(k, prefill))}
                  >
                    {FN_GLYPH[k]} {FN_NAME[k]}
                  </button>
                ))}
              </span>
            )}
            <button type="button" className="ed-x" onClick={closeBubble} title="닫기 (Esc)" aria-label="닫기">
              ×
            </button>
          </div>
          <FnForm
            key={sel}
            item={shownItem}
            models={models}
            prefill={prefill}
            onChange={(fn) => applyFn(sel, selItem, fn)}
            reveal={{ roomUuid, revealAt: noteRevealAt, onSaved: onRevealSaved }}
          />
          {liveDraft ? (
            <p className="note ed-bad">아직 붙지 않았어요 · {liveDraft.error} 올바르게 적으면 바로 붙어요.</p>
          ) : (
            selItem.fn && <p className="note ed-ok">붙어 있어요. 저장하면 팔로워에게 보여요.</p>
          )}
        </div>
      )}

      {busy && <p className="ed-busy" role="status">방을 다시 짓는 중…</p>}

      <div className="ed-dock">
        <div className="ed-tabs" role="tablist" aria-label="꾸미기 독">
          {(
            [
              ["furn", "가구"],
              ["fn", "기능"],
              ["pal", "색·무늬"],
              ["tpl", "템플릿"],
              ["ch", "채널"],
              ["st", "통계"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" className="ed-tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
          <span className="ed-count">가구 {items.length}개</span>
          <a className="ed-credit" href="https://kenney.nl" target="_blank" rel="noopener noreferrer">
            가구: Kenney (CC0)
          </a>
        </div>

        {tab === "furn" && (
          <div className="ed-pane">
            <div className="ed-chips">
              <input
                className="ed-search"
                type="search"
                value={query}
                placeholder="가구 찾기 (예: 의자, lamp)"
                aria-label="가구 찾기"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQuery("");
                }}
              />
              <button type="button" className="ed-chip" aria-pressed={!q && cat === "recent"} onClick={() => { setCat("recent"); setQuery(""); }}>
                최근
              </button>
              {groups.map((g) => (
                <button key={g.label} type="button" className="ed-chip" aria-pressed={!q && cat === g.label} onClick={() => { setCat(g.label); setQuery(""); }}>
                  {g.label}
                </button>
              ))}
            </div>
            <div className="ed-strip">
              {!room ? (
                <p className="note">불러오는 중…</p>
              ) : !room.catalogue ? (
                <p className="note">가구 목록을 불러오지 못했어요.</p>
              ) : shownModels.length === 0 ? (
                <p className="note">{q ? "맞는 가구가 없어요." : "최근에 꺼낸 가구가 아직 없어요."}</p>
              ) : (
                shownModels.map((m) => (
                  <Tile
                    key={m.id}
                    m={m}
                    pic={HAND_PIC[m.id] ?? thumb(m.id)}
                    pressed={armedId === m.id}
                    disabled={busy || (HEAP_IDS.has(m.id) && heapTaken)}
                    onPick={() => arm(m)}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {tab === "fn" && (
          <div className="ed-pane">
            <div className="ed-strip">
              {FN_ORDER.map((k) => {
                const have = items.flatMap((it, i) => (it.fn?.kind === k ? [i] : []));
                const can = items.findIndex((it) => !it.fn && slotKindsFor(it.type, it.model).includes(k));
                const skins = allModels.filter((m) => kindsOfId(m.id).includes(k)).map((m) => m.label);
                if (k === "keepsake") skins.push("앨범 책장");
                const dflt = byId.get(FN_DEFAULT[k]);
                const status = have.length
                  ? `${have.map((i) => itemLabel(items[i], models)).join(", ")}에 붙어 있어요`
                  : can >= 0
                    ? `${itemLabel(items[can], models)}에 붙일 수 있어요`
                    : "붙일 가구가 아직 없어요";
                const act = () => fnAct(k);
                return (
                  <div key={k} className={have.length ? "ed-fncard set" : "ed-fncard"}>
                    <b>
                      {FN_GLYPH[k]} {FN_NAME[k]}
                    </b>
                    <small>{status}</small>
                    <small title={skins.join(", ")}>가구: {skins.join(", ")}</small>
                    <button type="button" className="btn small" disabled={busy || (!have.length && can < 0 && !dflt)} onClick={act}>
                      {have.length ? "고르기" : can >= 0 ? "붙이기" : `${dflt?.label ?? "가구"} 놓기`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "tpl" && (
          <div className="ed-pane">
            <div className="ed-strip">
              {HEAP_TEMPLATES.map((t) => (
                <button key={t.id} type="button" className="ed-tplcard" disabled={busy || !room} onClick={() => applyTemplate(t)}>
                  {/* 템플릿 그림은 public/heap/templates 의 정적 파일이다 (만들기 화면과 같은 그림) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.image} alt="" draggable={false} />
                  <b>{t.label}</b>
                  <small>{t.blurb}</small>
                </button>
              ))}
              <p className="note ed-tplnote">
                템플릿을 고르면 가구, 색, 방 크기가 그 템플릿으로 바뀌어요. 붙여 둔 링크와 기념품은 맞는 가구로 옮겨요. 되돌리기로 바로 돌아올 수 있어요.
              </p>
            </div>
          </div>
        )}

        {tab === "ch" && <ChannelTab owner={owner} />}

        {tab === "st" && <StatsTab roomUuid={roomUuid} />}

        {tab === "pal" && (
          <ColourPane palette={st?.palette ?? null} brand={st?.brand ?? null} backdrop={st?.backdrop ?? null} busy={busy} cmd={cmd} />
        )}
      </div>
    </>
  );
}
