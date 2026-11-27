"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageRow } from "@/lib/bubble/repo";
import type { WriteBlock } from "@/lib/moderation/repo";

// 새 메시지를 가져오는 간격. (실시간 방식은 PoC 후 결정, 지금은 폴링)
const POLL_MS = 5000;

// 폴링 응답에서 메시지 밖의 값 (/api/bubble/rooms/[roomId]/messages)
export type SyncMeta = {
  status: "open" | "closed";
  memberCount: number | null;
  writeBlock?: WriteBlock | null;
};

// 버블 대화 화면(room-chat.tsx)과 미니룸 채팅 창(dock-chat.tsx)이 함께 쓰는 폴링.
// pollUrl 에 ?since=<cursor> 를 붙여 바뀐 메시지만 받아 id 기준으로 합친다. 삭제된 메시지도 같은 id로 덮어쓴다.
// onMeta: 방 상태, 참여 인원, 쓰기 차단을 받을 때마다 부른다.
export function useMessageSync({
  pollUrl,
  initialMessages,
  initialCursor,
  enabled,
  onMeta,
}: {
  pollUrl: string;
  initialMessages: MessageRow[];
  initialCursor: string;
  enabled: boolean;
  onMeta?: (meta: SyncMeta) => void;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const cursor = useRef(initialCursor);
  const inFlight = useRef(false);

  const sync = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`${pollUrl}?since=${encodeURIComponent(cursor.current)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as SyncMeta & { messages: MessageRow[]; cursor: string };
      cursor.current = data.cursor;
      if (data.messages.length > 0) {
        setMessages((prev) => {
          const byId = new Map(prev.map((m) => [m.id, m]));
          for (const m of data.messages) byId.set(m.id, m);
          return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
        });
      }
      onMeta?.(data);
    } finally {
      inFlight.current = false;
    }
  }, [pollUrl, onMeta]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(sync, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, sync]);

  return { messages, sync };
}
