import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { roleLabel } from "@/lib/access";

async function HomeContent() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return (
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-key-brown">CMMS에 오신 것을 환영합니다</h1>
        <p className="mt-2 text-key-stone">로그인하면 주요 기능 화면을 볼 수 있습니다.</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-full bg-key-brown px-5 py-2 text-key-mist"
        >
          로그인
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-8 shadow-sm">
      <span className="rounded-full bg-key-blue px-2.5 py-0.5 text-sm text-key-brown">
        {roleLabel(session.user.role)}
      </span>
      <h1 className="mt-4 text-3xl font-bold text-key-brown">
        {session.user.name}님, 환영합니다
      </h1>
      <p className="mt-2 text-key-stone">{session.user.email}</p>
      <Link
        href="/features"
        className="mt-6 inline-block rounded-full bg-key-brown px-5 py-2 text-key-mist"
      >
        주요 기능 보기
      </Link>
    </section>
  );
}

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <Suspense fallback={<div className="h-48 rounded-2xl bg-white/60" />}>
        <HomeContent />
      </Suspense>
    </main>
  );
}
