// 방 화면이 엔진에 넘기는 값을 DB 스냅샷에서 만든다. /room/[roomId] 와 온보딩 컨셉 C(/onboarding/c)가 같은 방을 띄우려고 함께 쓴다.
import {
  getOpenBubbleRoomId,
  listChangedRoomSlugs,
  listOwnerReels,
  listRooms,
  getRoomSnapshot,
  type HeapRoomSnapshot,
} from "@/lib/heap/repo";
import { classifyReel } from "@/lib/heap/caps";
import { publicLayout } from "@/lib/heap/layout";
import type { Viewer } from "@/lib/session";
import type { HeapOwnerData, HeapRoomData } from "@/components/heap/heap-room";

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
// 엔진은 플랫폼마다 다르게 그린다: 유튜브는 썸네일 카드, 붙여 넣은 게시물(인스타그램·틱톡)은 제목 카드다.
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
    // 힙에서 뺀 영상 목록(excludedReels)은 보내지 않는다 (layout.ts 의 publicLayout). 꾸미기의 저장은 이 값 없이 가고 서버가 DB의 목록을 남긴다.
    layout: publicLayout(snapshot.room.layout),
    reels: snapshot.reels.map((reel) => ({
        id: reel.externalId,
        platform: reel.platform,
        // 정규 원본 주소. 카드 뒷면, "원본 보기", 공식 임베드가 모두 이 값을 쓴다.
        url: reel.sourceUrl,
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

// https 주소만 링크로 쓴다. 아니면 null (화면은 글자만 보여 준다).
const httpsOnly = (url: string): string | null => (/^https:\/\//i.test(url) ? url : null);

// 방 주인 화면의 채널 탭이 읽는 값. 영상의 갈래(쇼츠, 롱폼, 인스타그램)는 가져오기 상한과 같은 규칙(caps.ts)으로 센다.
function toOwnerData(snapshot: HeapRoomSnapshot, reels: Awaited<ReturnType<typeof listOwnerReels>>): HeapOwnerData {
  return {
    nickname: snapshot.room.creatorName,
    channels: snapshot.channels.map((channel) => ({
      id: channel.id,
      platform: channel.platform,
      title: channel.title,
      url: httpsOnly(channel.channelUrl),
    })),
    reels: reels.map((reel) => ({
      id: reel.id,
      platform: reel.platform,
      title: reel.title,
      url: httpsOnly(reel.sourceUrl),
      kind: classifyReel(reel),
      channelId: reel.channelId,
      published: reel.publishedAt ? formatDay(reel.publishedAt) : null,
      excluded: reel.excluded,
    })),
  };
}

// 방 하나를 띄우는 데 필요한 값. 없는 방이면 null.
// withOwner: 방 주인이 보면 꾸미기용 값(owner)까지 읽는다. 온보딩은 꾸미기를 열지 않으므로 false.
export async function loadRoomView(
  roomId: string,
  viewer: Viewer | null,
  { withOwner }: { withOwner: boolean },
): Promise<{ data: HeapRoomData; canEdit: boolean; owner: HeapOwnerData | null } | null> {
  const [snapshot, rooms] = await Promise.all([getRoomSnapshot(roomId, viewer?.id ?? null), listRooms()]);
  if (!snapshot) return null;
  // 휴대폰이 여는 버블: 방 주인이 연 대화방이 있으면 그 방, 없으면 버블 목록. 로그인과 참여는 버블 쪽이 확인한다.
  const bubbleRoomId = await getOpenBubbleRoomId(snapshot.room.creatorId);
  const bubbleHref = bubbleRoomId ? `/bubble/${bubbleRoomId}` : "/bubble";
  // 문에 붙은 방 목록에 찍는 점. 로그인하지 않았으면 방문 기록이 없어서 점도 없다.
  const changedSlugs = new Set(viewer ? await listChangedRoomSlugs(viewer.id) : []);
  // 꾸미기는 방 주인만. 서버 액션도 같은 검사를 다시 한다.
  const canEdit = withOwner && viewer !== null && viewer.id === snapshot.room.creatorId;
  // 방 주인에게만: 첫 방 열기 체크리스트(setup-checklist.tsx)가 읽는 닉네임(방 이름을 지었는지 견준다)과,
  // 꾸미기의 채널 탭이 읽는 연결한 채널과 이 방의 영상 전부(뺀 것 포함).
  const owner = canEdit ? toOwnerData(snapshot, await listOwnerReels(snapshot.room.id, snapshot.room.layout)) : null;
  return { data: toRoomData(snapshot, rooms, bubbleHref, changedSlugs), canEdit, owner };
}
