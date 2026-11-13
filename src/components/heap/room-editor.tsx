"use client";

import { useEffect, useState, type CSSProperties, type MouseEvent, type RefObject } from "react";
import { saveLayoutAction } from "@/lib/heap/actions";

// 꾸미기 패널. 방 주인이 가구를 옮기고 시간대를 고른 뒤 서버에 저장한다.
// 엔진(room-engine.js)과는 방 루트 요소의 이벤트로만 이야기한다: heap:get 으로 읽고, heap:items / heap:time 으로 바꾼다.
// 평면도는 뒷벽(z = -d/2)이 위, 왼쪽 벽(x = -w/2)이 왼쪽이다. 3D 화면에서 벽이 있는 두 변이 위와 왼쪽에 온다.

type Item = {
  type: string;
  x: number;
  z: number;
  rot?: number;
  size?: number;
  model?: string;
  tint?: boolean;
  y?: number;
};
type Model = { id: string; label: string; category: string; w?: number; d?: number };
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
};
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
    setItems(next);
    setSel(nextSel);
    setSaveNote("");
    send("heap:items", next);
  };
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
      change([...items, inside({ type: "model", model: armed, x, z, rot: 0 })], items.length);
      setArmed(null);
    } else {
      // y(가구 위에 올린 높이)를 비롯한 나머지 값은 그대로 둔다.
      change(
        items.map((it, i) => (i === sel ? inside({ ...it, x, z }) : it)),
        sel,
      );
    }
  };
  const rotate = () => {
    if (sel == null) return;
    change(
      items.map((it, i) => (i === sel ? inside({ ...it, rot: ((it.rot || 0) + 90) % 360 }) : it)),
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
        setSaveNote("detail" in result ? `${result.message} (${result.detail})` : result.message);
      }
    } catch {
      setSaveNote("저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };
  const reset = () => {
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
  const shown = groups[Math.min(group, groups.length - 1)];
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
          <button className="btn ghost small" type="button" disabled={sel == null} onClick={rotate}>
            회전
          </button>
          <button className="btn ghost small" type="button" disabled={sel == null} onClick={remove}>
            지우기
          </button>
          <button className="btn ghost small" type="button" onClick={nextTime}>
            시간 · {timeLabel}
          </button>
        </div>

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
