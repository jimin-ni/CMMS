"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAvatarAction, saveAvatarAction, type AvatarResult } from "@/lib/creator/actions";
import { Avatar } from "@/components/avatar";

// 크리에이터 프로필 사진 등록. 서버에서 크리에이터인지, 파일 형식과 크기를 다시 확인한다.
export function AvatarForm({
  name,
  currentUrl,
  maxBytes,
}: {
  name: string;
  currentUrl: string | null;
  maxBytes: number;
}) {
  const router = useRouter();
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [tooLarge, setTooLarge] = useState(false);

  // 저장에 성공하면 미리보기를 비우고 서버에서 새 사진 주소를 받아 다시 그린다.
  async function submitAction(prev: AvatarResult | null, formData: FormData) {
    const result = await saveAvatarAction(prev, formData);
    if (result.ok) {
      setPreview(null);
      router.refresh();
    }
    return result;
  }
  const [state, formAction, pending] = useActionState(submitAction, null);

  // 고른 파일 미리보기 주소는 다 쓰면 정리한다.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <form action={formAction} className="flex items-center gap-4">
      <Avatar name={name} url={preview ?? currentUrl} size={72} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <label className="text-sm">
          <span className="sr-only">프로필 사진 파일</span>
          <input
            name="avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setTooLarge(!!file && file.size > maxBytes);
              setPreview(file ? URL.createObjectURL(file) : null);
            }}
            className="w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-key-mist file:px-4 file:py-1.5 file:text-key-brown"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || !preview || tooLarge}
            className="rounded-full bg-key-brown px-5 py-2 text-sm text-key-mist disabled:opacity-60"
          >
            {pending ? "올리는 중..." : "사진 저장"}
          </button>
          {currentUrl && (
            <button
              type="button"
              disabled={deleting}
              onClick={() =>
                startDelete(async () => {
                  const result = await deleteAvatarAction();
                  if (result.ok) router.refresh();
                  else setDeleteError(result.error);
                })
              }
              className="text-sm text-key-stone underline"
            >
              사진 지우기
            </button>
          )}
        </div>
        <p className="text-xs text-key-stone">
          PNG, JPEG, WebP, GIF · {Math.round(maxBytes / 1024)}KB 이하. 다른 크리에이터와 구독자에게 보여요.
        </p>
        {tooLarge && (
          <p className="text-sm text-red-700">사진은 {Math.round(maxBytes / 1024)}KB까지 올릴 수 있어요.</p>
        )}
        {state?.ok && <p className="text-sm text-key-stone">저장했어요.</p>}
        {state && !state.ok && <p className="text-sm text-red-700">{state.error}</p>}
        {deleteError && <p className="text-sm text-red-700">{deleteError}</p>}
      </div>
    </form>
  );
}
