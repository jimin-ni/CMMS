"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { withNext } from "@/lib/next-path";
import {
  addGuestbookAction,
  addNoteAction,
  deleteNoteAction,
  markNoteReadAction,
  recordVisitAction,
  refetchNotesAction,
  replyNoteAction,
  setNoteHiddenAction,
} from "@/lib/heap/actions";
import { itemHalfExtents, itemPlacementError } from "@/lib/heap/layout";
import { surfaces } from "@/lib/heap/surfaces";
import { HEAP_POLICY } from "@/lib/heap/policy";
import { parsePieceUrl } from "@/lib/heap/platform";
import { isEmailAddress, isSafeLink, isWebLink, parseMusicUrl } from "@/lib/heap/slots";
import { SHELL_KEYS } from "@/lib/heap/template-move";
import { usePrefs } from "@/lib/settings/prefs";
import type { HeapChannelPlatform } from "@/lib/heap/platform";
import type { ReelClass } from "@/lib/heap/caps";
import { toEngineNote } from "./engine/tree-ids";
import { blockHeapAuthorAction, hidePersonAction, reportHeapPostAction } from "@/lib/heap/moderation-actions";
import type { HeapSurface } from "@/lib/moderation/repo";
import { MODERATION_TEXT } from "@/lib/moderation/policy";
import { ANIM_TEST, DEBUG_ON, SHADOW_TEST, saveDebugFlags } from "./engine/debug-flags";
import { FX, FX_GROUPS, resetFx, saveFx } from "./engine/fx-flags";
import { authClient } from "@/lib/auth-client";

// 디버그 값은 페이지가 뜰 때 정해지고 바뀌지 않는다
const noSubscribe = () => () => {};
// 방 안의 로그인 팝업으로 로그인한 뒤 다시 열 화면 (heap:signin 의 detail 에서 heap:go 의 detail 로). 쪽지는 writeOnLoad 로 연다.
const GO_AFTER_SIGNIN: Record<string, string> = { chat: "phone", guestbook: "guestbook" };
import { RoomEditor } from "./room-editor";
import { AlbumBook, type Album } from "./album-book";
import { SetupChecklist, setupFlags, type ChecklistAction } from "./setup-checklist";
import { ShareButton } from "./share-button";
import { createPresenceClient, createPresenceHub, type PresenceClient, type PresenceHub } from "./presence-client";
import { setPrefs, type NameShow } from "@/lib/settings/prefs";
import { moneygraphyPixel, moneygraphyRounded, pretendard } from "@/app/fonts/onboarding";
import "./heap-room.css";
import { CREDITS } from "@/components/snow-globe/credits";
import { CHAT_DOCK_OPEN } from "@/components/bubble/dock-parts";

// 크리에이터 정보(creator.json)는 public/heap/rooms/ 아래의 정적 파일이다. 나머지 방 데이터는 서버가 DB에서 읽어 data로 넘긴다.
const DATA_BASE = "/heap/rooms/";
// 엔진이 캔버스에 글자를 그릴 때 이 두 글꼴 이름을 그대로 쓴다.
// 영상 카드의 앞뒷면은 온보딩 글꼴(머니그라피, Pretendard)을 쓴다. 루트에 붙인 CSS 변수에서 엔진이 이름을 읽는다 (card-art.js).
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600&family=Nanum+Pen+Script&display=swap";

const CARD_FONTS = `${moneygraphyPixel.variable} ${moneygraphyRounded.variable} ${pretendard.variable}`;

// 쪽지 하나의 전송 모양. notes-repo.ts의 HeapNote에서 Date만 ISO 문자열로 바꾼 것이다 (실시간 읽기의 notes와 같다). 엔진의 tree-ids.js가 엔진 모양으로 바꾼다.
export type HeapNoteWire = {
  id: string;
  name: string | null;
  mine: boolean;
  sealed: boolean;
  hidden: boolean;
  body?: string;
  tint: string;
  font: string;
  y: number | null;
  angle: number | null;
  createdAt: string;
  reply?: { body: string; font: string; fontSize: number | null; createdAt: string };
  unread?: boolean;
};

