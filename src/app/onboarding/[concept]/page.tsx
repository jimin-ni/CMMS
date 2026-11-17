import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ONBOARDING_CONCEPTS, findOnboardingConcept } from "@/lib/onboarding";
import { OnboardingRoom } from "@/components/onboarding-c/onboarding-room";
import { LoadingScreen } from "@/components/onboarding-c/loading-screen";
import { moneygraphyPixel, moneygraphyRounded, pretendard } from "@/app/fonts/onboarding";

type OnboardingPageProps = {
  params: Promise<{ concept: string }>;
};

// 시안 3개만 미리 만든다. 목록에 없는 주소는 404.
export function generateStaticParams() {
  return ONBOARDING_CONCEPTS.map((concept) => ({ concept: concept.id }));
}

// 주소(params)는 요청 시점 값이라 Suspense 안에서 읽는다 (cacheComponents). 글꼴 변수는 바깥에 둔다.
async function ConceptContent({ params }: OnboardingPageProps) {
  const { concept: id } = await params;
  const concept = findOnboardingConcept(id);
  if (!concept) {
    notFound();
  }

  // 컨셉 B: 바인더 노트를 넘기다 앨범으로 접어 2번 방 책장에 꽂는 온보딩.
  // 컨셉 C: 실제 2번 방 위에 얹은 온보딩. 둘 다 화면 전체를 덮으므로 위의 헤더는 가려진다.
  if (concept.id === "b" || concept.id === "c") {
    return (
      <Suspense fallback={concept.id === "c" ? <LoadingScreen /> : <div className="fixed inset-0 z-[60] bg-[#0c0a08]" />}>
        <OnboardingRoom concept={concept.id} />
      </Suspense>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <span className="rounded-full bg-key-mist px-2.5 py-0.5 text-xs text-key-brown">
          {concept.status}
        </span>
        <h1 className="mt-4 text-3xl font-bold text-key-brown">{concept.title}</h1>
        <p className="mt-2 text-key-stone">아직 내용이 없습니다. 시안을 정한 뒤 이 페이지를 채웁니다.</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-key-brown px-5 py-2 text-key-mist"
        >
          처음으로
        </Link>
      </section>
    </main>
  );
}

export default function OnboardingConceptPage({ params }: OnboardingPageProps) {
  return (
    <div className={`${moneygraphyPixel.variable} ${moneygraphyRounded.variable} ${pretendard.variable}`}>
      <Suspense fallback={null}>
        <ConceptContent params={params} />
      </Suspense>
    </div>
  );
}
