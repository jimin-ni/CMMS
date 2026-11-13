"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from "react";
import { saveLayoutAction } from "@/lib/heap/actions";
import { HEAP_POLICY } from "@/lib/heap/policy";
import { slotKindsFor, slotLabel, type PcLink, type SlotFn, type SlotKind } from "@/lib/heap/slots";

// 꾸미기 패널. 방 주인이 가구를 옮기고 시간대를 고른 뒤 서버에 저장한다.
// 엔진(room-engine.js)과는 방 루트 요소의 이벤트로만 이야기한다: heap:get 으로 읽고, heap:items / heap:time 으로 바꾼다.
// 평면도는 뒷벽(z = -d/2)이 위, 왼쪽 벽(x = -w/2)이 왼쪽이다. 3D 화면에서 벽이 있는 두 변이 위와 왼쪽에 온다.
// 고른 가구가 기능(item.fn)을 달 수 있으면 그 아래에 기능 칸이 나온다 (종류와 허용 가구: catalogue.json의 slots, 검사: slots.ts).

type Item = {
  type: string;
  x: number;
  z: number;
  rot?: number;
  size?: number;
  model?: string;
  tint?: boolean;
  y?: number;
  fn?: SlotFn;
};
type Model = { id: string; label: string; category: string; w?: number; d?: number; lift?: number };
type Wall = "back" | "left";
type TimeChoice = string | number;
// heap:get 이 돌려주는 값 (room-engine.js 6번 구역)
type RoomState = {
  room: { w: number; d: number };
  // DB에 저장된 layout 전체. 저장할 때 여기에 items, time, room을 덮어 쓴다.
  layout: Record<string, unknown>;
  items: Item[];
  catalogue: { models: Model[] } | null;
  table: { x: number; z: number; w: number; d: number };
  door: { wall: Wall; at: number } | null;
  window: { wall: Wall; at: number; w: number } | null;
  time: TimeChoice;
  // creator.json의 링크 목록과 링크트리 주소. PC를 처음 만들 때 채워 넣는 데 쓴다.
  creatorLinks: { title: string; url?: string; email?: string }[];
  linktree: string | null;
  // 마지막으로 저장된 상태. 처음으로 버튼이 여기로 돌아간다.
  original: { items: Item[]; time: TimeChoice };
};

// 엔진이 직접 만드는 가구의 이름과 바닥 크기(엔진 단위, 회전 전). room-engine.js 의 BUILD 치수에서 읽은 값이다.
// 화분(plant)은 item.size 를 곱한다. 모델(type: model)의 크기는 catalogue.json 의 w, d 를 쓴다.
const HAND: Record<string, { label: string; w: number; d: number }> = {
  bed: { label: "침대", w: 2.8, d: 1.4 },
  shelf: { label: "앨범 책장", w: 1.6, d: 0.5 },
  plant: { label: "화분", w: 0.7, d: 0.7 },
  snake: { label: "산세베리아", w: 0.4, d: 0.4 },
  lamp: { label: "조명", w: 0.5, d: 0.5 },
  books: { label: "책 더미", w: 0.45, d: 0.35 },
  frame: { label: "액자", w: 0.8, d: 0.12 },
};
// 벽 액자는 벽에 붙는다. 놓는 곳에서 가까운 벽으로 당기고, 높이 y는 액자의 가운데 값이다.
// 값은 policy.ts에 있다 (서버가 같은 자리만 받는다).
const FRAME_Y = HEAP_POLICY.frameY;
const FRAME_HALF = HEAP_POLICY.frameWallMargin;
const HAND_PREFIX = "hand:";
const DOOR_W = 1;

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
  { label: "화분", cats: ["plant"] },
  { label: "러그", cats: ["rug"] },
  { label: "화면", cats: ["screen"] },
  { label: "소품", cats: ["decor"] },
];
const KNOWN = GROUPS.flatMap((g) => g.cats);

const round2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const chars = (v: string) => [...v].length;
const pct = (v: number, total: number) => `${(v / total) * 100}%`;

