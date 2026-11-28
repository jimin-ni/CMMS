"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { trackEvent } from "@/lib/analytics";
import { NICKNAME_MAX } from "@/lib/nickname";
import { useLanguage } from "@/lib/settings/prefs";
import { useSignup } from "@/components/signup/use-signup";
import { Paper } from "./paper";
import { PixelIcon } from "./icons";

// 내비게이션 바의 아이콘이나 방 안의 일(채팅, 방명록, 쪽지)이 띄우는 로그인 팝업. 로그인 처리는 /login 페이지와 같다.
// "계정 만들기"를 누르면 다른 화면으로 가지 않고 같은 종이가 세로로 길어지며 가입 쪽이 된다 (처리는 /signup 과 같은 useSignup).
// 약관과 개인정보 처리방침은 새 탭으로 연다: 쓰던 가입 양식이 지워지지 않게.
// onSignedIn: 로그인이나 가입에 성공하면 부른다 (팝업을 닫고 서버 값을 다시 읽는다. 방 안의 일이면 그 화면을 다시 연다)
// 글은 설정의 언어를 따른다. reason 은 띄운 쪽이 넘긴 문장 그대로다.

const TEXT = {
  ko: {
    close: "닫기",
    title: "로그인",
    email: "이메일",
    password: "비밀번호",
    pending: "확인 중...",
    submit: "로그인",
    failed: "로그인하지 못했어요. 다시 시도해 주세요.",
    newHere: "처음인가요?",
    create: "계정 만들기",
  },
  en: {
    close: "Close",
    title: "Sign in",
    email: "Email",
    password: "Password",
    pending: "Signing in...",
    submit: "Sign in",
    failed: "Could not sign in. Please try again.",
    newHere: "New here?",
    create: "Create an account",
  },
};

export function LoginPopup({
  reason,
  onClose,
  onSignedIn,
}: {
  reason: string;
  onClose: () => void;
  onSignedIn: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="oc-modal" onClick={onClose}>
      <div
        className={mode === "signup" ? "oc-modal-card oc-signup" : "oc-modal-card"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="oc-login-title"
        onClick={(event) => event.stopPropagation()}
      >
        <Paper tape={["tl", "tr"]}>
          {mode === "login" ? (
            <LoginSide reason={reason} onClose={onClose} onSignedIn={onSignedIn} onSignup={() => setMode("signup")} />
          ) : (
            <SignupSide onClose={onClose} onSignedIn={onSignedIn} onLogin={() => setMode("login")} />
          )}
        </Paper>
      </div>
    </div>
  );
}

function CloseButton({ onClose, label }: { onClose: () => void; label: string }) {
  return (
    <button type="button" className="oc-close" onClick={onClose} aria-label={label}>
      <PixelIcon name="close" size={20} />
    </button>
  );
}

function LoginSide({
  reason,
  onClose,
  onSignedIn,
  onSignup,
}: {
  reason: string;
  onClose: () => void;
  onSignedIn: () => void;
  onSignup: () => void;
}) {
  const t = TEXT[useLanguage()];
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      setErrorMessage(result.error.message ?? t.failed);
      return;
    }
    const role = result.data.user.role;
    trackEvent({
      event: "login",
      method: "email",
      user_role: role === "admin" || role === "creator" || role === "public" ? role : "unknown",
    });
    onSignedIn();
  }

  return (
    <>
      <CloseButton onClose={onClose} label={t.close} />
      <h3 id="oc-login-title" className="oc-rounded">
        {t.title}
      </h3>
      <p className="oc-sub">{reason}</p>
      <form onSubmit={handleSubmit}>
        <label className="oc-field">
          {t.email}
          <input name="email" type="email" autoComplete="email" required autoFocus />
        </label>
        <label className="oc-field">
          {t.password}
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {errorMessage && (
          <p className="oc-error" role="alert">
            {errorMessage}
          </p>
        )}
        <button type="submit" className="oc-primary oc-rounded" disabled={pending}>
          {pending ? t.pending : t.submit}
        </button>
      </form>
      <p className="oc-foot">
        {t.newHere}{" "}
        <button type="button" className="oc-link" onClick={onSignup}>
          {t.create}
        </button>
      </p>
    </>
  );
}

