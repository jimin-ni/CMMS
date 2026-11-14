"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addGuestbookAction, recordVisitAction } from "@/lib/heap/actions";
import { itemHalfExtents, itemPlacementError } from "@/lib/heap/layout";
import { surfaces } from "@/lib/heap/surfaces";
import { HEAP_POLICY } from "@/lib/heap/policy";
import { parsePieceUrl } from "@/lib/heap/platform";
import { isEmailAddress, isSafeLink, isWebLink, parseMusicUrl } from "@/lib/heap/slots";
import { SHELL_KEYS } from "@/lib/heap/template-move";
import type { HeapChannelPlatform } from "@/lib/heap/platform";
import type { ReelClass } from "@/lib/heap/caps";
import { RoomEditor } from "./room-editor";
import { SetupChecklist, setupFlags, type ChecklistAction } from "./setup-checklist";
import { ShareButton } from "./share-button";
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
  // platform: heap_reels.platform (유튜브는 썸네일 카드, 인스타그램·틱톡은 제목 카드) · url: 정규 원본 주소
  reels: {
    id: string;
    platform: string;
    url: string;
    title: string;
    channel: string | null;
    wide: boolean;
    views: string;
    published: string | null;
  }[];
  pieces: { id: string; by: string; date: string; caption: string }[];
  guestbook: { id: string; name: string; createdAt: string }[];
  visits: { today: number; total: number };
  creatorVisit: string | null;
};

// 방 주인에게만 넘기는 값 (page.tsx). 체크리스트와 꾸미기의 채널 탭이 읽는다. 주소(url)는 https 만, 아니면 null.
export type HeapOwnerData = {
  // 방 이름을 지었는지 견주는 닉네임
  nickname: string;
  channels: { id: string; platform: HeapChannelPlatform; title: string; url: string | null }[];
  // 이 방의 영상 전부 (힙에서 뺀 것 포함, 최근 순). id 는 heap_reels.id (빼기·되돌리기 액션이 받는 값)
  reels: {
    id: string;
    platform: HeapChannelPlatform;
    title: string;
    url: string | null;
    kind: ReelClass;
    channelId: string | null;
    published: string | null;
    excluded: boolean;
  }[];
};

// 꾸미기가 방의 틀을 바꿀 때 엔진이 보내는 편집 상태 (engine/edit.js 의 remount). 다음 마운트에 opts.resume 으로 그대로 넘긴다.
// shell: 방 크기와 고정된 것의 자리 (템플릿을 깔면 바뀐다) · name: 꾸미는 중인 방 이름 · savedName: 저장된 방 이름
type EditResume = {
  edit: boolean;
  items: unknown[];
  time: string | number;
  palette: Record<string, unknown> | null;
  // 방 뒤의 배경(null = 시간 따라)과 주인이 넣은 브랜드 색(null = 없음). 팔레트처럼 레이아웃에 얹는다
  backdrop?: Record<string, unknown> | null;
  brand?: string[] | null;
  shell?: Record<string, unknown>;
  name?: string;
  savedName?: string;
  original: unknown;
  baseLayout: Record<string, unknown>;
  [key: string]: unknown;
};

// 저장된 모습 하나: 레이아웃 전체와 방 이름. 저장 전으로(판정 J10)가 이 방문 동안 한 벌을 기억한다.
export type SavedRoom = { layout: Record<string, unknown>; name: string };

