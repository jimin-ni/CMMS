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
import { CHAT_DOCK_OPEN, ChatDock } from "@/components/bubble/chat-dock";

const LOGIN_REASON = "Sign in to leave your mark in this room.";
// 로그인 전에 방 안에서 로그인이 필요한 것을 누를 때 (HeapRoom 이 보내는 heap:signin 의 detail)
const SIGNIN_REASONS: Record<string, string> = {
  chat: "Sign in to chat with the creator.",
  guestbook: "Sign in to leave your name in the guestbook.",
  note: "Sign in to hang a note on the tree.",
};
// 설정 버튼이 여는 곳 (settings-book.tsx)
const SETTINGS_HREF = "/settings";
// 로그인한 사람의 이름 버튼이 여는 곳 (mypage/my-book.tsx)
const MYPAGE_HREF = "/mypage";
// 가운데 안내 팝업이 아래로 내려가기까지
const GUIDE_CENTER_MS = 3000;

// 내비게이션 바의 버튼: 홈, 폴라로이드, 레터, (로그인), 설정. 챗은 오른쪽 아래 채팅 창(ChatDock)으로 옮겼다.
// go: 방 안에서 옮겨 갈 곳 (엔진의 heap:go, engine/nav.js). 레터는 쪽지 트리로 들어간다 (트리가 없는 방은 방명록).
type Go = "room" | "polaroid" | "tree";
const NAV_ITEMS: { id: string; icon: PixelIconName; label: string; go: Go }[] = [
  { id: "home", icon: "home", label: "Home", go: "room" },
  { id: "polaroid", icon: "image", label: "Polaroid", go: "polaroid" },
  { id: "letter", icon: "mail", label: "Letter", go: "tree" },
];
const NAV_ICON = 28;

// 안내 팝업 자리: 가운데, 아래, 숨김(Esc 로 건너뛴 뒤 아직 아무 곳도 둘러보지 않음)
type GuideSpot = "center" | "bottom" | "hidden";

