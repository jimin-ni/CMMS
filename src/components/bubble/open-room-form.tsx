"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { openThreadAction } from "@/lib/bubble/actions";

export function OpenRoomForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(openThreadAction, null);

  useEffect(() => {
    if (state?.ok && state.threadId) {
      router.push(`/bubble/${state.threadId}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        구독자 닉네임
        <input
          name="nickname"
          required
          placeholder="구독자의 닉네임을 정확히 입력하세요"
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