// 미니룸 화면. 마크업은 room.html의 HUD/오버레이 그대로이고, 엔진(engine/)이 id로 찾아 채운다.
// three는 브라우저에서만 돌아야 하므로 엔진은 effect 안에서 dynamic import로 불러온다.
// canEdit: 꾸미기 버튼을 보여 줄지. 방을 걸어 다니는 동안(엔진의 room 모드)에만 버튼이 나온다.
export function HeapRoom({
  roomId,
  data,
  viewerName,
  signedIn,
  canEdit = false,
  owner = null,
}: {
  roomId: string;
  data: HeapRoomData;
  viewerName: string | null;
  signedIn: boolean;
  canEdit?: boolean;
  // 방 주인에게만: 체크리스트가 읽는 닉네임, 채널 탭이 읽는 채널과 영상
  owner?: HeapOwnerData | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // 엔진이 알려 주는 값: 방이 화면에 떴는지(heap:ready), 지금 모드(heap:mode).
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState("room");
  const [editing, setEditing] = useState(false);
  // 팔로워로 보기 (판정 J7): 꾸미기 화면을 모두 숨기고 방을 팔로워의 구도로 보여 준다. 꾸미기 안에서만 켠다.
  const [preview, setPreview] = useState(false);
  const closeEditor = useCallback(() => {
    setEditing(false);
    setPreview(false);
  }, []);
  // 이 방문 동안의 저장: 마지막으로 저장한 모습, 그 저장 바로 전의 모습(저장 전으로), 이번에 저장했는지 (체크리스트)
  const [saved, setSaved] = useState<SavedRoom>({ layout: data.layout, name: data.name });
  const [beforeSave, setBeforeSave] = useState<SavedRoom | null>(null);
  const [savedThisVisit, setSavedThisVisit] = useState(false);
  const onSaved = useCallback((prev: SavedRoom, next: SavedRoom) => {
    setBeforeSave(prev);
    setSaved(next);
    setSavedThisVisit(true);
  }, []);
  // 체크리스트의 단추가 꾸미기에 시키는 일. 꾸미기가 닫혀 있으면 열고 나서 한다. seq 로 같은 일을 두 번 눌러도 새 일이 된다.
  const [action, setAction] = useState<{ kind: ChecklistAction; seq: number } | null>(null);
  const runAction = (kind: ChecklistAction) => {
    setAction({ kind, seq: (action?.seq ?? 0) + 1 });
    setEditing(true);
    setPreview(false);
  };
  // 꾸미는 동안의 체크리스트 상태 (저장 전의 기능과 이름). 꾸미기가 닫히면 저장된 것을 읽는다.
  const [live, setLive] = useState<{ pc: boolean; keepsake: boolean; name: string } | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !editing || !owner) return;
    const onState = (e: Event) => {
      const d = (e as CustomEvent<{ items: unknown; name?: string }>).detail;
      const f = setupFlags(d.items);
      const name = typeof d.name === "string" ? d.name : "";
      setLive((prev) => (prev && prev.pc === f.pc && prev.keepsake === f.keepsake && prev.name === name ? prev : { ...f, name }));
    };
    root.addEventListener("heap:editstate", onState);
    return () => {
      root.removeEventListener("heap:editstate", onState);
      setLive(null);
    };
  }, [editing, owner]);
  // 팔레트를 바꾸며 다시 마운트할 때의 편집 상태. 이 방에만 쓴다 (방을 옮기면 버려진다).
  const [resume, setResume] = useState<EditResume | null>(null);
  // 엔진은 가장 최근의 data 로 뜬다. 같은 방의 새 스냅샷(router.refresh: 채널 탭)은 엔진을 다시 띄우지 않는다:
  // 새 영상 목록만 heap:reels 로 보내고(engine/live.js), 다음에 다시 마운트하면(팔레트) 이 값으로 뜬다.
  const latest = useRef(data);
  const engineData = useRef(data);
  useEffect(() => {
    latest.current = data;
    if (engineData.current === data) return;
    engineData.current = data;
    rootRef.current?.dispatchEvent(new CustomEvent("heap:reels", { detail: data.reels }));
  }, [data]);
  // 방을 옮기면 꾸미기를 닫고 이어 붙일 편집 상태도 버린다 (렌더 중에 앞의 방과 견준다). 앞 방의 편집이 새 방으로 새지 않게.
  const [shownRoom, setShownRoom] = useState(data.roomUuid);
  if (shownRoom !== data.roomUuid) {
    setShownRoom(data.roomUuid);
    setEditing(false);
    setResume(null);
  }

  // 꾸미기가 열리고 닫힐 때 엔진에 알린다. 엔진은 편집 모드로 들어가고(engine/edit.js) 음악을 멈춘다.
  useEffect(() => {
    rootRef.current?.dispatchEvent(new CustomEvent("heap:edit", { detail: editing }));
  }, [editing]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let dispose: (() => void) | null = null;
    const data = latest.current;
    engineData.current = data;
    // 엔진이 뜨는 동안(dynamic import, setupLive 전) 새 스냅샷이 오면 그 heap:reels 는 듣는 이가 없다. 뜬 뒤에 최신 목록을 한 번 더 보낸다.
    const onReady = () => {
      setReady(true);
      const now = latest.current;
      // 엔진이 뜬 data 와 다르면 보낸다. 이미 받은 목록이면 엔진에서 아무 일도 없다.
      if (now !== data) {
        engineData.current = now;
        root.dispatchEvent(new CustomEvent("heap:reels", { detail: now.reels }));
      }
    };
    const onMode = (e: Event) => setMode((e as CustomEvent<string>).detail);
    const onRemount = (e: Event) => setResume((e as CustomEvent<EditResume>).detail);
    root.addEventListener("heap:ready", onReady);
    root.addEventListener("heap:mode", onMode);
    root.addEventListener("heap:remount", onRemount);
    // 다시 마운트할 때는 편집 중인 가구, 시간, 팔레트를 저장된 레이아웃 위에 얹어 띄운다. palette가 null이면 기본 색이다.
    const r = resume;
    let mountData = data;
    // 방의 틀(shell)이 있으면 저장된 틀 대신 그것을 쓴다 (템플릿을 깔았거나 저장 전 모습을 불러왔다). 이름도 꾸미는 중인 이름으로 띄운다.
    if (r) {
      const layout: Record<string, unknown> = { ...r.baseLayout, items: r.items, time: r.time };
      if (r.shell) {
        for (const key of SHELL_KEYS) delete layout[key];
        Object.assign(layout, r.shell);
      }
      if (r.palette) layout.palette = r.palette;
      else delete layout.palette;
      if (r.backdrop) layout.backdrop = r.backdrop;
      else delete layout.backdrop;
      if (r.brand) layout.brand = r.brand;
      else delete layout.brand;
      mountData = { ...data, layout, name: typeof r.name === "string" ? r.name : data.name };
    }
    import("./engine").then(({ mountRoom }) => {
      // StrictMode의 첫 번째 mount는 여기서 걸러져 엔진이 한 번만 뜬다.
      if (cancelled) return;
      dispose = mountRoom(root, {
        roomId,
        dataBase: DATA_BASE,
        data: mountData,
        resume: r,
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
        // 꾸미기(engine/edit.js)가 옮기는 동안 쓰는 서버의 자리 규칙: 바닥 크기, 자리 검사(서버와 같은 문구), 액자 높이와 벽 여백
        itemHalfExtents,
        placementError: itemPlacementError,
        // 가구 위에 얹기: 받침의 윗면 높이, 작은 가구, 위에 선 것 찾기, 저장된 물건을 윗면에 맞추기 (surfaces.ts)
        surfaces,
        policy: HEAP_POLICY,
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
      root.removeEventListener("heap:remount", onRemount);
      dispose?.();
    };
  }, [roomId, viewerName, signedIn, router, resume]);

  // 체크리스트: 방 주인에게, 방이 뜬 뒤, 걸어 다니는 방이나 꾸미기(팔로워로 보기 빼고)에서
  const showChecklist = !!owner && ready && (editing ? !preview : mode === "room");

  return (
    <div ref={rootRef} className={editing ? (preview ? "heap-room editing previewing" : "heap-room editing") : "heap-room"}>
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
            {ready && !editing && <ShareButton rootRef={rootRef} roomId={roomId} roomUuid={data.roomUuid} />}
          </div>
          <p className="hint" id="hint" />
        </div>
      </div>
      <p id="toast" />
      {editing && (
        <RoomEditor
          key={data.roomUuid}
          rootRef={rootRef}
          roomUuid={data.roomUuid}
          roomName={saved.name}
          onClose={closeEditor}
          preview={preview}
          setPreview={setPreview}
          action={action}
          beforeSave={beforeSave}
          onSaved={onSaved}
          owner={owner}
        />
      )}
      {showChecklist && owner && (
        <SetupChecklist
          roomId={roomId}
          roomUuid={data.roomUuid}
          nickname={owner.nickname}
          channels={owner.channels.length}
          name={editing && live ? live.name : saved.name}
          flags={editing && live ? live : setupFlags(saved.layout.items)}
          savedLayout={saved.layout}
          savedThisVisit={savedThisVisit}
          onAction={runAction}
        />
      )}

      <div id="player" hidden>
        <div className="player-bar">
          <span id="player-title" />
          <button id="player-close" className="btn ghost" type="button">
            플레이어 닫기
          </button>
        </div>
        <div id="player-frame" />
        <p id="player-note" hidden>
          이 미리보기 화면에는 공식 플레이어를 넣을 수 없어요. 아래의 원본 보기 단추로 열어 주세요.
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
