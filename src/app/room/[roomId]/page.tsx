import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/session";
import { HeapRoom } from "@/components/heap/heap-room";
// 방 목록의 원본. 엔진도 같은 파일을 /heap/rooms/index.json 으로 읽는다.
import rooms from "../../../../public/heap/rooms/index.json";

// 미니룸은 로그인 없이 볼 수 있다. 세션은 이름을 보여 주는 데에만 쓴다.
// params와 세션은 요청 시점 값이라 Suspense 안에서 읽는다 (cacheComponents).
async function RoomContent({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!rooms.some((room) => room.id === roomId)) {
    notFound();
  }
  const viewer = await getViewer();

  return <HeapRoom roomId={roomId} viewerName={viewer?.name ?? null} />;
}

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  return (
    <Suspense fallback={<div className="flex-1 bg-[#565344]" />}>
      <RoomContent params={params} />
    </Suspense>
  );
}
