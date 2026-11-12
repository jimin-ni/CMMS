"use client";

import { useActionState } from "react";
import { savePersonaAction } from "@/lib/creator/actions";

export function PersonaForm({ initialPersona, maxChars }: { initialPersona: string; maxChars: number }) {
  const [state, formAction, pending] = useActionState(savePersonaAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        내 성격
        <textarea
          name="persona"
          defaultValue={initialPersona}
          maxLength={maxChars}
          rows={3}
          placeholder="예: 어떤 메시지에도 밝고 다정하게 반응하는 ENFP"
          className="resize-none rounded-lg border border-key-stone/50 px-3 py-2"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-key-brown px-5 py-2 text-sm text-key-mist disabled:opacity-60"
        >
          {pending ? "저장 중..." : "저장"}
        </button>
        {state?.ok && <span className="text-sm text-key-stone">저장했어요.</span>}
        {state && !state.ok && <span className="text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
