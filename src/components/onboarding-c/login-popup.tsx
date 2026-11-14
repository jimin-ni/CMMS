"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { trackEvent } from "@/lib/analytics";
import { Paper } from "./paper";
import { PixelIcon } from "./icons";

// 내비게이션 바의 아이콘을 누르면 뜨는 로그인 팝업. 로그인 처리는 /login 페이지와 같다.
export function LoginPopup({ reason, onClose }: { reason: string; onClose: () => void }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      setErrorMessage(result.error.message ?? "Could not sign in. Please try again.");
      return;
    }
    const role = result.data.user.role;
    trackEvent({
      event: "login",
      method: "email",
      user_role: role === "admin" || role === "creator" || role === "public" ? role : "unknown",
    });
    onClose();
  }

  return (
    <div className="oc-modal" onClick={onClose}>
      <div
        className="oc-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="oc-login-title"
        onClick={(event) => event.stopPropagation()}
      >
        <Paper tape={["tl", "tr"]}>
          <button type="button" className="oc-close" onClick={onClose} aria-label="Close">
            <PixelIcon name="close" size={20} />
          </button>
          <h3 id="oc-login-title" className="oc-rounded">
            Sign in
          </h3>
          <p className="oc-sub">{reason}</p>
          <form onSubmit={handleSubmit}>
            <label className="oc-field">
              Email
              <input name="email" type="email" autoComplete="email" required autoFocus />
            </label>
            <label className="oc-field">
              Password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            {errorMessage && (
              <p className="oc-error" role="alert">
                {errorMessage}
              </p>
            )}
            <button type="submit" className="oc-primary oc-rounded" disabled={pending}>
              {pending ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p className="oc-foot">
            New here? <Link href="/signup">Create an account</Link>
          </p>
        </Paper>
      </div>
    </div>
  );
}
