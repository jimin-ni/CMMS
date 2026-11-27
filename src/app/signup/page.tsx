"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth-client";
import { trackEvent } from "@/lib/analytics";
import { nextFromLocation, withNext } from "@/lib/next-path";
import { NICKNAME_MAX, NICKNAME_STATUSES, NICKNAME_TEXT, nicknameLength, type NicknameStatus } from "@/lib/nickname";
import { useLanguage } from "@/lib/settings/prefs";

const noSubscribe = () => () => {};

// 화면 글 (설정의 언어). 영어는 영어화(2026-11-27) 때의 글 그대로다
const TEXT = {
  ko: {
    checkFailed: "닉네임을 확인하지 못했어요. 잠시 뒤에 다시 시도해 주세요.",
    chooseAge: "만 14세 이상인지 예 또는 아니오를 선택해 주세요.",
    failed: "회원가입에 실패했습니다.",
    doneTitle: "가입이 끝났어요",
    underAge: "만 14세 미만은 일부 서비스를 이용할 수 없어요. 채팅, 쪽지, 방명록은 쓸 수 없고, 방 구경과 읽기는 할 수 있어요.",
    ok: "확인",
    title: "회원가입",
    ageQuestion: "만 14세 이상인가요?",
    yes: "예",
    no: "아니오",
    ageLocked: "한 번 답하면 바꿀 수 없어요.",
    nickname: "닉네임",
    checking: "확인 중...",
    check: "확인",
    email: "이메일",
    password: "비밀번호 (8자 이상)",
    confirm: "비밀번호 확인",
    mismatch: "비밀번호가 서로 달라요.",
    agreeBefore: "가입하기를 누르면 ",
    terms: "서비스 이용약관",
    and: "과 ",
    privacy: "개인정보 처리방침",
    agreeAfter: "에 동의한 것으로 봅니다.",
    pending: "처리 중...",
    submit: "가입하기",
    haveAccount: "이미 계정이 있나요?",
    signIn: "로그인",
    nicknameNoticeTitle: "닉네임을 사용할 수 없어요",
    hidePassword: "비밀번호 숨기기",
    showPassword: "비밀번호 보기",
  },
  en: {
    checkFailed: "Couldn't check the nickname. Try again later.",
    chooseAge: "Choose Yes or No for the age question.",
    failed: "Sign up failed.",
    doneTitle: "You’re signed up",
    underAge: "Under 14? You can visit rooms and read, but not chat, write notes, or sign guestbooks.",
    ok: "OK",
    title: "Sign up",
    ageQuestion: "Are you 14 or older?",
    yes: "Yes",
    no: "No",
    ageLocked: "You can’t change this later.",
    nickname: "Nickname",
    checking: "Checking...",
    check: "Check",
    email: "Email",
    password: "Password (8+ characters)",
    confirm: "Confirm password",
    mismatch: "Passwords don’t match.",
    agreeBefore: "By signing up, you agree to the ",
    terms: "Terms",
    and: " and ",
    privacy: "Privacy Policy",
    agreeAfter: ".",
    pending: "Signing up...",
    submit: "Sign up",
    haveAccount: "Have an account?",
    signIn: "Sign in",
    nicknameNoticeTitle: "Can’t use this nickname",
    hidePassword: "Hide password",
    showPassword: "Show password",
  },
};
type SignupText = (typeof TEXT)["en"];

// 서버가 닉네임을 거절한 오류(code NICKNAME_*)면 그 상태. 아니면 null
function nicknameStatusOf(code: string | undefined): NicknameStatus | null {
  const status = code?.startsWith("NICKNAME_") ? code.slice("NICKNAME_".length).toLowerCase() : null;
  return NICKNAME_STATUSES.find((s) => s === status) ?? null;
}

