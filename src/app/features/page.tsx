import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { FEATURES } from "@/lib/features";

async function FeaturesContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-key-brown">주요 기능</h1>
      <p className="mt-1 text-key-stone">임시 화면입니다. 기능별 상세는 개발 후 추가합니다.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {FEATURES.map((feature) => {
          const card = (
            <article className="flex h-full flex-col rounded-2xl bg-white p-6 shadow-sm">
              <span className="w-fit rounded-full bg-key-mist px-2.5 py-0.5 text-xs text-key-brown">
                {feature.status}
              </span>
              <h2 className="mt-3 text-lg font-semibold text-key-brown">{feature.title}</h2>
              <p className="mt-2 flex-1 text-sm text-key-stone">{feature.description}</p>
              <p className="mt-4 border-t border-key-mist pt-3 text-xs text-key-stone">
                {feature.owner}
              </p>
            </article>
          );

          return feature.href ? (
            <Link key={feature.title} href={feature.href} className="block rounded-2xl hover:shadow-md">
              {card}
            </Link>
          ) : (
            <div key={feature.title}>{card}</div>
          );
        })}
      </div>
    </>
  );
}

export default function FeaturesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <Suspense fallback={<div className="h-48 rounded-2xl bg-white/60" />}>
        <FeaturesContent />
      </Suspense>
    </main>
  );
}
