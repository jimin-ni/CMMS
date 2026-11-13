import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/session";
import {
  getOpenBubbleRoomId,
  getRoomSnapshot,
  listChangedRoomSlugs,
  listRooms,
  type HeapRoomSnapshot,
} from "@/lib/heap/repo";
import { HeapRoom, type HeapRoomData } from "@/components/heap/heap-room";

type RoomPageProps = {
  params: Promise<{ roomId: string }>;
};

const seoulDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// 한국 시간 기준 "YYYY.MM.DD"
function formatDay(date: Date): string {
  const parts = Object.fromEntries(seoulDate.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}.${parts.month}.${parts.day}`;
}

// 조회수를 원래 reels.json처럼 "3.2만" 꼴로 보여 준다. 엔진이 이 문자열에서 숫자를 다시 읽는다.
function formatViews(count: number | null): string {
  if (count === null) return "";
  if (count >= 1e4) return `${String(Math.round(count / 1e3) / 10).replace(/\.0$/, "")}만`;
  if (count >= 1e3) return `${String(Math.round(count / 100) / 10).replace(/\.0$/, "")}천`;
  return String(count);
}

// DB 스냅샷을 엔진이 읽는 모양으로 바꾼다. 서버에서 클라이언트로 넘기므로 Date는 문자열로 만든다.
// 엔진은 YouTube 영상만 그릴 수 있어서 다른 플랫폼 영상은 뺀다 (지금 시드는 전부 YouTube).
function toRoomData(
  snapshot: HeapRoomSnapshot,
  rooms: { slug: string; name: string; blurb: string }[],
  bubbleHref: string,
  changedSlugs: Set<string>,
): HeapRoomData {
  return {
    bubbleHref,
    roomUuid: snapshot.room.id,
    name: snapshot.room.name,
    serverTime: snapshot.serverTime.toISOString(),
    rooms: rooms.map((room) => ({
      id: room.slug,
      name: room.name,
      blurb: room.blurb,
      changed: changedSlugs.has(room.slug),
    })),
    layout: snapshot.room.layout,
    reels: snapshot.reels
      .filter((reel) => reel.platform === "youtube")
      .map((reel) => ({
        id: reel.externalId,
        title: reel.title,
        // 채널을 모르는 영상은 null. 엔진이 방 이름으로 대신한다.
        channel: reel.channelTitle,
        wide: reel.wide ?? false,
        views: formatViews(reel.viewCount),
        published: reel.publishedAt ? formatDay(reel.publishedAt) : null,
      })),
    pieces: snapshot.landed.map((piece) => ({
      id: piece.id,
      by: piece.submitterName ?? "알 수 없음",
      date: formatDay(piece.landedAt ?? piece.createdAt),
      caption: piece.title || piece.note || "팬 작품",
    })),
    guestbook: snapshot.guestbook.map((entry) => ({
      id: entry.id,
      name: entry.name,
      createdAt: entry.createdAt.toISOString(),
    })),
    visits: snapshot.visits,
    creatorVisit: snapshot.room.creatorVisitedAt ? formatDay(snapshot.room.creatorVisitedAt) : null,
  };
}

// 미니룸은 로그인 없이 볼 수 있다. 세션은 이름을 보여 주고, 방문 기록과 방명록 쓰기를 켜고, 꾸미기 버튼을 낼지 정하는 데에만 쓴다.
// params, 세션, DB 읽기는 요청 시점 값이라 Suspense 안에서 읽는다 (cacheComponents).
async function RoomContent({ params }: RoomPageProps) {
  const { roomId } = await params;
  const viewer = await getViewer();
  const [snapshot, rooms] = await Promise.all([getRoomSnapshot(roomId, viewer?.id ?? null), listRooms()]);
  if (!snapshot) {
    notFound();
  }
  // 휴대폰이 여는 버블: 방 주인이 연 대화방이 있으면 그 방, 없으면 버블 목록. 로그인과 참여는 버블 쪽이 확인한다.
  const bubbleRoomId = await getOpenBubbleRoomId(snapshot.room.creatorId);
  const bubbleHref = bubbleRoomId ? `/bubble/${bubbleRoomId}` : "/bubble";
  // 문에 붙은 방 목록에 찍는 점. 로그인하지 않았으면 방문 기록이 없어서 점도 없다.
  const changedSlugs = new Set(viewer ? await listChangedRoomSlugs(viewer.id) : []);
  // 꾸미기는 방 주인만. 서버 액션도 같은 검사를 다시 한다.
  const canEdit = viewer !== null && viewer.id === snapshot.room.creatorId;

  // key: 다른 방으로 옮기면 꾸미기 패널의 상태도 새로 시작한다.
  return (
    <HeapRoom
      key={roomId}
      roomId={roomId}
      data={toRoomData(snapshot, rooms, bubbleHref, changedSlugs)}
      viewerName={viewer?.name ?? null}
      signedIn={viewer !== null}
      canEdit={canEdit}
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
