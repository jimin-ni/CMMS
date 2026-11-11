"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinRoomAction, openRoomAction } from "@/lib/bubble/actions";

export function OpenRoomForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(openRoomAction, null);

  useEffect(() => {
    if (state?.ok && state.roomId) {
      router.push(`/bubble/${state.roomId}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        대화방 이름
        <input
          name="title"
          required
          maxLength={50}
          placeholder="구독자에게 보일 대화방 이름"
          className="rounded-lg border border-key-stone/50 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-key-brown px-5 py-2 text-sm text-key-mist disabled:opacity-60"
      >
        {pending ? "여는 중..." : "대화방 열기"}
      </button>
      {state && !state.ok && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

export function JoinRoomButton({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-700">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await joinRoomAction(roomId);
            if (result.ok) router.push(`/bubble/${roomId}`);
            else setError(result.error);
          })
        }
        className="rounded-full bg-talk-yellow px-3 py-1 text-xs font-medium text-gray-900 disabled:opacity-60"
      >
        {pending ? "참여 중..." : "참여"}
      </button>
    </span>
  );
}
