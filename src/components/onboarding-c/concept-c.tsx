"use client";

// 온보딩 컨셉 C. 방은 실제 2번 방이다: /room/dname 과 같은 HeapRoom(힙 엔진)을 띄우고, 그 위에 온보딩을 얹는다.
// 어두운 화면 → 창문 빛과 빈 방 → 스크롤마다 글과 가구가 번갈아 쌓임 → "Ready to Start?" → 방이 화면 가득 확대
// → 방 안 둘러보기(room-tour.tsx: 안내 팝업, 진행 점, 내비게이션 바, 로그인 팝업).
// 엔진에는 heap:intro 이벤트(engine/intro.js)로 가구와 사진 더미, 카메라 거리만 알려 준다.
import "./onboarding-c.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeapRoom, type HeapRoomData } from "@/components/heap/heap-room";
import { ONBOARDING_ROOM_ID, SCROLL_SCREENS, STEPS, TIMELINE, ramp, stepOfItems, stepWindow } from "./story";
import { PaperFilters } from "./paper";
import { PixelIcon } from "./icons";
import { RoomTour } from "./room-tour";

type Phase = "scroll" | "zoom" | "room";

// 스크롤하는 동안 방은 화면의 약 50%: 방 카메라를 이만큼 뒤로 물린다. 방 안에서는 1(보통 구도).
const FAR = 1.95;
// 스크롤하는 동안 방이 천천히 도는 각도 (시작, 끝)
const TURN: [number, number] = [-0.4, 0.12];
const ZOOM_MS = 2800;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function ConceptC({
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
  const introRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef<HTMLDivElement>(null);
  const captionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const phaseRef = useRef<Phase>("scroll");
  const progressRef = useRef(0);
  const zoomStartRef = useRef(-1);

  const [phase, setPhase] = useState<Phase>("scroll");
  const itemSteps = useMemo(() => stepOfItems(data.layout.items), [data.layout.items]);

  // 매 프레임: 스크롤을 부드럽게 따라가고, 엔진에 연출 값을 보내고, 글의 투명도를 바꾼다 (React 는 다시 그리지 않는다)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const zoomMs = reduce ? 500 : ZOOM_MS;
    const pileStep = STEPS.findIndex((s) => s.pile);
    let last = performance.now(), raf = 0, sentNull = false;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const max = root.scrollHeight - root.clientHeight;
      const target = max > 0 ? root.scrollTop / max : 0;
      progressRef.current += (target - progressRef.current) * (reduce ? 1 : 1 - Math.exp(-dt * 5));
      const p = progressRef.current;
      const roomEl = hostRef.current?.querySelector(".heap-room");

      let zoom = 0;
      if (phaseRef.current !== "scroll") {
        zoom = Math.min(1, (now - zoomStartRef.current) / zoomMs);
        if (zoom >= 1 && phaseRef.current === "zoom") {
          phaseRef.current = "room";
          setPhase("room");
        }
      }
      const z = easeInOut(zoom);
      const reveal = ramp(p, ...TIMELINE.reveal);
      const dark = ramp(p, ...TIMELINE.dark);

      if (phaseRef.current === "room") {
        // 연출 끝: 가구, 사진, 카메라를 보통 방으로 돌린다
        if (!sentNull) roomEl?.dispatchEvent(new CustomEvent("heap:intro", { detail: null }));
        sentNull = true;
      } else {
        sentNull = false;
        const turnScroll = lerp(TURN[0], TURN[1], p);
        roomEl?.dispatchEvent(
          new CustomEvent("heap:intro", {
            detail: {
              items: itemSteps.map((s) => (phaseRef.current === "zoom" ? 1 : ramp(p, ...stepWindow(s).drop))),
              pile: phaseRef.current === "zoom" ? 1 : ramp(p, ...stepWindow(pileStep).drop),
              dist: lerp(FAR, 1, z),
              turn: lerp(turnScroll, 0, z),
            },
          }),
        );
      }

      const scrollShade = Math.max(1 - reveal, 0.72 * dark);
      if (shadeRef.current) shadeRef.current.style.opacity = String(phaseRef.current === "scroll" ? scrollShade : 0.72 * (1 - z));
      if (vignetteRef.current) vignetteRef.current.style.opacity = String(1 - z);
      if (introRef.current) introRef.current.style.opacity = String(1 - ramp(p, ...TIMELINE.introOut));
      STEPS.forEach((_, i) => {
        const el = captionRefs.current[i];
        if (!el) return;
        const w = stepWindow(i);
        const enter = ramp(p, ...w.textIn), leave = ramp(p, ...w.textOut);
        el.style.opacity = String(enter * (1 - leave));
        el.style.setProperty("--oc-shift", `${(1 - enter) * 28 - leave * 28}px`);
      });
      if (readyRef.current) {
        const r = ramp(p, ...TIMELINE.ready) * Math.max(0, 1 - zoom * 4);
        readyRef.current.style.opacity = String(r);
        readyRef.current.style.visibility = r > 0.01 ? "visible" : "hidden";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [itemSteps]);

  // "Ready to Start?"가 보일 때 클릭이나 키를 누르면 방 안으로 들어간다
  const enterRoom = useCallback(() => {
    if (phaseRef.current !== "scroll" || progressRef.current < TIMELINE.ready[0]) return;
    phaseRef.current = "zoom";
    zoomStartRef.current = performance.now();
    setPhase("zoom");
  }, []);

  useEffect(() => {
    if (phase !== "scroll") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") enterRoom();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, enterRoom]);

  const rootClass = phase === "scroll" ? "oc-root" : "oc-root oc-locked";

  return (
    <div ref={rootRef} className={rootClass}>
      <PaperFilters />
      <div style={{ height: `${SCROLL_SCREENS * 100}vh` }}>
        <div className="oc-stage" onClick={() => phaseRef.current === "scroll" && enterRoom()}>
          {/* 실제 2번 방. 스크롤하는 동안에는 누를 수 없고, 방 안에 들어오면 /room/dname 과 똑같이 움직인다. */}
          <div ref={hostRef} className={phase === "room" ? "oc-room-host live" : "oc-room-host"}>
            <HeapRoom roomId={ONBOARDING_ROOM_ID} data={data} viewerName={viewerName} signedIn={signedIn} />
          </div>
          <div ref={vignetteRef} className="oc-layer oc-vignette" />
          <div ref={shadeRef} className="oc-layer oc-shade" />

          {/* 1. 첫 화면 */}
          <div ref={introRef} className="oc-layer oc-intro">
            <h1 className="oc-pixel">Memories</h1>
            <p className="oc-rounded">a room full of the moments you loved</p>
            <div className="oc-scroll-hint">
              <PixelIcon name="mouse" size={28} />
              <span>Scroll to begin</span>
              <PixelIcon name="chevronDown" size={18} className="oc-bob" />
            </div>
          </div>

          {/* 2. 가구와 함께 나오는 글 */}
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              ref={(el) => {
                captionRefs.current[i] = el;
              }}
              className={`oc-layer oc-caption ${i % 2 ? "right" : "left"}`}
              style={{ opacity: 0 }}
            >
              <span className="oc-index oc-pixel">0{i + 1}</span>
              <h2 className="oc-rounded">{step.title}</h2>
              <p>{step.line}</p>
            </div>
          ))}

          {/* 3. Ready to Start? */}
          <div ref={readyRef} className="oc-layer oc-ready" style={{ opacity: 0, visibility: "hidden" }}>
            <button type="button" className="oc-pixel" onClick={enterRoom} tabIndex={phase === "scroll" ? 0 : -1}>
              Ready to Start?
            </button>
            <span>Click anywhere to step inside</span>
          </div>

          {/* 4~7. 방 안 둘러보기: 안내 팝업, 진행 점, 내비게이션 바, 로그인 팝업 */}
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
