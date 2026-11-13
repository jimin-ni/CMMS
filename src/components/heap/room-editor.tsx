"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { saveLayoutAction } from "@/lib/heap/actions";
import { HEAP_POLICY } from "@/lib/heap/policy";
import { checkFn, slotKindsFor, type PcLink, type SlotFn, type SlotKind } from "@/lib/heap/slots";
import { FnForm, canCarryFn, isLamp, itemLabel, newFn, type Item, type Model } from "./fn-form";
import { PRESETS, WELLS, effectivePalette, samePalette, swatches, wellValue, withWell, type Palette, type Well } from "./palettes";

// 꾸미기 화면. 방 주인이 방 안에서 가구를 놓고 옮긴 뒤 저장한다 (design/editor.md, B1~B6).
// 가구를 집고 끌고 돌리는 일, 팔레트, 모양 바꾸기, 되돌리기 기록은 엔진(engine/edit.js)이 한다. 이 컴포넌트는 그 위의 단추들이다:
// 위 막대(되돌리기, 시간, 위에서 보기, 맞추기, 저장, 나가기), 아래 독(가구 · 기능 · 색·무늬 탭), 고른 가구 위의 막대, 가구 아래의 기능 말풍선, 기능 표, 알림.
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
  look: string;
  mount: number;
  // 방금 내려놓은 새 가구. 기능을 달 수 있으면 말풍선을 연다.
  placed: { index: number; seq: number } | null;
  // 팔레트를 칠하느라 방을 다시 띄우는 중
  busy: boolean;
  // 카메라 (engine/edit-camera.js): plan 은 위에서 보기, fitted 는 확대나 이동 없이 맞춘 구도인지
  view: { plan: boolean; fitted: boolean };
};

// 책상 위에 얹는 달력의 높이 (노트북, 모니터와 같은 책상 높이)
const CALENDAR_Y = 0.77;
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
const groupOf = (m: Model) => GROUPS.find((g) => g.cats.includes(m.category)) ?? (m.category === "frame" || m.category === "calendar" ? null : GROUPS[10]);
// 엔진이 직접 만드는 벽 액자와 책상 달력은 카탈로그에 없어서 한 묶음으로 따로 낸다. 그림은 없고 이름만 보인다.
const HAND_MODELS: Model[] = [
  { id: `${HAND_PREFIX}frame`, label: "벽 액자", category: "frame" },
  { id: `${HAND_PREFIX}calendar`, label: "탁상 달력", category: "calendar" },
];
const HAND_GROUP = "액자·달력";

// 다섯 기능: 독의 기능 탭 순서, 짧은 이름, 칸의 표시, 기본 모양 (붙일 가구가 없을 때 커서에 올린다)
const FN_ORDER: SlotKind[] = ["music", "latest", "pc", "keepsake", "calendar"];
const FN_NAME: Record<SlotKind, string> = { music: "음악", latest: "최신 영상", pc: "PC 링크", keepsake: "기념품", calendar: "달력" };
const FN_GLYPH: Record<SlotKind, string> = { music: "♪", latest: "▶", pc: "↗", keepsake: "★", calendar: "▦" };
const FN_DEFAULT: Record<SlotKind, string> = { music: "radio", latest: "televisionModern", pc: "laptop", keepsake: `${HAND_PREFIX}frame`, calendar: `${HAND_PREFIX}calendar` };

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
  const want = ids.filter((id) => !id.startsWith(HAND_PREFIX)).join(",");
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

// 직접 고르는 색 한 칸. 고르는 동안은 칸만 바뀌고, 고르기를 마치면(change) 방에 칠한다.
function ColorWell({ label, value, onCommit, disabled }: { label: string; value: string; onCommit: (v: string) => void; disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = () => onCommit(el.value);
    el.addEventListener("change", h);
    return () => el.removeEventListener("change", h);
  }, [onCommit]);
  return (
    <label className="ed-well">
      <span>{label}</span>
      <input ref={ref} type="color" value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} aria-label={`${label} 색`} />
    </label>
  );
}

