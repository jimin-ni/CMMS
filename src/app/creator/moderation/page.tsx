import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { ReviewBoard } from "@/components/moderation/review-board";

// 방 주인의 AI 스크리닝 검토 화면. 자기 방에서 나온 기록과 자기가 건 차단만 보인다 (문서 11장).
export default function CreatorModerationPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Suspense fallback={<p className="text-sm text-ash">불러오는 중...</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "creator") redirect("/");
  return (
    <div className="flex flex-col gap-4">
      <Link href="/creator" className="text-sm text-ink underline">
        ‹ 크리에이터 페이지
      </Link>
      <h1 className="text-xl font-medium text-ink">메시지 검토</h1>
      <ReviewBoard viewer={viewer} />
    </div>
  );
}
