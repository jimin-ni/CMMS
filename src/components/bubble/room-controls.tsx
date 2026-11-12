"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeRoomAction, type ActionResult } from "@/lib/bubble/actions";

export type DeleteAction = (messageId: string) => Promise<ActionResult>;

export function DeleteMessageButton({
  messageId,
  deleteAction,
  onDeleted,
}: {
  messageId: string;
  deleteAction: DeleteAction;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteAction(messageId);
            if (result.ok) onDeleted();
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

export function CloseRoomButton({ roomId }: { roomId: string }) {
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
            const result = await closeRoomAction(roomId);
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
