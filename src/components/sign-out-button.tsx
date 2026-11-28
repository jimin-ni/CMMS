"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useLanguage } from "@/lib/settings/prefs";

// 보조 단추 (흰 바탕, 1px ink 테두리, 4px 모서리, 높이 35px)
const HEADER_STYLE =
  "h-[35px] rounded-[4px] border border-ink bg-white px-3 text-[13px] font-bold uppercase text-ink hover:bg-cream";

// className: 놓이는 곳의 모양 (기본은 위 막대의 단추). label: 단추 글 (없으면 언어에 맞춘 기본 글)
export function SignOutButton({ className = HEADER_STYLE, label }: { className?: string; label?: string }) {
  const router = useRouter();
  const language = useLanguage();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className={className}
    >
      {label ?? (language === "en" ? "Sign out" : "로그아웃")}
    </button>
  );
}