// hostRef: HeapRoom 을 감싼 요소 (.oc-room-host). 엔진 모드를 data-mode 로 달아 CSS 가 방의 단추를 감추거나 보인다.
// live: 방 안을 둘러보는 단계인지. 그 전에는 아무것도 세지 않고 보이지 않는다.
// skipped: Esc 로 온보딩을 건너뛰었는지. 모두 둘러본 것으로 세어 내비게이션 바를 연다.
// homeHref: 있으면 홈 버튼이 방 안의 처음 자리 대신 이 주소로 간다 (문으로 옮겨 간 다른 방, visit-room.tsx).
// chatRoom: 오른쪽 아래 채팅 창이 대화를 여는 방(미니룸 slug). 내비게이션 바가 열릴 때 함께 뜬다. 없으면 채팅 창도 없다.
export function RoomTour({
  hostRef,
  live,
  skipped = false,
  layoutItems,
  viewerName,
  signedIn,
  homeHref,
  chatRoom,
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  live: boolean;
  skipped?: boolean;
  layoutItems: unknown;
  viewerName: string | null;
  signedIn: boolean;
  homeHref?: string;
  chatRoom?: string;
}) {
  const router = useRouter();
  const liveRef = useRef(live);
  const [engineMode, setEngineMode] = useState("room");
  const [panelOpen, setPanelOpen] = useState(false);
  const [guideSpot, setGuideSpot] = useState<GuideSpot>("center");
  const [found, setFound] = useState<SpotId[]>([]);
  const [active, setActive] = useState<SpotId | null>(null);
  // 로그인 팝업. null 이면 닫힘. reason: 까닭 글.
  // action: 방 안에서 로그인이 필요한 것을 눌러 뜬 경우 그 일(heap:signin 의 detail). 내비게이션 바의 로그인이면 null.
  // 로그인하거나 가입하고 나면 그 일을 하던 화면으로 돌아간다.
  const [login, setLogin] = useState<{ reason: string; action: string | null } | null>(null);
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
    // 로그인 전에 휴대폰의 대화, 방명록, 쪽지 쓰기를 누르면 방이 알려 준다 (HeapRoom 의 signInHere)
    const onSignIn = (e: Event) => {
      const action = (e as CustomEvent<string>).detail;
      setLogin({ reason: SIGNIN_REASONS[action] ?? LOGIN_REASON, action: action ?? null });
    };
    roomEl.addEventListener("heap:mode", onMode);
    roomEl.addEventListener("heap:signin", onSignIn);
    return () => {
      watch.disconnect();
      roomEl.removeEventListener("heap:mode", onMode);
      roomEl.removeEventListener("heap:signin", onSignIn);
    };
  }, [hostRef, markFound]);

  // 로그인하지 않은 방문자에게 아직 둘러보지 않은 곳을 옅게 빛낸다 (엔진의 heap:hint, engine/walk.js).
  // 둘러본 곳은 빛이 꺼진다. 건너뛰었거나 로그인했으면 아무것도 빛내지 않는다. 엔진이 다시 뜨면(heap:ready) 다시 보낸다.
  const hintSpots = useMemo(
    () => (live && !signedIn && !skipped ? spots.filter((id) => !found.includes(id)) : []),
    [live, signedIn, skipped, spots, found],
  );
  useEffect(() => {
    const roomEl = hostRef.current?.querySelector<HTMLElement>(".heap-room");
    if (!roomEl) return;
    const send = () => roomEl.dispatchEvent(new CustomEvent("heap:hint", { detail: hintSpots }));
    send();
    roomEl.addEventListener("heap:ready", send);
    return () => roomEl.removeEventListener("heap:ready", send);
  }, [hostRef, hintSpots]);

  // 방 안에 들어오면("Ready to Start?" 뒤) 누를 수 있는 물건 위에 작은 빛을 반짝인다 (엔진의 heap:sparkle, engine/sparkle.js).
  // 엔진이 다시 뜨면(heap:ready) 다시 보낸다.
  useEffect(() => {
    const roomEl = hostRef.current?.querySelector<HTMLElement>(".heap-room");
    if (!roomEl) return;
    const send = () => roomEl.dispatchEvent(new CustomEvent("heap:sparkle", { detail: live }));
    send();
    roomEl.addEventListener("heap:ready", send);
    return () => roomEl.removeEventListener("heap:ready", send);
  }, [hostRef, live]);

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

  const closeLogin = useCallback(() => setLogin(null), []);
  // 로그인하면 서버가 닉네임과 로그인 상태를 다시 읽는다 (방명록 쓰기도 켜진다).
  // 방 안의 일 때문에 뜬 팝업이면 방에 heap:signedin 으로 알린다: 엔진이 다시 뜬 뒤 그 화면을 다시 연다 (heap-room.tsx).
  const loginAction = login?.action ?? null;
  const onSignedIn = useCallback(() => {
    setLogin(null);
    // 채팅 창에서 뜬 팝업이면 로그인 뒤 채팅 창을 다시 펼친다. 그 밖의 일은 방이 그 화면을 다시 연다.
    if (loginAction === "chat" && chatRoom) window.dispatchEvent(new Event(CHAT_DOCK_OPEN));
    else if (loginAction) hostRef.current?.querySelector(".heap-room")?.dispatchEvent(new CustomEvent("heap:signedin", { detail: loginAction }));
    router.refresh();
  }, [router, hostRef, loginAction, chatRoom]);
  // 방 안의 자리로 옮긴다: 홈(처음 들어온 상태), 탁자의 사진, 탁자의 휴대폰
  const go = (where: Go) => {
    if (where === "room" && homeHref) {
      router.push(homeHref);
      return;
    }
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
  const allFound = countFound >= spots.length;
  // 앉기, 상영, 책장, 열린 창에서는 엔진의 단추와 창을 쓰므로 안내 팝업을 잠시 내린다.
  // 모든 곳을 둘러보면 안내 팝업은 닫는다.
  const guideShown = spot !== "hidden" && engineMode === "room" && !panelOpen && !allFound;
  const progressNote =
    allFound
      ? "You found every story here."
      : navOpen
        ? "A menu just opened at the top."
        : `${countFound} of ${spots.length} found`;

  return (
    <>
      {/* 왼쪽 위 방 이름(엔진의 #cname) 대신 서비스 이름. 이름 칸은 CSS 가 자리만 남기고 감춘다. */}
      <span className="oc-corner oc-display">MEMOAMO</span>

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
              onClick={() => go(item.go)}
              tabIndex={navOpen ? 0 : -1}
            >
              <PixelIcon name={item.icon} size={NAV_ICON} />
              <span className="oc-label">{item.label}</span>
            </button>
          ))}
          {signedIn ? (
            <button
              type="button"
              className="oc-nav-btn oc-nav-name"
              onClick={() => router.push(MYPAGE_HREF)}
              tabIndex={navOpen ? 0 : -1}
              title="My page"
            >
              <PixelIcon name="user" size={NAV_ICON} />
              <span>{viewerName}</span>
            </button>
          ) : (
            <button
              type="button"
              className="oc-nav-btn"
              onClick={() => setLogin({ reason: LOGIN_REASON, action: null })}
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

      {chatRoom && navOpen && (
        <ChatDock
          room={chatRoom}
          signedIn={signedIn}
          onAskSignIn={() => setLogin({ reason: SIGNIN_REASONS.chat, action: "chat" })}
        />
      )}

      {login && <LoginPopup reason={login.reason} onClose={closeLogin} onSignedIn={onSignedIn} />}
    </>
  );
}
