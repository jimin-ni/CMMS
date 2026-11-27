"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult, ModerationNotice } from "@/lib/bubble/actions";
import { BUBBLE_POLICY } from "@/lib/bubble/policy";
import { trackEvent } from "@/lib/analytics";
import type { PreviewResult } from "@/lib/bubble/ai-preview";
import { ReactionView } from "./reaction-view";

export type SendAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function Composer({
  sendAction,
  target,
  maxChars,
  previewRoomId,
  onSent,
  variant = "page",
  reply = null,
  onCancelReply,
}: {
  // 버블과 크리에이터 톡이 같은 입력창을 쓰고, 보내기 동작과 대상 id만 다르다.
  sendAction: SendAction;
  target: { name: string; value: string };
  maxChars: number;
  // 크리에이터 예상 반응을 미리 볼 버블 방. 구독자에게만 넘기고, 없으면 미리보기를 끈다.
  previewRoomId: string | null;
  onSent: () => void;
  // page: 버블 대화 화면. dock: 미니룸 채팅 창 (Figma "Creators' mini rooms" 5차)
  variant?: "page" | "dock";
  // 인용 답장할 메시지. 보낼 때 replyTo 로 함께 보낸다.
  reply?: { id: string; senderName: string; body: string } | null;
  onCancelReply?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // AI 스크리닝 안내. 확인을 누를 때까지 입력창 위에 둔다.
  const [notice, setNotice] = useState<ModerationNotice | null>(null);
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 전송 성공 시 입력창을 비우고 목록을 새로 가져온다.
  async function submitAction(prev: ActionResult | null, formData: FormData) {
    const result = await sendAction(prev, formData);
    // 쓰기 차단이 걸렸거나 풀렸으면 입력창을 서버에서 다시 그린다.
    if ((result.ok && result.notice?.refresh) || (!result.ok && result.refresh)) router.refresh();
    setNotice(result.ok ? (result.notice ?? null) : null);
    if (result.ok) {
      // 버블 방은 roomId, 크리에이터 톡은 chatId로 보낸다.
      trackEvent({
        event: "chat_message_send",
        chat_type: target.name === "chatId" ? "creator_talk" : "bubble_room",
      });
      setDraft("");
      setPreview(null);
      onCancelReply?.();
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

  const dock = variant === "dock";
  const sendOnEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter는 보내기, Shift+Enter는 줄바꿈. 한글 조합 중인 Enter는 무시한다.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!pending) formRef.current?.requestSubmit();
    }
  };
  const onDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    // 미리보기는 지금 입력한 문장에 대한 것만 보여준다.
    setPreview(null);
    setPreviewLoading(false);
  };

  return (
    <div className={dock ? "flex flex-col gap-1.5 px-2.5 pt-1.5 pb-1" : "flex flex-col gap-2 bg-white p-3"}>
      {notice && (
        <div
          role="alert"
          className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-sm ${
            notice.tone === "warn" ? "border-red-700 text-red-700" : "border-hairline text-ink"
          }`}
        >
          <p className="flex-1">{notice.text}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 text-xs font-bold uppercase underline"
          >
            확인
          </button>
        </div>
      )}
      {preview?.status === "ok" && (
        <div className="flex items-center gap-2 rounded-sm bg-cream px-3 py-2 text-sm">
          <ReactionView reaction={preview.reaction} size={28} />
          <span className="text-xs text-ash">예상 반응 (AI 참고용)</span>
        </div>
      )}
      {previewLoading && <p className="text-xs text-ash">예상 반응을 확인하는 중...</p>}

      {reply && (
        <div className="flex items-start gap-2 border-l-2 border-ink bg-white px-2 py-1 text-[10px] text-ash">
          <p className="min-w-0 flex-1 truncate">
            <span className="font-semibold text-[#462500]">{reply.senderName}</span>에게 답장 · {reply.body}
          </p>
          <button type="button" onClick={onCancelReply} className="shrink-0 underline">
            취소
          </button>
        </div>
      )}

      {dock ? (
        <form ref={formRef} action={formAction} className="flex flex-col gap-[3px]">
          <input type="hidden" name={target.name} value={target.value} />
          {reply && <input type="hidden" name="replyTo" value={reply.id} />}
          <div className="flex items-center gap-[7px]">
            <textarea
              name="body"
              value={draft}
              onChange={onDraftChange}
              onKeyDown={sendOnEnter}
              rows={1}
              placeholder="Text Here"
              aria-label="메시지 입력"
              className="h-[38px] w-[248px] resize-none border-[0.5px] border-[#9b8c85] bg-white px-2.5 py-[10px] font-[family-name:var(--font-oc-body)] text-[13.5px] leading-[17px] text-key-brown outline-none placeholder:text-[12px] placeholder:text-[#9b8c85]"
            />
            <button
              type="submit"
              disabled={pending || length === 0}
              aria-label="보내기"
              className="flex size-[22px] shrink-0 items-center justify-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={length === 0 || pending ? "/chat/send-disabled.svg" : "/chat/send.svg"}
                alt=""
                width={22}
                height={22}
              />
            </button>
          </div>
          <div className="flex items-center justify-between font-[family-name:var(--font-oc-body)] text-[7px] leading-[9px]">
            <span className={length > maxChars ? "text-red-700" : "text-[#9b8c85]"}>
              {length} / {maxChars}
            </span>
            {state && !state.ok && <span className="text-[10px] text-red-700">{state.error}</span>}
          </div>
        </form>
      ) : (
      <form ref={formRef} action={formAction} className="flex flex-col gap-1">
        <input type="hidden" name={target.name} value={target.value} />
        {reply && <input type="hidden" name="replyTo" value={reply.id} />}
        <div className="flex items-end gap-2">
          <textarea
            name="body"
            value={draft}
            onChange={onDraftChange}
            onKeyDown={sendOnEnter}
            rows={2}
            placeholder="메시지 입력"
            className="flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={pending || length === 0}
            className="inline-flex h-10 items-center rounded-sm border border-black bg-ink px-3 text-sm font-bold uppercase text-white hover:bg-ink-soft disabled:border-hairline disabled:bg-cream disabled:text-ash"
          >
            {pending ? "..." : "전송"}
          </button>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={length > maxChars ? "text-red-700" : "text-ash"}>
            {length} / {maxChars}자
          </span>
          {state && !state.ok && <span className="text-red-700">{state.error}</span>}
        </div>
      </form>
      )}
    </div>
  );
}
