"use client";

// 미니룸 오른쪽 아래의 채팅 창 (Figma "Creators' mini rooms" 5차).
// 갈색 배너를 누르면 창이 위로 올라오고, 배너나 창 바깥을 누르면 배너만 남기고 아래로 내려간다.
// 구독자와 로그아웃한 방문자는 지금 들어와 있는 방 주인과의 대화를, 크리에이터는 언제나 자기 대화방을 본다 (lib/bubble/dock.ts).
// 방 안의 휴대폰에서 대화를 열 때(heap-room.tsx)와 로그인 팝업으로 로그인한 뒤(room-tour.tsx)에는 CHAT_DOCK_OPEN 이벤트로 연다.
import { useCallback, useEffect, useRef, useState } from "react";
import type { DockData } from "@/lib/bubble/dock";
import { joinRoomAction } from "@/lib/bubble/actions";
import { DockChat } from "./dock-chat";
import { Badge, CHAT_DOCK_OPEN, DockAvatar } from "./dock-parts";

export { CHAT_DOCK_OPEN } from "./dock-parts";

// 배너 높이. 접으면 이만큼만 화면에 남는다.
const BANNER_PX = 29;
// 창 전체 배율 (Figma 크기의 1.25배, 2026-11-27 요청)
const ZOOM = 1.25;

export function ChatDock({ room, signedIn, onAskSignIn }: { room: string; signedIn: boolean; onAskSignIn: () => void }) {
  const [data, setData] = useState<DockData | null>(null);
  const [expanded, setExpanded] = useState(false);
  // 접힌 배너에 띄우는 안 읽은 수 (DockChat 이 계산해서 알려 준다)
  const [unread, setUnread] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const joining = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/bubble/dock?room=${encodeURIComponent(room)}`, { cache: "no-store" });
    if (res.ok) setData((await res.json()) as DockData);
  }, [room]);

  // signedIn 이 바뀌면(로그인 팝업으로 로그인) 새로 읽는다.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bubble/dock?room=${encodeURIComponent(room)}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<DockData>) : null))
      .then((next) => {
        if (!cancelled && next) setData(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [room, signedIn]);

  // 바깥(방, 내비게이션 바 등)을 누르면 내려간다.
  useEffect(() => {
    if (!expanded) return;
    const down = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setExpanded(false);
    };
    window.addEventListener("pointerdown", down);
    return () => window.removeEventListener("pointerdown", down);
  }, [expanded]);

  useEffect(() => {
    const open = () => setExpanded(true);
    window.addEventListener(CHAT_DOCK_OPEN, open);
    return () => window.removeEventListener(CHAT_DOCK_OPEN, open);
  }, []);

  // 구독자가 아직 참여하지 않은 방이면 창을 처음 열 때 참여한다.
  const chat = data?.chat ?? null;
  useEffect(() => {
    if (!expanded || !chat || chat.joined || !chat.canJoin || joining.current) return;
    joining.current = true;
    joinRoomAction(chat.roomId)
      .then((r) => (r.ok ? load() : undefined))
      .finally(() => {
        joining.current = false;
      });
  }, [expanded, chat, load]);

  if (!data) return null;

  // 로그아웃: 새 메시지가 왔다는 배지를 늘 띄운다 (궁금하게 만들기)
  const badge = !data.signedIn ? 1 : unread;

  return (
    <div
      ref={rootRef}
      // Figma 수치(302px 등)를 그대로 쓰고 창 전체를 ZOOM 배로 키운다. 화면 기준 길이(오른쪽 여백 20px, 위 여백 144px)는 ZOOM 으로 나눠 그대로 둔다.
      className="oc-chat fixed bottom-0 z-40 flex w-[302px] flex-col transition-transform duration-300 ease-out"
      style={{
        zoom: ZOOM,
        right: 20 / ZOOM,
        height: `calc((100dvh - 144px) / ${ZOOM})`,
        maxWidth: `calc((100vw - 40px) / ${ZOOM})`,
        transform: expanded ? "translateY(0)" : `translateY(calc(100% - ${BANNER_PX}px))`,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "채팅 접기" : "채팅 펼치기"}
        className="relative flex h-[29px] shrink-0 items-center rounded-t-[6px] bg-ink px-[11.5px] text-left font-[family-name:var(--font-display)] text-[13px] leading-[19.5px] font-bold text-white"
      >
        {expanded ? data.ownerName : data.label}
        {!expanded && badge > 0 && <Badge count={badge} className="absolute -top-[9px] right-[5.5px]" />}
      </button>

      <div className="flex min-h-0 flex-1 flex-col bg-cream">
        {chat && chat.joined ? (
          <DockChat
            // 방이 닫히거나 쓰기 차단이 바뀌어 새로 읽으면 대화 상태도 새로 시작한다.
            key={`${chat.roomId}:${chat.cursor}`}
            chat={chat}
            ownerName={data.ownerName}
            ownerAvatarUrl={data.ownerAvatarUrl}
            expanded={expanded}
            onUnread={setUnread}
            onReload={load}
          />
        ) : (
          <StatusCard
            name={data.ownerName}
            avatarUrl={data.ownerAvatarUrl}
            open={data.open}
            showBadge={!data.signedIn}
            onClick={data.signedIn ? undefined : onAskSignIn}
          />
        )}
      </div>
    </div>
  );
}

// 로그아웃했거나 대화방이 없을 때: 방 주인 사진과 "Chat Open" / "Chat Close"
function StatusCard({
  name,
  avatarUrl,
  open,
  showBadge,
  onClick,
}: {
  name: string;
  avatarUrl: string | null;
  open: boolean;
  showBadge: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="relative">
        <DockAvatar name={name} url={avatarUrl} size={90.5} />
        {!open && <span className="absolute inset-0 rounded-full bg-cream/40" aria-hidden />}
        {open && showBadge && <Badge count={1} className="absolute top-[72.5px] left-[68px]" />}
      </span>
      <span className="mt-[8.5px] font-[family-name:var(--font-display)] text-[24px] leading-[36px] font-normal text-ink">
        {open ? "Chat Open" : "Chat Close"}
      </span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="mt-[52px] flex flex-col items-center self-center">
      {body}
    </button>
  ) : (
    <div className="mt-[52px] flex flex-col items-center self-center">{body}</div>
  );
}
