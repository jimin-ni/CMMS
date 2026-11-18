"use client";

// 책상 위에 세로로 긴 책자 장들이 옆으로 늘어선 화면의 틀. 설정(/settings)과 마이페이지(/mypage)가 함께 쓴다.
// - 한 화면에 두 장이 보이고, 장의 아래 20% 는 화면 아래에 잘린다 (settings-book.css 의 --pw, --ph).
// - 아래로 스크롤하면 장들이 오른쪽에서 왼쪽으로 지나간다. 세로 스크롤 거리 = 가로 이동 거리 (1:1).
// - 장 바깥(책상)을 누르거나 Esc, 닫기 단추를 누르면 홈(/home)으로 간다.
import "../onboarding-c/onboarding-c.css";
import "../onboarding-b/onboarding-b.css";
import "./settings-book.css";
import { Children, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PaperFilters } from "../onboarding-c/paper";
import { PixelIcon } from "../onboarding-c/icons";

const HOME_HREF = "/home";

// heading: 위 막대의 제목. closeLabel: 닫기 단추의 읽어 주는 이름. children: BookPage 들
export function Book({ heading, closeLabel, children }: { heading: string; closeLabel: string; children: ReactNode }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  // 장 수 (CSS 의 --n). 조건부로 빠진 장(null, false)은 세지 않는다
  const pageCount = Children.toArray(children).length;

  // 세로 스크롤 -> 장들의 가로 이동
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onScroll = () => {
      const y = root.scrollTop;
      if (trackRef.current) trackRef.current.style.transform = `translate3d(${-y}px, 0, 0)`;
      if (hintRef.current) hintRef.current.style.opacity = String(Math.max(0, 1 - y / 80));
    };
    onScroll();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.push(HOME_HREF);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // Tab 으로 화면 밖 장의 칸에 가면 그 장이 보이게 스크롤한다.
  // 무대는 overflow: hidden 이라 브라우저가 무대를 가로로 밀어 버리므로 되돌린다.
  const onFocus = (event: React.FocusEvent) => {
    const root = rootRef.current, stage = stageRef.current, track = trackRef.current;
    const page = (event.target as HTMLElement).closest<HTMLElement>(".sb-page");
    if (!root || !stage || !track || !page) return;
    stage.scrollLeft = 0;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const r = page.getBoundingClientRect();
    if (r.left < gap) root.scrollTop += r.left - gap;
    else if (r.right > window.innerWidth - gap) root.scrollTop += r.right - (window.innerWidth - gap);
  };

  const onStageClick = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest(".sb-page, .sb-top")) return;
    router.push(HOME_HREF);
  };

  return (
    <div ref={rootRef} className="oc-root ob-root sb-root" style={{ "--n": pageCount } as React.CSSProperties}>
      <PaperFilters />
      <div className="sb-scroll">
        <div ref={stageRef} className="oc-stage" onClick={onStageClick}>
          <div className="oc-layer ob-desk" />

          <header className="sb-top">
            <h1 className="ob-pixel">{heading}</h1>
            <div ref={hintRef} className="sb-hint" aria-hidden="true">
              <PixelIcon name="mouse" size={20} />
              <span>scroll to turn</span>
            </div>
            <button type="button" className="sb-close" onClick={() => router.push(HOME_HREF)} aria-label={closeLabel}>
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <div ref={trackRef} className="sb-track" onFocus={onFocus}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// 책자 한 장. id: 제목의 id 에 붙는 이름 (장마다 달라야 한다)
export function BookPage({
  id,
  no,
  tag,
  title,
  children,
}: {
  id: string;
  no: number;
  tag: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="sb-page" aria-labelledby={`sb-title-${id}`}>
      <span className="oc-tape sb-tape" aria-hidden="true" />
      <p className="ob-tiny sb-no">
        p.{String(no).padStart(2, "0")} — {tag}
      </p>
      <h2 id={`sb-title-${id}`} className="ob-pixel sb-title">
        {title}
      </h2>
      {children}
    </section>
  );
}