export default function SignupPage() {
  const router = useRouter();
  const language = useLanguage();
  const t = TEXT[language];
  const nickText = NICKNAME_TEXT[language];
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // 다른 화면에서 가입하러 왔으면(?next=) 가입 뒤 그리로 돌아간다
  const next = useSyncExternalStore(noSubscribe, nextFromLocation, () => null);
  // 만 14세 이상인지. null: 아직 선택 안 함 (docs/planning/12-ai-screening.md 3-3)
  const [is14OrOlder, setIs14OrOlder] = useState<boolean | null>(null);
  // "아니오"로 가입한 뒤 보여 주는 안내창. 확인을 누르면 다음 화면으로 간다.
  const [underAgeNext, setUnderAgeNext] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  // 스크리닝을 통과한 닉네임. 입력이 바뀌면 다시 확인해야 한다.
  const [checkedNickname, setCheckedNickname] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // 닉네임 확인에 실패했을 때 띄우는 안내창 문구
  const [nicknameNotice, setNicknameNotice] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const nicknameOk = checkedNickname !== null && checkedNickname === nickname.trim();
  const passwordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;

  // 통과하면 true. 실패하면 안내창을 띄우고 false.
  async function checkNickname(): Promise<boolean> {
    const name = nickname.trim();
    if (nicknameOk) return true;
    let status: NicknameStatus;
    if (nicknameLength(name) === 0) status = "empty";
    else if (nicknameLength(name) > NICKNAME_MAX) status = "too_long";
    else {
      setChecking(true);
      const res = await fetch("/api/signup/nickname", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }).catch(() => null);
      setChecking(false);
      const data = (await res?.json().catch(() => null)) as { status?: NicknameStatus } | null;
      if (!data?.status) {
        setErrorMessage(t.checkFailed);
        return false;
      }
      status = data.status;
    }
    if (status === "ok") {
      setCheckedNickname(name);
      return true;
    }
    setNicknameNotice(nickText[status]);
    return false;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // await 뒤에는 event.currentTarget이 비므로 먼저 읽어 둔다.
    const form = new FormData(event.currentTarget);
    if (is14OrOlder === null) {
      setErrorMessage(t.chooseAge);
      return;
    }
    // 두 칸이 다르면 입력칸 아래 안내가 이미 보이고 있다.
    if (password !== passwordConfirm) return;

    setPending(true);
    setErrorMessage(null);
    if (!(await checkNickname())) {
      setPending(false);
      return;
    }

    // 역할은 가입 요청에 넣지 않는다. 가입 후 서버에서 따로 설정한다.
    const result = await authClient.signUp.email({
      name: nickname.trim(),
      email: String(form.get("email")),
      password,
    });

    if (result.error) {
      setPending(false);
      const nickStatus = nicknameStatusOf(result.error.code);
      setErrorMessage(nickStatus ? nickText[nickStatus] : (result.error.message ?? t.failed));
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
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-sm border border-hairline bg-white p-8">
        <h1 className="text-[32px] leading-[1.2] font-medium text-ink">{t.title}</h1>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1">{t.ageQuestion}</legend>
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
                {value ? t.yes : t.no}
              </button>
            ))}
          </div>
          <p className="text-xs text-ash">{t.ageLocked}</p>
        </fieldset>

        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="signup-name" className="flex justify-between">
            {t.nickname}
            <span className={nicknameLength(nickname) > NICKNAME_MAX ? "text-red-700" : "text-ash"}>
              {nicknameLength(nickname)}/{NICKNAME_MAX}
            </span>
          </label>
          <div className="flex gap-2">
            <input
              id="signup-name"
              name="name"
              required
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              aria-describedby="signup-name-rules signup-name-status"
              className="min-w-0 flex-1 rounded-sm border border-ash px-3 py-2"
            />
            <button
              type="button"
              onClick={() => void checkNickname()}
              disabled={checking || nicknameOk}
              className="shrink-0 rounded-sm border border-ink px-3 py-2 text-ink disabled:opacity-60"
            >
              {checking ? t.checking : t.check}
            </button>
          </div>
          <p id="signup-name-rules" className="text-xs text-red-700">{nickText.rulesNotice}</p>
          <p id="signup-name-status" aria-live="polite" className="text-xs text-green-700">
            {nicknameOk ? nickText.ok : ""}
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          {t.email}
          <input name="email" type="email" required className="rounded-sm border border-ash px-3 py-2" />
        </label>
        <PasswordField
          label={t.password}
          value={password}
          onChange={setPassword}
          visible={showPassword}
          onToggle={() => setShowPassword((v) => !v)}
          t={t}
        />
        <PasswordField
          label={t.confirm}
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          visible={showPassword}
          onToggle={() => setShowPassword((v) => !v)}
          invalid={passwordMismatch}
          t={t}
        />
        {passwordMismatch && <p className="text-xs text-red-700">{t.mismatch}</p>}
        {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
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
          disabled={pending}
          className="inline-flex h-[35px] items-center justify-center rounded-sm border border-black bg-ink px-3 text-sm font-bold uppercase text-white hover:bg-ink-soft disabled:opacity-60"
        >
          {pending ? t.pending : t.submit}
        </button>
        <p className="text-sm text-ash">
          {t.haveAccount}{" "}
          <Link href={withNext("/login", next)} className="font-medium text-ink underline">
            {t.signIn}
          </Link>
        </p>
      </form>
      {nicknameNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="nickname-notice-title"
            aria-describedby="nickname-notice-body"
            className="flex w-full max-w-sm flex-col gap-4 rounded-sm border border-hairline bg-white p-6"
          >
            <h2 id="nickname-notice-title" className="text-lg font-medium text-ink">{t.nicknameNoticeTitle}</h2>
            <p id="nickname-notice-body" className="text-sm text-ink">{nicknameNotice}</p>
            <button
              type="button"
              autoFocus
              onClick={() => setNicknameNotice(null)}
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
