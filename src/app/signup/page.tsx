"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignupPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // null: 아직 선택 안 함, true: 크리에이터, false: 구독자
  const [isCreator, setIsCreator] = useState<boolean | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreator === null) {
      setErrorMessage("크리에이터인지 예 또는 아니오를 선택해 주세요.");
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

    if (isCreator) {
      const res = await fetch("/api/signup/creator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "creator" }),
      });
      if (!res.ok) {
        setPending(false);
        setErrorMessage("크리에이터 설정에 실패했습니다. 로그인 후 다시 시도해 주세요.");
        return;
      }
    }

    setPending(false);
    // 예를 고른 경우 크리에이터 페이지로 이동한다.
    router.push(isCreator ? "/creator" : "/");
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-md px-6 py-12">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-key-brown">회원가입</h1>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1">크리에이터인가요?</legend>
          <div className="flex gap-2">
            <button
              type="button"
              aria-pressed={isCreator === true}
              onClick={() => setIsCreator(true)}
              className={`flex-1 rounded-lg border px-3 py-2 ${
                isCreator === true
                  ? "border-key-brown bg-key-brown text-key-mist"
                  : "border-key-stone/50 text-key-brown"
              }`}
            >
              예
            </button>
            <button
              type="button"
              aria-pressed={isCreator === false}
              onClick={() => setIsCreator(false)}
              className={`flex-1 rounded-lg border px-3 py-2 ${
                isCreator === false
                  ? "border-key-brown bg-key-brown text-key-mist"
                  : "border-key-stone/50 text-key-brown"
              }`}
            >
              아니오
            </button>
          </div>
          <p className="text-xs text-key-stone">
            예를 고르면 크리에이터로 가입합니다. 크리에이터 검증 절차는 나중에 추가합니다.
          </p>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          닉네임
          <input name="name" required className="rounded-lg border border-key-stone/50 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          이메일
          <input name="email" type="email" required className="rounded-lg border border-key-stone/50 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          비밀번호 (8자 이상)
          <input name="password" type="password" minLength={8} required className="rounded-lg border border-key-stone/50 px-3 py-2" />
        </label>
        {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-key-brown px-5 py-2 text-key-mist disabled:opacity-60"
        >
          {pending ? "처리 중..." : "가입하기"}
        </button>
        <p className="text-sm text-key-stone">
          이미 계정이 있나요?{" "}
          <Link href="/login" className="font-medium text-key-brown underline">
            로그인
          </Link>
        </p>
      </form>
    </main>
  );
}
