"use client";

// 설정(/settings)과 마이페이지(/mypage)의 틀: 기울어진 필름 판 위에 종이를 집게로 집어 둔 모습 (Figma "6차").
// 배경은 세 겹 그림이다 (public/settings/film, paper, clip). 글은 종이 위 919 × 1098 칸 안에 들어가고,
// 넘치면 스크롤한다 (스크롤바는 숨긴다). 종이 바깥을 누르거나 Esc 를 누르면 홈(/home)으로 간다.
// 단추 규칙: 흰 바탕은 고르지 않은 것, 갈색 바탕(.on)은 지금 상태다.
import "./clipboard.css";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const HOME_HREF = "/home";

// onClose: 있으면 방 위에 띄운 것이다 (room-tour.tsx). 배경을 비워 방이 보이게 하고, 닫을 때 이것을 부른다.
//   방 엔진은 window 에서 키를 받으므로(이동, Esc) 띄워 둔 동안은 키를 먼저 잡아 엔진에 넘기지 않는다.
//   안의 링크를 누르면 그 주소로 가면서 닫는다.
// 없으면 /settings, /mypage 주소로 바로 들어온 것이다. 닫으면 홈으로 간다.
export function Clipboard({
  title,
  closeLabel,
  className = "",
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  className?: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const overlay = onClose !== undefined;
  const close = useCallback(() => (onClose ? onClose() : router.push(HOME_HREF)), [onClose, router]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (overlay) e.stopPropagation();
    };
    // capture: 엔진의 window keydown 보다 먼저 받는다
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [close, overlay]);

  return (
    <div
      className={`cb-root${overlay ? " cb-overlay" : ""} ${className}`}
      role={overlay ? "dialog" : undefined}
      aria-modal={overlay || undefined}
      aria-label={overlay ? title : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
        else if (overlay && (e.target as HTMLElement).closest("a")) onClose();
      }}
    >
      <div className="cb-stage">
        {/* eslint-disable-next-line @next/next/no-img-element -- 겹쳐 놓는 장식 그림. 크기는 CSS 가 정한다 */}
        <img className="cb-layer cb-film" src="/settings/film.webp" alt="" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="cb-layer cb-paper" src="/settings/paper.webp" alt="" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="cb-layer cb-clip" src="/settings/clip.webp" alt="" draggable={false} />
        <section className="cb-scroll" aria-label={title}>
          <div className="cb-body">
            <h1 className="cb-title">{title}</h1>
            {children}
          </div>
        </section>
        <button type="button" className="cb-close" onClick={close}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}

// 칸 제목과 그 아래 선. brown: 결제 내역처럼 갈색 선
export function Section({ head, brown = false, children }: { head: string; brown?: boolean; children: ReactNode }) {
  return (
    <section className="cb-section">
      <h2 className={`cb-head${brown ? " brown" : ""}`}>{head}</h2>
      {children}
    </section>
  );
}

// 픽셀 화살표 (pixelarticons chevron-down-2 모양). 펼치면 위로 돈다
function Caret() {
  return (
    <svg className="cb-caret" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 10h12v2H6v-2zm3 2h6v2H9v-2zm2 2h2v2h-2v-2z" />
    </svg>
  );
}

// 접는 칸. 머리 줄을 누르면 펼쳐진다
export function Fold({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`cb-fold${open ? " open" : ""}`}>
      <button type="button" className="cb-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{label}</span>
        <Caret />
      </button>
      {open && <div className="cb-fold-body">{children}</div>}
    </div>
  );
}
