"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const HEADER_STYLE = "rounded-full border border-key-mist/60 px-3 py-1 hover:bg-key-mist/10";

// className: 놓이는 곳의 모양 (기본은 위 막대의 단추)
export function SignOutButton({ className = HEADER_STYLE }: { className?: string }) {
  const router = useRouter();

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
      로그아웃
    </button>
  );
}
