"use client";

// 방 안 둘러보기: 안내 팝업, 둘러보기 진행 점, 3곳을 둘러보면 내비게이션 바, 로그인 아이콘을 누르면 로그인 팝업.
// 안내 팝업("Welcome in.")은 화면 가운데에 떴다가, 누르거나 3초가 지나면 아래로 내려간다.
// 온보딩 컨셉 B와 C가 함께 쓴다. 둘러보기는 엔진의 모드(heap:mode)와 열린 창(overlay 의 hidden)을 읽어서 센다. 엔진은 고치지 않는다.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { MODE_SPOT, NAV_AFTER, PANEL_IDS, PANEL_SPOT, SPOTS, spotsFor, type SpotId } from "./story";
import { Paper } from "./paper";
import { PixelIcon, type PixelIconName } from "./icons";
import { LoginPopup } from "./login-popup";

const LOGIN_REASON = "Sign in to leave your mark in this room.";
// 휴대폰의 대화를 로그인 전에 누를 때 (엔진의 heap:signin)
const CHAT_LOGIN_REASON = "Sign in to chat with the creator.";
// 설정 버튼이 여는 곳 (임시로 컨셉 B 화면)
const SETTINGS_HREF = "/settings";
// 가운데 안내 팝업이 아래로 내려가기까지
const GUIDE_CENTER_MS = 3000;

// 내비게이션 바의 버튼: 홈, 폴라로이드, 챗, 레터, (로그인), 설정.
// go: 방 안에서 옮겨 갈 곳 (엔진의 heap:go, engine/nav.js). 레터는 아직 하는 일이 없다.
type Go = "room" | "polaroid" | "phone";
const NAV_ITEMS: { id: string; icon: PixelIconName; label: string; go?: Go }[] = [
  { id: "home", icon: "home", label: "Home", go: "room" },
  { id: "polaroid", icon: "image", label: "Polaroid", go: "polaroid" },
  { id: "chat", icon: "chat", label: "Chat", go: "phone" },
  { id: "letter", icon: "mail", label: "Letter" },
];
const NAV_ICON = 28;

// 안내 팝업 자리: 가운데, 아래, 숨김(Esc 로 건너뛴 뒤 아직 아무 곳도 둘러보지 않음)
type GuideSpot = "center" | "bottom" | "hidden";