function footprint(it: Item, models: Model[]) {
  const model = it.type === "model" ? models.find((m) => m.id === it.model) : undefined;
  const hand = HAND[it.type];
  const k = it.type === "plant" ? it.size || 1 : 1;
  const w = model?.w ?? (hand ? hand.w * k : 0.5);
  const d = model?.d ?? (hand ? hand.d * k : 0.5);
  const turned = Math.round((it.rot || 0) / 90) % 2 !== 0;
  return {
    w: turned ? d : w,
    d: turned ? w : d,
    label: model?.label ?? hand?.label ?? it.model ?? it.type,
    rug: model?.category === "rug",
  };
}

export function RoomEditor({
  rootRef,
  roomUuid,
  onClose,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  roomUuid: string;
  onClose: () => void;
}) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [time, setTime] = useState<TimeChoice>("auto");
  const [sel, setSel] = useState<number | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [group, setGroup] = useState(0);
  const [saveNote, setSaveNote] = useState("");
  const [saving, setSaving] = useState(false);
  // 기능 칸에서 글자를 칠 때는 엔진에 보내는 걸 잠깐 미룬다 (한 글자마다 가구를 다시 짓지 않게)
  const pushTimer = useRef(0);
  const pending = useRef<Item[] | null>(null);
  // 패널이 닫힐 때 아직 못 보낸 마지막 고침은 보내고 간다
  useEffect(
    () => () => {
      window.clearTimeout(pushTimer.current);
      if (pending.current) rootRef.current?.dispatchEvent(new CustomEvent("heap:items", { detail: pending.current }));
    },
    [rootRef],
  );

  // 열릴 때 지금 방에 있는 것을 엔진에서 읽어 온다.
  useEffect(() => {
    let alive = true;
    rootRef.current?.dispatchEvent(
      new CustomEvent("heap:get", {
        detail: (state: RoomState) => {
          if (!alive) return;
          setRoom(state);
          setItems(state.items);
          setTime(state.time);
        },
      }),
    );
    return () => {
      alive = false;
    };
  }, [rootRef]);

  // Esc 로 닫는다. 방명록 같은 오버레이가 떠 있으면 그쪽이 먼저 닫히도록 엔진에 맡긴다.
  // capture 단계라서 엔진이 오버레이를 닫기 전에 확인한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (rootRef.current?.querySelector(".overlay:not([hidden])")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [rootRef, onClose]);

  const send = (type: string, detail: unknown) =>
    rootRef.current?.dispatchEvent(new CustomEvent(type, { detail }));

  if (!room) {
    return (
      <aside className="room-editor panel" aria-label="방 꾸미기">
        <div className="panel-head">
          <b>꾸미기</b>
          <button className="btn ghost" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="panel-body">
          <p className="note">불러오는 중…</p>
        </div>
      </aside>
    );
  }

  const W = room.room.w;
  const D = room.room.d;
  const models = room.catalogue?.models ?? [];

  // 고친 목록은 곧바로 엔진에 보내서 3D 방이 따라오게 한다.
  const change = (next: Item[], nextSel: number | null) => {
    window.clearTimeout(pushTimer.current);
    pending.current = null;
    setItems(next);
    setSel(nextSel);
    setSaveNote("");
    send("heap:items", next);
  };
  const changeLater = (next: Item[]) => {
    setItems(next);
    setSaveNote("");
    window.clearTimeout(pushTimer.current);
    pending.current = next;
    pushTimer.current = window.setTimeout(() => {
      pending.current = null;
      send("heap:items", next);
    }, 300);
  };
  // 벽 액자: 가까운 벽에 붙이고 그 벽을 보게 돌린다 (뒷벽 0도, 왼쪽 벽 90도)
  const snapToWall = (it: Item): Item => {
    if (Math.abs(it.z + D / 2) <= Math.abs(it.x + W / 2)) {
      return { ...it, x: round2(clamp(it.x, -W / 2 + FRAME_HALF, W / 2 - FRAME_HALF)), z: round2(-D / 2), rot: 0 };
    }
    return { ...it, x: round2(-W / 2), z: round2(clamp(it.z, -D / 2 + FRAME_HALF, D / 2 - FRAME_HALF)), rot: 90 };
  };
  const placed = (it: Item): Item => (it.type === "frame" ? snapToWall(it) : inside(it));
  // 바닥 크기가 방 안에 들어오도록 가운데를 민다.
  const inside = (it: Item): Item => {
    const f = footprint(it, models);
    const lx = Math.max(0, (W - f.w) / 2);
    const lz = Math.max(0, (D - f.d) / 2);
    return { ...it, x: round2(Math.min(lx, Math.max(-lx, it.x))), z: round2(Math.min(lz, Math.max(-lz, it.z))) };
  };

  const onPlan = (e: MouseEvent<HTMLDivElement>) => {
    if (!armed && sel == null) return;
    const el = e.currentTarget;
    const box = el.getBoundingClientRect();
    // 누른 곳을 엔진 좌표로 바꾸고 0.5 단위에 맞춘다.
    const x = Math.round((((e.clientX - box.left) / box.width) * W - W / 2) * 2) / 2;
    const z = Math.round((((e.clientY - box.top) / box.height) * D - D / 2) * 2) / 2;
    if (armed) {
      const hand = armed.startsWith(HAND_PREFIX) ? armed.slice(HAND_PREFIX.length) : null;
      const lift = models.find((m) => m.id === armed)?.lift;
      const made: Item = hand
        ? { type: hand, x, z, rot: 0, y: FRAME_Y }
        : { type: "model", model: armed, x, z, rot: 0, ...(lift ? { y: lift } : {}) };
      change([...items, placed(made)], items.length);
      setArmed(null);
    } else {
      // y(가구 위에 올린 높이)와 기능(fn)을 비롯한 나머지 값은 그대로 둔다.
      change(
        items.map((it, i) => (i === sel ? placed({ ...it, x, z }) : it)),
        sel,
      );
    }
  };
  const rotate = () => {
    if (sel == null) return;
    change(
      items.map((it, i) => (i === sel && it.type !== "frame" ? inside({ ...it, rot: ((it.rot || 0) + 90) % 360 }) : it)),
      sel,
    );
  };
  const remove = () => {
    if (sel == null) return;
    change(
      items.filter((_, i) => i !== sel),
      null,
    );
  };
  const nextTime = () => {
    const next = TIMES[(TIMES.findIndex(([key]) => key === time) + 1) % TIMES.length][0];
    setTime(next);
    setSaveNote("");
    send("heap:time", next);
  };
  // 서버에는 layout 전체를 보낸다. DB의 기존 layout(창, 문, 팔레트 등)에 편집한 items, time, room만 덮어 쓴다.
  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaveNote("");
    const layout = { ...room.layout, room: { w: room.room.w, d: room.room.d }, items, time };
    try {
      const result = await saveLayoutAction(roomUuid, layout);
      if (result.ok) {
        // 엔진과 이 패널의 기준(처음으로)을 방금 저장한 상태로 옮긴다.
        send("heap:saved", layout);
        setRoom({ ...room, layout, original: { items, time } });
        setSaveNote("저장했어요.");
      } else {
        // 서버가 돌려주는 detail은 "items[26].fn.links[6]: 이메일 주소가 …" 꼴이다. 크리에이터에게는 가구 번호를 뺀 말만 보여 주고 전체는 콘솔에 남긴다.
        if ("detail" in result) console.warn("[heap-room] 저장 거절", result.detail);
        setSaveNote("detail" in result ? `${result.message} (${result.detail.replace(/^items\[\d+\][^:]*:\s*/, "")})` : result.message);
      }
    } catch {
      setSaveNote("저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };
  const reset = () => {
    window.clearTimeout(pushTimer.current);
    pending.current = null;
    setItems(room.original.items);
    setTime(room.original.time);
    setSel(null);
    setArmed(null);
    setSaveNote("");
    send("heap:items", room.original.items);
    send("heap:time", room.original.time);
  };

  const groups = GROUPS.map((g) => ({
    label: g.label,
    models: models.filter(
      (m) => g.cats.includes(m.category) || (g.cats.includes("decor") && !KNOWN.includes(m.category)),
    ),
  })).filter((g) => g.models.length > 0);
  // 엔진이 직접 만드는 벽 액자는 카탈로그에 없어서 한 묶음으로 따로 낸다.
  groups.push({ label: "액자", models: [{ id: `${HAND_PREFIX}frame`, label: "벽 액자", category: "frame" }] });
  const shown = groups[Math.min(group, groups.length - 1)];
  const selItem = sel != null ? items[sel] : undefined;
  const setFn = (fn: SlotFn | undefined) => {
    if (sel == null) return;
    changeLater(
      items.map((it, i) => {
        if (i !== sel) return it;
        const rest = { ...it };
        delete rest.fn;
        return fn ? { ...rest, fn } : rest;
      }),
    );
  };
  // PC를 처음 만들 때 채우는 링크: creator.json의 목록 + 링크트리. 칸 수와 글자 수 한도에 맞춰 자른다.
  const prefill = (): PcLink[] => {
    const links: PcLink[] = [];
    for (const L of room.creatorLinks) {
      const title = [...L.title].slice(0, HEAP_POLICY.linkTitleMaxChars).join("");
      if (L.email) links.push({ title, email: L.email });
      else if (L.url) links.push({ title, url: L.url });
    }
    if (room.linktree) links.push({ title: "Linktree", url: room.linktree });
    return links.slice(0, HEAP_POLICY.pcLinksMax);
  };
  const timeLabel = TIMES.find(([key]) => key === time)?.[1] ?? `${time}시`;

  // 벽에 붙는 표시(문, 창): 벽을 따라 at 을 가운데로 len 만큼.
  const wallMark = (wall: Wall, at: number, len: number): CSSProperties =>
    wall === "back"
      ? { left: pct(at - len / 2 + W / 2, W), width: pct(len, W) }
      : { top: pct(at - len / 2 + D / 2, D), height: pct(len, D) };

  return (
    <aside className="room-editor panel" aria-label="방 꾸미기">
      <div className="panel-head">
        <b>꾸미기</b>
        <button className="btn ghost" type="button" onClick={onClose}>
          닫기
        </button>
      </div>
      <div className="panel-body">
        <div className="ed-walls">
          <div
            className={armed ? "ed-plan arming" : "ed-plan"}
            style={{ aspectRatio: `${W} / ${D}`, backgroundSize: `${50 / W}% ${50 / D}%` }}
            onClick={onPlan}
          >
            {room.window && (
              <span
                className={`ed-mark window ${room.window.wall}`}
                style={wallMark(room.window.wall, room.window.at, room.window.w)}
              >
                창
              </span>
            )}
            {room.door && (
              <span className={`ed-mark door ${room.door.wall}`} style={wallMark(room.door.wall, room.door.at, DOOR_W)}>
                문
              </span>
            )}
            <span
              className="ed-table"
              style={{
                left: pct(room.table.x - room.table.w / 2 + W / 2, W),
                top: pct(room.table.z - room.table.d / 2 + D / 2, D),
                width: pct(room.table.w, W),
                height: pct(room.table.d, D),
              }}
            >
              사진 탁자
            </span>
            {items.map((it, i) => {
              const f = footprint(it, models);
              return (
                <button
                  key={i}
                  type="button"
                  className={`ed-item${f.rug ? " rug" : ""}${i === sel ? " sel" : ""}`}
                  style={{
                    left: pct(it.x + W / 2, W),
                    top: pct(it.z + D / 2, D),
                    width: pct(f.w, W),
                    height: pct(f.d, D),
                    zIndex: f.rug ? 1 : it.y ? 3 : 2,
                  }}
                  aria-pressed={i === sel}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSel(i === sel ? null : i);
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="row">
          <button className="btn ghost small" type="button" disabled={sel == null || selItem?.type === "frame"} onClick={rotate}>
            회전
          </button>
          <button className="btn ghost small" type="button" disabled={sel == null} onClick={remove}>
            지우기
          </button>
          <button className="btn ghost small" type="button" onClick={nextTime}>
            시간 · {timeLabel}
          </button>
        </div>
        {selItem && <FnForm item={selItem} models={models} prefill={prefill} onChange={setFn} />}

        {shown ? (
          <>
            <div className="row">
              {groups.map((g, i) => (
                <button
                  key={g.label}
                  type="button"
                  className={g === shown ? "btn small" : "btn ghost small"}
                  aria-pressed={g === shown}
                  onClick={() => setGroup(i)}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="row">
              {shown.models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="ed-pick"
                  aria-pressed={armed === m.id}
                  onClick={() => setArmed(armed === m.id ? null : m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {armed && <p className="note">놓을 곳을 눌러 주세요</p>}
          </>
        ) : (
          <p className="note">가구 목록을 불러오지 못했어요.</p>
        )}
      </div>
      <div className="ed-foot">
        <div className="row">
          <button className="btn" type="button" disabled={saving} onClick={save}>
            {saving ? "저장하는 중…" : "저장"}
          </button>
          <button className="btn ghost" type="button" onClick={reset}>
            처음으로
          </button>
        </div>
        {saveNote && (
          <p className="note" role="status">
            {saveNote}
          </p>
        )}
      </div>
    </aside>
  );
}

// 고른 가구의 기능 칸. 달 수 있는 종류가 없으면 아무것도 그리지 않는다.
function FnForm({
  item,
  models,
  prefill,
  onChange,
}: {
  item: Item;
  models: Model[];
  prefill: () => PcLink[];
  onChange: (fn: SlotFn | undefined) => void;
}) {
  const kinds = slotKindsFor(item.type, item.model);
  if (kinds.length === 0) return null;
  const fn = item.fn;
  const name = footprint(item, models).label;

  if (!fn) {
    return (
      <div className="ed-fn">
        <b>{name}에 기능 달기</b>
        <div className="row">
          {kinds.map((kind: SlotKind) => (
            <button
              key={kind}
              type="button"
              className="btn small"
              onClick={() => onChange(kind === "pc" ? { kind: "pc", links: prefill() } : { kind: "keepsake", name: "" })}
            >
              {slotLabel(kind)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ed-fn">
      <b>
        {name} · {slotLabel(fn.kind)}
      </b>
      {fn.kind === "pc" ? <PcFields fn={fn} prefill={prefill} onChange={onChange} /> : <KeepsakeFields fn={fn} onChange={onChange} />}
      <div className="row">
        <button type="button" className="btn ghost small" onClick={() => onChange(undefined)}>
          기능 빼기
        </button>
      </div>
    </div>
  );
}

// 링크 한 줄의 주소 칸: http(s)·mailto 주소는 url로, 그 밖의 글은 이메일 주소로 본다.
const addressOf = (L: PcLink) => ("url" in L ? L.url : L.email);
const linkFrom = (title: string, address: string): PcLink =>
  /^(https?:\/\/|mailto:)/i.test(address) ? { title, url: address } : { title, email: address };
const addressBad = (address: string) =>
  address.trim() !== "" && !/^(https?:\/\/\S+|mailto:\S+|[^\s@]+@[^\s@]+\.[^\s@]+)$/i.test(address.trim());

function PcFields({
  fn,
  prefill,
  onChange,
}: {
  fn: Extract<SlotFn, { kind: "pc" }>;
  prefill: () => PcLink[];
  onChange: (fn: SlotFn | undefined) => void;
}) {
  const links = fn.links;
  if (!links) {
    return (
      <>
        <p className="note">링크를 따로 정하지 않았어요. 방에 걸려 있던 기존 링크 목록이 그대로 보여요.</p>
        <div className="row">
          <button type="button" className="btn small" onClick={() => onChange({ kind: "pc", links: prefill() })}>
            링크 직접 고치기
          </button>
        </div>
      </>
    );
  }
  const set = (next: PcLink[]) => onChange({ kind: "pc", links: next });
  return (
    <>
      {links.map((L, i) => (
        <div className="ed-linkrow" key={i}>
          <input
            aria-label={`링크 ${i + 1} 제목`}
            placeholder={`제목 (${HEAP_POLICY.linkTitleMaxChars}자까지)`}
            value={L.title}
            maxLength={HEAP_POLICY.linkTitleMaxChars}
            onChange={(e) => set(links.map((o, j) => (j === i ? linkFrom(e.target.value, addressOf(o)) : o)))}
          />
          <input
            aria-label={`링크 ${i + 1} 주소`}
            placeholder="https://… 또는 이메일 주소"
            value={addressOf(L)}
            maxLength={HEAP_POLICY.linkUrlMaxChars}
            onChange={(e) => set(links.map((o, j) => (j === i ? linkFrom(o.title, e.target.value.trim()) : o)))}
          />
          {addressBad(addressOf(L)) && <span className="note ed-bad">http(s) 주소나 이메일 주소여야 해요.</span>}
          <div className="row">
            <button type="button" className="btn ghost small" onClick={() => set(links.filter((_, j) => j !== i))}>
              줄 지우기
            </button>
          </div>
        </div>
      ))}
      <div className="row">
        <button
          type="button"
          className="btn small"
          disabled={links.length >= HEAP_POLICY.pcLinksMax}
          onClick={() => set([...links, { title: "", url: "" }])}
        >
          링크 추가 ({links.length}/{HEAP_POLICY.pcLinksMax})
        </button>
        <button type="button" className="btn ghost small" onClick={() => onChange({ kind: "pc" })}>
          기존 링크 목록으로
        </button>
      </div>
    </>
  );
}

function KeepsakeFields({
  fn,
  onChange,
}: {
  fn: Extract<SlotFn, { kind: "keepsake" }>;
  onChange: (fn: SlotFn | undefined) => void;
}) {
  // 비운 칸은 값에서 뺀다 (서버는 빈 글자를 받지 않는다). 이름만 비어도 남겨 두고, 저장할 때 서버가 알려 준다.
  const set = (field: "name" | "date" | "caption" | "link", value: string) => {
    const next: Extract<SlotFn, { kind: "keepsake" }> = { ...fn, [field]: value };
    if (field !== "name" && value === "") delete next[field];
    onChange(next);
  };
  return (
    <>
      <label className="ed-field">
        <span>이름 (꼭 필요해요, {HEAP_POLICY.keepsakeNameMaxChars}자까지)</span>
        <input value={fn.name} maxLength={HEAP_POLICY.keepsakeNameMaxChars} onChange={(e) => set("name", e.target.value)} />
      </label>
      {chars(fn.name) === 0 && <span className="note ed-bad">이름을 적어야 저장할 수 있어요.</span>}
      <label className="ed-field">
        <span>날짜</span>
        <input type="date" value={fn.date ?? ""} onChange={(e) => set("date", e.target.value)} />
      </label>
      <label className="ed-field">
        <span>설명 ({HEAP_POLICY.keepsakeCaptionMaxChars}자까지)</span>
        <textarea value={fn.caption ?? ""} maxLength={HEAP_POLICY.keepsakeCaptionMaxChars} onChange={(e) => set("caption", e.target.value)} />
      </label>
      <label className="ed-field">
        <span>링크 (http(s) 주소. 유튜브 게시물이면 썸네일이 나와요)</span>
        <input
          value={fn.link ?? ""}
          maxLength={HEAP_POLICY.linkUrlMaxChars}
          placeholder="https://…"
          onChange={(e) => set("link", e.target.value.trim())}
        />
      </label>
      {fn.link && !/^https?:\/\/\S+$/i.test(fn.link) && <span className="note ed-bad">http(s) 주소여야 해요.</span>}
    </>
  );
}
