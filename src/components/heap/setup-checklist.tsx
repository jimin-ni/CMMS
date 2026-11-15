"use client";

import { useEffect, useState } from "react";
import { HEAP_TEMPLATES } from "@/lib/heap/templates";

// 첫 방 열기 체크리스트 (DECISIONS A8, 판정 J4). 방 주인에게만, 방에서도 꾸미기에서도 왼쪽 카드로 보인다.
// 접으면 진행 알약이 되고, 숨기기를 누르면 이 브라우저에서는 다시 나오지 않는다 (localStorage).
// 줄은 실제 상태로 찬다: 방 이름(닉네임과 다른가), 연결한 채널 수, 가구에 달린 기능(꾸미기 중이면 저장 전 것), 저장한 레이아웃이 템플릿 그대로인가.
// 여섯 줄이 이 화면에서 모두 차면 완료 안내를 잠깐 보이고 사라진다 (판정 2026-11-14). 공유는 안내가 가리키는 다음 단계라 줄에 없다.
// 처음부터 모두 찬 방에서는 안내 없이 아무것도 그리지 않는다.
// 이 컴포넌트는 엔진이 뜬 뒤(heap:ready)에만 그려진다: 서버 렌더에 없으니 localStorage를 첫 렌더에서 읽어도 어긋나지 않는다.

export type ChecklistAction = "name" | "pc" | "keepsake" | "palette" | "channel";

type FnItem = { type?: unknown; model?: unknown; x?: unknown; z?: unknown; rot?: unknown; fn?: { kind?: unknown; links?: unknown } };

// 링크와 기념품 줄: 가구 목록에 그 기능이 달려 있는가. PC는 링크가 하나 이상 있어야 찬다.
export function setupFlags(items: unknown): { pc: boolean; keepsake: boolean } {
  const list = Array.isArray(items) ? (items as FnItem[]) : [];
  return {
    pc: list.some((it) => it?.fn?.kind === "pc" && Array.isArray(it.fn.links) && it.fn.links.length > 0),
    keepsake: list.some((it) => it?.fn?.kind === "keepsake"),
  };
}

// 가구의 자리, 기능, 팔레트로 만든 비교 문자열. 높이(y)는 엔진이 받침에 맞춰 고칠 수 있어서 보지 않는다.
// 기능도 본다: 템플릿 그대로의 가구에 링크만 달고 저장한 방도 꾸민 방이다 (kitchen-living 은 러브쑤 방에서 기능만 뺀 것이다).
function signature(layout: Record<string, unknown>): string {
  const items = Array.isArray(layout.items) ? (layout.items as FnItem[]) : [];
  return JSON.stringify({
    items: items.map((it) => [it.type, it.model ?? null, it.x, it.z, it.rot ?? 0, it.fn ?? null]),
    palette: layout.palette ?? null,
  });
}
const TEMPLATE_SIGS = new Set(HEAP_TEMPLATES.map((t) => signature(t.layout)));

const HIDE_KEY = "heap-setup-hidden:";
// 완료 안내를 보이는 시간과 사라지는 시간 (ms). 사라지는 시간은 heap-room.css 의 .setup-check.leaving 과 맞춘다.
const DONE_SHOW_MS = 4000;
const DONE_FADE_MS = 600;

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* 저장소를 못 쓰는 창: 이 화면에서만 기억한다 */
  }
}

// list: 줄을 보인다. done: 완료 안내. leaving: 안내가 사라지는 중. gone: 그리지 않는다.
type Phase = "list" | "done" | "leaving" | "gone";

