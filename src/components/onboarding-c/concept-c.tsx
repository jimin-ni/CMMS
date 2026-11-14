"use client";

// 온보딩 컨셉 C. 방은 실제 2번 방이다: /room/dname 과 같은 HeapRoom(힙 엔진)을 띄우고, 그 위에 온보딩을 얹는다.
// 어두운 화면 → 창문 빛과 빈 방 → 스크롤마다 글과 가구가 번갈아 쌓임 → "Ready to Start?" → 방이 화면 가득 확대
// → 아래 안내 팝업과 둘러보기 진행 → 3곳을 둘러보면 내비게이션 바 → 아이콘을 누르면 로그인 팝업.
// 엔진에는 heap:intro 이벤트(engine/intro.js)로 가구와 사진 더미, 카메라 거리만 알려 준다. 둘러보기는 엔진의 모드와 창을 읽어서 센다.
import "./onboarding-c.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HeapRoom, type HeapRoomData } from "@/components/heap/heap-room";
import {
  MODE_SPOT,
  NAV_AFTER,
  ONBOARDING_ROOM_ID,
  PANEL_IDS,
  PANEL_SPOT,
  SCROLL_SCREENS,
  SPOTS,
  STEPS,
  TIMELINE,
  ramp,
  spotsFor,
  stepOfItems,
  stepWindow,
  type SpotId,
} from "./story";
import { Paper, PaperFilters } from "./paper";
import { PixelIcon } from "./icons";
import { LoginPopup } from "./login-popup";

type Phase = "scroll" | "zoom" | "room";
type NavAction = "login" | "room" | "note";