function SignupSide({ onClose, onSignedIn, onLogin }: { onClose: () => void; onSignedIn: () => void; onLogin: () => void }) {
  const close = TEXT[useLanguage()].close;
  // "아니오"로 가입했으면 안내를 보인 뒤 확인을 누를 때 onSignedIn
  const [underAge, setUnderAge] = useState(false);
  const f = useSignup((is14OrOlder) => (is14OrOlder ? onSignedIn() : setUnderAge(true)));
  const { t, nickText } = f;

  if (underAge) {
    return (
      <div role="alert">
        <h3 id="oc-login-title" className="oc-rounded">
          {t.doneTitle}
        </h3>
        <p className="oc-sub">{t.underAge}</p>
        <button type="button" className="oc-primary oc-rounded" onClick={onSignedIn} autoFocus>
          {t.ok}
        </button>
      </div>
    );
  }

  return (
    <>
      <CloseButton onClose={onClose} label={close} />
      <h3 id="oc-login-title" className="oc-rounded">
        {t.title}
      </h3>
      <form onSubmit={f.handleSubmit}>
        <fieldset className="oc-field oc-age">
          <legend>{t.ageQuestion}</legend>
          <div className="oc-toggle">
            {[true, false].map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={f.is14OrOlder === value}
                onClick={() => f.setIs14OrOlder(value)}
                autoFocus={value}
              >
                {value ? t.yes : t.no}
              </button>
            ))}
          </div>
          <small>{t.ageLocked}</small>
        </fieldset>

        <div className="oc-field">
          <label htmlFor="oc-signup-name" className="oc-field-head">
            {t.nickname}
            <span className={f.nicknameTooLong ? "oc-bad" : undefined}>
              {f.nicknameCount}/{NICKNAME_MAX}
            </span>
          </label>
          <div className="oc-inline">
            <input
              id="oc-signup-name"
              name="name"
              required
              value={f.nickname}
              onChange={(e) => {
                f.setNickname(e.target.value);
                f.closeNicknameNotice();
              }}
              aria-describedby="oc-signup-name-rules oc-signup-name-status"
            />
            <button type="button" className="oc-secondary" onClick={() => void f.checkNickname()} disabled={f.checking || f.nicknameOk}>
              {f.checking ? t.checking : t.check}
            </button>
          </div>
          <small id="oc-signup-name-rules" className="oc-bad">
            {nickText.rulesNotice}
          </small>
          <small id="oc-signup-name-status" aria-live="polite" className="oc-good">
            {f.nicknameOk ? nickText.ok : ""}
          </small>
          {f.nicknameNotice && (
            <p className="oc-error" role="alert">
              <b>{t.nicknameNoticeTitle}</b> {f.nicknameNotice}
            </p>
          )}
        </div>

        <label className="oc-field">
          {t.email}
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <PasswordField
          label={t.password}
          value={f.password}
          onChange={f.setPassword}
          visible={f.showPassword}
          onToggle={f.toggleShowPassword}
          toggleLabel={f.showPassword ? t.hidePassword : t.showPassword}
        />
        <PasswordField
          label={t.confirm}
          value={f.passwordConfirm}
          onChange={f.setPasswordConfirm}
          visible={f.showPassword}
          onToggle={f.toggleShowPassword}
          toggleLabel={f.showPassword ? t.hidePassword : t.showPassword}
          invalid={f.passwordMismatch}
        />
        {f.passwordMismatch && <p className="oc-error">{t.mismatch}</p>}
        {f.errorMessage && (
          <p className="oc-error" role="alert">
            {f.errorMessage}
          </p>
        )}
        <p className="oc-agree">
          {t.agreeBefore}
          <Link href="/terms" target="_blank" rel="noopener">
            {t.terms}
          </Link>
          {t.and}
          <Link href="/privacy" target="_blank" rel="noopener">
            {t.privacy}
          </Link>
          {t.agreeAfter}
        </p>
        <button type="submit" className="oc-primary oc-rounded" disabled={f.pending}>
          {f.pending ? t.pending : t.submit}
        </button>
      </form>
      <p className="oc-foot">
        {t.haveAccount}{" "}
        <button type="button" className="oc-link" onClick={onLogin}>
          {t.signIn}
        </button>
      </p>
    </>
  );
}

function PasswordField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  toggleLabel: string;
  invalid?: boolean;
}) {
  return (
    <label className="oc-field">
      {props.label}
      <span className="oc-password">
        <input
          type={props.visible ? "text" : "password"}
          minLength={8}
          required
          autoComplete="new-password"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          aria-invalid={props.invalid || undefined}
        />
        <button type="button" onClick={props.onToggle} aria-label={props.toggleLabel} aria-pressed={props.visible}>
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
