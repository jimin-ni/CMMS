"use client";

// 미니룸 채팅 창(chat-dock.tsx)의 대화 화면. 버블 대화방과 같은 메시지와 보내기 동작을 쓰고 모양만 Figma 5차를 따른다.
// 안 읽은 수와 "New Message" 구분선은 이 브라우저에 저장한 마지막 읽은 시각으로 센다 (DB에는 읽음 기록이 없다).
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { DockChat as DockChatData } from "@/lib/bubble/dock";
import type { MessageRow } from "@/lib/bubble/repo";
import { deleteMessageAction, sendMessageAction } from "@/lib/bubble/actions";
import { reportMessageAction } from "@/lib/moderation/actions";
import { RemovedText, WriteBlockedPanel } from "@/components/moderation/chat-moderation";
import { Composer } from "./composer";
import { DockAvatar } from "./dock-parts";
import { useMessageSync, type SyncMeta } from "./use-message-sync";

const READ_KEY = "memoamo.chat.read.";
// 지난 메시지가 위에 더 있을 때 목록 위쪽 끝: 잘린 메시지가 흐려지며 사라진다
const FADE_TOP = "linear-gradient(to bottom, transparent 0, #000 48px)";

// column-reverse 목록은 맨 아래가 scrollTop 0 이고 위로 갈수록 음수가 된다.
function hasMoreAbove(el: HTMLElement): boolean {
  return el.scrollHeight - el.clientHeight - Math.abs(el.scrollTop) > 1;
}

function readMark(roomId: string): string {
  try {
    return window.localStorage.getItem(READ_KEY + roomId) ?? "";
  } catch {
    return "";
  }
}

function writeMark(roomId: string, iso: string) {
  try {
    window.localStorage.setItem(READ_KEY + roomId, iso);
  } catch {
    // 저장이 막힌 브라우저(사생활 보호 창 등): 배지는 매번 처음부터 센다.
  }
}

