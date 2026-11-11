"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendMessageAction, type ActionResult } from "@/lib/bubble/actions";

type Preview =
  | { status: "ok"; fit: "맞음" | "애매" | "어긋남"; expectedReaction: string; reason: string }
  | { status: "unavailable"; reason: string }
  | { error: string };

export function Composer({
  roomId,
  maxChars,
  onSent,
}: {
  roomId: string;
  maxChars: number;
  onSent: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 전송 성공 시 입력창을 비우고 목록을 새로 가져온다.
  async function submitAction(prev: ActionResult | null, formData: FormData) {
    const result = await sendMessageAction(prev, formData);
    if (result.ok) {
      setDraft("");
      setPreview(null);
      onSent();
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
        body: JSON.stringify({ roomId, draft }),
      });
      setPreview((await res.json()) as Preview);
      setPreviewLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [draft, length, roomId]);

  return (
    <div className="flex flex-col gap-2 bg-white p-3">
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

      <form ref={formRef} action={formAction} className="flex flex-col gap-1">
        <input type="hidden" name="roomId" value={roomId} />
        <div className="flex items-end gap-2">
          <textarea
            name="body"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (Array.from(e.target.value.trim()).length < 2) setPreview(null);
            }}
            onKeyDown={(e) => {
              // Enter는 보내기, Shift+Enter는 줄바꿈. 한글 조합 중인 Enter는 무시한다.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!pending) formRef.current?.requestSubmit();
              }
            }}
            rows={2}
            placeholder="메시지 입력"
            className="flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={pending || length === 0}
            className="rounded-md bg-talk-yellow px-3 py-2 text-sm font-medium text-gray-900 disabled:bg-key-mist disabled:text-key-stone"
          >
            {pending ? "..." : "전송"}
          </button>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={length > maxChars ? "text-red-700" : "text-key-stone"}>
            {length} / {maxChars}자
          </span>
          {state && !state.ok && <span className="text-red-700">{state.error}</span>}
        </div>
      </form>
    </div>
  );
}
