"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth-client";
import { trackEvent } from "@/lib/analytics";
import { ADMIN_CONTACT_EMAIL } from "@/lib/moderation/policy";
import { nextFromLocation, withNext } from "@/lib/next-path";

const noSubscribe = () => () => {};

export default function LoginPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // 다른 화면에서 로그인하러 왔으면(?next=) 로그인 뒤 그리로 돌아간다. 회원가입으로 가도 이어 넘긴다.
  const next = useSyncExternalStore(noSubscribe, nextFromLocation, () => null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);

    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });

    setPending(false);
    if (result.error) {
      setErrorMessage(result.error.message ?? "로그인에 실패했습니다.");
      return;
    }
    trackEvent({ event: "login", method: "email", user_role: toUserRole(result.data.user.role) });
    router.push(next ?? "/");
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-md px-6 py-12">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-sm border border-hairline bg-white p-8">
        <h1 className="text-[32px] leading-[1.2] font-medium text-ink">로그인</h1>
        <label className="flex flex-col gap-1 text-sm">
          이메일
          <input name="email" type="email" required className="rounded-sm border border-ash px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          비밀번호
          <input name="password" type="password" required className="rounded-sm border border-ash px-3 py-2" />
        </label>
        {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-[35px] items-center justify-center rounded-sm border border-black bg-ink px-3 text-sm font-bold uppercase text-white hover:bg-ink-soft disabled:opacity-60"
        >
          {pending ? "확인 중..." : "로그인"}
        </button>
        <p className="text-sm text-ash">
          계정이 없나요?{" "}
          <Link href={withNext("/signup", next)} className="font-medium text-ink underline">
            회원가입
          </Link>
        </p>
        {/* 계정 정지 등으로 로그인할 수 없는 사용자의 이의 제기 경로 (docs/planning/12-ai-screening.md 9장) */}
        <a
          href={`mailto:${ADMIN_CONTACT_EMAIL}?subject=${encodeURIComponent("[CMMS] 관리자 문의")}`}
          className="self-start text-xs text-ash underline"
        >
          관리자 문의
        </a>
      </form>
    </main>
  );
}

// 세션의 role 값을 GA에 보낼 정해진 값으로 좁힌다. 모르는 값은 "unknown"으로 보낸다.
function toUserRole(role: string | null | undefined) {
  return role === "admin" || role === "creator" || role === "public" ? role : "unknown";
}
