"use client";

// 방 안 둘러보기: 아래 안내 팝업, 둘러보기 진행 점, 3곳을 둘러보면 내비게이션 바, 아이콘을 누르면 로그인 팝업.
// 온보딩 컨셉 B와 C가 함께 쓴다. 둘러보기는 엔진의 모드(heap:mode)와 열린 창(overlay 의 hidden)을 읽어서 센다. 엔진은 고치지 않는다.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MODE_SPOT, NAV_AFTER, PANEL_IDS, PANEL_SPOT, SPOTS, spotsFor, type SpotId } from "./story";
import { Paper } from "./paper";
import { PixelIcon } from "./icons";
import { LoginPopup } from "./login-popup";

type NavAction = "login" | "room" | "note";

const LOGIN_REASON: Record<NavAction, string> = {
  login: "Sign in to leave your mark in this room.",
  room: "Sign in first, then make a room of your own.",
  note: "Sign in to hang a note on the tree.",
};
// 쪽지 트리 화면. /features 의 "임시 트리 보기" 카드와 같은 정적 페이지다.
const NOTE_TREE_HREF = "/tree-mock/index.html";
const PLAN_HREF = "/plan";

// hostRef: HeapRoom 을 감싼 요소 (.oc-room-host). 엔진 모드를 data-mode 로 달아 CSS 가 방의 단추를 감추거나 보인다.
// live: 방 안을 둘러보는 단계인지. 그 전에는 아무것도 세지 않고 보이지 않는다.
export function RoomTour({
  hostRef,
  live,
  layoutItems,
  viewerName,
  signedIn,
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  live: boolean;
  layoutItems: unknown;
  viewerName: string | null;
  signedIn: boolean;
}) {
  const router = useRouter();
  const liveRef = useRef(live);
  const [engineMode, setEngineMode] = useState("room");
  const [panelOpen, setPanelOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [found, setFound] = useState<SpotId[]>([]);
  const [active, setActive] = useState<SpotId | null>(null);
  const [loginFor, setLoginFor] = useState<NavAction | null>(null);
  const spots = useMemo(() => spotsFor(layoutItems), [layoutItems]);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const markFound = useCallback((id: SpotId) => {
    if (!liveRef.current) return;
    setActive(id);
    setFound((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setGuideOpen(true);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const roomEl = host?.querySelector<HTMLElement>(".heap-room");
    if (!host || !roomEl) return;
    host.dataset.mode = "room";
    const onMode = (e: Event) => {
      const mode = (e as CustomEvent<string>).detail;
      host.dataset.mode = mode;
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
  }, [hostRef, markFound]);

  // 방 안에 들어온 뒤 마우스를 움직이거나 누르면 안내 팝업이 올라온다
  useEffect(() => {
    if (!live || guideOpen) return;
    const open = () => setGuideOpen(true);
    window.addEventListener("pointermove", open, { once: true });
    window.addEventListener("pointerdown", open, { once: true });
    window.addEventListener("keydown", open, { once: true });
    return () => {
      window.removeEventListener("pointermove", open);
      window.removeEventListener("pointerdown", open);
      window.removeEventListener("keydown", open);
    };
  }, [live, guideOpen]);

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

  if (!live) return null;

  const countFound = found.filter((id) => spots.includes(id)).length;
  const navOpen = countFound >= NAV_AFTER;
  const activeSpot = active ? SPOTS[active] : null;
  // 앉기, 상영, 책장, 열린 창에서는 엔진의 단추와 창을 쓰므로 안내 팝업을 잠시 내린다
  const guideShown = guideOpen && engineMode === "room" && !panelOpen;
  const progressNote =
    countFound >= spots.length
      ? "You found every story here."
      : navOpen
        ? "A menu just opened at the top."
        : `${countFound} of ${spots.length} found`;

  return (
    <>
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

      <nav className={`oc-nav${navOpen ? " open" : ""}`} aria-label="Menu" aria-hidden={!navOpen}>
        <Paper tape={["tl"]}>
          <span className="oc-brand oc-pixel">Memories</span>
          {signedIn ? (
            <span className="oc-nav-btn oc-nav-name">
              <PixelIcon name="user" size={20} />
              <span>{viewerName}</span>
            </span>
          ) : (
            <button type="button" className="oc-nav-btn" onClick={(event) => onNav(event, "login")} tabIndex={navOpen ? 0 : -1}>
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

      {loginFor && <LoginPopup reason={LOGIN_REASON[loginFor]} onClose={closeLogin} onSignedIn={onSignedIn} />}
    </>
  );
}
