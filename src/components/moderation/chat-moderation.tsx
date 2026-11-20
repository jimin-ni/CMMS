"use client";

// 버블 대화방 안의 AI 스크리닝 부품: 내린 글 표시, 신고·차단 버튼, 쓰기 차단 안내 (문서 8장, 9장, 10장)
import { useState, useTransition } from "react";
import {
  blockUserAction,
  reportMessageAction,
  requestAppealAction,
  revealRemovedAction,
} from "@/lib/moderation/actions";
import { MODERATION_TEXT } from "@/lib/moderation/policy";
import type { WriteBlock } from "@/lib/moderation/repo";

// 신고로 내린 글. 방 주인·관리자는 그 자리에서 원문을 펼쳐 볼 수 있다(열람은 기록된다).
export function RemovedText({ messageId, canReveal }: { messageId: string; canReveal: boolean }) {
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-col gap-1">
      <span className="italic">{MODERATION_TEXT.removed}</span>
      {body !== null && <span className="not-italic text-ash">원문: {body}</span>}
      {canReveal && body === null && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await revealRemovedAction(messageId);
              if (r.ok) setBody(r.body ?? "");
              else setError(r.error);
            })
          }
          className="self-start text-[11px] text-ash underline"
        >
          원문 보기
        </button>
      )}
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </span>
  );
}

// 방 주인·관리자가 구독자 글 옆에서 쓰는 신고(글 내림 + 경고 1회)와 차단(사람 단위 쓰기 차단 + 예전 글 내림)
export function ModeratorTools({
  messageId,
  senderId,
  senderName,
  onDone,
}: {
  messageId: string;
  senderId: string;
  senderName: string;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (confirmText: string, action: () => Promise<{ ok: boolean; error?: string }>) => {
    if (!window.confirm(confirmText)) return;
    start(async () => {
      const r = await action();
      if (r.ok) {
        setError(null);
        onDone();
      } else setError(r.error ?? "처리하지 못했어요.");
    });
  };
  return (
    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-ash">
      <button
        type="button"
        disabled={pending}
        className="underline"
        onClick={() =>
          run("이 메시지를 신고해서 내릴까요? 작성자에게 경고 1회가 쌓여요.", () => reportMessageAction(messageId))
        }
      >
        신고
      </button>
      <button
        type="button"
        disabled={pending}
        className="underline"
        onClick={() =>
          run(
            `${senderName} 님을 차단할까요? 내 방에서 더 이상 글을 쓸 수 없고, 예전 글도 모두 내려가요.`,
            () => blockUserAction(senderId),
          )
        }
      >
        차단
      </button>
      {error && <span className="text-red-700">{error}</span>}
    </span>
  );
}

// 쓸 수 없는 구독자의 입력창 자리 (문서 10-1)
export function WriteBlockedPanel({ block }: { block: WriteBlock }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // 요청이 저장되면 바로 바꿔 보여 준다. 다시 열면 서버 값(block.appealed)으로 보인다.
  const [appealedNow, setAppealedNow] = useState(false);
  const appealed = block.reason === "sanction" && (block.appealed || appealedNow);
  return (
    <div className="flex flex-col items-center gap-2 bg-white px-4 py-3 text-center text-sm text-ink">
      <p>{block.reason === "under_age" ? MODERATION_TEXT.underAge : MODERATION_TEXT.writeBlocked}</p>
      {block.reason === "sanction" &&
        (appealed ? (
          <p className="text-xs text-ash">재검토를 요청했어요.</p>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await requestAppealAction(block.sanctionId);
                if (r.ok) setAppealedNow(true);
                else setError(r.error);
              })
            }
            className="rounded-sm border border-ink px-3 py-1 text-xs font-bold uppercase hover:bg-cream"
          >
            재검토 요청
          </button>
        ))}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
