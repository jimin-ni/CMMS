import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { roleLabel } from "@/lib/access";
import { SignOutButton } from "@/components/sign-out-button";

async function HeaderNav() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <nav className="flex items-center gap-4 text-sm">
      {session ? (
        <>
          <Link href="/features" className="hover:underline">
            기능
          </Link>
          <span className="rounded-full bg-key-blue px-2.5 py-0.5 text-key-brown">
            {roleLabel(session.user.role)}
          </span>
          <SignOutButton />
        </>
      ) : (
        <>
          <Link href="/login" className="hover:underline">
            로그인
          </Link>
          <Link href="/signup" className="hover:underline">
            회원가입
          </Link>
        </>
      )}
    </nav>
  );
}

export function Header() {
  return (
    <header className="bg-key-brown text-key-mist">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          CMMS
        </Link>
        <Suspense fallback={<div className="h-5 w-40" />}>
          <HeaderNav />
        </Suspense>
      </div>
    </header>
  );
}
