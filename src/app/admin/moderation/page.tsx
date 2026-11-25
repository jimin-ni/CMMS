import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { ReviewBoard } from "@/components/moderation/review-board";

// 관리자의 AI 스크리닝 검토 화면. 모든 방의 기록, 자해 글 원문, 방 주인 글 사후 확인까지 보인다 (문서 11장).
export default function AdminModerationPage() {
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
  if (viewer.role !== "admin") redirect("/");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-medium text-ink">메시지 검토 (관리자)</h1>
        <Link href="/admin/moderation/terms" className="text-xs text-ash underline">
          판정 사전
        </Link>
      </div>
      <ReviewBoard viewer={viewer} />
    </div>
  );
}