export function RoomEditor({
  rootRef,
  roomUuid,
  roomName,
  onClose,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  roomUuid: string;
  roomName: string;
  onClose: () => void;
}) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [st, setSt] = useState<EditState | null>(null);
  const [tab, setTab] = useState<"furn" | "fn" | "pal">("furn");
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [cat, setCat] = useState<string>(() => (readRecent().length ? "recent" : GROUPS[0].label));
  const [query, setQuery] = useState("");
  const [armedId, setArmedId] = useState<string | null>(null);
  // 열린 기능 말풍선 (가구 번호). 고른 가구가 바뀌면 닫힌다.
  const [bubbleFor, setBubbleFor] = useState<number | null>(null);
  // 올바르지 않아 아직 저장하지 않은 기능 값. base 는 그때의 가구 기능이다: 되돌리기 등으로 가구 쪽이 바뀌면 이 값은 버린다.
  const [draft, setDraft] = useState<{ index: number; fn: SlotFn; base: string; error: string } | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
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
  const shownNotice = st?.notice && st.notice.seq !== goneSeq ? st.notice : null;

  const models = room?.catalogue?.models ?? [];
  // 독에 내놓는 모델: 벽·천장에 거는 것과 벽 조각(catalogue.json 의 mount)은 아직 놓을 수 없어 뺀다.
  // 이미 방에 놓인 것은 그대로 그려지고 고르고 옮기고 넣을 수 있다 (이름은 models 전체에서 찾는다).
  const placeable = models.filter((m) => !m.mount);
  const items = st?.items ?? [];
  const sel = st?.sel ?? null;
  const selItem = sel != null ? items[sel] : undefined;
  const busy = !!st?.busy;
  const bubbleOpen = bubbleFor != null && bubbleFor === sel && !!selItem && !st?.moving && !busy && canCarryFn(selItem);
  // 고른 가구가 바뀌면 모양 바꾸기 목록도 닫는다 (렌더 중에 앞의 값과 견준다)
  const [swapSel, setSwapSel] = useState<number | null>(null);
  if (swapSel !== sel) {
    setSwapSel(sel);
    setSwapOpen(false);
  }

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
      if ("error" in r) setDraft({ index, fn, base: fnKey(item.fn), error: r.error.replace(/^fn[^:]*:\s*/, "") });
      else {
        cmd({ op: "fn", index, fn: r.fn });
        setDraft(null);
      }
    },
    [cmd],
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

  // 서버에는 layout 전체를 보낸다. DB의 기존 layout(창, 문 등)에 편집한 items, time, room, palette만 덮어 쓴다.
  const save = useCallback(async (): Promise<boolean> => {
    if (saving || !room || !st || st.busy) return false;
    setSaving(true);
    setSaveNote("");
    const layout: Record<string, unknown> = { ...room.layout, room: { w: room.room.w, d: room.room.d }, items: st.items, time: st.time };
    if (st.palette) layout.palette = st.palette;
    else delete layout.palette;
    try {
      const result = await saveLayoutAction(roomUuid, layout);
      if (!alive.current) return false;
      if (result.ok) {
        // 엔진의 기준(버리고 나가기의 목표)을 방금 저장한 상태로 옮긴다. 엔진은 다른 방의 roomUuid 면 버린다.
        send("heap:saved", { roomUuid, layout });
        setRoom({ ...room, layout });
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
  }, [saving, room, st, roomUuid, send]);

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
  const arm = (m: Model, fn?: SlotFn) => {
    if (armedId === m.id && !fn) {
      cmd({ op: "cancel" });
      setArmedId(null);
      return;
    }
    const hand = m.id.startsWith(HAND_PREFIX) ? m.id.slice(HAND_PREFIX.length) : null;
    const template: Item = hand
      ? hand === "calendar"
        ? { type: hand, x: 0, z: 0, rot: 0, y: CALENDAR_Y, fn: { kind: "calendar", entries: [] } }
        : { type: hand, x: 0, z: 0, rot: 0, y: HEAP_POLICY.frameY }
      : { type: "model", model: m.id, x: 0, z: 0, rot: 0, ...(m.lift ? { y: m.lift } : {}), ...(fn ? { fn } : {}) };
    setArmedId(m.id);
    setBubbleFor(null);
    setDraft(null);
    const next = [m.id, ...recent.filter((id) => id !== m.id)].slice(0, RECENT_MAX);
    setRecent(next);
    writeRecent(next);
    cmd({ op: "arm", template });
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
    const list = placeable.filter((m) => m.id !== selItem.model && fits(slotKindsFor("model", m.id)));
    if (selItem.type !== "shelf" && fits(slotKindsFor("shelf"))) list.push({ id: `${HAND_PREFIX}shelf`, label: "앨범 책장", category: "shelf" });
    return list;
  })();

  const look = st?.look ?? "";
  const thumbIds = [
    ...(tab === "furn" ? shownModels.map((m) => m.id) : []),
    ...(swapOpen ? swapChoices.map((m) => m.id) : []),
  ];
  const thumb = useThumbs(rootRef, look, st?.mount ?? 0, thumbIds);

  // ---------- 팔레트 ----------
  const pal = effectivePalette(st?.palette);
  const activePreset = PRESETS.find((p) => samePalette(p.palette, pal))?.id ?? null;
  const applyPalette = (p: Palette) => {
    if (samePalette(p, pal)) return;
    cmd({ op: "palette", palette: p });
  };
  const commitWell = (key: Well) => (v: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(v)) applyPalette(effectivePalette(withWell(pal, key, v)));
  };

  const time = st?.time ?? "auto";
  const timeLabel = TIMES.find(([key]) => key === time)?.[1] ?? `${time}시`;
  const nextTime = () => cmd({ op: "time", value: TIMES[(TIMES.findIndex(([key]) => key === time) + 1) % TIMES.length][0] });
  const saveState = busy
    ? "색을 칠하는 중…"
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
      ? "끌어서 옮기기 · R 돌리기 · Del 넣기 · Ctrl+D 복제 · Esc 고르기 취소"
      : "가구를 눌러 고르고 끌어서 옮겨요 · 휠 확대 · 오른쪽 끌기 이동 · T 위에서 보기 · 0 맞추기";

  // 말풍선에 보이는 기능: 들고 있는 값(올바르지 않은 것)이 있으면 그것, 아니면 가구에 달린 것
  const liveDraft = draft && bubbleOpen && draft.index === sel && selItem && draft.base === fnKey(selItem.fn) ? draft : null;
  const shownItem: Item | undefined = selItem && (liveDraft ? { ...selItem, fn: liveDraft.fn } : selItem);
  const selKinds = selItem ? slotKindsFor(selItem.type, selItem.model) : [];
  const closeBubble = () => {
    setBubbleFor(null);
    setDraft(null);
  };

  return (
    <>
      <div className="ed-top" role="toolbar" aria-label="꾸미기">
        <b>꾸미기</b>
        <span className="ed-room">{roomName}</span>
        <button className="btn ghost small" type="button" disabled={!st?.canUndo || busy} onClick={() => cmd({ op: "undo" })} title="Ctrl+Z">
          되돌리기
        </button>
        <button className="btn ghost small" type="button" disabled={!st?.canRedo || busy} onClick={() => cmd({ op: "redo" })} title="Ctrl+Shift+Z">
          다시 하기
        </button>
        <button className="btn ghost small" type="button" disabled={busy} onClick={nextTime}>
          시간 · {timeLabel}
        </button>
        <button className="btn ghost small" type="button" disabled={!st?.dirty || busy} onClick={() => cmd({ op: "reset" })} title="마지막으로 저장한 모습으로">
          처음으로
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
          {selItem.type !== "frame" && (
            <button type="button" onClick={() => cmd({ op: "rotate", dir: 1 })} title="R">
              회전
            </button>
          )}
          <button type="button" onClick={() => cmd({ op: "copy" })} title="Ctrl+D">
            복제
          </button>
          {isLamp(selItem, models) && (
            <button type="button" aria-pressed={selItem.lit !== false} onClick={() => cmd({ op: "lit" })} title="꺼 둔 조명은 밤에도 꺼져 있어요">
              {selItem.lit === false ? "불 켜기" : "불 끄기"}
            </button>
          )}
          {selKinds.length > 0 && (
            <button type="button" className="fn" aria-pressed={bubbleOpen} onClick={() => (bubbleOpen ? closeBubble() : setBubbleFor(sel))}>
              기능
            </button>
          )}
          {swapChoices.length > 0 && (
            <button type="button" aria-expanded={swapOpen} onClick={() => setSwapOpen(!swapOpen)}>
              모양 바꾸기
            </button>
          )}
          <button type="button" onClick={() => cmd({ op: "remove" })} title="Del">
            넣기
          </button>
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
      {!bubbleOpen && <p className="ed-hint">{hint}</p>}
      {shownNotice && (
        <div className="ed-toast" role="status">
          <span>{shownNotice.text}</span>
          {shownNotice.undo && (
            <button
              type="button"
              onClick={() => {
                cmd({ op: "undo" });
                setGoneSeq(shownNotice.seq);
              }}
            >
              되돌리기
            </button>
          )}
        </div>
      )}

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
          <FnForm key={sel} item={shownItem} models={models} prefill={prefill} onChange={(fn) => applyFn(sel, selItem, fn)} />
          {liveDraft ? (
            <p className="note ed-bad">아직 붙지 않았어요 · {liveDraft.error} 올바르게 적으면 바로 붙어요.</p>
          ) : (
            selItem.fn && <p className="note ed-ok">붙어 있어요. 저장하면 팔로워에게 보여요.</p>
          )}
        </div>
      )}

      {busy && <p className="ed-busy" role="status">색을 칠하는 중…</p>}

      <div className="ed-dock">
        <div className="ed-tabs" role="tablist" aria-label="꾸미기 독">
          {(
            [
              ["furn", "가구"],
              ["fn", "기능"],
              ["pal", "색·무늬"],
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
                shownModels.map((m) => <Tile key={m.id} m={m} pic={thumb(m.id)} pressed={armedId === m.id} disabled={busy} onPick={() => arm(m)} />)
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
                const act = () => {
                  if (have.length) openBubble(have[0], items[have[0]]);
                  else if (can >= 0) openBubble(can, items[can], k);
                  else if (dflt) {
                    pendingKind.current = k === "latest" || k === "calendar" ? null : k;
                    arm(dflt, k === "latest" ? { kind: "latest" } : undefined);
                  }
                };
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

        {tab === "pal" && (
          <div className="ed-pane">
            <div className="ed-strip">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="ed-palcard"
                  aria-pressed={activePreset === p.id}
                  disabled={busy}
                  onClick={() => applyPalette(p.palette)}
                >
                  <span className="ed-sw" aria-hidden="true">
                    {swatches(p.palette).map((c, i) => (
                      <i key={i} style={{ background: c }} />
                    ))}
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
            <div className="ed-wells" aria-label="직접 고르기">
              <span className="ed-wells-h">직접</span>
              {WELLS.map((w) => (
                <ColorWell
                  key={`${w.key}:${wellValue(pal, w.key)}`}
                  label={w.label}
                  value={wellValue(pal, w.key)}
                  disabled={busy}
                  onCommit={commitWell(w.key)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
