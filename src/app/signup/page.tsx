"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth-client";
import { trackEvent } from "@/lib/analytics";
import { nextFromLocation, withNext } from "@/lib/next-path";

const noSubscribe = () => () => {};

export default function SignupPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // 다른 화면에서 가입하러 왔으면(?next=) 가입 뒤 그리로 돌아간다
  const next = useSyncExternalStore(noSubscribe, nextFromLocation, () => null);
  // 만 14세 이상인지. null: 아직 선택 안 함 (docs/planning/12-ai-screening.md 3-3)
  const [is14OrOlder, setIs14OrOlder] = useState<boolean | null>(null);
  // "아니오"로 가입한 뒤 보여 주는 안내창. 확인을 누르면 다음 화면으로 간다.
  const [underAgeNext, setUnderAgeNext] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (is14OrOlder === null) {
      setErrorMessage("만 14세 이상인지 예 또는 아니오를 선택해 주세요.");
      return;
    }

    setPending(true);
    setErrorMessage(null);

    const form = new FormData(event.currentTarget);
    // 역할은 가입 요청에 넣지 않는다. 가입 후 서버에서 따로 설정한다.
    const result = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    });

    if (result.error) {
      setPending(false);
      setErrorMessage(result.error.message ?? "회원가입에 실패했습니다.");
      return;
    }

    // 14세 확인 답은 가입 직후 한 번만 저장한다. 실패해도 가입은 끝난 상태라 다음으로 넘어간다.
    await fetch("/api/signup/age", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is14OrOlder }),
    }).catch(() => undefined);

    setPending(false);
    trackEvent({ event: "sign_up", method: "email", user_role: "public" });
    const to = next ?? "/";
    if (!is14OrOlder) {
      setUnderAgeNext(to);
      return;
    }
    router.push(to);
    router.refresh();
  }

  if (underAgeNext) {
    return (
      <main className="mx-auto w-full max-w-md px-6 py-12">
        <div role="alertdialog" aria-labelledby="under-age-title" className="flex flex-col gap-4 rounded-sm border border-hairline bg-white p-8">
          <h1 id="under-age-title" className="text-xl font-medium text-ink">가입이 끝났어요</h1>
          <p className="text-sm text-ink">
            만 14세 미만은 일부 서비스를 이용할 수 없어요. 채팅, 쪽지, 방명록은 쓸 수 없고, 방 구경과 읽기는 할 수 있어요.
          </p>
          <button
            type="button"
            onClick={() => {
              router.push(underAgeNext);
              router.refresh();
            }}
            className="inline-flex h-[35px] items-center justify-center rounded-sm border border-black bg-ink px-3 text-sm font-bold uppercase text-white hover:bg-ink-soft"
          >
            확인
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-6 py-12">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-sm border border-hairline bg-white p-8">
        <h1 className="text-[32px] leading-[1.2] font-medium text-ink">회원가입</h1>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1">만 14세 이상인가요?</legend>
          <div className="flex gap-2">
            {[true, false].map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={is14OrOlder === value}
                onClick={() => setIs14OrOlder(value)}
                className={`flex-1 rounded-sm border px-3 py-2 ${
                  is14OrOlder === value ? "border-ink bg-ink text-white" : "border-ash text-ink"
                }`}
              >
                {value ? "예" : "아니오"}
              </button>
            ))}
          </div>
          <p className="text-xs text-ash">한 번 답하면 바꿀 수 없어요.</p>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          닉네임
          <input name="name" required className="rounded-sm border border-ash px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          이메일
          <input name="email" type="email" required className="rounded-sm border border-ash px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          비밀번호 (8자 이상)
          <input name="password" type="password" minLength={8} required className="rounded-sm border border-ash px-3 py-2" />
        </label>
        {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
        {/* 문서는 새 탭으로 연다: 쓰던 가입 양식이 지워지지 않게 */}
        <p className="text-xs text-ash">
          가입하기를 누르면{" "}
          <Link href="/terms" target="_blank" rel="noopener" className="text-ink underline">
            서비스 이용약관
          </Link>
          과{" "}
          <Link href="/privacy" target="_blank" rel="noopener" className="text-ink underline">
            개인정보 처리방침
          </Link>
          에 동의한 것으로 봅니다.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-[35px] items-center justify-center rounded-sm border border-black bg-ink px-3 text-sm font-bold uppercase text-white hover:bg-ink-soft disabled:opacity-60"
        >
          {pending ? "처리 중..." : "가입하기"}
        </button>
        <p className="text-sm text-ash">
          이미 계정이 있나요?{" "}
          <Link href={withNext("/login", next)} className="font-medium text-ink underline">
            로그인
          </Link>
        </p>
      </form>
    </main>
  );
}
