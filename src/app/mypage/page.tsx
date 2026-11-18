import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { roleLabel } from "@/lib/access";
import {
  getOpenBubbleRoomId,
  getRoomByCreator,
  getVisitCounts,
  listCreatorChannels,
} from "@/lib/heap/repo";
import { getNoteCounts } from "@/lib/heap/notes-repo";
import { MyBook, type MyCreatorData } from "@/components/mypage/my-book";
import { LoadingScreen } from "@/components/onboarding-c/loading-screen";
import { moneygraphyPixel, moneygraphyRounded, pretendard } from "@/app/fonts/onboarding";

// 마이페이지: 로그인한 사람이 내비게이션 바의 이름을 누르면 연다 (로그인 전에는 로그인 팝업이 뜬다).
// 세션과 DB 읽기는 요청 시점 값이라 Suspense 안에서 읽는다 (cacheComponents).
async function MyPageContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const { user } = session;
  const role = (user as { role?: string | null }).role;

  let creator: MyCreatorData | null = null;
  if (role === "creator" || role === "admin") {
    const [room, openRoomId, channels] = await Promise.all([
      getRoomByCreator(user.id),
      getOpenBubbleRoomId(user.id),
      listCreatorChannels(user.id),
    ]);
    const [visits, notes] = room
      ? await Promise.all([getVisitCounts(room.id), getNoteCounts(room.id, user.id)])
      : [
          { today: 0, total: 0 },
          { received: 0, unread: 0, replied: 0 },
        ];
    creator = {
      room: room && { slug: room.slug, name: room.name },
      visits,
      notes,
      chat: { openRoomId },
      channels: channels.map((c) => ({ platform: c.platform, title: c.title, url: c.channelUrl })),
    };
  }

  return (
    <MyBook
      account={{ name: user.name, email: user.email, roleLabel: roleLabel(role), joinedAt: user.createdAt }}
      creator={creator}
    />
  );
}

export default function MyPage() {
  return (
    <div className={`${moneygraphyPixel.variable} ${moneygraphyRounded.variable} ${pretendard.variable}`}>
      <Suspense fallback={<LoadingScreen />}>
        <MyPageContent />
      </Suspense>
    </div>
  );
}
