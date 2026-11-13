"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { saveLayoutAction } from "@/lib/heap/actions";
import { HEAP_POLICY } from "@/lib/heap/policy";
import type { PcLink, SlotFn } from "@/lib/heap/slots";
import { FnForm, hasFnSheet, isLamp, itemLabel, type Item, type Model } from "./fn-form";

// 꾸미기 화면. 방 주인이 방 안에서 가구를 놓고 옮긴 뒤 저장한다 (design/editor.md, B1·B2).
// 가구를 집고 끌고 돌리는 일과 되돌리기 기록은 엔진(engine/edit.js)이 한다. 이 컴포넌트는 그 위의 단추들이다:
// 위 막대(되돌리기, 시간, 저장, 나가기), 아래의 가구 목록, 고른 가구 위의 막대, 알림, 기능 시트.
// 엔진과는 방 루트 요소의 이벤트로만 이야기한다: heap:get 으로 한 번 읽고, heap:editcmd 로 시키고, heap:editstate 로 듣는다.

type TimeChoice = string | number;
// heap:get 이 돌려주는 값 중 여기서 쓰는 것 (engine/editor-bridge.js)
type RoomState = {
  room: { w: number; d: number };
  // DB에 저장된 layout 전체. 저장할 때 여기에 items, time, room을 덮어 쓴다.
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
};

// 책상 위에 얹는 달력의 높이 (노트북, 모니터와 같은 책상 높이)
const CALENDAR_Y = 0.77;
const HAND_PREFIX = "hand:";

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

