"use client";

// 설정(/settings)과 마이페이지(/mypage)의 틀: 기울어진 필름 판 위에 종이를 집게로 집어 둔 모습 (Figma "6차").
// 배경은 세 겹 그림이다 (public/settings/film, paper, clip). 글은 종이 위 919 × 1098 칸 안에 들어가고,
// 넘치면 스크롤한다 (스크롤바는 숨긴다). 종이 바깥을 누르거나 Esc 를 누르면 홈(/home)으로 간다.
// 단추 규칙: 흰 바탕은 고르지 않은 것, 갈색 바탕(.on)은 지금 상태다.
import "./clipboard.css";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const HOME_HREF = "/home";

export function Clipboard({
  title,
  closeLabel,
  className = "",
  children,
}: {
  title: string;
  closeLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(HOME_HREF);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div
      className={`cb-root ${className}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) router.push(HOME_HREF);
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
        <button type="button" className="cb-close" onClick={() => router.push(HOME_HREF)}>
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
