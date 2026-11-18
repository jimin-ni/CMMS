import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { roleLabel } from "@/lib/access";
import { SignOutButton } from "@/components/sign-out-button";

async function HeaderNav() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <nav className="flex items-center gap-4 text-[13px] font-semibold">
      {session ? (
        <>
          <Link href="/features" className="px-1 py-2.5 underline-offset-8 hover:underline hover:decoration-2">
            기능
          </Link>
          <span className="rounded-[4px] border border-ash px-2 py-0.5 text-xs font-bold uppercase text-ash">
            {roleLabel(session.user.role)}
          </span>
          <SignOutButton />
        </>
      ) : (
        <>
          <Link href="/login" className="px-1 py-2.5 underline-offset-8 hover:underline hover:decoration-2">
            로그인
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-[35px] items-center rounded-[4px] border border-black bg-ink px-3 text-[13px] font-bold uppercase text-white hover:bg-ink-soft"
          >
            회원가입
          </Link>
        </>
      )}
    </nav>
  );
}

export function Header() {
  return (
    <header className="border-b border-ink bg-white text-ink">
      <div className="mx-auto flex h-[60px] max-w-5xl items-center justify-between px-5">
        <Link href="/" className="font-[family-name:var(--font-display)] text-2xl font-medium uppercase">
          CMMS
        </Link>
        <Suspense fallback={<div className="h-5 w-40" />}>
          <HeaderNav />
        </Suspense>
      </div>
    </header>
  );
}