// hostRef: HeapRoom 을 감싼 요소 (.oc-room-host). 엔진 모드를 data-mode 로 달아 CSS 가 방의 단추를 감추거나 보인다.
// live: 방 안을 둘러보는 단계인지. 그 전에는 아무것도 세지 않고 보이지 않는다.
// skipped: Esc 로 온보딩을 건너뛰었는지. 모두 둘러본 것으로 세어 내비게이션 바를 연다.
export function RoomTour({
  hostRef,
  live,
  skipped = false,
  layoutItems,
  viewerName,
  signedIn,
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  live: boolean;
  skipped?: boolean;
  layoutItems: unknown;
  viewerName: string | null;
  signedIn: boolean;
}) {
  const router = useRouter();
  const liveRef = useRef(live);
  const [engineMode, setEngineMode] = useState("room");
  const [panelOpen, setPanelOpen] = useState(false);
  const [guideSpot, setGuideSpot] = useState<GuideSpot>("center");
  const [found, setFound] = useState<SpotId[]>([]);
  const [active, setActive] = useState<SpotId | null>(null);
  // 로그인 팝업에 쓰는 까닭 글. null 이면 닫힘.
  const [loginReason, setLoginReason] = useState<string | null>(null);
  const spots = useMemo(() => spotsFor(layoutItems), [layoutItems]);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const markFound = useCallback((id: SpotId) => {
    if (!liveRef.current) return;
    setActive(id);
    setFound((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setGuideSpot("bottom");
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
    // 로그인 전에 휴대폰의 대화를 누르면 엔진이 알려 준다 (HeapRoom 의 signInHere)
    const onSignIn = () => setLoginReason(CHAT_LOGIN_REASON);
    roomEl.addEventListener("heap:mode", onMode);
    roomEl.addEventListener("heap:signin", onSignIn);
    return () => {
      watch.disconnect();
      roomEl.removeEventListener("heap:mode", onMode);
      roomEl.removeEventListener("heap:signin", onSignIn);
    };
  }, [hostRef, markFound]);

  // 방 안에 들어오면 안내 팝업이 가운데에 뜬다. 어디든 누르거나 3초가 지나면 아래로 내려간다.
  const centered = live && !skipped && guideSpot === "center";
  useEffect(() => {
    if (!centered) return;
    const down = () => setGuideSpot("bottom");
    const timer = window.setTimeout(down, GUIDE_CENTER_MS);
    window.addEventListener("pointerdown", down);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", down);
    };
  }, [centered]);

  const closeLogin = useCallback(() => setLoginReason(null), []);
  // 로그인하면 서버가 닉네임과 로그인 상태를 다시 읽는다 (방명록 쓰기도 켜진다)
  const onSignedIn = useCallback(() => {
    setLoginReason(null);
    router.refresh();
  }, [router]);
  // 방 안의 자리로 옮긴다: 홈(처음 들어온 상태), 탁자의 사진, 탁자의 휴대폰
  const go = (where: Go) => {
    // 홈은 온보딩이 끝난 처음 상태라 안내 팝업도 내린다
    if (where === "room") setGuideSpot("hidden");
    hostRef.current?.querySelector(".heap-room")?.dispatchEvent(new CustomEvent("heap:go", { detail: where }));
  };

  if (!live) return null;

  // 건너뛰면 모두 둘러본 것으로 센다
  const seen = skipped ? spots : found;
  const countFound = seen.filter((id) => spots.includes(id)).length;
  const navOpen = countFound >= NAV_AFTER;
  const activeSpot = active ? SPOTS[active] : null;
  const spot: GuideSpot = skipped && guideSpot === "center" ? "hidden" : guideSpot;
  // 앉기, 상영, 책장, 열린 창에서는 엔진의 단추와 창을 쓰므로 안내 팝업을 잠시 내린다
  const guideShown = spot !== "hidden" && engineMode === "room" && !panelOpen;
  const progressNote =
    countFound >= spots.length
      ? "You found every story here."
      : navOpen
        ? "A menu just opened at the top."
        : `${countFound} of ${spots.length} found`;

  return (
    <>
      {/* 왼쪽 위 방 이름(엔진의 #cname) 대신 서비스 이름. 이름 칸은 CSS 가 자리만 남기고 감춘다. */}
      <span className="oc-corner oc-pixel">memories</span>

      <div
        className={`oc-guide${guideShown ? (spot === "center" ? " open center" : " open") : ""}`}
        aria-live="polite"
        aria-hidden={!guideShown}
      >
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
                <span key={id} className={seen.includes(id) ? "on" : ""}>
                  {seen.includes(id) ? "●" : "○"}
                </span>
              ))}
            </span>
            <span>{progressNote}</span>
          </div>
        </Paper>
      </div>

      <nav className={`oc-nav${navOpen ? " open" : ""}`} aria-label="Menu" aria-hidden={!navOpen}>
        <Paper tape={["tl"]}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="oc-nav-btn"
              onClick={item.go ? () => go(item.go!) : undefined}
              tabIndex={navOpen ? 0 : -1}
            >
              <PixelIcon name={item.icon} size={NAV_ICON} />
              <span className="oc-label">{item.label}</span>
            </button>
          ))}
          {signedIn ? (
            <span className="oc-nav-btn oc-nav-name">
              <PixelIcon name="user" size={NAV_ICON} />
              <span>{viewerName}</span>
            </span>
          ) : (
            <button
              type="button"
              className="oc-nav-btn"
              onClick={() => setLoginReason(LOGIN_REASON)}
              tabIndex={navOpen ? 0 : -1}
            >
              <PixelIcon name="login" size={NAV_ICON} />
              <span className="oc-label">Login</span>
            </button>
          )}
          <button type="button" className="oc-nav-btn" onClick={() => router.push(SETTINGS_HREF)} tabIndex={navOpen ? 0 : -1}>
            <PixelIcon name="settings" size={NAV_ICON} />
            <span className="oc-label">Setting</span>
          </button>
        </Paper>
      </nav>

      {loginReason && <LoginPopup reason={loginReason} onClose={closeLogin} onSignedIn={onSignedIn} />}
    </>
  );
}