export function SetupChecklist({
  roomId,
  roomUuid,
  nickname,
  channels,
  name,
  flags,
  savedLayout,
  savedThisVisit,
  onAction,
}: {
  roomId: string;
  roomUuid: string;
  nickname: string;
  channels: number;
  name: string;
  flags: { pc: boolean; keepsake: boolean };
  savedLayout: Record<string, unknown>;
  savedThisVisit: boolean;
  onAction: (action: ChecklistAction) => void;
}) {
  const [hidden, setHidden] = useState(() => readFlag(HIDE_KEY + roomUuid));
  const [open, setOpen] = useState(true);

  const url = `/room/${encodeURIComponent(roomId)}`;
  const decorated = savedThisVisit || !TEMPLATE_SIGS.has(signature(savedLayout));
  // [이름, 찼는가, 단추 이름, 누르면]  단추가 없으면 null
  const rows: [string, boolean, string | null, (() => void) | null][] = [
    ["URL 정하기", true, null, null],
    ["방 이름 짓기", name !== nickname, "하기", () => onAction("name")],
    ["채널 연결", channels > 0, "하기", () => onAction("channel")],
    ["링크 놓기", flags.pc, "하기", () => onAction("pc")],
    ["기념품 놓기", flags.keepsake, "하기", () => onAction("keepsake")],
    ["방 꾸미고 저장하기", decorated, "하기", () => onAction("palette")],
  ];
  const done = rows.filter((r) => r[1]).length;
  const allDone = done === rows.length;

  // 모두 찬 순간을 렌더 중에 알아챈다 (이전 값과 견주는 React 권장 방식). 처음부터 모두 찼으면 gone 으로 시작한다.
  // 안내 중에 줄이 다시 비면 (꾸미기에서 링크를 지우는 등) 목록으로 돌아간다.
  const [phase, setPhase] = useState<Phase>(allDone ? "gone" : "list");
  const [prevAllDone, setPrevAllDone] = useState(allDone);
  if (allDone !== prevAllDone) {
    setPrevAllDone(allDone);
    setPhase(allDone ? "done" : "list");
  }

  useEffect(() => {
    if (phase === "done") {
      const t = window.setTimeout(() => setPhase("leaving"), DONE_SHOW_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === "leaving") {
      const t = window.setTimeout(() => setPhase("gone"), DONE_FADE_MS);
      return () => window.clearTimeout(t);
    }
  }, [phase]);

  if (hidden || phase === "gone") return null;

  if (phase === "done" || phase === "leaving") {
    return (
      <section
        className={`setup-check setup-done${phase === "leaving" ? " leaving" : ""}`}
        role="status"
        aria-label="첫 방 열기 완료"
      >
        <h3>방 열기 완료</h3>
        <div className="setup-meter" aria-hidden="true">
          <i style={{ width: "100%" }} />
        </div>
        <p>첫 방 꾸미기를 모두 마쳤어요. 저장한 뒤에는 위의 ‘공유’로 방을 알릴 수 있어요.</p>
      </section>
    );
  }

  const title = `방 열기 ${done}/${rows.length}`;
  if (!open) {
    return (
      <button type="button" className="setup-pill" onClick={() => setOpen(true)} title="체크리스트 펼치기">
        {title}
        <i style={{ width: `${(done / rows.length) * 100}%` }} aria-hidden="true" />
      </button>
    );
  }
  return (
    <section className="setup-check" aria-label="첫 방 열기 체크리스트">
      <h3>
        {title}
        <button type="button" onClick={() => setOpen(false)}>
          접기
        </button>
        <button
          type="button"
          onClick={() => {
            writeFlag(HIDE_KEY + roomUuid);
            setHidden(true);
          }}
          title="이 브라우저에서는 다시 보이지 않아요"
        >
          숨기기
        </button>
      </h3>
      <div className="setup-meter" aria-hidden="true">
        <i style={{ width: `${(done / rows.length) * 100}%` }} />
      </div>
      <ol>
        {rows.map(([label, ok, act, run]) => (
          <li key={label} className={ok ? "done" : undefined}>
            <span className="setup-dot" aria-hidden="true">
              {ok ? "✓" : ""}
            </span>
            <span className="setup-label">
              {label}
              {label === "URL 정하기" && <small>{url}</small>}
            </span>
            {act && run && !ok && (
              <button type="button" onClick={run}>
                {act}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
