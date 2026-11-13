"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addGuestbookAction, recordVisitAction } from "@/lib/heap/actions";
import { HEAP_POLICY } from "@/lib/heap/policy";
import { parsePieceUrl } from "@/lib/heap/platform";
import { isEmailAddress, isSafeLink, isWebLink, parseMusicUrl } from "@/lib/heap/slots";
import { RoomEditor } from "./room-editor";
import "./heap-room.css";

// 크리에이터 정보(creator.json)는 public/heap/rooms/ 아래의 정적 파일이다. 나머지 방 데이터는 서버가 DB에서 읽어 data로 넘긴다.
const DATA_BASE = "/heap/rooms/";
// 엔진이 캔버스에 글자를 그릴 때 이 두 글꼴 이름을 그대로 쓴다.
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600&family=Nanum+Pen+Script&display=swap";

// page.tsx가 DB 스냅샷을 엔진이 쓰는 모양으로 바꿔 넘긴다. 날짜는 한국 시간 "YYYY.MM.DD" 문자열.
export type HeapRoomData = {
  // heap_rooms.id (uuid). 서버 액션과 실시간 읽기 주소가 이 값을 쓴다. 주소의 slug와 다르다.
  roomUuid: string;
  // 방 이름(heap_rooms.name). 화면 제목과 카드 뒷면에 쓴다.
  name: string;
  // 휴대폰이 여는 버블 주소: 방 주인의 열린 대화방(/bubble/<id>) 또는 목록(/bubble)
  bubbleHref: string;
  // 이 스냅샷을 읽은 DB 시각(ISO). 실시간 읽기의 첫 기준점이다.
  serverTime: string;
  // changed: 로그인한 사람이 마지막으로 다녀간 뒤 바뀐 방이면 true (문에 붙은 방 목록에 점이 찍힌다). 로그인하지 않았으면 모두 false.
  rooms: { id: string; name: string; blurb: string; changed: boolean }[];
  layout: Record<string, unknown>;
  reels: { id: string; title: string; channel: string | null; wide: boolean; views: string; published: string | null }[];
  pieces: { id: string; by: string; date: string; caption: string }[];
  guestbook: { id: string; name: string; createdAt: string }[];
  visits: { today: number; total: number };
  creatorVisit: string | null;
};

