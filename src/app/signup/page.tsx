"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignupPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);

    const form = new FormData(event.currentTarget);
    const result = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    });

    setPending(false);
    if (result.error) {
      setErrorMessage(result.error.message ?? "회원가입에 실패했습니다.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-md px-6 py-12">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-key-brown">회원가입</h1>
        <p className="text-xs text-key-stone">가입하면 기본 역할은 구독자(public)입니다.</p>
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