const LOGIN_REASON: Record<NavAction, string> = {
  login: "Sign in to leave your mark in this room.",
  room: "Sign in first, then make a room of your own.",
  note: "Sign in to hang a note on the tree.",
};
// 쪽지 트리 화면. /features 의 "임시 트리 보기" 카드와 같은 정적 페이지다.
const NOTE_TREE_HREF = "/tree-mock/index.html";
const PLAN_HREF = "/plan";

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
  const router = useRouter();
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
  const [engineMode, setEngineMode] = useState("room");
  const [panelOpen, setPanelOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [found, setFound] = useState<SpotId[]>([]);
  const [active, setActive] = useState<SpotId | null>(null);
  const [loginFor, setLoginFor] = useState<NavAction | null>(null);

  const itemSteps = useMemo(() => stepOfItems(data.layout.items), [data.layout.items]);
  const spots = useMemo(() => spotsFor(data.layout.items), [data.layout.items]);

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

  const markFound = useCallback((id: SpotId) => {
    if (phaseRef.current !== "room") return;
    setActive(id);
    setFound((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setGuideOpen(true);
  }, []);

  // 둘러보기: 엔진의 모드(앉기, 상영, 책장)와 열린 창(휴대폰, 방명록, 문 …)을 읽는다
  useEffect(() => {
    const roomEl = hostRef.current?.querySelector<HTMLElement>(".heap-room");
    if (!roomEl) return;
    const onMode = (e: Event) => {
      const mode = (e as CustomEvent<string>).detail;
      setEngineMode(mode);
      const spot = MODE_SPOT[mode];
      if (spot) markFound(spot);
    };
    const check = () => {
      let open = false;
      for (const id of PANEL_IDS) {
        const el = roomEl.querySelector<HTMLElement>(`#${id}`);
        if (!el || el.hidden) continue;
        open = true;
        const spot = PANEL_SPOT[id];
        if (spot) markFound(spot);
      }
      setPanelOpen(open);
    };
    const watch = new MutationObserver(check);
    watch.observe(roomEl, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
    roomEl.addEventListener("heap:mode", onMode);
    return () => {
      watch.disconnect();
      roomEl.removeEventListener("heap:mode", onMode);
    };
  }, [markFound]);

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

  // 방 안에 들어온 뒤 마우스를 움직이거나 누르면 안내 팝업이 올라온다
  useEffect(() => {
    if (phase !== "room" || guideOpen) return;
    const open = () => setGuideOpen(true);
    window.addEventListener("pointermove", open, { once: true });
    window.addEventListener("pointerdown", open, { once: true });
    window.addEventListener("keydown", open, { once: true });
    return () => {
      window.removeEventListener("pointermove", open);
      window.removeEventListener("pointerdown", open);
      window.removeEventListener("keydown", open);
    };
  }, [phase, guideOpen]);

  // 로그인 전에는 어느 아이콘이든 로그인 팝업을 띄운다. 로그인 뒤에는 결제 안내와 쪽지 트리로 가는 링크가 된다.
  function onNav(event: React.MouseEvent, action: NavAction) {
    if (signedIn) return;
    event.preventDefault();
    setLoginFor(action);
  }

  const closeLogin = useCallback(() => setLoginFor(null), []);
  // 로그인하면 서버가 닉네임과 로그인 상태를 다시 읽는다 (방명록 쓰기도 켜진다)
  const onSignedIn = useCallback(() => {
    setLoginFor(null);
    router.refresh();
  }, [router]);

  const countFound = found.filter((id) => spots.includes(id)).length;
  const navOpen = countFound >= NAV_AFTER;
  const activeSpot = active ? SPOTS[active] : null;
  // 앉기, 상영, 책장, 열린 창에서는 엔진의 단추와 창을 쓰므로 안내 팝업을 잠시 내린다
  const guideShown = phase === "room" && guideOpen && engineMode === "room" && !panelOpen;
  const progressNote =
    countFound >= spots.length
      ? "You found every story here."
      : navOpen
        ? "A menu just opened at the top."
        : `${countFound} of ${spots.length} found`;

  const rootClass = ["oc-root", phase !== "scroll" && "oc-locked", phase === "room" && "oc-live", `oc-engine-${engineMode}`]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={rootRef} className={rootClass}>
      <PaperFilters />
      <div style={{ height: `${SCROLL_SCREENS * 100}vh` }}>
        <div className="oc-stage" onClick={() => phaseRef.current === "scroll" && enterRoom()}>
          {/* 실제 2번 방. 스크롤하는 동안에는 누를 수 없고, 방 안에 들어오면 /room/dname 과 똑같이 움직인다. */}
          <div ref={hostRef} className="oc-room-host">
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

          {/* 4·5. 아래 안내 팝업과 둘러보기 진행 */}
          {phase === "room" && (
            <div className={`oc-guide${guideShown ? " open" : ""}`} aria-live="polite" aria-hidden={!guideShown}>
              <Paper tape={["top"]}>
                <div key={active ?? "welcome"} className="oc-swap">
                  <h3 className="oc-rounded">{activeSpot ? activeSpot.name : "Welcome in."}</h3>
                  <p>
                    {activeSpot
                      ? activeSpot.story
                      : "Click the floor to walk around. Sit at the table to dig through the polaroids, and look for the phone, the door and the guestbook."}
                  </p>
                </div>
                <div className="oc-progress">
                  <span className="oc-dots" role="img" aria-label={`${countFound} of ${spots.length} explored`}>
                    {spots.map((id) => (
                      <span key={id} className={found.includes(id) ? "on" : ""}>
                        {found.includes(id) ? "●" : "○"}
                      </span>
                    ))}
                  </span>
                  <span>{progressNote}</span>
                </div>
              </Paper>
            </div>
          )}

          {/* 6. 내비게이션 바 */}
          {phase === "room" && (
            <nav className={`oc-nav${navOpen ? " open" : ""}`} aria-label="Menu" aria-hidden={!navOpen}>
              <Paper tape={["tl"]}>
                <span className="oc-brand oc-pixel">Memories</span>
                {signedIn ? (
                  <span className="oc-nav-btn oc-nav-name">
                    <PixelIcon name="user" size={20} />
                    <span>{viewerName}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="oc-nav-btn"
                    onClick={(event) => onNav(event, "login")}
                    tabIndex={navOpen ? 0 : -1}
                  >
                    <PixelIcon name="login" size={20} />
                    <span className="oc-label">Sign in</span>
                  </button>
                )}
                <Link
                  href={PLAN_HREF}
                  className="oc-nav-btn"
                  onClick={(event) => onNav(event, "room")}
                  tabIndex={navOpen ? 0 : -1}
                  aria-label="Make my room"
                >
                  <PixelIcon name="home" size={20} />
                  <span className="oc-label">My room</span>
                </Link>
                {/* 정적 HTML 이라 Link 가 아니라 일반 링크로 연다 */}
                <a
                  href={NOTE_TREE_HREF}
                  className="oc-nav-btn"
                  onClick={(event) => onNav(event, "note")}
                  tabIndex={navOpen ? 0 : -1}
                  aria-label="Leave a note"
                >
                  <PixelIcon name="mail" size={20} />
                  <span className="oc-label">Leave a note</span>
                </a>
              </Paper>
            </nav>
          )}

          {/* 7. 로그인 팝업 */}
          {loginFor && <LoginPopup reason={LOGIN_REASON[loginFor]} onClose={closeLogin} onSignedIn={onSignedIn} />}
        </div>
      </div>
    </div>
  );
}
