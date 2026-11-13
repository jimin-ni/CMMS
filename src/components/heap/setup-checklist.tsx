"use client";

import { useState } from "react";
import { HEAP_TEMPLATES } from "@/lib/heap/templates";

// 첫 방 열기 체크리스트 (DECISIONS A8, 판정 J4). 방 주인에게만, 방에서도 꾸미기에서도 왼쪽 카드로 보인다.
// 일곱 줄이 모두 차면 사라지고, 접으면 진행 알약이 되고, 숨기기를 누르면 이 브라우저에서는 다시 나오지 않는다 (localStorage).
// 줄은 실제 상태로 찬다: 방 이름(닉네임과 다른가), 연결한 채널 수, 가구에 달린 기능(꾸미기 중이면 저장 전 것), 저장한 레이아웃이 템플릿 그대로인가.
// 링크 공유하기만 이 브라우저의 기록(주소를 복사했는지)으로 찬다.
// 이 컴포넌트는 엔진이 뜬 뒤(heap:ready)에만 그려진다: 서버 렌더에 없으니 localStorage를 첫 렌더에서 읽어도 어긋나지 않는다.

export type ChecklistAction = "name" | "pc" | "keepsake" | "palette";

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
const SHARE_KEY = "heap-setup-shared:";
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
  const [shared, setShared] = useState(() => readFlag(SHARE_KEY + roomUuid));
  const [open, setOpen] = useState(true);
  const [note, setNote] = useState("");

  const url = `/room/${encodeURIComponent(roomId)}`;
  const share = async () => {
    const full = `${window.location.origin}${url}`;
    try {
      await navigator.clipboard.writeText(full);
      writeFlag(SHARE_KEY + roomUuid);
      setShared(true);
      setNote("방 주소를 복사했어요");
    } catch {
      setNote(`복사하지 못했어요 · ${full}`);
    }
  };

  const decorated = savedThisVisit || !TEMPLATE_SIGS.has(signature(savedLayout));
  // [이름, 찼는가, 단추 이름, 누르면]  단추가 없으면 null
  const rows: [string, boolean, string | null, (() => void) | null][] = [
    ["URL 정하기", true, null, null],
    ["방 이름 짓기", name !== nickname, "하기", () => onAction("name")],
    ["채널 연결", channels > 0, null, null],
    ["링크 놓기", flags.pc, "하기", () => onAction("pc")],
    ["기념품 놓기", flags.keepsake, "하기", () => onAction("keepsake")],
    ["방 꾸미고 저장하기", decorated, "하기", () => onAction("palette")],
    ["링크 공유하기", shared, "복사", () => void share()],
  ];
  const done = rows.filter((r) => r[1]).length;
  if (hidden || done === rows.length) return null;

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
            {label === "채널 연결" && !ok && <small className="setup-soon" title="채널 연결 화면은 다음 단계에서 열려요">준비 중</small>}
            {/* 링크 공유하기는 찬 뒤에도 다시 복사할 수 있다 */}
            {act && run && (!ok || label === "링크 공유하기") && (
              <button type="button" onClick={run}>
                {act}
              </button>
            )}
          </li>
        ))}
      </ol>
      {note && (
        <p className="setup-note" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
