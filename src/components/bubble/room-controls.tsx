"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeThreadAction, deleteMessageAction } from "@/lib/bubble/actions";

// 새 메시지를 주기적으로 가져온다. (실시간 방식은 PoC 후 결정)
export function RoomRefresher() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}

export function DeleteMessageButton({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteMessageAction(messageId);
            if (result.ok) router.refresh();
            else setError(result.error);
          })
        }
        className="text-key-stone underline"
      >
        삭제
      </button>
      {error && <span className="text-red-700">{error}</span>}
    </span>
  );
}

export function CloseRoomButton({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await closeThreadAction(threadId);
            if (result.ok) router.refresh();
            else setError(result.error);
          })
        }
        className="rounded-full border border-key-stone/60 px-3 py-1 text-xs text-key-brown"
      >
        대화방 닫기
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
