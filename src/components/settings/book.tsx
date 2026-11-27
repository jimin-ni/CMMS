"use client";

// 책상 위에 펼쳐 둔 O링 수첩 한 권. 설정(/settings)과 마이페이지(/mypage)가 함께 쓴다.
// - 가운데 O링 줄을 축으로 장(leaf)이 오른쪽에서 왼쪽으로 넘어간다. 장 하나의 앞면과 뒷면에 쪽(BookPage)이 하나씩 붙는다.
// - 처음에는 오른쪽에 1쪽만 있고 왼쪽은 표지 안쪽이다. 한 장 넘기면 왼쪽에 2쪽, 오른쪽에 3쪽 (양쪽 펼침).
// - 좁은 화면(700px 이하)은 한 쪽씩 본다: 장을 넘기며 왼쪽 쪽으로 옮겨 가고, 다음 걸음에 오른쪽 쪽으로 옮겨 간다.
// - 마우스 휠 한 번, ‹ › 단추, ← → 키로 한 걸음씩 넘긴다. 터치로 스크롤(한 걸음 = 화면 높이의 STEP 배)하면 멈춘 뒤 가까운 걸음에 맞춘다.
// - 지금 보이지 않는 쪽은 inert 라서 Tab 이 들어가지 않는다.
// - 수첩 바깥(책상)을 누르거나 Esc, 닫기 단추를 누르면 홈(/home)으로 간다.
import "../onboarding-c/onboarding-c.css";
import "../onboarding-b/onboarding-b.css";
import "./settings-book.css";
import { Children, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PaperFilters } from "../onboarding-c/paper";
import { PixelIcon } from "../onboarding-c/icons";
import { useLanguage } from "@/lib/settings/prefs";

