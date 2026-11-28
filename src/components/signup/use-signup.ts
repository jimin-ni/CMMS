"use client";

// 회원가입 양식의 상태와 처리. 가입 화면(/signup)과 로그인 팝업의 가입 쪽(onboarding-c/login-popup.tsx)이 함께 쓴다.
// 모양은 쓰는 쪽이 그린다. 가입이 끝나면 onSignedUp(is14OrOlder) 를 부른다 (Better Auth 가 가입과 함께 로그인한다).
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { trackEvent } from "@/lib/analytics";
import { NICKNAME_MAX, NICKNAME_STATUSES, NICKNAME_TEXT, nicknameLength, type NicknameStatus } from "@/lib/nickname";
import { useLanguage } from "@/lib/settings/prefs";
import { SIGNUP_TEXT } from "./signup-text";

// 서버가 닉네임을 거절한 오류(code NICKNAME_*)면 그 상태. 아니면 null
function nicknameStatusOf(code: string | undefined): NicknameStatus | null {
  const status = code?.startsWith("NICKNAME_") ? code.slice("NICKNAME_".length).toLowerCase() : null;
  return NICKNAME_STATUSES.find((s) => s === status) ?? null;
}

export function useSignup(onSignedUp: (is14OrOlder: boolean) => void) {
  const language = useLanguage();
  const t = SIGNUP_TEXT[language];
  const nickText = NICKNAME_TEXT[language];
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // 만 14세 이상인지. null: 아직 선택 안 함 (docs/planning/12-ai-screening.md 3-3)
  const [is14OrOlder, setIs14OrOlder] = useState<boolean | null>(null);
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
  const nicknameCount = nicknameLength(nickname);

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
    onSignedUp(is14OrOlder);
  }

  return {
    t,
    nickText,
    errorMessage,
    pending,
    is14OrOlder,
    setIs14OrOlder,
    nickname,
    setNickname,
    nicknameCount,
    nicknameTooLong: nicknameCount > NICKNAME_MAX,
    nicknameOk,
    checking,
    checkNickname,
    nicknameNotice,
    closeNicknameNotice: () => setNicknameNotice(null),
    password,
    setPassword,
    passwordConfirm,
    setPasswordConfirm,
    passwordMismatch,
    showPassword,
    toggleShowPassword: () => setShowPassword((v) => !v),
    handleSubmit,
  };
}
