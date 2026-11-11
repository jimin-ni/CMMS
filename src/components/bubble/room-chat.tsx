"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MessageRow } from "@/lib/bubble/repo";
import { Composer } from "./composer";
import { DeleteMessageButton } from "./room-controls";

// 새 메시지를 가져오는 간격. (실시간 방식은 PoC 후 결정, 지금은 폴링)
const POLL_MS = 5000;

type Props = {
  roomId: string;
  viewerId: string;
  initialMessages: MessageRow[];
  initialCursor: string;
  isOpen: boolean;
  canSend: boolean;
  maxChars: number;
  // 크리에이터 예상 반응 미리보기. 구독자에게만 켠다.
  showReactionPreview: boolean;
  closedNotice: string;
};

export function RoomChat(props: Props) {
  const { roomId, viewerId, isOpen } = props;
  const router = useRouter();
  const [messages, setMessages] = useState(props.initialMessages);
  const cursor = useRef(props.initialCursor);
  const inFlight = useRef(false);

  // since 뒤로 바뀐 메시지를 받아 id 기준으로 합친다. 삭제된 메시지도 같은 id로 덮어쓴다.
  const sync = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(
        `/api/bubble/rooms/${roomId}/messages?since=${encodeURIComponent(cursor.current)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: MessageRow[];
        cursor: string;
        status: "open" | "closed";
      };
      cursor.current = data.cursor;
      if (data.messages.length > 0) {
        setMessages((prev) => {
          const byId = new Map(prev.map((m) => [m.id, m]));
          for (const m of data.messages) byId.set(m.id, m);
          return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
        });
      }
      // 방이 닫히면 머리글과 입력창을 서버에서 다시 그린다.
      if (data.status === "closed") router.refresh();
    } finally {
      inFlight.current = false;
    }
  }, [roomId, router]);

  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(sync, POLL_MS);
    return () => clearInterval(id);
  }, [isOpen, sync]);

  return (
    <>
      {/* column-reverse라서 새 메시지가 오면 스크롤이 맨 아래에 머문다. */}
      <div className="flex flex-1 flex-col-reverse overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-1">
          {messages.length === 0 && (
            <li className="py-6 text-center text-sm text-gray-600">아직 메시지가 없어요.</li>
          )}
          {messages.map((message, index) => {
            const mine = message.sender_id === viewerId;
            // 같은 사람이 이어서 보낸 메시지는 이름과 프로필을 한 번만 보여준다.
            const firstOfRun = index === 0 || messages[index - 1].sender_id !== message.sender_id;
            const bubble = (
              <p
                className={`max-w-[70vw] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm sm:max-w-sm ${
                  mine ? "bg-talk-yellow" : "bg-white"
                } ${message.deleted_at ? "italic text-gray-500" : "text-gray-900"}`}
              >
                {message.deleted_at ? "삭제된 메시지입니다." : message.body}
              </p>
            );
            const time = (
              <time className="shrink-0 text-[10px] text-gray-600">
                {formatTime(message.created_at)}
              </time>
            );

            if (mine) {
              return (
                <li
                  key={message.id}
                  className={`flex flex-col items-end ${firstOfRun ? "mt-2" : ""}`}
                >
                  <div className="flex items-end gap-1">
                    {time}
                    {bubble}
                  </div>
                  {message.can_delete && (
                    <DeleteMessageButton messageId={message.id} onDeleted={sync} />
                  )}
                </li>
              );
            }

            return (
              <li key={message.id} className={`flex gap-2 ${firstOfRun ? "mt-2" : ""}`}>
                <div className="w-9 shrink-0">
                  {firstOfRun && (
                    <span className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-key-mist text-sm font-semibold text-key-brown">
                      {Array.from(message.sender_name)[0] ?? "?"}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-start">
                  {firstOfRun && (
                    <span className="mb-1 text-xs text-gray-700">{message.sender_name}</span>
                  )}
                  <div className="flex items-end gap-1">
                    {bubble}
                    {time}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {props.canSend ? (
        <Composer
          roomId={roomId}
          maxChars={props.maxChars}
          showReactionPreview={props.showReactionPreview}
          onSent={sync}
        />
      ) : (
        <p className="bg-white px-4 py-3 text-center text-sm text-gray-500">
          {props.closedNotice}
        </p>
      )}
    </>
  );
}

// 서버 시간대와 관계없이 한국 시간으로 "오후 3:12"처럼 보여준다.
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}
