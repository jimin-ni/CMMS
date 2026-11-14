"use client";

// 온보딩 컨셉 C: 어두운 화면 → 창문 빛과 빈 방 → 스크롤로 가구가 하나씩 쌓임 → "Ready to Start?" → 방 안으로 확대
// → 아래 안내 팝업과 둘러보기 진행 표시 → 3개를 둘러보면 내비게이션 바 → 아이콘을 누르면 로그인 팝업.
import "./onboarding-c.css";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { RoomScene } from "./room-scene";
import { NAV_AFTER, SCROLL_SCREENS, STORY, TIMELINE, itemWindow, ramp, type ItemId } from "./story";
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

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function ConceptC() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RoomScene | null>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const captionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const phaseRef = useRef<Phase>("scroll");
  const progressRef = useRef(0);
  const zoomStartRef = useRef(-1);
  const hoverRef = useRef<ItemId | null>(null);

  const [phase, setPhase] = useState<Phase>("scroll");
  const [guideOpen, setGuideOpen] = useState(false);
  const [found, setFound] = useState<ItemId[]>([]);
  const [active, setActive] = useState<ItemId | null>(null);
  const [hover, setHover] = useState<ItemId | null>(null);
  const [loginFor, setLoginFor] = useState<NavAction | null>(null);
  const { data: session } = authClient.useSession();

  // 3D 장면과 매 프레임 갱신. 스크롤에 따라 바뀌는 글은 다시 그리지 않고 스타일만 바꾼다.
  useEffect(() => {
    const root = rootRef.current, canvas = canvasRef.current;
    if (!root || !canvas) return;
    const scene = new RoomScene(canvas);
    sceneRef.current = scene;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const zoomMs = reduce ? 500 : 2800;
    const resize = new ResizeObserver(() => scene.resize());
    resize.observe(canvas);

    let last = performance.now(), raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const max = root.scrollHeight - root.clientHeight;
      const target = max > 0 ? root.scrollTop / max : 0;
      // 스크롤을 그대로 쓰지 않고 따라가게 해서 움직임이 끊기지 않는다
      progressRef.current += (target - progressRef.current) * (reduce ? 1 : 1 - Math.exp(-dt * 5));
      const p = progressRef.current;

      let zoom = 0, dark = ramp(p, TIMELINE.dark[0], TIMELINE.dark[1]), readyFade = 1;
      if (phaseRef.current !== "scroll") {
        const z = Math.min(1, (now - zoomStartRef.current) / zoomMs);
        zoom = z;
        dark = 1 - 0.7 * easeInOut(z);
        readyFade = Math.max(0, 1 - z * 4);
        if (z >= 1 && phaseRef.current === "zoom") {
          phaseRef.current = "room";
          setPhase("room");
        }
      }
      scene.frame(dt, { progress: p, zoom, dark, room: phaseRef.current === "room" });

      if (introRef.current) introRef.current.style.opacity = String(1 - ramp(p, ...TIMELINE.introOut));
      STORY.forEach((_, i) => {
        const el = captionRefs.current[i];
        if (!el) return;
        const w = itemWindow(i);
        const enter = ramp(p, ...w.textIn), leave = ramp(p, ...w.textOut);
        el.style.opacity = String(enter * (1 - leave));
        el.style.setProperty("--oc-shift", `${(1 - enter) * 28 - leave * 28}px`);
      });
      if (readyRef.current) {
        const r = ramp(p, ...TIMELINE.ready) * readyFade;
        readyRef.current.style.opacity = String(r);
        readyRef.current.style.visibility = r > 0.01 ? "visible" : "hidden";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setFound(found);
  }, [found]);

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

  const interact = useCallback((id: ItemId) => {
    sceneRef.current?.interact(id);
    setActive(id);
    setFound((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setGuideOpen(true);
  }, []);

  function toNdc(event: React.PointerEvent | React.MouseEvent) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      nx: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      ny: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const scene = sceneRef.current;
    if (!scene || phaseRef.current !== "room") return;
    const { nx, ny } = toNdc(event);
    scene.setPointer(nx, ny);
    const id = event.pointerType === "mouse" ? scene.pick(nx, ny) : null;
    if (id !== hoverRef.current) {
      hoverRef.current = id;
      scene.setHover(id);
      setHover(id);
    }
    if (tipRef.current) tipRef.current.style.transform = `translate(${event.clientX + 16}px, ${event.clientY + 14}px)`;
  }

  function onCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const scene = sceneRef.current;
    if (!scene) return;
    if (phaseRef.current === "scroll") {
      enterRoom();
      return;
    }
    if (phaseRef.current !== "room") return;
    const { nx, ny } = toNdc(event);
    const id = scene.pick(nx, ny);
    if (id) interact(id);
  }

  // 로그인 전에는 어느 아이콘이든 로그인 팝업을 띄운다. 로그인 뒤에는 결제 안내와 쪽지 트리로 가는 링크가 된다.
  function onNav(event: React.MouseEvent, action: NavAction) {
    if (session) return;
    event.preventDefault();
    setLoginFor(action);
  }

  const closeLogin = useCallback(() => setLoginFor(null), []);

  const activeStory = STORY.find((s) => s.id === active);
  const hoverStory = STORY.find((s) => s.id === hover);
  const navOpen = found.length >= NAV_AFTER;
  const progressNote =
    found.length === STORY.length
      ? "You found every story here."
      : navOpen
        ? "A menu just opened at the top."
        : `${found.length} of ${STORY.length} found`;

  return (
    <div ref={rootRef} className={`oc-root${phase === "scroll" ? "" : " oc-locked"}`}>
      <PaperFilters />
      <div style={{ height: `${SCROLL_SCREENS * 100}vh` }}>
        <div className="oc-stage">
          <canvas
            ref={canvasRef}
            className="oc-canvas"
            aria-hidden="true"
            onPointerMove={onPointerMove}
            onPointerLeave={() => {
              hoverRef.current = null;
              sceneRef.current?.setHover(null);
              setHover(null);
            }}
            onClick={onCanvasClick}
            style={{ cursor: hover ? "pointer" : "default" }}
          />

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
          {STORY.map((item, i) => (
            <div
              key={item.id}
              ref={(el) => {
                captionRefs.current[i] = el;
              }}
              className={`oc-layer oc-caption ${i % 2 ? "right" : "left"}`}
              style={{ opacity: 0 }}
            >
              <span className="oc-index oc-pixel">0{i + 1}</span>
              <h2 className="oc-rounded">{item.title}</h2>
              <p>{item.line}</p>
            </div>
          ))}

          {/* 3. Ready to Start? */}
          <div ref={readyRef} className="oc-layer oc-ready" style={{ opacity: 0, visibility: "hidden" }}>
            <button type="button" className="oc-pixel" onClick={enterRoom} tabIndex={phase === "scroll" ? 0 : -1}>
              Ready to Start?
            </button>
            <span>Click anywhere to step inside</span>
          </div>

          {/* 마우스를 올린 가구 이름 */}
          <div
            ref={tipRef}
            className="oc-tip oc-rounded"
            style={{ opacity: phase === "room" && hoverStory ? 1 : 0 }}
            aria-hidden="true"
          >
            {hoverStory?.name}
          </div>

          {/* 4·5. 아래 안내 팝업과 둘러보기 진행 */}
          {phase === "room" && (
            <div className={`oc-guide${guideOpen ? " open" : ""}`} aria-live="polite">
              <Paper tape={["top"]}>
                <div key={active ?? "welcome"} className="oc-swap">
                  <h3 className="oc-rounded">{activeStory ? activeStory.name : "Welcome in."}</h3>
                  <p>
                    {activeStory
                      ? activeStory.story
                      : "Everything in this room holds a little story. Click whatever catches your eye."}
                  </p>
                </div>
                <div className="oc-progress">
                  <span className="oc-dots" role="img" aria-label={`${found.length} of ${STORY.length} explored`}>
                    {STORY.map((s) => (
                      <span key={s.id} className={found.includes(s.id) ? "on" : ""}>
                        {found.includes(s.id) ? "●" : "○"}
                      </span>
                    ))}
                  </span>
                  <span>{progressNote}</span>
                </div>
                {/* 키보드와 화면 낭독기로도 둘러볼 수 있게 */}
                <ul className="oc-sr">
                  {STORY.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => interact(s.id)}>
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </Paper>
            </div>
          )}

          {/* 6. 내비게이션 바 */}
          {phase === "room" && (
            <nav className={`oc-nav${navOpen ? " open" : ""}`} aria-label="Menu" aria-hidden={!navOpen}>
              <Paper tape={["tl"]}>
                <span className="oc-brand oc-pixel">Memories</span>
                {session ? (
                  <span className="oc-nav-btn oc-nav-name">
                    <PixelIcon name="user" size={20} />
                    <span>{session.user.name}</span>
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
          {loginFor && <LoginPopup reason={LOGIN_REASON[loginFor]} onClose={closeLogin} />}
        </div>
      </div>
    </div>
  );
}