// 미니룸 화면. 마크업은 room.html의 HUD/오버레이 그대로이고, 엔진(room-engine.js)이 id로 찾아 채운다.
// three는 브라우저에서만 돌아야 하므로 엔진은 effect 안에서 dynamic import로 불러온다.
// canEdit: 꾸미기 버튼을 보여 줄지. 방을 걸어 다니는 동안(엔진의 room 모드)에만 버튼이 나온다.
export function HeapRoom({
  roomId,
  data,
  viewerName,
  signedIn,
  canEdit = false,
}: {
  roomId: string;
  data: HeapRoomData;
  viewerName: string | null;
  signedIn: boolean;
  canEdit?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // 엔진이 알려 주는 값: 방이 화면에 떴는지(heap:ready), 지금 모드(heap:mode).
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState("room");
  const [editing, setEditing] = useState(false);
  const closeEditor = useCallback(() => setEditing(false), []);

  // 꾸미기 패널이 열리고 닫힐 때 엔진에 알린다. 패널이 음악 플레이어 자리를 차지하므로 열리면 음악이 멈춘다.
  useEffect(() => {
    rootRef.current?.dispatchEvent(new CustomEvent("heap:edit", { detail: editing }));
  }, [editing]);

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
        data,
        viewerName,
        signedIn,
        roomUuid: data.roomUuid,
        pollMs: HEAP_POLICY.pollIntervalMs,
        bubbleHref: data.bubbleHref,
        navigate: (href: string) => router.push(href),
        // 기념품 링크가 유튜브 게시물인지 알아보는 데 쓴다 (엔진이 썸네일 주소를 만든다)
        parseLink: parsePieceUrl,
        // 음악 링크(유튜브 영상·재생목록)에서 임베드 ID를 뽑는다. 서버가 저장 전에 하는 검사와 같은 함수다.
        parseMusic: parseMusicUrl,
        // 링크를 화면에 걸기 전의 검사. 서버가 저장 전에 하는 검사와 같은 함수다.
        isSafeLink,
        isWebLink,
        isEmail: isEmailAddress,
        recordVisit: () => recordVisitAction(data.roomUuid),
        addGuestbook: (name: string) => addGuestbookAction(data.roomUuid, name),
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
  }, [roomId, data, viewerName, signedIn, router]);

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
      {editing && <RoomEditor rootRef={rootRef} roomUuid={data.roomUuid} onClose={closeEditor} />}

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

      {/* 음악: 방 오른쪽 위에 붙는 공식 유튜브 플레이어. 방 이름의 반대편이다. 엔진이 채운다. */}
      <div id="music" hidden>
        <div className="player-bar">
          <span id="music-title">음악</span>
          <button id="music-close" className="btn ghost" type="button">
            닫기
          </button>
        </div>
        <div id="music-frame" />
        <p id="music-note" hidden>
          이 미리보기 화면에는 YouTube 플레이어를 넣을 수 없어요.
        </p>
        <a id="music-link" className="btn ghost" href="https://www.youtube.com/" target="_blank" rel="noopener" hidden>
          YouTube에서 열기
        </a>
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

      {/* 책상 위 PC: 크리에이터의 링크 모음. 엔진이 pc-list를 채운다. */}
      <div id="pc" className="overlay" hidden>
        <div className="panel">
          <div className="panel-head">
            <b id="pc-title">링크 모음</b>
            <button id="pc-close" className="btn ghost" type="button">
              닫기
            </button>
          </div>
          <div className="panel-body pc-list" id="pc-list" />
        </div>
      </div>

      {/* 액자와 선반 위 기념품: 이름, 날짜, 설명, 원본 링크. 엔진이 ks-title과 ks-body를 채운다. */}
      <div id="keepsake" className="overlay" hidden>
        <div className="panel">
          <div className="panel-head">
            <b id="ks-title" />
            <button id="ks-close" className="btn ghost" type="button">
              닫기
            </button>
          </div>
          <div className="panel-body" id="ks-body" />
        </div>
      </div>

      {/* 책상 위 달력: 크리에이터가 팬에게 알리는 날짜. 오늘부터 앞으로의 것만 보인다. 엔진이 cal-body를 채운다. */}
      <div id="calendar" className="overlay" hidden>
        <div className="panel">
          <div className="panel-head">
            <b>달력</b>
            <button id="cal-close" className="btn ghost" type="button">
              닫기
            </button>
          </div>
          <div className="panel-body" id="cal-body" />
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
            {signedIn ? (
              <form className="gb-form" id="gb-form">
                <input
                  id="gb-name"
                  name="gb-name"
                  maxLength={HEAP_POLICY.guestbookNameMaxChars}
                  autoComplete="nickname"
                  placeholder={`이름 (${HEAP_POLICY.guestbookNameMaxChars}자까지)`}
                  aria-label="방명록에 남길 이름"
                />
                <button className="btn" type="submit" id="gb-submit">
                  이름 남기기
                </button>
              </form>
            ) : (
              <p className="note" id="gb-login">
                이름을 남기려면 <Link href="/login">로그인</Link>이 필요해요.
              </p>
            )}
            <p className="note" id="gb-msg" role="status" />
            <div className="gb-list" id="gb-list" />
            <p className="note">이름과 날짜만 남아요.</p>
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
            <p className="note" id="rooms-legend" hidden>
              <span className="dot" aria-hidden="true" />
              다녀간 뒤 바뀐 방이에요.
            </p>
          </div>
        </div>
      </div>
      <div id="fade" />
      <p id="status">방 꾸미는 중…</p>
    </div>
  );
}
