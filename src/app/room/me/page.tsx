import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { getRoomByCreator } from "@/lib/heap/repo";
import { suggestSlug } from "@/lib/heap/slug";
import { HEAP_TEMPLATES } from "@/lib/heap/templates";
import { ClaimRoom } from "@/components/heap-funnel/claim-room";

// /room/me: 내 미니홈으로 가는 문. 세션을 읽으므로 Suspense 안에서 처리한다 (cacheComponents).
// 로그인 전: 로그인 화면으로. 로그인 화면이 돌아올 주소를 받지 않아서 /room/me로 되돌아오는 길은 없다 (열린 리다이렉트를 만들지 않는다).
// 크리에이터가 아니면: 안내 한 줄. 방이 있으면: 그 방으로. 방이 없으면: 방 만들기 화면.
async function MyRoomContent() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  if (viewer.role !== "creator") {
    return (
      <main className="mx-auto w-full max-w-md px-6 py-12">
        <div className="flex flex-col gap-4 rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-key-brown">내 미니홈</h1>
          <p className="text-sm text-key-stone">크리에이터 계정만 미니홈을 만들 수 있어요. 다른 크리에이터의 방은 둘러볼 수 있어요.</p>
          <Link href="/rooms" className="w-fit rounded-full bg-key-brown px-5 py-2 text-key-mist">
            미니홈 둘러보기
          </Link>
        </div>
      </main>
    );
  }

  const room = await getRoomByCreator(viewer.id);
  if (room) redirect(`/room/${room.slug}`);

  return (
    <ClaimRoom
      nickname={viewer.name}
      suggestedSlug={suggestSlug(viewer.name)}
      templates={HEAP_TEMPLATES.map(({ id, label, blurb, image }) => ({ id, label, blurb, image }))}
    />
  );
}

export default function MyRoomPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-[#2f2c24]" />}>
      <MyRoomContent />
    </Suspense>
  );
}
