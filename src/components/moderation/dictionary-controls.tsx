"use client";

// 판정 사전 관리 화면의 허용 목록 입력과 삭제 버튼. 결과는 서버에서 다시 그린다.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAllowAction, removeAllowAction } from "@/lib/moderation/dictionary-actions";
import type { DictWriteResult } from "@/lib/moderation/dictionary-repo";

const BTN = "rounded-sm border border-ink px-2 py-0.5 text-xs font-bold hover:bg-cream disabled:opacity-50";
const INPUT = "rounded-sm border border-hairline bg-white px-2 py-1 text-sm";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<DictWriteResult>, onOk?: () => void) =>
    start(async () => {
      const r = await action();
      if (r.ok) {
        setError(null);
        onOk?.();
        router.refresh();
      } else setError(r.error);
    });
  return { pending, error, run };
}

export function AddAllowForm() {
  const { pending, error, run } = useRun();
  const [term, setTerm] = useState("");
  const [note, setNote] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addAllowAction(term, note), () => {
          setTerm("");
          setNote("");
        });
      }}
    >
      <input
        className={`${INPUT} w-40`}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="허용할 단어"
        maxLength={40}
        aria-label="허용할 단어"
      />
      <input
        className={`${INPUT} min-w-0 flex-1`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="메모 (어떤 오탐을 막는지)"
        maxLength={200}
        aria-label="메모"
      />
      <button type="submit" disabled={pending || !term.trim()} className={BTN}>
        추가
      </button>
      {error && <span className="w-full text-xs text-red-700">{error}</span>}
    </form>
  );
}

export function RemoveAllowButton({ id, term }: { id: number; term: string }) {
  const { pending, error, run } = useRun();
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={BTN}
        onClick={() => {
          if (window.confirm(`허용 목록에서 "${term}"을(를) 뺄까요? 5분 안에 판정에 반영돼요.`)) {
            run(() => removeAllowAction(id));
          }
        }}
      >
        빼기
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
