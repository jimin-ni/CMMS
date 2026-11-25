import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { VisitRoom } from "@/components/onboarding-c/visit-room";
import type { HeapRoomData } from "@/components/heap/heap-room";
import { moneygraphyPixel, moneygraphyRounded, pretendard } from "@/app/fonts/onboarding";
import { simLayout } from "./sim-layout";

// 개발 전용: 받침 시험 방. DB 를 읽지도 쓰지도 않는다. 배포에서는 404.
//   /dev/surfaces                  윗면이 있는 가구 전부 (크리스마스 키트 빼고)와 손 가구
//   /dev/surfaces?set=holiday      크리스마스 키트의 받침
//   /dev/surfaces?reels=80         사진 더미의 카드 수 (기본 40). 더미 옮기기 시험용
// 꾸미기 버튼으로 들어가 물건을 받침 위로 끌어 본다. 저장은 되지 않는다 (서버가 방을 찾지 못한다).
type Props = { searchParams: Promise<{ set?: string; reels?: string }> };

async function SimRoom({ searchParams }: Props) {
  const { set = "base", reels = "40" } = await searchParams;
  await connection(); // serverTime 은 요청 시점 값이다
  const n = Math.min(200, Math.max(0, Number(reels) || 0));
  const data: HeapRoomData = {
    roomUuid: "00000000-0000-4000-8000-000000000000",
    name: "받침 시험 방",
    bubbleHref: "/bubble",
    serverTime: new Date().toISOString(),
    rooms: [],
    layout: simLayout(set),
    reels: Array.from({ length: n }, (_, i) => ({
      id: `sim${String(i).padStart(4, "0")}`,
      platform: "youtube",
      url: `https://www.youtube.com/watch?v=sim${i}`,
      title: `시험 카드 ${i + 1}`,
      channel: "시험",
      handle: null,
      wide: i % 5 === 0,
      views: "1천",
      viewCount: 1000,
      published: null,
    })),
    pieces: [],
    guestbook: [],
    visits: { today: 0, total: 0 },
    creatorVisit: null,
    notes: [],
    noteRevealAt: null,
    unreadNotes: 0,
  };
  return (
    <div className={`${moneygraphyPixel.variable} ${moneygraphyRounded.variable} ${pretendard.variable}`}>
      <VisitRoom
        roomId={`dev-surfaces-${set}`}
        owner={{ nickname: "시험", channels: [], reels: [] }}
        data={data}
        viewerName="시험"
        signedIn={false}
        canEdit
      />
    </div>
  );
}

export default function SurfacesSimPage(props: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={<div className="flex-1 bg-[#565344]" />}>
      <SimRoom {...props} />
    </Suspense>
  );
}
