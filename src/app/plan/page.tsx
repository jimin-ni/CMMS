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
    <section className="rounded-2xl bg-white p-8 shadow-sm">
      <span className="rounded-full bg-key-mist px-2.5 py-0.5 text-xs text-key-brown">결제 준비 중</span>
      <h1 className="mt-4 text-2xl font-bold text-key-brown">나만의 방 만들기</h1>
      <p className="mt-2 text-key-stone">
        {viewer.name}님만의 방을 만들고, 좋아하는 순간을 폴라로이드로 모아 둘 수 있어요.
      </p>
      <ul className="mt-6 flex flex-col gap-2 text-sm">
        <li>· 내 방 꾸미기 (가구, 색, 무늬)</li>
        <li>· 좋아하는 영상을 폴라로이드로 쌓기</li>
        <li>· 친구가 남기는 방명록과 쪽지</li>
      </ul>
      <p className="mt-6 text-sm text-key-stone">가격과 결제 방식은 곧 안내합니다.</p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          disabled
          className="rounded-full bg-key-brown px-5 py-2 text-key-mist disabled:opacity-60"
        >
          결제하기 (준비 중)
        </button>
        <Link href="/onboarding/c" className="rounded-full px-5 py-2 text-key-brown">
          방으로 돌아가기
        </Link>
      </div>
    </section>
  );
}

export default function PlanPage() {
  return (
    <main className="mx-auto w-full max-w-md px-6 py-12">
      <Suspense fallback={<div className="h-64 rounded-2xl bg-white/60" />}>
        <PlanContent />
      </Suspense>
    </main>
  );
}
