// 마이페이지에 보일 값 전부 (계정, 크리에이터 값, 차단 목록). /mypage 화면과 방 위에 띄우는 마이페이지가 함께 쓴다.
// 화면으로 보내는 값이라 날짜는 ISO 글로 바꾼다 (서버 액션 응답도 그대로 쓸 수 있다).
import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getOpenBubbleRoomId, getRoomByCreator, getVisitCounts, listCreatorChannels } from "@/lib/heap/repo";
import { getNoteCounts } from "@/lib/heap/notes-repo";
import { listMyBlocks } from "@/lib/heap/blocks-repo";
import { getRoom } from "@/lib/bubble/repo";
import type { MyPageData, MyCreatorData } from "@/components/mypage/my-book";

// 로그인하지 않았으면 null
export async function loadMyPageData(): Promise<MyPageData | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { user } = session;
  const role = (user as { role?: string | null }).role ?? null;

  const blocks = await listMyBlocks(user.id);
  let creator: MyCreatorData | null = null;
  if (role === "creator" || role === "admin") {
    const [room, openRoomId, channels] = await Promise.all([
      getRoomByCreator(user.id),
      getOpenBubbleRoomId(user.id),
      listCreatorChannels(user.id),
    ]);
    const [visits, notes, chatRoom] = await Promise.all([
      room ? getVisitCounts(room.id) : { today: 0, total: 0 },
      room ? getNoteCounts(room.id, user.id) : { received: 0, unread: 0, replied: 0 },
      openRoomId ? getRoom(openRoomId, user.id) : null,
    ]);
    creator = {
      room: room && { slug: room.slug, name: room.name },
      visits,
      notes,
      chat: { openRoomId, members: chatRoom?.member_count ?? 0 },
      channels: channels.map((c) => ({ platform: c.platform, title: c.title, url: c.channelUrl })),
    };
  }

  return {
    account: {
      name: user.name,
      email: user.email,
      role,
      isAdmin: role === "admin",
    },
    creator,
    blocks: blocks.map((b) => ({ ...b, createdAt: b.createdAt.toISOString() })),
  };
}
