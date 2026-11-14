import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/session";
import { loadRoomView } from "@/lib/heap/room-view";
import { HeapRoom } from "@/components/heap/heap-room";

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

  // key: 다른 방으로 옮기면 꾸미기 패널의 상태도 새로 시작한다.
  return (
    <HeapRoom
      key={roomId}
      roomId={roomId}
      owner={view.owner}
      data={view.data}
      viewerName={viewer?.name ?? null}
      signedIn={viewer !== null}
      canEdit={view.canEdit}
    />
  );
}

export default function RoomPage({ params }: RoomPageProps) {
  return (
    <Suspense fallback={<div className="flex-1 bg-[#565344]" />}>
      <RoomContent params={params} />
    </Suspense>
  );
}
