"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startChatAction } from "@/lib/bubble/talk-actions";
import type { CreatorCard } from "@/lib/bubble/talk-repo";

// 크리에이터 프로필 카드 목록. 한 명을 고르면 1:1 대화, 여러 명을 고르면 그룹 대화를 연다.
export function CreatorPicker({ creators, maxPick }: { creators: CreatorCard[]; maxPick: number }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(startChatAction, null);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (state?.ok) router.push(`/bubble/talk/${state.chatId}`);
  }, [state, router]);

  function toggle(id: string) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : prev.length < maxPick ? [...prev, id] : prev,
    );
  }

  if (creators.length === 0) {
    return <p className="px-5 py-6 text-sm text-key-stone">찾는 크리에이터가 없어요.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <ul className="grid grid-cols-1 gap-2 px-5 sm:grid-cols-2">
        {creators.map((creator) => {
          const checked = picked.includes(creator.id);
          return (
            <li key={creator.id}>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-key-brown ${
                  checked ? "border-key-brown bg-key-mist" : "border-key-stone/30 hover:bg-key-mist/50"
                }`}
              >
                <input
                  type="checkbox"
                  name="memberId"
                  value={creator.id}
                  checked={checked}
                  onChange={() => toggle(creator.id)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-key-blue/40 text-lg font-semibold text-key-brown"
                >
                  {Array.from(creator.name)[0] ?? "?"}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-gray-900">{creator.name}</span>
                    <span className="rounded-full bg-key-blue/30 px-2 py-0.5 text-[10px] text-key-brown">
                      크리에이터
                    </span>
                  </span>
                  <span className="line-clamp-2 text-xs text-key-stone">
                    {creator.persona || "아직 소개가 없어요."}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`mt-1 h-5 w-5 shrink-0 rounded-full border-2 ${
                    checked ? "border-key-brown bg-key-brown" : "border-key-stone/60"
                  }`}
                />
              </label>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-key-mist bg-white px-5 py-3">
        {picked.length > 1 && (
          <input
            name="title"
            maxLength={50}
            placeholder="그룹 대화 이름 (선택)"
            className="rounded-lg border border-key-stone/50 px-3 py-2 text-sm"
          />
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-key-stone">
            {picked.length === 0
              ? "대화할 크리에이터를 골라 주세요."
              : picked.length === 1
                ? "1:1 대화"
                : `그룹 대화 · 나 포함 ${picked.length + 1}명`}
          </span>
          <button
            type="submit"
            disabled={pending || picked.length === 0}
            className="rounded-full bg-key-brown px-5 py-2 text-sm text-key-mist disabled:opacity-50"
          >
            {pending ? "여는 중..." : "대화 시작"}
          </button>
        </div>
        {state && !state.ok && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