export function DockChat({
  chat,
  ownerName,
  ownerAvatarUrl,
  expanded,
  onUnread,
  onReload,
}: {
  chat: DockChatData;
  ownerName: string;
  ownerAvatarUrl: string | null;
  expanded: boolean;
  onUnread: (count: number) => void;
  onReload: () => void;
}) {
  const { roomId, viewerId, moderator } = chat;
  const writeBlockKey = JSON.stringify(chat.writeBlock);
  // 방이 닫히거나 쓰기 차단이 바뀌면 창의 처음 값을 다시 읽는다.
  const onMeta = useCallback(
    (data: SyncMeta) => {
      const blockChanged = data.writeBlock !== undefined && JSON.stringify(data.writeBlock) !== writeBlockKey;
      if (data.status === "closed" || blockChanged) onReload();
    },
    [writeBlockKey, onReload],
  );
  const { messages, sync } = useMessageSync({
    pollUrl: `/api/bubble/rooms/${roomId}/messages`,
    initialMessages: chat.messages,
    initialCursor: chat.cursor,
    enabled: true,
    onMeta,
  });

  // 마지막으로 읽은 시각. 창을 펴는 순간의 값을 구분선 자리로 잡아 두고, 편 동안 들어온 메시지는 읽은 것으로 친다.
  // 이 화면은 창의 처음 값을 받은 뒤 브라우저에서만 그려지므로 처음 값에서 바로 읽는다.
  const latest = messages.at(-1)?.created_at ?? "";
  const [mark, setMark] = useState(() => readMark(roomId));
  const [divider, setDivider] = useState<string | null>(() => (expanded ? mark : null));
  const [wasExpanded, setWasExpanded] = useState(expanded);
  if (wasExpanded !== expanded) {
    setWasExpanded(expanded);
    setDivider(expanded ? mark : null);
    if (!expanded && latest > mark) setMark(latest);
  }
  useEffect(() => {
    if (expanded && latest > readMark(roomId)) writeMark(roomId, latest);
  }, [expanded, latest, roomId]);

  const unread = useMemo(
    () => messages.filter((m) => m.sender_id !== viewerId && !m.deleted_at && m.created_at > mark).length,
    [messages, mark, viewerId],
  );
  useEffect(() => {
    onUnread(expanded ? 0 : unread);
  }, [expanded, unread, onUnread]);

  // 위로 더 굴릴 지난 메시지가 있는지 (메시지 목록의 위쪽 끝을 흐리게 할지)
  const [moreAbove, setMoreAbove] = useState(false);

  // 누른 메시지: 크리에이터는 팬 글에 신고와 인용 답장, 누구나 지울 수 있는 자기 글에 삭제
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState<{ id: string; senderName: string; body: string } | null>(null);

  // 구분선을 붙일 첫 새 메시지 (다른 사람의 글 중 창을 열기 전 읽은 시각보다 뒤)
  const firstNewId =
    divider !== null
      ? messages.find((m) => m.sender_id !== viewerId && m.created_at > divider)?.id
      : undefined;

  return (
    <>
      {/* column-reverse라서 새 메시지가 오면 스크롤이 맨 아래에 머문다.
          스크롤바는 숨기고, 위에 지난 메시지가 더 있으면 위쪽 끝을 흐리게 잘라 굴려 보게 한다. */}
      <div
        onScroll={(e) => setMoreAbove(hasMoreAbove(e.currentTarget))}
        ref={(el) => {
          if (el) setMoreAbove(hasMoreAbove(el));
        }}
        className="mx-2.5 flex min-h-0 flex-1 flex-col-reverse overflow-y-auto bg-white px-2.5 pt-[14.5px] pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={moreAbove ? { maskImage: FADE_TOP, WebkitMaskImage: FADE_TOP } : undefined}
      >
        <ul className="flex flex-col">
          {messages.length === 0 && (
            <li className="py-6 text-center font-[family-name:var(--font-text)] text-[12px] text-[#9b8c85]">
              아직 메시지가 없어요.
            </li>
          )}
          {messages.map((message, index) => {
            const mine = message.sender_id === viewerId;
            const fromOwner = message.sender_id === chat.ownerId;
            const firstOfRun = index === 0 || messages[index - 1].sender_id !== message.sender_id;
            const isSelected = selected === message.id;
            const canMention = moderator && !mine && !fromOwner && !message.deleted_at && !message.removed;
            const canDelete = mine && message.can_delete;
            const clickable = canMention || canDelete;
            return (
              <li key={message.id} className={firstOfRun && index > 0 ? "mt-[33px]" : "mt-[3px]"}>
                {message.id === firstNewId && <NewMessageDivider />}
                <Message
                  message={message}
                  mine={mine}
                  // 구독자 화면의 크리에이터 글에는 사진과 이름을, 크리에이터 화면의 팬 글에는 이름만 붙인다.
                  head={firstOfRun && !mine ? (fromOwner ? "avatar" : "name") : null}
                  indent={!mine && fromOwner}
                  ownerName={ownerName}
                  ownerAvatarUrl={ownerAvatarUrl}
                  selected={isSelected}
                  moderator={moderator}
                  onClick={clickable ? () => setSelected(isSelected ? null : message.id) : undefined}
                />
                {isSelected && (
                  <MessageActions
                    mine={mine}
                    messageId={message.id}
                    canMention={canMention}
                    canDelete={canDelete}
                    onMention={() => {
                      setReply({ id: message.id, senderName: message.sender_name, body: message.body ?? "" });
                      setSelected(null);
                    }}
                    onDone={() => {
                      setSelected(null);
                      sync();
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {chat.canSend && chat.writeBlock ? (
        <WriteBlockedPanel block={chat.writeBlock} />
      ) : chat.canSend ? (
        <Composer
          variant="dock"
          sendAction={sendMessageAction}
          target={{ name: "roomId", value: roomId }}
          maxChars={chat.maxChars}
          previewRoomId={chat.previewRoomId}
          reply={reply}
          onCancelReply={() => setReply(null)}
          onSent={sync}
        />
      ) : (
        <p className="px-2.5 py-3 text-center font-[family-name:var(--font-text)] text-[12px] text-[#9b8c85]">
          이 대화방에서는 메시지를 보낼 수 없어요.
        </p>
      )}
    </>
  );
}

function NewMessageDivider() {
  return (
    <div className="-mx-2.5 mb-[15px] flex items-center gap-[5px]" role="separator">
      <span className="h-px flex-1 bg-brand-gold" />
      <span className="font-[family-name:var(--font-text)] text-[10px] leading-[13.5px] text-brand-gold">New Message</span>
      <span className="h-px flex-1 bg-brand-gold" />
    </div>
  );
}

function Message({
  message,
  mine,
  head,
  indent,
  ownerName,
  ownerAvatarUrl,
  selected,
  moderator,
  onClick,
}: {
  message: MessageRow;
  mine: boolean;
  head: "avatar" | "name" | null;
  indent: boolean;
  ownerName: string;
  ownerAvatarUrl: string | null;
  selected: boolean;
  moderator: boolean;
  onClick?: () => void;
}) {
  const deleted = Boolean(message.deleted_at);
  const tone = mine
    ? "bg-ink text-white"
    : selected
      ? "bg-[#9b8c85] text-white"
      : "bg-white text-[#462500]";
  const bubbleClass = `max-w-[190px] whitespace-pre-wrap break-words border-[0.5px] border-[#9b8c85] px-2.5 py-[11px] text-left font-[family-name:var(--font-text)] text-[12px] leading-[16.5px] ${tone} ${
    deleted ? (mine ? "italic text-cream" : "italic text-[#9b8c85]") : ""
  }`;
  const content = (
    <>
      {message.reply && (
        <span
          className={`mb-1 block truncate border-l-2 pl-1.5 text-[10px] leading-[13px] ${
            mine ? "border-white/60 text-white/70" : "border-[#9b8c85] text-[#9b8c85]"
          }`}
        >
          {message.reply.sender_name}: {message.reply.body ?? "삭제된 메시지"}
        </span>
      )}
      {deleted ? (
        "deleted message"
      ) : message.removed ? (
        <RemovedText messageId={message.id} canReveal={moderator} />
      ) : (
        message.body
      )}
    </>
  );
  const bubble = onClick ? (
    <button type="button" onClick={onClick} className={`${bubbleClass} cursor-pointer`} aria-pressed={selected}>
      {content}
    </button>
  ) : (
    <p className={bubbleClass}>{content}</p>
  );
  const time = (
    <time className="shrink-0 font-[family-name:var(--font-text)] text-[10px] leading-[13.5px] text-[#9b8c85]">
      {formatTime(message.created_at)}
    </time>
  );

  if (mine) {
    return (
      <div className="flex items-end justify-end gap-[5px]">
        {time}
        {bubble}
      </div>
    );
  }
  const row = (
    <div className="flex items-end gap-[5px]">
      {bubble}
      {time}
    </div>
  );
  if (head === "avatar") {
    return (
      <div className="flex gap-[3.5px]">
        <DockAvatar name={ownerName} url={ownerAvatarUrl} size={41.5} />
        <div className="flex flex-col">
          <span className="mt-[6.5px] mb-[7px] font-[family-name:var(--font-text)] text-[10px] leading-[13.5px] font-semibold text-[#462500]">
            {ownerName}
          </span>
          {row}
        </div>
      </div>
    );
  }
  return (
    <div className={`flex flex-col ${indent ? "pl-[45px]" : ""}`}>
      {head === "name" && (
        <span className="mb-[3px] font-[family-name:var(--font-text)] text-[10px] leading-[13.5px] font-semibold text-[#462500]">
          {message.sender_name}
        </span>
      )}
      {row}
    </div>
  );
}

// 누른 메시지 아래 단추: 팬 글에는 Report(신고해서 내리기)와 mention(인용 답장), 자기 글에는 Delete
function MessageActions({
  mine,
  messageId,
  canMention,
  canDelete,
  onMention,
  onDone,
}: {
  mine: boolean;
  messageId: string;
  canMention: boolean;
  canDelete: boolean;
  onMention: () => void;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (confirmText: string, action: () => Promise<{ ok: boolean; error?: string }>) => {
    if (!window.confirm(confirmText)) return;
    start(async () => {
      const r = await action();
      if (r.ok) onDone();
      else setError(r.error ?? "처리하지 못했어요.");
    });
  };
  const btn = "px-[17px] py-[7px] font-[family-name:var(--font-text)] text-[6px] leading-[8px] font-bold";
  return (
    <div className={`mt-[3px] flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div className="flex">
        {canMention && (
          <>
            <button
              type="button"
              disabled={pending}
              className={`${btn} border-[0.5px] border-rewards-red bg-rewards-red text-white`}
              onClick={() =>
                run("이 메시지를 신고해서 내릴까요? 작성자에게 경고 1회가 쌓여요.", () => reportMessageAction(messageId))
              }
            >
              Report
            </button>
            <button type="button" className={`${btn} border-[0.5px] border-ink bg-white text-ink`} onClick={onMention}>
              mention
            </button>
          </>
        )}
        {canDelete && (
          <button
            type="button"
            disabled={pending}
            className={`${btn} border-[0.5px] border-ink bg-white text-ink`}
            onClick={() => run("이 메시지를 지울까요?", () => deleteMessageAction(messageId))}
          >
            Delete
          </button>
        )}
      </div>
      {error && <span className="mt-1 text-[10px] text-red-700">{error}</span>}
    </div>
  );
}

// 한국 시간으로 "AM 1:44" 처럼 보여 준다 (Figma 표기).
const timeParts = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Seoul",
});

function formatTime(iso: string): string {
  const parts = timeParts.formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("dayPeriod")} ${get("hour")}:${get("minute")}`;
}
