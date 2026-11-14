"use client";

// 온보딩 컨셉 B: 책상 위 바인더 노트(링이 아래) → 스크롤하면 아랫장이 링을 지나 위로 넘어와 앞장 위에 덮인다(3D)
// → 마지막 장 뒤에 하드보드 표지가 덮여 앨범 한 권이 되고, 책 등이 보이게 세워진다
// → 책상이 걷히며 2번 방이 보이고, 카메라가 책장으로 다가가 앨범이 꽂힌 뒤 다시 물러난다
// → "Ready to Start?" → 방 안 둘러보기 (컨셉 C와 같은 room-tour.tsx).
// 2번 방은 /room/dname 과 같은 HeapRoom 이다. 엔진에는 heap:intro(카메라 줌, 꽂힌 앨범)와 heap:introquery(앨범 자리의 화면 좌표)만 쓴다.
import "../onboarding-c/onboarding-c.css";
import "./onboarding-b.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { HeapRoom, type HeapRoomData } from "@/components/heap/heap-room";
import { ONBOARDING_ROOM_ID, ramp } from "../onboarding-c/story";
import { PaperFilters } from "../onboarding-c/paper";
import { PixelIcon } from "../onboarding-c/icons";
import { RoomTour } from "../onboarding-c/room-tour";
import { PAGES } from "./pages";

type Phase = "scroll" | "enter" | "room";

// 스크롤 진행도(0~1) 시간표
const T = {
  flips: [
    [0.05, 0.2],
    [0.24, 0.39],
  ] as [number, number][], // 2장, 3장이 넘어오는 구간
  close: [0.44, 0.54] as const, // 표지가 덮인다
  desk: [0.44, 0.52] as const, // 책상이 걷히고 방이 보인다
  turn: [0.55, 0.64] as const, // 책 등이 보이게 세운다
  focusIn: [0.62, 0.72] as const, // 카메라가 책장으로
  fly: [0.64, 0.78] as const, // 책이 책장의 빈 칸으로
  insert: 0.78, // 이때부터 3D 앨범이 꽂혀 있다
  fade: [0.775, 0.79] as const, // 화면 위의 책이 사라진다
  focusOut: [0.81, 0.89] as const, // 카메라가 방 전체로
  dark: [0.89, 0.94] as const,
  ready: [0.92, 0.96] as const,
};
const SCROLL_SCREENS = 11;
const ENTER_MS = 900;
const PERSPECTIVE = 2400;
// 넘기기 전의 장이 바인더 아래로 늘어진 각도 (-180° 면 책과 같은 평면). 조금 덜 젖혀 두께가 보이게 한다
const HANG = -172;
// 바인더 아래에 늘어진, 넘기지 않는 종이 장 수 (배경)
const FILLERS = 4;
const FILLER_TONES = ["#efe5d2", "#ece1cc", "#e8dcc5", "#e4d7be"];

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Slot = { x: number; y: number; h: number } | null;