// page.tsx가 DB 스냅샷을 엔진이 쓰는 모양으로 바꿔 넘긴다. 날짜는 한국 시간 "YYYY.MM.DD" 문자열.
export type HeapRoomData = {
  // 0013: 이 방의 글을 신고하고 쓰기를 막을 수 있는가 (방 주인이나 관리자). 서버가 다시 확인한다.
  canModerate?: boolean;
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
    handle: string | null;
    wide: boolean;
    views: string;
    // 조회수 그대로 (모르면 null). 시안 SVG 를 쓰는 방의 카드가 "2,000,000" 처럼 적는다 (engine/card-art.js).
    viewCount: number | null;
    published: string | null;
  }[];
  pieces: { id: string; by: string; date: string; caption: string }[];
  guestbook: { id: string; name: string; createdAt: string }[];
  visits: { today: number; total: number };
  creatorVisit: string | null;
  // 쪽지 트리: 보는 사람에게 보이는 쪽지 전부, 봉인이 풀리는 시각(ISO, 없으면 null), 방 주인에게만 0이 아닌 안 읽은 쪽지 수
  notes: HeapNoteWire[];
  noteRevealAt: string | null;
  unreadNotes: number;
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
// shell: 방 크기와 문의 자리 (템플릿을 깔면 바뀐다. 방 v2 에서 나머지 소품은 items 다) · name: 꾸미는 중인 방 이름 · savedName: 저장된 방 이름
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
  signInHere = false,
  presence = false,
  chatDock = false,
}: {
  roomId: string;
  data: HeapRoomData;
  viewerName: string | null;
  signedIn: boolean;
  canEdit?: boolean;
  // 방 주인에게만: 체크리스트가 읽는 닉네임, 채널 탭이 읽는 채널과 영상
  owner?: HeapOwnerData | null;
  // 온보딩: 로그인 전에 휴대폰의 대화를 누르면 로그인 화면으로 가지 않고 방에 heap:signin 을 보낸다 (둘러보기가 로그인 팝업을 띄운다)
  signInHere?: boolean;
  // 방 함께 있기를 켤지. /room 페이지만 true 를 넘긴다 (온보딩 방은 끈다)
  presence?: boolean;
  // 오른쪽 아래 채팅 창(bubble/chat-dock.tsx)이 있는 화면: 휴대폰의 "버블 열기"가 버블 화면으로 가지 않고 채팅 창을 편다.
  chatDock?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // 엔진이 알려 주는 값: 방이 화면에 떴는지(heap:ready), 지금 모드(heap:mode).
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState("room");
  // 책장에서 고른 앨범 (heap:album). 있으면 앨범 수첩을 띄운다
  const [album, setAlbum] = useState<Album | null>(null);
  const closeAlbum = useCallback(() => setAlbum(null), []);
  const [editing, setEditing] = useState(false);
  // 임시 디버그 사이드바 (engine/debug-flags.js). ?debug=1 일 때만. 서버 렌더와 맞추려고 마운트 뒤에 켠다.
  const debugOn = useSyncExternalStore(noSubscribe, () => DEBUG_ON, () => false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [animTest, setAnimTest] = useState({ ...ANIM_TEST });
  const toggleAnim = (key: "fold" | "bauble") => {
    ANIM_TEST[key] = !ANIM_TEST[key];
    saveDebugFlags();
    setAnimTest({ ...ANIM_TEST });
  };
  // 그림자 보기: room 방 안만(기본), all 방 밖까지, none 모두 감추기 (engine/shell.js 의 applyShadowMode)
  const [shadowMode, setShadowMode] = useState(SHADOW_TEST.mode);
  const pickShadow = (mode: string) => {
    SHADOW_TEST.mode = mode;
    saveDebugFlags();
    setShadowMode(mode);
    rootRef.current?.dispatchEvent(new CustomEvent("heap:shadow"));
  };
  const debugSignOut = async () => {
    await authClient.signOut();
    window.location.reload();
  };
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
  // 쪽지 공개 시각. 꾸미기의 공개일 칸이 바꾸면 여기와 엔진(heap:reveal)이 함께 바뀐다.
  const [noteRevealAt, setNoteRevealAt] = useState<string | null>(data.noteRevealAt);
  const onRevealSaved = useCallback((iso: string | null) => {
    setNoteRevealAt(iso);
    rootRef.current?.dispatchEvent(new CustomEvent("heap:reveal", { detail: iso }));
  }, []);
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
  // 로그인하고 돌아온 주소의 ?write=1: 쪽지 쓰기를 바로 연다 (L6). 처음 한 번만 읽고 주소에서 지운다.
  // StrictMode의 첫 effect가 지운 뒤에도 두 번째 effect가 알 수 있게 ref에 둔다. 엔진이 열고 나면 false가 된다 (다시 마운트해도 열리지 않는다).
  const writeOnLoad = useRef<boolean | null>(null);
  // 방 안의 로그인 팝업으로 로그인했다 (둘러보기가 보내는 heap:signedin, room-tour.tsx). 값은 로그인을 부른 일(heap:signin 의 detail).
  // 로그인하면 엔진이 다시 뜨는데, 그때 그 일을 하던 화면을 다시 연다. 쪽지는 쓰기 판, 대화는 휴대폰, 방명록은 방명록 창.
  const afterSignIn = useRef<string | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onSignedIn = (e: Event) => {
      afterSignIn.current = (e as CustomEvent<string>).detail;
    };
    root.addEventListener("heap:signedin", onSignedIn);
    return () => root.removeEventListener("heap:signedin", onSignedIn);
  }, []);
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

  // 방 함께 있기(presence, docs/dev/presence.md): 로그인한 사람의 /room 화면에서만 연결한다.
  // 연결은 엔진 바깥에 둔다. 꾸미기 때문에 엔진이 다시 마운트되어도 다른 사람에게 나갔다 들어온 것처럼 보이지 않게.
  // 엔진은 고정 손잡이(hub)를 받고, 연결은 설정(나 숨기기, 이름 공개 규칙)에 따라 여기서 바꿔 끼운다.
  const presenceOn = presence && signedIn && !!process.env.NEXT_PUBLIC_PRESENCE_URL;
  const [presenceHub] = useState(createPresenceHub);
  const presenceRef = useRef<PresenceClient | null>(null);
  const presencePrefs = usePrefs().presence;
  const hideOthersRef = useRef(presencePrefs.hideOthers);
  // 개인 차단(0013)을 새로 걸면 올린다: 새 티켓(가린 사람 목록 h)으로 다시 붙는다
  const [blockEpoch, setBlockEpoch] = useState(0);
  useEffect(() => {
    if (!presenceOn || presencePrefs.hideMe) return;
    const client = createPresenceClient({ roomUuid: data.roomUuid, show: presencePrefs.show });
    client.setMuted(hideOthersRef.current);
    presenceRef.current = client;
    presenceHub.attach(client);
    client.start();
    return () => {
      presenceHub.attach(null);
      client.close();
      if (presenceRef.current === client) presenceRef.current = null;
    };
  }, [presenceOn, data.roomUuid, presencePrefs.show, presencePrefs.hideMe, presenceHub, blockEpoch]);
  // 다른 사람 숨기기는 연결을 바꾸지 않고 서버에 알린다
  useEffect(() => {
    hideOthersRef.current = presencePrefs.hideOthers;
    presenceRef.current?.setMuted(presencePrefs.hideOthers);
  }, [presencePrefs.hideOthers]);

  // 꾸미기가 열리고 닫힐 때 엔진에 알린다. 엔진은 편집 모드로 들어가고(engine/edit.js) 음악을 멈춘다.
  useEffect(() => {
    rootRef.current?.dispatchEvent(new CustomEvent("heap:edit", { detail: editing }));
  }, [editing]);

  // 보는 사람이 설정 화면에서 고른 방 시간대 (engine/time.js 의 heap:viewtime). 꾸미는 동안에는 방 주인이 고른 시간대를 보여 준다.
  // 엔진이 새로 뜰 때(heap:ready)도 다시 보낸다: 팔레트를 바꾸면 엔진을 다시 마운트한다.
  const roomTimePref = usePrefs().roomTime;
  const viewTime = editing ? null : roomTimePref;
  const viewTimeRef = useRef(viewTime);
  useEffect(() => {
    viewTimeRef.current = viewTime;
    rootRef.current?.dispatchEvent(new CustomEvent("heap:viewtime", { detail: viewTime }));
  }, [viewTime]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let dispose: (() => void) | null = null;
    const data = latest.current;
    engineData.current = data;
    if (writeOnLoad.current === null) {
      const url = new URL(window.location.href);
      writeOnLoad.current = url.searchParams.get("write") === "1";
      if (url.searchParams.has("write")) {
        url.searchParams.delete("write");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }
    // 쪽지를 쓰려다 로그인했으면 ?write=1 로 돌아온 것과 같게 쓰기 판을 연다
    if (signedIn && afterSignIn.current === "note") {
      afterSignIn.current = null;
      writeOnLoad.current = true;
    }
    // 엔진이 뜨는 동안(dynamic import, setupLive 전) 새 스냅샷이 오면 그 heap:reels 는 듣는 이가 없다. 뜬 뒤에 최신 목록을 한 번 더 보낸다.
    const onReady = () => {
      setReady(true);
      // 대화나 방명록을 열려다 로그인했으면 그 화면을 다시 연다 (engine/nav.js 의 heap:go)
      const go = signedIn ? GO_AFTER_SIGNIN[afterSignIn.current ?? ""] : undefined;
      if (go) {
        afterSignIn.current = null;
        root.dispatchEvent(new CustomEvent("heap:go", { detail: go }));
      }
      root.dispatchEvent(new CustomEvent("heap:viewtime", { detail: viewTimeRef.current }));
      const now = latest.current;
      // 엔진이 뜬 data 와 다르면 보낸다. 이미 받은 목록이면 엔진에서 아무 일도 없다.
      if (now !== data) {
        engineData.current = now;
        root.dispatchEvent(new CustomEvent("heap:reels", { detail: now.reels }));
      }
    };
    const onMode = (e: Event) => setMode((e as CustomEvent<string>).detail);
    const onAlbum = (e: Event) => setAlbum((e as CustomEvent<Album>).detail);
    const onRemount = (e: Event) => setResume((e as CustomEvent<EditResume>).detail);
    root.addEventListener("heap:ready", onReady);
    root.addEventListener("heap:mode", onMode);
    root.addEventListener("heap:album", onAlbum);
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
        // 방 함께 있기 연결 (없으면 혼자 보는 방 그대로)
        presence: presenceOn ? presenceHub : undefined,
        pollMs: HEAP_POLICY.pollIntervalMs,
        bubbleHref: data.bubbleHref,
        navigate: (href: string) => {
          if (chatDock && href === mountData.bubbleHref) {
            root.querySelector<HTMLButtonElement>("#phone-close")?.click();
            window.dispatchEvent(new Event(CHAT_DOCK_OPEN));
          } else router.push(href);
        },
        askSignIn: signInHere ? () => root.dispatchEvent(new CustomEvent("heap:signin", { detail: "chat" })) : undefined,
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
        // 쪽지 트리: 엔진 모양의 쪽지 목록(빈 목록이면 빈 트리), 봉인이 풀리는 시각, 방 주인인가(canEdit는 방 주인에게만 켜진다), 안 읽은 수
        treeNotes: mountData.notes.map(toEngineNote),
        noteRevealAt: mountData.noteRevealAt,
        isOwner: canEdit,
        unreadNotes: mountData.unreadNotes,
        recordVisit: () => recordVisitAction(data.roomUuid),
        addGuestbook: (name: string) => addGuestbookAction(data.roomUuid, name),
        // 쪽지 쓰기. addNote 는 서버 액션의 답을 그대로 주되 쪽지를 엔진 모양으로 바꿔 준다 (tree-ids.js). input = { body, tint, font, displayName, fontSize, ornament, ornamentColor, spot }
        addNote: async (input: unknown) => {
          const result = await addNoteAction(data.roomUuid, input);
          return result.ok
            ? { ok: true as const, note: toEngineNote(result.note), evictedId: result.evictedId, notice: result.notice }
            : result;
        },
        deleteNote: (noteId: string) => deleteNoteAction(noteId),
        // 0013 신고·차단 (쪽지와 방명록 공통). surface 는 "note" 또는 "guestbook", id 는 글 id 다.
        reportPost: (surface: HeapSurface, id: string) => reportHeapPostAction(surface, id),
        blockAuthor: (surface: HeapSurface, id: string) => blockHeapAuthorAction(surface, id),
        hidePerson: (surface: HeapSurface, id: string) => hidePersonAction(surface, id),
        removedText: MODERATION_TEXT.removed,
        refreshBlocked: () => setBlockEpoch((n) => n + 1),
        // 방 주인의 도구 (engine/tree-owner.js). replyNote 의 note 는 엔진 모양으로 바꿔 준다.
        replyNote: async (noteId: string, input: unknown) => {
          const result = await replyNoteAction(noteId, input);
          return result.ok ? { ok: true as const, note: toEngineNote(result.note) } : result;
        },
        setHidden: (noteId: string, hidden: boolean) => setNoteHiddenAction(noteId, hidden),
        // 방 주인이 안 읽은 쪽지를 열었다: 그 쪽지만 읽은 것으로
        markNoteRead: (noteId: string) => markNoteReadAction(noteId),
        // 공개 시각이 되었거나 바뀌었을 때: 쪽지 전부를 다시 읽는다
        refetchNotes: async () => {
          const result = await refetchNotesAction(data.roomUuid);
          return result.ok
            ? { ok: true as const, notes: result.notes.map(toEngineNote), noteRevealAt: result.noteRevealAt, unreadNotes: result.unreadNotes }
            : result;
        },
        // 로그인이 없는 사람이 쪽지 쓰기를 누르면: 온보딩 방(signInHere)은 방 안의 로그인 팝업을 띄우고(heap:signin),
        // 다른 방은 로그인 화면으로 보낸다. next 는 돌아올 주소다 (로그인 화면이 읽으면 그리로 돌아온다).
        signIn: signInHere
          ? () => root.dispatchEvent(new CustomEvent("heap:signin", { detail: "note" }))
          : () => router.push(`/login?next=${encodeURIComponent(`/room/${encodeURIComponent(roomId)}?write=1`)}`),
        openWrite: signedIn && writeOnLoad.current === true,
        consumeWrite: () => {
          writeOnLoad.current = false;
        },
        // 원본의 hash + reload 자리. 이동하면 이 방의 effect가 정리되면서 엔진이 dispose된다.
        onNavigate: (id) => router.push(`/room/${encodeURIComponent(id)}`),
      });
    });
    return () => {
      cancelled = true;
      root.removeEventListener("heap:ready", onReady);
      root.removeEventListener("heap:mode", onMode);
      root.removeEventListener("heap:album", onAlbum);
      root.removeEventListener("heap:remount", onRemount);
      setAlbum(null);
      dispose?.();
    };
  }, [roomId, viewerName, signedIn, canEdit, router, resume, signInHere, presenceOn, presenceHub, chatDock]);

  // 체크리스트: 방 주인에게, 방이 뜬 뒤, 걸어 다니는 방이나 꾸미기(팔로워로 보기 빼고)에서
  const showChecklist = !!owner && ready && (editing ? !preview : mode === "room");

  return (
    <div
      ref={rootRef}
      className={`${editing ? (preview ? "heap-room editing previewing" : "heap-room editing") : "heap-room"} ${CARD_FONTS}`}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONTS_HREF} precedence="default" />


      {/* 엔진이 mount마다 여기에 <canvas id="scene">을 새로 만들고, dispose 때 지운다. */}
      <div id="scene-host" />
      {/* 집어 든 카드를 3D 카드 자리에 겹쳐 보이는 HTML 카드 (engine/card-view.js). 누르면 뒤집히고, 뒷면의 아이콘이 원본 링크다. */}
      <div id="cardview" hidden />
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
            <button id="tree-write" className="btn" type="button" hidden>
              쪽지 쓰기
            </button>
            <button id="treeexit" className="btn ghost" type="button" hidden>
              트리에서 물러나기
            </button>
            <button id="globeexit" className="btn ghost" type="button" hidden>
              글로브에서 물러나기
            </button>
            {canEdit && ready && mode === "room" && !editing && (
              <button id="edit-open" className="btn ghost" type="button" onClick={() => setEditing(true)}>
                꾸미기
              </button>
            )}
            {ready && !editing && <ShareButton rootRef={rootRef} roomId={roomId} />}
            {presenceOn && ready && !editing && <PresenceControls hub={presenceHub} isOwner={canEdit} />}
          </div>
          <p className="hint" id="hint" />
        </div>
        {/* 쪽지 트리 모드에서 쪽지가 나와 있을 때만 (tree.js). 화면 양옆에 뜬다. */}
        <button id="tree-prev" className="tree-step prev" type="button" aria-label="이전 쪽지" hidden>
          ‹
        </button>
        <button id="tree-next" className="tree-step next" type="button" aria-label="다음 쪽지" hidden>
          ›
        </button>
        {/* 임시 디버그 사이드바 (engine/debug-flags.js). ?debug=1 일 때만. 비교가 끝나면 걷어 낸다. */}
        {debugOn && (
          <div className={`debug-side${debugOpen ? " open" : ""}`}>
            <button type="button" className="debug-tab" aria-expanded={debugOpen} onClick={() => setDebugOpen((o) => !o)}>
              디버그
            </button>
            {debugOpen && (
              <div className="debug-body" role="group" aria-label="디버그">
                <button type="button" onClick={() => window.location.reload()}>
                  방 새로고침
                </button>
                <button type="button" aria-pressed={animTest.fold} onClick={() => toggleAnim("fold")}>
                  쪽지 접기 {animTest.fold ? "켬" : "끔"}
                </button>
                <button type="button" aria-pressed={animTest.bauble} onClick={() => toggleAnim("bauble")}>
                  장식 열기 {animTest.bauble ? "켬" : "끔"}
                </button>
                <label className="debug-select">
                  그림자
                  <select value={shadowMode} onChange={(e) => pickShadow(e.target.value)}>
                    <option value="all">방 밖까지</option>
                    <option value="room">방 안만 (기본)</option>
                    <option value="none">모두 감추기</option>
                  </select>
                </label>
                <FxDebug rootRef={rootRef} />
                {signedIn && (
                  <button type="button" onClick={debugSignOut}>
                    로그아웃
                  </button>
                )}
                {presenceOn && <PresenceDebug hub={presenceHub} />}
              </div>
            )}
          </div>
        )}
      </div>
      <p id="toast" />
      {/* 스노우 글로브 모드(engine/globe.js)의 출처 표기 목록 (snow-globe/credits.ts) */}
      {mode === "globe" && (
        <section id="globe-credits" className="panel" aria-label="출처 표기">
          <div className="panel-head">
            <b>Credits</b>
          </div>
          <div className="panel-body">
            {CREDITS.map((g) => (
              <div key={g.title}>
                <h3>{g.title}</h3>
                <ul>
                  {g.items.map((c) => (
                    <li key={c.name}>
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noopener noreferrer">
                          {c.name}
                        </a>
                      ) : (
                        c.name
                      )}
                      {c.by && <span> · {c.by}</span>}
                      <span className="lic">{c.license}</span>
                      {c.note && <small>{c.note}</small>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
      {/* 스노우 글로브 모드에서 눈이 내리는 3초 동안 보인다 (engine/globe.js) */}
      <p id="globe-snow" aria-live="polite">
        ❄ 눈이 내리는 중
      </p>
      {/* 쪽지 쓰기 (tree-write.js): 3D 종이 위에 겹치는 글상자, 아래 조작 줄, 접은 쪽지를 끌어 걸 때의 안내 줄, 내 쪽지 지우기와 확인창 */}
      <div id="tree-sheet" hidden>
        <textarea
          id="ts-text"
          rows={4}
          lang="ko"
          spellCheck={false}
          autoComplete="off"
          aria-label="쪽지 내용"
          placeholder="여기에 써요"
        />
        <div id="ts-sig" className="ts-sig" hidden>
          <span aria-hidden="true">- </span>
          <input id="ts-name" type="text" maxLength={12} lang="ko" autoComplete="off" spellCheck={false} placeholder="익명" aria-label="이름 (비우면 익명)" />
        </div>
        <div id="ts-ctl" className="ts-ctl">
          {/* 종이: 종이 색과 글씨체, 글씨 크기. 장식: 종류와 색. 두 묶음에 작은 이름을 붙인다. */}
          <div className="ts-row">
            <span className="ts-lab">종이</span>
            <div className="ts-tints" id="ts-tints" role="group" aria-label="종이 색" />
            <label className="ts-size">
              글씨 크기
              <input id="ts-size" type="range" step={1} min={62} max={290} defaultValue={290} />
            </label>
          </div>
          <div className="ts-fonts" id="ts-fonts" role="group" aria-label="글씨체" />
          <div className="ts-row">
            <span className="ts-lab">장식</span>
            <div className="ts-seg" id="ts-kinds" role="group" aria-label="장식 종류" />
            <div className="ts-tints ts-swatches" id="ts-swatches" role="group" aria-label="장식 색" />
          </div>
          <div className="ts-row">
            <span id="ts-count" className="ts-count" aria-live="off" />
            <button id="ts-fold" className="btn" type="button">
              접어서 달기
            </button>
            <button id="ts-cancel" className="btn ghost" type="button">
              취소
            </button>
          </div>
        </div>
        <div id="ts-drag" className="ts-drag" hidden>
          <p id="ts-drag-text">접은 쪽지를 트리 위로 끌어다 놓으세요</p>
          <div className="ts-row">
            <button id="ts-box" className="btn" type="button">
              쪽지함에 넣기
            </button>
            <button id="ts-reopen" className="btn ghost" type="button">
              다시 펼치기
            </button>
          </div>
        </div>
      </div>
      {/* 열린 쪽지 아래의 단추 줄 (tree-owner.js 가 자리를 정한다): 방 주인의 답장 쓰기와 숨기기, 내 쪽지의 지우기 */}
      <div id="tree-tools" hidden>
        <button id="tree-reply" className="btn" type="button" hidden>
          답장 쓰기
        </button>
        <button id="tree-hide" className="btn ghost" type="button" hidden>
          숨기기
        </button>
        <button id="tree-del" className="btn ghost" type="button" hidden>
          지우기
        </button>
        {/* 0013: 남의 쪽지. 신고는 방 주인·관리자, 차단은 방 주인·관리자에게는 쓰기 막기, 다른 사람에게는 나에게서 가리기 */}
        <button id="tree-report" className="btn ghost" type="button" hidden>
          신고
        </button>
        <button id="tree-block" className="btn ghost" type="button" hidden>
          차단
        </button>
      </div>
      {/* 방 주인의 답장 쓰기 (tree-owner.js): 팬 종이 옆에 선 답장 종이 위에 겹치는 글상자와 아래 조작 줄 (글씨체, 글씨 크기, 접어서 넣기, 취소) */}
      <div id="tree-rsheet" hidden>
        <textarea id="tr-text" rows={4} lang="ko" spellCheck={false} autoComplete="off" aria-label="답장 내용" placeholder="답장을 써요" hidden />
        <div id="tr-ctl" className="ts-ctl tr-ctl" hidden>
          <div className="ts-fonts" id="tr-fonts" role="group" aria-label="답장 글씨체" />
          <div className="ts-row">
            <label className="ts-size">
              글씨 크기
              <input id="tr-size" type="range" step={1} min={62} max={200} defaultValue={200} />
            </label>
          </div>
          <div className="ts-row">
            <span id="tr-count" className="ts-count" aria-live="off" />
            <button id="tr-fold" className="btn" type="button">
              접어서 넣기
            </button>
            <button id="tr-cancel" className="btn ghost" type="button">
              취소
            </button>
          </div>
        </div>
      </div>
      {/* 쪽지함 목록 (tree-box.js) */}
      <div id="tree-box" className="overlay" hidden>
        <div className="panel">
          <div className="panel-head">
            <b id="tb-count">쪽지함</b>
            <button id="tb-close" className="btn ghost" type="button">
              닫기
            </button>
          </div>
          <div className="panel-body">
            <div id="tb-list" className="tb-list" />
          </div>
        </div>
      </div>
      <div id="tree-confirm" className="overlay" hidden>
        <div className="panel confirm" role="alertdialog" aria-labelledby="tc-text">
          <p id="tc-text" />
          <div className="row">
            <button id="tc-yes" className="btn" type="button" />
            <button id="tc-no" className="btn ghost" type="button" />
          </div>
        </div>
      </div>
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
          noteRevealAt={noteRevealAt}
          onRevealSaved={onRevealSaved}
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

      {/* 플레이어 바깥: 누르면 플레이어를 닫는다. 아래의 사진 보기나 방에는 닿지 않는다 (players.js) */}
      <div id="player-shade" hidden />
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

      {/* 앨범 수첩 (album-book.tsx). 엔진이 heap:album 을 보내면 연다. 수첩은 이 방의 CSS 를 피해 body 에 띄우고,
          #grid 는 수첩이 열려 있다는 표시로만 남긴다: 엔진과 둘러보기가 다른 창처럼 여긴다 (Esc 가 먼저 닫고, 방 키가 쉰다) */}
      <div id="grid" hidden={!album} />
      {album &&
        createPortal(
          <div className={CARD_FONTS}>
            <AlbumBook album={album} onClose={closeAlbum} />
          </div>,
          document.body,
        )}

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
                이름을 남기려면{" "}
                {signInHere ? (
                  // 온보딩 방: 방 안의 로그인 팝업 (heap:signin, 둘러보기가 띄운다)
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => rootRef.current?.dispatchEvent(new CustomEvent("heap:signin", { detail: "guestbook" }))}
                  >
                    로그인
                  </button>
                ) : (
                  <Link href={withNext("/login", `/room/${encodeURIComponent(roomId)}`)}>로그인</Link>
                )}
                이 필요해요.
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

// 디버그 사이드바의 방 효과(셰이더 팩) 줄 (engine/fx-flags.js, engine/fx.js). 묶음마다 켜고 끄기와 값 슬라이더.
// 슬라이더는 끄는 동안 숫자만 바꾸고, 멈추고 150ms 뒤에 엔진에 보낸다 (그림자 값은 셰이더를 다시 만든다).
function FxDebug({ rootRef }: { rootRef: RefObject<HTMLDivElement | null> }) {
  const [fx, setFx] = useState(() => structuredClone(FX));
  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send = (delay: number) => {
    saveFx();
    setFx(structuredClone(FX));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => rootRef.current?.dispatchEvent(new CustomEvent("heap:fx")), delay);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const [note, setNote] = useState("");
  // 화면 복사: 공유 단추와 같은 길(heap:capture)로 지금 구도를 효과까지 그려 PNG 로 클립보드에 넣는다. 화면 위 글자와 단추는 들어가지 않는다.
  // ClipboardItem 에 Promise 를 주어 클릭 한 번 안에서 쓰기를 시작한다 (Chrome 은 클릭 뒤 비동기로 쓰면 막는다).
  const copyShot = () => {
    const got: { canvas: HTMLCanvasElement | null } = { canvas: null };
    rootRef.current?.dispatchEvent(new CustomEvent("heap:capture", { detail: (c: HTMLCanvasElement | null) => { got.canvas = c; } }));
    const canvas = got.canvas;
    if (!canvas) { setNote("그리지 못했어요"); return; }
    const png = new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("toBlob"))), "image/png"));
    navigator.clipboard
      .write([new ClipboardItem({ "image/png": png })])
      .then(() => setNote(`화면을 복사했어요 (${canvas.width}×${canvas.height})`))
      .catch(() => setNote("클립보드에 넣지 못했어요"));
  };
  // 설정 내보내기: 방 효과 값과 다른 디버그 값을 JSON 파일로 내려받는다. 서버로는 보내지 않는다
  const exportSettings = () => {
    const data = { savedAt: new Date().toISOString(), room: window.location.pathname, fx: FX, shadow: SHADOW_TEST.mode, anim: ANIM_TEST };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `heap-debug-${data.savedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNote("설정을 내려받았어요");
  };
  type Group = Record<string, number | boolean>;
  const groups = FX as unknown as Record<string, Group>;
  const view = fx as unknown as Record<string, Group>;
  return (
    <div className="debug-fx" role="group" aria-label="방 효과">
      <p className="debug-fx-title">방 효과</p>
      {FX_GROUPS.map((g) => (
        <div key={g.key} className="debug-fx-group">
          <div className="debug-fx-row">
            <button
              type="button"
              aria-pressed={Boolean(view[g.key].on)}
              onClick={() => {
                groups[g.key].on = !groups[g.key].on;
                send(0);
              }}
            >
              {g.label} {view[g.key].on ? "켬" : "끔"}
            </button>
            <button type="button" className="debug-fx-more" aria-expanded={open === g.key} onClick={() => setOpen((o) => (o === g.key ? null : g.key))}>
              {open === g.key ? "−" : "값"}
            </button>
          </div>
          {open === g.key &&
            g.params.map((p) => (
              <label key={p.key} className="debug-fx-slider">
                <span>
                  {p.label} <b>{Number(view[g.key][p.key])}</b>
                </span>
                <input
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={Number(view[g.key][p.key])}
                  onChange={(e) => {
                    groups[g.key][p.key] = Number(e.target.value);
                    send(150);
                  }}
                />
              </label>
            ))}
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          resetFx();
          send(0);
        }}
      >
        효과 기본값으로
      </button>
      <button type="button" onClick={copyShot}>
        화면 복사
      </button>
      <button type="button" onClick={exportSettings}>
        설정 내보내기
      </button>
      {note && <p className="debug-fx-note" role="status">{note}</p>}
    </div>
  );
}

// 디버그 사이드바의 방 함께 있기 줄: 연결 상태, 초당 보낸/받은 메시지 수, 같이 있는 사람(peer id 와 이름만).
function PresenceDebug({ hub }: { hub: PresenceHub }) {
  const [view, setView] = useState({ status: "-", rate: "0/0", peers: "" });
  useEffect(() => {
    let last = hub.counts();
    const id = setInterval(() => {
      const c = hub;
      if (!c.active()) return setView({ status: "꺼짐 (나 숨기기)", rate: "0/0", peers: "" });
      const now = c.counts();
      setView({
        status: c.status(),
        rate: `${now.sent - last.sent}/${now.recv - last.recv}`,
        peers: c.peers().map((p) => `${p.name}${p.owner ? "[주인]" : ""}(${p.peer}) ${p.state}`).join(", "),
      });
      last = now;
    }, 1000);
    return () => clearInterval(id);
  }, [hub]);
  return (
    <p className="debug-presence">
      함께 있기: {view.status} · 초당 보냄/받음 {view.rate}
      <br />
      {view.peers || "다른 사람 없음"}
    </p>
  );
}

// 방 함께 있기 설정: 지금 남에게 어떻게 보이는지, 나 숨기기, 다른 사람 숨기기, 이름 공개 규칙.
// 설정은 이 브라우저에 남는다 (settings/prefs.ts). 이름 규칙을 바꾸면 새 입장권으로 다시 들어온다.
const SHOW_LABEL: Record<NameShow, string> = { hidden: "가리기", creators: "방 주인에게만", followers: "팔로워에게" };

function PresenceControls({ hub, isOwner }: { hub: PresenceHub; isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const pref = usePrefs().presence;
  const [count, setCount] = useState(0);
  useEffect(() => {
    const sync = () => setCount(hub.peers().length);
    const offMsg = hub.on(sync);
    const offStatus = hub.onStatus(sync);
    return () => {
      offMsg();
      offStatus();
    };
  }, [hub]);
  const patch = (p: Partial<typeof pref>) => setPrefs({ presence: { ...pref, ...p } });
  const seenAs = pref.hideMe
    ? "지금은 아무에게도 보이지 않아요. 다른 사람도 보이지 않아요"
    : isOwner
      ? "방 주인으로, 이름과 함께 보여요"
      : pref.show === "followers"
        ? "이 방의 다른 방문자에게 이름이 보여요"
        : pref.show === "creators"
          ? "방 주인에게만 이름이 보이고, 다른 방문자에게는 '방문자'로 보여요"
          : "다른 방문자에게 '방문자'로 보여요";
  return (
    <div className="presence-ctl">
      <button type="button" className="btn ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        함께 있기{!pref.hideMe && !pref.hideOthers && count > 0 ? ` ${count}` : ""}
      </button>
      {open && (
        <div className="presence-panel" role="group" aria-label="함께 있기 설정">
          <p className="presence-seen">{seenAs}</p>
          <label>
            <input type="checkbox" checked={pref.hideMe} onChange={(e) => patch({ hideMe: e.target.checked })} /> 나 숨기기
          </label>
          <label>
            <input type="checkbox" checked={pref.hideOthers} disabled={pref.hideMe} onChange={(e) => patch({ hideOthers: e.target.checked })} /> 다른 사람
            숨기기 (연결이 느릴 때)
          </label>
          {!isOwner && (
            <fieldset disabled={pref.hideMe}>
              <legend>내 이름</legend>
              {(Object.keys(SHOW_LABEL) as NameShow[]).map((v) => (
                <label key={v}>
                  <input type="radio" name="presence-show" checked={pref.show === v} onChange={() => patch({ show: v })} /> {SHOW_LABEL[v]}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}
