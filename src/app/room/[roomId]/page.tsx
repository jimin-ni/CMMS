import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/session";
import { HeapRoom } from "@/components/heap/heap-room";
// 방 목록의 원본. 엔진도 같은 파일을 /heap/rooms/index.json 으로 읽는다.
import rooms from "../../../../public/heap/rooms/index.json";

type RoomPageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// 미니룸은 로그인 없이 볼 수 있다. 세션은 이름을 보여 주고 꾸미기 버튼을 낼지 정하는 데에만 쓴다.
// params, searchParams, 세션은 요청 시점 값이라 Suspense 안에서 읽는다 (cacheComponents).
async function RoomContent({ params, searchParams }: RoomPageProps) {
  const { roomId } = await params;
  if (!rooms.some((room) => room.id === roomId)) {
    notFound();
  }
  const viewer = await getViewer();
  // PoC 지름길: 방의 주인이 누구인지는 DB 단계에서 생긴다. 그 전까지는 creator·admin 누구나, 그리고 ?edit=1 이면 꾸미기를 연다.
  const canEdit =
    viewer?.role === "creator" || viewer?.role === "admin" || (await searchParams).edit === "1";

  // key: 다른 방으로 옮기면 꾸미기 패널의 상태도 새로 시작한다.
  return <HeapRoom key={roomId} roomId={roomId} viewerName={viewer?.name ?? null} canEdit={canEdit} />;
}

export default function RoomPage({ params, searchParams }: RoomPageProps) {
  return (
    <Suspense fallback={<div className="flex-1 bg-[#565344]" />}>
      <RoomContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