const NOTICE_MS = 6000;

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
  const [group, setGroup] = useState(0);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [goneSeq, setGoneSeq] = useState(0);

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
  const items = st?.items ?? [];
  const sel = st?.sel ?? null;
  const selItem = sel != null ? items[sel] : undefined;
  const sheetOpen = sheetFor != null && sheetFor === sel && !!selItem && !st?.moving;

  // 서버에는 layout 전체를 보낸다. DB의 기존 layout(창, 문, 팔레트 등)에 편집한 items, time, room만 덮어 쓴다.
  const save = useCallback(async (): Promise<boolean> => {
    if (saving || !room || !st) return false;
    setSaving(true);
    setSaveNote("");
    const layout = { ...room.layout, room: { w: room.room.w, d: room.room.d }, items: st.items, time: st.time };
    try {
      const result = await saveLayoutAction(roomUuid, layout);
      if (result.ok) {
        // 엔진의 기준(버리고 나가기의 목표)을 방금 저장한 상태로 옮긴다.
        send("heap:saved", layout);
        setRoom({ ...room, layout });
        setSaveNote("저장했어요");
        return true;
      }
      // 서버가 돌려주는 detail은 "items[26].fn.links[6]: 이메일 주소가 …" 꼴이다. 크리에이터에게는 가구 번호를 뺀 말만 보여 주고 전체는 콘솔에 남긴다.
      if ("detail" in result) console.warn("[heap-room] 저장 거절", result.detail);
      setSaveNote("detail" in result ? `${result.message} (${result.detail.replace(/^items\[\d+\][^:]*:\s*/, "")})` : result.message);
    } catch {
      setSaveNote("저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
    return false;
  }, [saving, room, st, roomUuid, send]);

  // Ctrl+S 는 저장. 브라우저의 페이지 저장은 막는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        // 기능 양식에 입력하는 중에는 저장하지 않는다 (덜 쓴 링크가 서버로 가서 실패한다)
        const t = e.target as HTMLElement | null;
        if (t && (t.closest("input, textarea, select, [contenteditable]"))) return;
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

  const arm = (m: Model) => {
    if (armedId === m.id) {
      cmd({ op: "cancel" });
      setArmedId(null);
      return;
    }
    const hand = m.id.startsWith(HAND_PREFIX) ? m.id.slice(HAND_PREFIX.length) : null;
    const template: Item = hand
      ? hand === "calendar"
        ? { type: hand, x: 0, z: 0, rot: 0, y: CALENDAR_Y, fn: { kind: "calendar", entries: [] } }
        : { type: hand, x: 0, z: 0, rot: 0, y: HEAP_POLICY.frameY }
      : { type: "model", model: m.id, x: 0, z: 0, rot: 0, ...(m.lift ? { y: m.lift } : {}) };
    setArmedId(m.id);
    setSheetFor(null);
    cmd({ op: "arm", template });
  };

  // PC를 처음 만들 때 채우는 링크: creator.json의 목록 + 링크트리. 칸 수와 글자 수 한도에 맞춰 자른다.
  const prefill = (): PcLink[] => {
    const links: PcLink[] = [];
    for (const L of room?.creatorLinks ?? []) {
      const title = [...L.title].slice(0, HEAP_POLICY.linkTitleMaxChars).join("");
      if (L.email) links.push({ title, email: L.email });
      else if (L.url) links.push({ title, url: L.url });
    }
    if (room?.linktree) links.push({ title: "Linktree", url: room.linktree });
    return links.slice(0, HEAP_POLICY.pcLinksMax);
  };

  const groups = GROUPS.map((g) => ({
    label: g.label,
    models: models.filter((m) => g.cats.includes(m.category) || (g.cats.includes("decor") && !KNOWN.includes(m.category))),
  })).filter((g) => g.models.length > 0);
  // 엔진이 직접 만드는 벽 액자와 책상 달력은 카탈로그에 없어서 한 묶음으로 따로 낸다.
  groups.push({
    label: "액자·달력",
    models: [
      { id: `${HAND_PREFIX}frame`, label: "벽 액자", category: "frame" },
      { id: `${HAND_PREFIX}calendar`, label: "탁상 달력", category: "calendar" },
    ],
  });
  const shown = groups[Math.min(group, groups.length - 1)];

  const time = st?.time ?? "auto";
  const timeLabel = TIMES.find(([key]) => key === time)?.[1] ?? `${time}시`;
  const nextTime = () => cmd({ op: "time", value: TIMES[(TIMES.findIndex(([key]) => key === time) + 1) % TIMES.length][0] });
  const saveState = saving ? "저장하는 중…" : saveNote ? saveNote : st?.dirty ? "저장 안 된 변경이 있어요" : "저장됨";

  const hint = st?.moving
    ? st.moving.isNew
      ? "눌러서 놓기 · Shift+클릭 계속 놓기 · R 돌리기 · Alt 스냅 끄기 · Esc 취소"
      : "놓을 곳에서 떼기 · R 돌리기 · Alt 스냅 끄기 · 아래 목록에 놓으면 넣기"
    : selItem
      ? "끌어서 옮기기 · R 돌리기 · Del 넣기 · Ctrl+D 복제 · Esc 고르기 취소"
      : "가구를 눌러 고르고 끌어서 옮겨요 · 아래 목록에서 새 가구를 꺼내요";

  return (
    <>
      <div className="ed-top" role="toolbar" aria-label="꾸미기">
        <b>꾸미기</b>
        <span className="ed-room">{roomName}</span>
        <button className="btn ghost small" type="button" disabled={!st?.canUndo} onClick={() => cmd({ op: "undo" })} title="Ctrl+Z">
          되돌리기
        </button>
        <button className="btn ghost small" type="button" disabled={!st?.canRedo} onClick={() => cmd({ op: "redo" })} title="Ctrl+Shift+Z">
          다시 하기
        </button>
        <button className="btn ghost small" type="button" onClick={nextTime}>
          시간 · {timeLabel}
        </button>
        <button className="btn ghost small" type="button" disabled={!st?.dirty} onClick={() => cmd({ op: "reset" })} title="마지막으로 저장한 모습으로">
          처음으로
        </button>
        <span className="ed-sp" />
        <span className={st?.dirty && !saveNote ? "ed-save dirty" : "ed-save"} role="status">
          {saveState}
        </span>
        <button className="btn small" type="button" disabled={saving || !st?.dirty} onClick={() => void save()} title="Ctrl+S">
          저장
        </button>
        <button className="btn ghost small" type="button" onClick={leave}>
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

      {selItem && !st?.moving && (
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
          <button type="button" onClick={() => cmd({ op: "remove" })} title="Del">
            넣기
          </button>
          {hasFnSheet(selItem, models) && (
            <button type="button" className="fn" aria-pressed={sheetOpen} onClick={() => setSheetFor(sheetOpen ? null : sel)}>
              기능
            </button>
          )}
        </div>
      )}
      <div id="ed-why" className="ed-why" hidden />
      {!sheetOpen && <p className="ed-hint">{hint}</p>}
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

      {sheetOpen && selItem && sel != null && (
        <aside
          className="ed-sheet panel"
          aria-label={`${itemLabel(selItem, models)} 기능`}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSheetFor(null);
          }}
        >
          <div className="panel-head">
            <b>{itemLabel(selItem, models)} · 기능</b>
            <button className="btn ghost small" type="button" onClick={() => setSheetFor(null)}>
              닫기
            </button>
          </div>
          <div className="panel-body">
            {isLamp(selItem, models) && (
              <div className="ed-fn">
                <b>스위치</b>
                <div className="row">
                  <button type="button" className="btn small" aria-pressed={selItem.lit !== false} onClick={() => cmd({ op: "lit" })}>
                    {selItem.lit === false ? "꺼짐 · 눌러서 켜기" : "켜짐 · 눌러서 끄기"}
                  </button>
                </div>
                <p className="note">켜 둔 조명은 저녁부터 아침까지 불이 들어와요. 꺼 둔 조명은 밤에도 꺼져 있어요.</p>
              </div>
            )}
            <FnForm
              key={sel}
              item={selItem}
              models={models}
              prefill={prefill}
              onChange={(fn: SlotFn | undefined) => cmd({ op: "fn", index: sel, fn })}
            />
          </div>
        </aside>
      )}

      <div className="ed-dock">
        <div className="ed-tabs" role="tablist" aria-label="가구 종류">
          {groups.map((g, i) => (
            <button
              key={g.label}
              type="button"
              role="tab"
              className="ed-tab"
              aria-selected={g === shown}
              onClick={() => setGroup(i)}
            >
              {g.label}
            </button>
          ))}
          <span className="ed-credit">
            가구 {items.length}개 · 모델 Kenney (CC0)
          </span>
        </div>
        <div className="ed-strip">
          {room ? (
            shown.models.map((m) => (
              <button key={m.id} type="button" className="ed-tile" aria-pressed={armedId === m.id} onClick={() => arm(m)}>
                {m.label}
              </button>
            ))
          ) : (
            <p className="note">불러오는 중…</p>
          )}
          {room && !room.catalogue && <p className="note">가구 목록을 불러오지 못했어요.</p>}
        </div>
      </div>
    </>
  );
}
