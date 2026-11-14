import Link from "next/link";
import { notFound } from "next/navigation";
import { ONBOARDING_CONCEPTS, findOnboardingConcept } from "@/lib/onboarding";

type OnboardingPageProps = {
  params: Promise<{ concept: string }>;
};

// 시안 3개만 미리 만든다. 목록에 없는 주소는 404.
export function generateStaticParams() {
  return ONBOARDING_CONCEPTS.map((concept) => ({ concept: concept.id }));
}

export default async function OnboardingConceptPage({ params }: OnboardingPageProps) {
  const { concept: id } = await params;
  const concept = findOnboardingConcept(id);
  if (!concept) {
    notFound();
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
