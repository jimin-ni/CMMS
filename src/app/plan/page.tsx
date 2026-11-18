import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";

// 나만의 방 결제 안내 (08 문서 §6의 /plan). 가격과 결제 방식은 아직 정하지 않아 안내만 보여 준다 (01 문서 §8 [미정]).
async function PlanContent() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect("/login");
  }

  return (
    <section className="rounded-sm border border-hairline bg-white p-8">
      <span className="rounded-sm border border-ash px-2 py-0.5 text-xs font-bold uppercase text-ash">결제 준비 중</span>
      <h1 className="mt-4 text-[32px] leading-[1.2] font-medium text-ink">나만의 방 만들기</h1>
      <p className="mt-2 text-ash">
        {viewer.name}님만의 방을 만들고, 좋아하는 순간을 폴라로이드로 모아 둘 수 있어요.
      </p>
      <ul className="mt-6 flex flex-col gap-2 text-sm">
        <li>· 내 방 꾸미기 (가구, 색, 무늬)</li>
        <li>· 좋아하는 영상을 폴라로이드로 쌓기</li>
        <li>· 친구가 남기는 방명록과 쪽지</li>
      </ul>
      <p className="mt-6 text-sm text-ash">가격과 결제 방식은 곧 안내합니다.</p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          disabled
          className="inline-flex h-[35px] items-center justify-center rounded-sm border border-black bg-ink px-3 text-sm font-bold uppercase text-white hover:bg-ink-soft disabled:opacity-60"
        >
          결제하기 (준비 중)
        </button>
        <Link href="/onboarding/c" className="inline-flex h-[35px] items-center justify-center rounded-sm border border-ink bg-white px-3 text-sm font-bold uppercase text-ink hover:bg-cream">
          방으로 돌아가기
        </Link>
      </div>
    </section>
  );
}

export default function PlanPage() {
  return (
    <main className="mx-auto w-full max-w-md px-6 py-12">
      <Suspense fallback={<div className="h-64 rounded-sm bg-cream" />}>
        <PlanContent />
      </Suspense>
    </main>
  );
}
