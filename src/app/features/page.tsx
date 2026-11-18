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
      <h1 className="text-[32px] leading-[1.2] font-medium text-ink">주요 기능</h1>
      <p className="mt-1 text-ash">임시 화면입니다. 기능별 상세는 개발 후 추가합니다.</p>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {FEATURES.map((feature) => {
          const body = (
            <>
              <span className="w-fit rounded-sm border border-ash px-2 py-0.5 text-xs font-bold uppercase text-ash">
                {feature.status}
              </span>
              <h2 className="mt-3 text-lg font-medium text-ink">{feature.title}</h2>
              <p className="mt-2 flex-1 text-sm text-ash">{feature.description}</p>
              <p className="mt-4 border-t border-hairline pt-3 text-xs text-ash">
                {feature.owner}
              </p>
            </>
          );
          const cardClass = "flex flex-col rounded-sm border border-hairline bg-white p-6";
          const linkClass = `${cardClass} transition hover:border-ink`;
          if (feature.href && feature.staticPage) {
            return (
              <a key={feature.title} href={feature.href} className={linkClass}>
                {body}
              </a>
            );
          }
          return feature.href ? (
            <Link
              key={feature.title}
              href={feature.href}
              className={linkClass}
            >
              {body}
            </Link>
          ) : (
            <article key={feature.title} className={cardClass}>
              {body}
            </article>
          );
        })}
      </div>
    </>
  );
}

export default function FeaturesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <Suspense fallback={<div className="h-48 rounded-sm bg-cream" />}>
        <FeaturesContent />
      </Suspense>
    </main>
  );
}