const HOME_HREF = "/home";
// 한 걸음의 스크롤 거리 (화면 높이에 곱한다). settings-book.css 의 --step 과 맞춘다
const STEP = 0.8;
// O링 수. settings-book.css 의 --rings 와 맞춘다 (구멍 자리가 같아야 한다)
const RINGS = 9;
const NARROW_QUERY = "(max-width: 700px)";
// 휠로 한 걸음 넘긴 뒤 다음 휠을 받기까지 (트랙패드는 한 번 쓸어도 휠 이벤트가 여러 번 온다)
const WHEEL_LOCK_MS = 650;
// 스크롤이 이만큼 멈춰 있으면 가까운 걸음에 맞춘다
const SETTLE_MS = 160;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function subscribeNarrow(onChange: () => void) {
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const getNarrow = () => window.matchMedia(NARROW_QUERY).matches;
const getNarrowServer = () => false;

const TEXT = {
  ko: { hint: "스크롤해서 넘기기", pages: "쪽 넘기기", prev: "앞 쪽", next: "다음 쪽" },
  en: { hint: "scroll to turn", pages: "Pages", prev: "Previous page", next: "Next page" },
};

// heading: 위 막대의 제목. closeLabel: 닫기 단추의 읽어 주는 이름. children: BookPage 들 (쪽 순서대로)
export function Book({ heading, closeLabel, children }: { heading: string; closeLabel: string; children: ReactNode }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const leafRefs = useRef<(HTMLDivElement | null)[]>([]);
  const narrow = useSyncExternalStore(subscribeNarrow, getNarrow, getNarrowServer);
  const t = TEXT[useLanguage()];

  // 조건부로 빠진 쪽(null, false)은 세지 않는다
  const pages = Children.toArray(children);
  const pageCount = pages.length;
  const leafCount = Math.ceil(pageCount / 2);
  // 걸음 수. 넓은 화면: 펼침마다 (쪽 수가 홀수면 마지막 장은 넘기지 않는다). 좁은 화면: 쪽마다
  const steps = narrow ? Math.max(0, pageCount - 1) : Math.floor(pageCount / 2);
  // 지금 멈춰 있는 걸음 (가장 가까운 걸음). 보이는 쪽과 쪽 번호 표시에 쓴다
  const [at, setAt] = useState(0);
  const atRef = useRef(0);
  // 휠과 단추가 가려는 걸음. 넘기는 중에 또 누르면 여기서 한 걸음 더 간다
  const targetRef = useRef(0);

  // 스크롤 -> 장의 각도와 (좁은 화면) 수첩의 가로 위치
  useEffect(() => {
    const root = rootRef.current, book = bookRef.current;
    if (!root || !book) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const step = root.clientHeight * STEP;
      const s = Math.min(steps, Math.max(0, root.scrollTop / step));
      leafRefs.current.forEach((leaf, i) => {
        if (!leaf) return;
        const t = easeInOut(clamp01(narrow ? s - 2 * i : s - i));
        const angle = -180 * t;
        // 위에 놓이는 순서: 오른쪽 더미는 앞 장이 위, 왼쪽 더미는 나중에 넘긴 장이 위, 넘어가는 장이 가장 위
        const z = t <= 0 ? (leafCount - i) * 0.6 : t >= 1 ? (i + 1) * 0.6 : leafCount * 0.6 + 2;
        leaf.style.transform = `translateZ(${z}px) rotateY(${angle}deg)`;
        leaf.dataset.side = angle < -90 ? "back" : "front";
        leaf.style.setProperty("--shade", String(Math.sin(t * Math.PI) * 0.35));
      });
      if (narrow) {
        // 짝수 걸음은 오른쪽 쪽, 홀수 걸음은 왼쪽 쪽이 화면 가운데에 온다
        const base = Math.floor(s);
        const frac = s - base;
        const left = easeInOut(base % 2 === 0 ? frac : 1 - frac);
        book.style.transform = `translateX(${(left - 0.5) * (book.offsetWidth / 2)}px)`;
      } else {
        book.style.transform = "";
      }
      if (hintRef.current) hintRef.current.style.opacity = String(Math.max(0, 1 - root.scrollTop / 80));
      const near = Math.round(s);
      if (near !== atRef.current) {
        atRef.current = near;
        setAt(near);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [narrow, steps, leafCount]);

  const goTo = useCallback(
    (step: number) => {
      const root = rootRef.current;
      if (!root) return;
      const target = Math.min(steps, Math.max(0, step));
      targetRef.current = target;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      root.scrollTo({ top: target * root.clientHeight * STEP, behavior: reduce ? "auto" : "smooth" });
    },
    [steps],
  );

  // 휠: 한 번에 한 걸음. 스크롤(터치, 스크롤 막대)이 멈추면 가까운 걸음에 맞춘다
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let lockedUntil = 0, settle = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) < Math.abs(event.deltaX) || Math.abs(event.deltaY) < 2) return;
      event.preventDefault();
      const now = performance.now();
      if (now < lockedUntil) return;
      lockedUntil = now + WHEEL_LOCK_MS;
      goTo(targetRef.current + Math.sign(event.deltaY));
    };
    const onScroll = () => {
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        const step = root.clientHeight * STEP;
        const near = Math.round(root.scrollTop / step);
        targetRef.current = Math.min(steps, near);
        if (Math.abs(root.scrollTop - near * step) > 2) goTo(near);
      }, SETTLE_MS);
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(settle);
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("scroll", onScroll);
    };
  }, [goTo, steps]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        router.push(HOME_HREF);
        return;
      }
      // 고르기 칸과 막대는 화살표를 스스로 쓴다
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      if (event.key === "ArrowRight") goTo(targetRef.current + 1);
      else if (event.key === "ArrowLeft") goTo(targetRef.current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, goTo]);

  const onStageClick = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest(".nb-book, .sb-top, .nb-pager")) return;
    router.push(HOME_HREF);
  };

  // 지금 보이는 쪽 (0부터). 넓은 화면의 걸음 k: 왼쪽 2k-1, 오른쪽 2k. 좁은 화면의 걸음 j: j
  const visible = (index: number) => (narrow ? index === at : index === 2 * at - 1 || index === 2 * at);
  const shown = Array.from({ length: pageCount }, (_, i) => i).filter(visible);
  const pageLabel = shown.map((i) => String(i + 1).padStart(2, "0")).join("–");

  const face = (index: number, side: "front" | "back") => (
    <div className={`nb-face nb-${side}`} inert={!visible(index)}>
      {index < pageCount ? pages[index] : <div className="sb-page nb-blank" aria-hidden="true" />}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="oc-root ob-root sb-root"
      style={{ "--steps": steps, "--rings": RINGS } as React.CSSProperties}
    >
      <PaperFilters />
      <div className="sb-scroll">
        <div className="oc-stage" onClick={onStageClick}>
          <div className="oc-layer ob-desk" />

          <header className="sb-top">
            <h1 className="ob-pixel">{heading}</h1>
            <div ref={hintRef} className="sb-hint" aria-hidden="true">
              <PixelIcon name="mouse" size={20} />
              <span>{t.hint}</span>
            </div>
            <button type="button" className="sb-close" onClick={() => router.push(HOME_HREF)} aria-label={closeLabel}>
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <div className="nb-stage3d">
            <div ref={bookRef} className="nb-book">
              {/* 표지: 왼쪽은 앞표지 안쪽, 오른쪽은 뒤표지 안쪽 */}
              <div className="nb-board" aria-hidden="true" />
              {Array.from({ length: leafCount }, (_, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    leafRefs.current[i] = el;
                  }}
                  className="nb-leaf"
                  data-side="front"
                >
                  {face(2 * i, "front")}
                  {face(2 * i + 1, "back")}
                  <span className="nb-shade" aria-hidden="true" />
                </div>
              ))}
              {/* 가운데 O링 */}
              <div className="nb-rings" aria-hidden="true">
                {Array.from({ length: RINGS }, (_, i) => (
                  <span key={i} className="nb-ring" />
                ))}
              </div>
            </div>
          </div>

          <nav className="nb-pager" aria-label={t.pages}>
            <button type="button" onClick={() => goTo(at - 1)} disabled={at <= 0} aria-label={t.prev}>
              ‹
            </button>
            <span className="ob-pixel" aria-live="polite">
              p.{pageLabel} / {String(pageCount).padStart(2, "0")}
            </span>
            <button type="button" onClick={() => goTo(at + 1)} disabled={at >= steps} aria-label={t.next}>
              ›
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}

// 수첩의 한 쪽. id: 제목의 id 에 붙는 이름 (쪽마다 달라야 한다)
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
