"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { nextFromLocation, withNext } from "@/lib/next-path";
import { NICKNAME_MAX } from "@/lib/nickname";
import type { SignupText } from "@/components/signup/signup-text";
import { useSignup } from "@/components/signup/use-signup";

const noSubscribe = () => () => {};

// 회원가입 화면. 양식의 상태와 처리는 useSignup 이 한다 (로그인 팝업의 가입 쪽과 같다).
export default function SignupPage() {
  const router = useRouter();
  // 다른 화면에서 가입하러 왔으면(?next=) 가입 뒤 그리로 돌아간다
  const next = useSyncExternalStore(noSubscribe, nextFromLocation, () => null);
  // "아니오"로 가입한 뒤 보여 주는 안내창. 확인을 누르면 다음 화면으로 간다.
  const [underAgeNext, setUnderAgeNext] = useState<string | null>(null);
  const f = useSignup((is14OrOlder) => {
    const to = next ?? "/";
    if (!is14OrOlder) {
      setUnderAgeNext(to);
      return;
    }
    router.push(to);
    router.refresh();
  });
  const { t, nickText } = f;

  if (underAgeNext) {
    return (
      <main className="mx-auto w-full max-w-md px-6 py-12">
        <div role="alertdialog" aria-labelledby="under-age-title" className="flex flex-col gap-4 rounded-sm border border-hairline bg-white p-8">
          <h1 id="under-age-title" className="text-xl font-medium text-ink">{t.doneTitle}</h1>
          <p className="text-sm text-ink">{t.underAge}</p>
          <button
            type="button"
            onClick={() => {
              router.push(underAgeNext);
              router.refresh();
            }}
            className="inline-flex h-[35px] items-center justify-center rounded-sm border border-black bg-ink px-3 text-sm font-bold uppercase text-white hover:bg-ink-soft"
          >
            {t.ok}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-6 py-12">
      <form onSubmit={f.handleSubmit} className="flex flex-col gap-4 rounded-sm border border-hairline bg-white p-8">
        <h1 className="text-[32px] leading-[1.2] font-medium text-ink">{t.title}</h1>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1">{t.ageQuestion}</legend>
          <div className="flex gap-2">
            {[true, false].map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={f.is14OrOlder === value}
                onClick={() => f.setIs14OrOlder(value)}
                className={`flex-1 rounded-sm border px-3 py-2 ${
                  f.is14OrOlder === value ? "border-ink bg-ink text-white" : "border-ash text-ink"
                }`}
              >
                {value ? t.yes : t.no}
              </button>
            ))}
          </div>
          <p className="text-xs text-ash">{t.ageLocked}</p>
        </fieldset>

        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="signup-name" className="flex justify-between">
            {t.nickname}
            <span className={f.nicknameTooLong ? "text-red-700" : "text-ash"}>
              {f.nicknameCount}/{NICKNAME_MAX}
            </span>
          </label>
          <div className="flex gap-2">
            <input
              id="signup-name"
              name="name"
              required
              value={f.nickname}
              onChange={(e) => f.setNickname(e.target.value)}
              aria-describedby="signup-name-rules signup-name-status"
              className="min-w-0 flex-1 rounded-sm border border-ash px-3 py-2"
            />
            <button
              type="button"
              onClick={() => void f.checkNickname()}
              disabled={f.checking || f.nicknameOk}
              className="shrink-0 rounded-sm border border-ink px-3 py-2 text-ink disabled:opacity-60"
            >
              {f.checking ? t.checking : t.check}
            </button>
          </div>
          <p id="signup-name-rules" className="text-xs text-red-700">{nickText.rulesNotice}</p>
          <p id="signup-name-status" aria-live="polite" className="text-xs text-green-700">
            {f.nicknameOk ? nickText.ok : ""}
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          {t.email}
          <input name="email" type="email" required className="rounded-sm border border-ash px-3 py-2" />
        </label>
        <PasswordField
          label={t.password}
          value={f.password}
          onChange={f.setPassword}
          visible={f.showPassword}
          onToggle={f.toggleShowPassword}
          t={t}
        />
        <PasswordField
          label={t.confirm}
          value={f.passwordConfirm}
          onChange={f.setPasswordConfirm}
          visible={f.showPassword}
          onToggle={f.toggleShowPassword}
          invalid={f.passwordMismatch}
          t={t}
        />
        {f.passwordMismatch && <p className="text-xs text-red-700">{t.mismatch}</p>}
        {f.errorMessage && <p className="text-sm text-red-700">{f.errorMessage}</p>}
        {/* 문서는 새 탭으로 연다: 쓰던 가입 양식이 지워지지 않게 */}
        <p className="text-xs text-ash">
          {t.agreeBefore}
          <Link href="/terms" target="_blank" rel="noopener" className="text-ink underline">
            {t.terms}
          </Link>
          {t.and}
          <Link href="/privacy" target="_blank" rel="noopener" className="text-ink underline">
            {t.privacy}
          </Link>
          {t.agreeAfter}
        </p>
        <button
          type="submit"
          disabled={f.pending}
          className="inline-flex h-[35px] items-center justify-center rounded-sm border border-black bg-ink px-3 text-sm font-bold uppercase text-white hover:bg-ink-soft disabled:opacity-60"
        >
          {f.pending ? t.pending : t.submit}
        </button>
        <p className="text-sm text-ash">
          {t.haveAccount}{" "}
          <Link href={withNext("/login", next)} className="font-medium text-ink underline">
            {t.signIn}
          </Link>
        </p>
      </form>
      {f.nicknameNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="nickname-notice-title"
            aria-describedby="nickname-notice-body"
            className="flex w-full max-w-sm flex-col gap-4 rounded-sm border border-hairline bg-white p-6"
          >
            <h2 id="nickname-notice-title" className="text-lg font-medium text-ink">{t.nicknameNoticeTitle}</h2>
            <p id="nickname-notice-body" className="text-sm text-ink">{f.nicknameNotice}</p>
            <button
              type="button"
              autoFocus
              onClick={f.closeNicknameNotice}
              className="inline-flex h-[35px] items-center justify-center rounded-sm border border-black bg-ink px-3 text-sm font-bold uppercase text-white hover:bg-ink-soft"
            >
              {t.ok}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function PasswordField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  invalid?: boolean;
  t: SignupText;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {props.label}
      <span className="relative flex">
        <input
          type={props.visible ? "text" : "password"}
          minLength={8}
          required
          autoComplete="new-password"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          aria-invalid={props.invalid || undefined}
          className={`w-full rounded-sm border px-3 py-2 pr-10 ${props.invalid ? "border-red-700" : "border-ash"}`}
        />
        <button
          type="button"
          onClick={props.onToggle}
          aria-label={props.visible ? props.t.hidePassword : props.t.showPassword}
          aria-pressed={props.visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ash hover:text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {props.visible && <path d="M3 3l18 18" />}
          </svg>
        </button>
      </span>
    </label>
  );
}
