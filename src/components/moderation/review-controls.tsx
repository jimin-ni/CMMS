"use client";

// 검토 화면 버튼. 결과는 서버에서 다시 그린다.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideEventAction, decideSanctionAction, type ModerationActionResult } from "@/lib/moderation/actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<ModerationActionResult>) =>
    start(async () => {
      const r = await action();
      if (r.ok) {
        setError(null);
        router.refresh();
      } else setError(r.error);
    });
  return { pending, error, run };
}

const BTN = "rounded-sm border border-ink px-2 py-0.5 text-xs font-bold hover:bg-cream disabled:opacity-50";

// 숨김 글: 해제(공개) / 유지. 방 주인 글 사후 확인: 문제없음 / 내림.
export function EventDecision({ eventId, ownerPost }: { eventId: string; ownerPost: boolean }) {
  const { pending, error, run } = useRun();
  return (
    <div className="flex items-center gap-2">
      <button type="button" disabled={pending} className={BTN} onClick={() => run(() => decideEventAction(eventId, "dismiss"))}>
        {ownerPost ? "문제없음" : "숨김 해제"}
      </button>
      <button type="button" disabled={pending} className={BTN} onClick={() => run(() => decideEventAction(eventId, "uphold"))}>
        {ownerPost ? "글 내림" : "숨김 유지"}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}

export function SanctionDecision({ sanctionId, canUphold }: { sanctionId: string; canUphold: boolean }) {
  const { pending, error, run } = useRun();
  return (
    <div className="flex items-center gap-2">
      {canUphold && (
        <button type="button" disabled={pending} className={BTN} onClick={() => run(() => decideSanctionAction(sanctionId, "uphold"))}>
          차단 유지
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        className={BTN}
        onClick={() => {
          if (window.confirm("차단을 해지할까요? 경고 수는 그대로라 다음 위반 1회로 다시 차단돼요.")) {
            run(() => decideSanctionAction(sanctionId, "revoke"));
          }
        }}
      >
        차단 해지
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}

export function UnblockButton({ sanctionId }: { sanctionId: string }) {
  const { pending, error, run } = useRun();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={BTN}
        onClick={() => {
          if (window.confirm("차단을 해지할까요? 내린 예전 글은 되살아나지 않아요.")) {
            run(() => decideSanctionAction(sanctionId, "revoke"));
          }
        }}
      >
        차단 해지
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