export function ConceptB({
  data,
  viewerName,
  signedIn,
}: {
  data: HeapRoomData;
  viewerName: string | null;
  signedIn: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const leafRefs = useRef<(HTMLDivElement | null)[]>([]);
  const coverRef = useRef<HTMLDivElement>(null);
  const fillerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hintRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("scroll");
  const progressRef = useRef(0);
  const enterStartRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("scroll");

  useEffect(() => {
    const root = rootRef.current, book = bookRef.current;
    if (!root || !book) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let last = performance.now(), raf = 0, sentNull = false;
    let slot: Slot = null;
    const take = (s: Slot) => {
      slot = s;
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const max = root.scrollHeight - root.clientHeight;
      const target = max > 0 ? root.scrollTop / max : 0;
      progressRef.current += (target - progressRef.current) * (reduce ? 1 : 1 - Math.exp(-dt * 6));
      const p = progressRef.current;
      const roomEl = hostRef.current?.querySelector(".heap-room");

      // 방 안으로 들어가는 짧은 전환 (Ready 를 누른 뒤)
      let enter = 0;
      if (phaseRef.current !== "scroll") {
        enter = Math.min(1, (now - enterStartRef.current) / (reduce ? 1 : ENTER_MS));
        if (enter >= 1 && phaseRef.current === "enter") {
          phaseRef.current = "room";
          setPhase("room");
        }
      }

      const close = easeInOut(ramp(p, ...T.close));

      // 1. 장 넘기기: 아직 넘기지 않은 장은 링에 꽂힌 채 바인더 아래로 늘어져 있다(HANG).
      //    스크롤하면 링 줄(구멍 가운데)을 축으로 올라와 앞장 위에 덮인다.
      //    늘어진 동안은 다음에 넘어올 장이 가장 앞, 넘어온 뒤에는 나중 장이 가장 위다.
      leafRefs.current.forEach((leaf, i) => {
        if (!leaf) return;
        const w = i === 0 ? null : T.flips[i - 1];
        const t = w ? easeInOut(ramp(p, w[0], w[1])) : 1;
        const rest = HANG - i * 2.5;
        const angle = rest + (0 - rest) * t;
        const z = t > 0.5 ? 2 + i * 0.8 : 1.2 - i * 0.3;
        leaf.style.transform = `translateZ(${z}px) rotateX(${angle}deg)`;
        leaf.dataset.side = angle < -90 ? "back" : "front";
        leaf.style.setProperty("--shade", String(Math.abs(Math.sin((angle * Math.PI) / 180)) * 0.45));
      });
      // 바인더 아래로 늘어진 나머지 종이들. 표지가 덮일 때 함께 접혀 들어간다
      fillerRefs.current.forEach((sheet, i) => {
        if (!sheet) return;
        const rest = HANG - 6 - i * 3;
        const angle = rest + (0 - rest) * easeInOut(ramp(close, 0, 0.85));
        sheet.style.transform = `translateZ(${0.4 - i * 0.3}px) rotateX(${angle}deg)`;
        sheet.style.setProperty("--shade", String(Math.abs(Math.sin((angle * Math.PI) / 180)) * 0.45));
      });

      // 2. 표지가 덮인다: 늘어진 종이들 맨 뒤에서 책 아래 가장자리를 축으로 올라와, 책 두께의 앞면(T/2)에 닿는다
      book.style.setProperty("--close", String(close));
      if (coverRef.current) {
        const angle = HANG - 14 + (0 - (HANG - 14)) * close;
        coverRef.current.style.transform = `translateZ(calc(var(--T) * ${close / 2} + ${close > 0.5 ? 4 : -3}px)) rotateX(${angle}deg)`;
        coverRef.current.dataset.side = angle < -90 ? "back" : "front";
      }

      // 3. 세우기: 시계 방향으로 90° 눕혀 책 등을 왼쪽으로 보낸 뒤, Y 축으로 90° 돌려 책 등을 본다
      const turnT = ramp(p, ...T.turn);
      const rz = 90 * easeInOut(ramp(turnT, 0, 0.6));
      const ry = 90 * easeInOut(ramp(turnT, 0.4, 1));
      const sTurn = lerp(1, 0.72, easeInOut(turnT));

      // 4. 책장으로: 엔진이 알려 주는 앨범 자리(화면 좌표)로 옮기며 줄인다
      const flyT = ramp(p, ...T.fly);
      if (flyT > 0) roomEl?.dispatchEvent(new CustomEvent("heap:introquery", { detail: take }));
      let tx = 0, ty = 0, s = sTurn;
      if (flyT > 0 && slot) {
        const W = book.offsetWidth, H = book.offsetHeight;
        const vw = window.innerWidth, vh = window.innerHeight;
        // 책 등은 책 가운데보다 H/2 만큼 앞에 있어 원근으로 커 보인다. 그만큼 덜 키운다
        const sTarget = slot.h / W / (PERSPECTIVE / (PERSPECTIVE - (H / 2) * (slot.h / W)));
        const e = easeInOut(flyT);
        tx = (slot.x - vw / 2) * e;
        ty = (slot.y - vh / 2) * e - Math.sin(flyT * Math.PI) * vh * 0.08;
        s = lerp(sTurn, sTarget, easeOut(flyT));
      }
      book.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s}) rotateY(${ry}deg) rotateZ(${rz}deg)`;
      book.style.opacity = String(1 - ramp(p, ...T.fade));

      // 스크롤 안내: 스크롤을 시작하면 흐려진다
      if (hintRef.current) hintRef.current.style.opacity = String(1 - ramp(p, 0.003, 0.03));

      // 책상과 책 그림자: 표지가 덮이면서 걷힌다
      const deskT = ramp(p, ...T.desk);
      if (deskRef.current) deskRef.current.style.opacity = String(1 - deskT);
      if (shadowRef.current) shadowRef.current.style.opacity = String(1 - deskT);

      // 5. 방 카메라: 기본 구도 → 책장으로 줌인 → 꽂은 뒤 줌아웃
      const focus = easeInOut(ramp(p, ...T.focusIn)) * (1 - easeInOut(ramp(p, ...T.focusOut)));
      if (phaseRef.current === "room") {
        if (!sentNull) roomEl?.dispatchEvent(new CustomEvent("heap:intro", { detail: null }));
        sentNull = true;
      } else {
        sentNull = false;
        roomEl?.dispatchEvent(new CustomEvent("heap:intro", { detail: { focus, album: p >= T.insert } }));
      }

      // 6. 어두워지고 Ready to Start?
      const dark = ramp(p, ...T.dark);
      if (shadeRef.current) shadeRef.current.style.opacity = String(0.72 * dark * (1 - easeInOut(enter)));
      if (readyRef.current) {
        const r = ramp(p, ...T.ready) * Math.max(0, 1 - enter * 3);
        readyRef.current.style.opacity = String(r);
        readyRef.current.style.visibility = r > 0.01 ? "visible" : "hidden";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const enterRoom = useCallback(() => {
    if (phaseRef.current !== "scroll" || progressRef.current < T.ready[0]) return;
    phaseRef.current = "enter";
    enterStartRef.current = performance.now();
    setPhase("enter");
  }, []);

  useEffect(() => {
    if (phase !== "scroll") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") enterRoom();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, enterRoom]);

  return (
    <div ref={rootRef} className={phase === "scroll" ? "oc-root ob-root" : "oc-root ob-root oc-locked"}>
      <PaperFilters />
      {/* 낙서 선을 펜 자국처럼 거칠게 */}
      <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
        <filter id="ob-rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div style={{ height: `${SCROLL_SCREENS * 100}vh` }}>
        <div className="oc-stage" onClick={() => phaseRef.current === "scroll" && enterRoom()}>
          {/* 실제 2번 방. 책상 아래에 깔려 있다가 표지가 덮일 때부터 보인다. */}
          <div ref={hostRef} className={phase === "room" ? "oc-room-host live" : "oc-room-host"}>
            <HeapRoom roomId={ONBOARDING_ROOM_ID} data={data} viewerName={viewerName} signedIn={signedIn} />
          </div>
          <div ref={deskRef} className="oc-layer ob-desk" />

          <div className="ob-stage3d" aria-hidden={phase !== "scroll"}>
            <div ref={shadowRef} className="ob-book-shadow" />
            <div ref={bookRef} className="ob-book">
              {/* 덮인 뒤의 두께: 책 등(아래), 위·왼쪽·오른쪽 종이 단면, 뒤표지 */}
              <div className="ob-face ob-spine">
                <span className="ob-pixel">MEMORIES</span>
                <small className="ob-rounded">vol.01 · Lovesoo &amp; you</small>
              </div>
              <div className="ob-face ob-edge ob-edge-top" />
              <div className="ob-face ob-edge ob-edge-left" />
              <div className="ob-face ob-edge ob-edge-right" />
              <div className="ob-face ob-backboard" />

              {/* 링에 꽂힌 채 바인더 아래로 늘어진 종이들 (처음부터 보이는 배경) */}
              {Array.from({ length: FILLERS }, (_, i) => (
                <div
                  key={`filler-${i}`}
                  ref={(el) => {
                    fillerRefs.current[i] = el;
                  }}
                  className="ob-leaf ob-filler"
                  data-side="back"
                  style={{ "--filler": FILLER_TONES[i % FILLER_TONES.length] } as React.CSSProperties}
                >
                  <div className="ob-sheet ob-back" />
                  <span className="ob-leaf-shade" />
                </div>
              ))}

              {/* 장: 링 줄(구멍 가운데)을 축으로 돈다 */}
              {PAGES.map((Page, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    leafRefs.current[i] = el;
                  }}
                  className="ob-leaf"
                  data-side={i === 0 ? "front" : "back"}
                >
                  <section className="ob-sheet ob-front" aria-label={`Page ${i + 1}`}>
                    <Page />
                  </section>
                  <div className="ob-sheet ob-back">
                    <span className="ob-pixel">Memories</span>
                  </div>
                  <span className="ob-leaf-shade" />
                </div>
              ))}

              {/* 아래 바인더: 흰 종이 띠의 펀칭 구멍 4쌍, 원형 구멍에 꽂힌 은색 링, 겹친 종이와 바인더 받침 */}
              <div className="ob-binder">
                <div className="ob-strip">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="ob-holes" style={{ left: `${12.5 + i * 25}%` }}>
                      <span className="ob-hole-pill" />
                      <span className="ob-hole-round" />
                    </span>
                  ))}
                </div>
                <div className="ob-layers" />
                <div className="ob-base" />
                {[0, 1, 2, 3].map((i) => (
                  <svg
                    key={i}
                    className="ob-ring"
                    style={{ left: `calc(${12.5 + i * 25}% + var(--ring-dx))` }}
                    viewBox="0 0 30 140"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id={`ob-metal-${i}`} x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0" stopColor="#6c7178" />
                        <stop offset="0.35" stopColor="#f4f6f8" />
                        <stop offset="0.55" stopColor="#b9bec4" />
                        <stop offset="1" stopColor="#5d6168" />
                      </linearGradient>
                    </defs>
                    <path d="M15 4 C15 40 22 70 20 140" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="9" strokeLinecap="round" transform="translate(2 3)" />
                    <path d="M15 4 C15 40 22 70 20 140" fill="none" stroke={`url(#ob-metal-${i})`} strokeWidth="8" strokeLinecap="round" />
                    <path d="M13.5 8 C13.5 40 20 70 18.5 140" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                ))}
              </div>

              {/* 하드보드 표지: 마지막에 아래에서 올라와 덮인다 */}
              <div ref={coverRef} className="ob-cover" data-side="back">
                <div className="ob-cover-front">
                  {/* 표지에 음각으로 새긴 글자 */}
                  <div className="ob-engrave">
                    <span className="ob-pixel ob-cover-title">MEMORIES</span>
                    <span className="ob-rounded ob-cover-sub">made by Lovesoo, filled by you</span>
                    <span className="ob-rounded ob-cover-vol">vol. 01</span>
                  </div>
                </div>
                <div className="ob-cover-back" />
              </div>
            </div>
          </div>

          {/* 스크롤 안내: 노트 오른쪽 바깥 여백 */}
          <div ref={hintRef} className="ob-scrollhint" aria-hidden={phase !== "scroll"}>
            <PixelIcon name="mouse" size={26} />
            <span>scroll to flip</span>
            <PixelIcon name="chevronDown" size={16} className="oc-bob" />
          </div>

          <div ref={shadeRef} className="oc-layer oc-shade" style={{ opacity: 0 }} />

          {/* Ready to Start? */}
          <div ref={readyRef} className="oc-layer oc-ready" style={{ opacity: 0, visibility: "hidden" }}>
            <button type="button" className="oc-pixel" onClick={enterRoom} tabIndex={phase === "scroll" ? 0 : -1}>
              Ready to Start?
            </button>
            <span>Click anywhere to step inside</span>
          </div>

          {/* 방 안 둘러보기: 안내 팝업, 진행 점, 내비게이션 바, 로그인 팝업 (컨셉 C와 같다) */}
          <RoomTour
            hostRef={hostRef}
            live={phase === "room"}
            layoutItems={data.layout.items}
            viewerName={viewerName}
            signedIn={signedIn}
          />
        </div>
      </div>
    </div>
  );
}
