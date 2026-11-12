"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RoomEditor } from "./room-editor";
import "./heap-room.css";

// 방 데이터(JSON)는 public/heap/rooms/ 아래에 있다.
const DATA_BASE = "/heap/rooms/";
// 엔진이 캔버스에 글자를 그릴 때 이 두 글꼴 이름을 그대로 쓴다.
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600&family=Nanum+Pen+Script&display=swap";

// 미니룸 화면. 마크업은 room.html의 HUD/오버레이 그대로이고, 엔진(room-engine.js)이 id로 찾아 채운다.
// three는 브라우저에서만 돌아야 하므로 엔진은 effect 안에서 dynamic import로 불러온다.
// canEdit: 꾸미기 버튼을 보여 줄지. 방을 걸어 다니는 동안(엔진의 room 모드)에만 버튼이 나온다.
export function HeapRoom({
  roomId,
  viewerName,
  canEdit = false,
}: {
  roomId: string;
  viewerName: string | null;
  canEdit?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // 엔진이 알려 주는 값: 방이 화면에 떴는지(heap:ready), 지금 모드(heap:mode).
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState("room");
  const [editing, setEditing] = useState(false);
  const closeEditor = useCallback(() => setEditing(false), []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let dispose: (() => void) | null = null;
    const onReady = () => setReady(true);
    const onMode = (e: Event) => setMode((e as CustomEvent<string>).detail);
    root.addEventListener("heap:ready", onReady);
    root.addEventListener("heap:mode", onMode);
    import("./room-engine").then(({ mountRoom }) => {
      // StrictMode의 첫 번째 mount는 여기서 걸러져 엔진이 한 번만 뜬다.
      if (cancelled) return;
      dispose = mountRoom(root, {
        roomId,
        dataBase: DATA_BASE,
        viewerName,
        // 원본의 hash + reload 자리. 이동하면 이 방의 effect가 정리되면서 엔진이 dispose된다.
        onNavigate: (id) => router.push(`/room/${encodeURIComponent(id)}`),
      });
    });
    return () => {
      cancelled = true;
      root.removeEventListener("heap:ready", onReady);
      root.removeEventListener("heap:mode", onMode);
      dispose?.();
    };
  }, [roomId, viewerName, router]);

  return (
    <div ref={rootRef} className={editing ? "heap-room editing" : "heap-room"}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONTS_HREF} precedence="default" />

      {/* 엔진이 mount마다 여기에 <canvas id="scene">을 새로 만들고, dispose 때 지운다. */}
      <div id="scene-host" />
      <div className="hud">
        <header className="who">
          <span className="name" id="cname" />
          <span className="meta" id="meta" />
          <span className="meta" id="visit" hidden />
        </header>
        <div className="bottom">
          <div className="row" id="albumrow" hidden />
          <div className="row">
            <button id="stand" className="btn" type="button" hidden>
              일어나기
            </button>
            <button id="flip" className="btn paper" type="button" hidden>
              뒤집기
            </button>
            <a id="srclink" className="btn ghost" href="https://www.youtube.com/" target="_blank" rel="noopener" hidden>
              원본 보기
            </a>
            <button id="eject" className="btn" type="button" hidden>
              사진 꺼내기
            </button>
            <a id="ytlink" className="btn ghost" href="https://www.youtube.com/" target="_blank" rel="noopener" hidden>
              YouTube에서 보기
            </a>
            <button id="sortexit" className="btn ghost" type="button" hidden>
              책장에서 물러나기
            </button>
            {canEdit && ready && mode === "room" && !editing && (
              <button className="btn ghost" type="button" onClick={() => setEditing(true)}>
                꾸미기
              </button>
            )}
          </div>
          <p className="hint" id="hint" />
        </div>
      </div>
      <p id="toast" />
      {editing && <RoomEditor rootRef={rootRef} onClose={closeEditor} />}

      <div id="player" hidden>
        <div className="player-bar">
          <span id="player-title" />
          <button id="player-close" className="btn ghost" type="button">
            플레이어 닫기
          </button>
        </div>
        <div id="player-frame" />
        <p id="player-note" hidden>
          이 미리보기 화면에는 YouTube 플레이어를 넣을 수 없어요. 아래의 &apos;YouTube에서 보기&apos;로 원본을 열어 주세요.
        </p>
      </div>

      <div id="phone" className="overlay" hidden>
        <div className="phone">
          <div className="phone-screen">
            <div className="phone-head">
              <span className="avatar" aria-hidden="true" id="avatar" />
              <div className="who2">
                <b id="phone-title" />
                <small id="phone-sub" />
              </div>
              <button id="phone-close" className="btn ghost" type="button">
                닫기
              </button>
            </div>
            <div className="phone-feed" id="phone-feed" />
          </div>
        </div>
      </div>

      <div id="grid" className="overlay" hidden>
        <div className="panel">
          <div className="panel-head">
            <b id="grid-title" />
            <button id="grid-close" className="btn ghost" type="button">
              닫기
            </button>
          </div>
          <div className="panel-body">
            <p className="note">제목이나 채널로 분류가 확실한 사진만 앨범에 들어가요.</p>
            <div className="grid-list" id="grid-list" />
          </div>
        </div>
      </div>

      <div id="guestbook" className="overlay" hidden>
        <div className="panel">
          <div className="panel-head">
            <b>방명록</b>
            <button id="gb-close" className="btn ghost" type="button">
              닫기
            </button>
          </div>
          <div className="panel-body">
            <form className="gb-form" id="gb-form">
              <input
                id="gb-name"
                name="gb-name"
                maxLength={12}
                autoComplete="nickname"
                placeholder="이름 (12자까지)"
                aria-label="방명록에 남길 이름"
              />
              <button className="btn" type="submit">
                이름 남기기
              </button>
            </form>
            <div className="gb-list" id="gb-list" />
            <p className="note">
              이름과 날짜만 남아요. 예시 표시가 붙은 줄은 시연용이고, 내가 남긴 이름은 지금은 이 기기에만 저장돼요.
            </p>
          </div>
        </div>
      </div>

      <div id="rooms" className="overlay" hidden>
        <div className="panel">
          <div className="panel-head">
            <b>다른 방으로</b>
            <button id="rooms-close" className="btn ghost" type="button">
              닫기
            </button>
          </div>
          <div className="panel-body">
            <div className="roomlist" id="roomlist" />
          </div>
        </div>
      </div>
      <div id="fade" />
      <p id="status">방 꾸미는 중…</p>
    </div>
  );
}
