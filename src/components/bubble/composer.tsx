"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/bubble/actions";
import { BUBBLE_POLICY } from "@/lib/bubble/policy";
import type { PreviewResult } from "@/lib/bubble/ai-preview";
import { ReactionView } from "./reaction-view";

export type SendAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function Composer({
  sendAction,
  target,
  maxChars,
  previewRoomId,
  onSent,
}: {
  // 버블과 크리에이터 톡이 같은 입력창을 쓰고, 보내기 동작과 대상 id만 다르다.
  sendAction: SendAction;
  target: { name: string; value: string };
  maxChars: number;
  // 크리에이터 예상 반응을 미리 볼 버블 방. 구독자에게만 넘기고, 없으면 미리보기를 끈다.
  previewRoomId: string | null;
  onSent: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 전송 성공 시 입력창을 비우고 목록을 새로 가져온다.
  async function submitAction(prev: ActionResult | null, formData: FormData) {
    const result = await sendAction(prev, formData);
    if (result.ok) {
      setDraft("");
      setPreview(null);
      onSent();
    }
    return result;
  }
  const [state, formAction, pending] = useActionState(submitAction, null);

  const length = Array.from(draft.trim()).length;

  // 입력이 3초 동안 바뀌지 않으면 크리에이터 예상 반응을 요청한다.
  // 그 사이 입력이 바뀌면 타이머와 진행 중인 요청을 모두 취소한다.
  useEffect(() => {
    if (!previewRoomId || length < 2 || length > maxChars) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/bubble/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ roomId: previewRoomId, draft }),
          signal: controller.signal,
        });
        setPreview(res.ok ? ((await res.json()) as PreviewResult) : null);
      } catch {
        // 취소되었거나 네트워크 오류. 미리보기는 참고용이라 조용히 넘긴다.
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, BUBBLE_POLICY.previewDebounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft, length, maxChars, previewRoomId]);

  return (
    <div className="flex flex-col gap-2 bg-white p-3">
      {preview?.status === "ok" && (
        <div className="flex items-center gap-2 rounded-lg bg-key-mist px-3 py-2 text-sm">
          <ReactionView reaction={preview.reaction} size={28} />
          <span className="text-xs text-key-stone">예상 반응 (AI 참고용)</span>
        </div>
      )}
      {previewLoading && <p className="text-xs text-key-stone">예상 반응을 확인하는 중...</p>}

      <form ref={formRef} action={formAction} className="flex flex-col gap-1">
        <input type="hidden" name={target.name} value={target.value} />
        <div className="flex items-end gap-2">
          <textarea
            name="body"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              // 미리보기는 지금 입력한 문장에 대한 것만 보여준다.
              setPreview(null);
              setPreviewLoading(false);
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
