import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/session";
import { getRoomBySlug } from "@/lib/heap/repo";
import { loadRoomView } from "@/lib/heap/room-view";
import { VisitRoom } from "@/components/onboarding-c/visit-room";
import { LoadingScreen } from "@/components/onboarding-c/loading-screen";
import { moneygraphyPixel, moneygraphyRounded, pretendard } from "@/app/fonts/onboarding";

type RoomPageProps = {
  params: Promise<{ roomId: string }>;
};

// 미니룸은 로그인 없이 볼 수 있다. 세션은 이름을 보여 주고, 방문 기록과 방명록 쓰기를 켜고, 꾸미기 버튼을 낼지 정하는 데에만 쓴다.
// params, 세션, DB 읽기는 요청 시점 값이라 Suspense 안에서 읽는다 (cacheComponents).
async function RoomContent({ params }: RoomPageProps) {
  const { roomId } = await params;
  const viewer = await getViewer();
  const view = await loadRoomView(roomId, viewer, { withOwner: true });
  if (!view) {
    notFound();
  }

  // key: 다른 방으로 옮기면 꾸미기 패널과 둘러보기(내비게이션 바)의 상태도 새로 시작한다.
  // 온보딩이 끝난 방(/home)과 같은 메모 모양 내비게이션 바를 얹는다 (visit-room.tsx).
  return (
    <div className={`${moneygraphyPixel.variable} ${moneygraphyRounded.variable} ${pretendard.variable}`}>
      <VisitRoom
        key={roomId}
        roomId={roomId}
        owner={view.owner}
        data={view.data}
        viewerName={viewer?.name ?? null}
        signedIn={viewer !== null}
        canEdit={view.canEdit}
      />
    </div>
  );
}

// 링크 미리보기 (판정 2026-11-14): 방 이름과 소개. 사진은 같은 폴더의 opengraph-image.tsx 가 그린다.
// 미리보기 사진 주소는 절대 주소여야 해서 사이트 주소(BETTER_AUTH_URL, 인증과 같은 출처)를 기준으로 삼는다.
export async function generateMetadata({ params }: RoomPageProps): Promise<Metadata> {
  const { roomId } = await params;
  const room = await getRoomBySlug(roomId);
  if (!room) return { title: "미니홈을 찾을 수 없어요" };
  const title = `${room.name} · 미니홈`;
  const description = room.blurb || `${room.creatorName}의 방. 지난 영상이 사진 더미로 쌓여 있어요.`;
  return {
    metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000"),
    title,
    description,
    openGraph: { title, description, type: "website", url: `/room/${encodeURIComponent(room.slug)}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function RoomPage({ params }: RoomPageProps) {
  return (
    // 방을 읽는 동안 첫 화면과 같은 대기 화면(MEMOAMO와 넘어가는 책)을 띄운다. 방이 뜰 때까지는 VisitRoom 이 같은 화면을 이어서 덮는다.
    <Suspense fallback={<LoadingScreen />}>
      <RoomContent params={params} />
    </Suspense>
  );
}
