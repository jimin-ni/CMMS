import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Room } from "@/components/sicham/room";
import {
  GAMES,
  creatorName,
  getStream,
  mockCurrentParticipants,
  mockWaitingViewers,
} from "@/lib/sicham/mock";

// params 접근은 Suspense 안에서 해야 Next 16 prerender 경고가 나지 않습니다.
// (features/page.tsx, page.tsx 와 같은 패턴)
async function RoomContent({ params }: { params: Promise<{ streamId: string }> }) {
  const { streamId } = await params;
  const stream = getStream(streamId);
  if (!stream) {
    notFound();
  }

  const host = creatorName(stream.creatorId);
  const game = GAMES[stream.gameId];
  const filled = Math.max(0, game.slots - stream.lookingFor);

  return (
    <Room
      streamId={stream.id}
      gameId={stream.gameId}
      title={stream.title}
      hostName={host.name}
      hostAvatar={host.avatar}
      viewers={stream.viewers}
      capacity={game.slots}
      initialQueue={mockWaitingViewers(stream.waiting)}
      initialParticipants={mockCurrentParticipants(filled)}
    />
  );
}

export default function RoomPage({ params }: { params: Promise<{ streamId: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Suspense fallback={<div className="h-96 rounded-2xl bg-white/60" />}>
        <RoomContent params={params} />
      </Suspense>
    </main>
  );
}
