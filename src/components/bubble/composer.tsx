"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sendMessageAction, type ActionResult } from "@/lib/bubble/actions";

type Preview =
  | { status: "ok"; fit: "맞음" | "애매" | "어긋남"; expectedReaction: string; reason: string }
  | { status: "unavailable"; reason: string }
  | { error: string };

export function Composer({ threadId, maxChars }: { threadId: string; maxChars: number }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 전송 성공 시 입력창을 비우고 목록을 새로 가져온다.
  async function submitAction(prev: ActionResult | null, formData: FormData) {
    const result = await sendMessageAction(prev, formData);
    if (result.ok) {
      setDraft("");
      setPreview(null);
      router.refresh();
    }
    return result;
  }
  const [state, formAction, pending] = useActionState(submitAction, null);

  const length = Array.from(draft.trim()).length;

  // 입력이 멈추고 0.8초 뒤에 AI 미리보기를 요청한다.
  useEffect(() => {
    if (length < 2) return;
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      const res = await fetch("/api/bubble/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId, draft }),
      });
      setPreview((await res.json()) as Preview);
      setPreviewLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [draft, length, threadId]);

  return (
    <div className="flex flex-col gap-3 border-t border-key-stone/30 p-4">
      {preview && "status" in preview && preview.status === "ok" && (
        <div className="rounded-lg bg-key-mist p-3 text-sm">
          <p className="text-xs text-key-stone">AI 반응 미리보기 (참고용)</p>
          <p className="mt-1">
            예상 반응: {preview.expectedReaction}
          </p>
          <p className="mt-1 text-xs text-key-stone">
            문맥 반영: {preview.fit} · {preview.reason}
          </p>
        </div>
      )}
      {preview && "status" in preview && preview.status === "unavailable" && (
        <p className="text-xs text-key-stone">{preview.reason}</p>
      )}
      {previewLoading && <p className="text-xs text-key-stone">예상 반응을 확인하는 중...</p>}

      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="threadId" value={threadId} />
        <textarea
          name="body"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (Array.from(e.target.value.trim()).length < 2) setPreview(null);
          }}
          rows={3}
          placeholder="메시지를 입력하세요"
          className="resize-none rounded-lg border border-key-stone/50 px-3 py-2 text-sm"
        />
        <div className="flex items-center justify-between text-xs">
          <span className={length > maxChars ? "text-red-700" : "text-key-stone"}>
            {length} / {maxChars}자
          </span>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-key-brown px-4 py-1.5 text-sm text-key-mist disabled:opacity-60"
          >
            {pending ? "보내는 중..." : "보내기"}
          </button>
        </div>
        {state && !state.ok && <p className="text-sm text-red-700">{state.error}</p>}
      </form>
    </div>
  );
}
