"use client";

// 문으로 옮겨 간 방(/room/[roomId]). 온보딩이 끝난 방과 같은 겉모습을 쓴다: 메모 모양 내비게이션 바, 왼쪽 위 서비스 이름, 로그인 팝업.
// 둘러보기는 모두 채운 것으로 센다 (Esc 로 건너뛴 것과 같다). 그래서 안내 팝업은 뜨지 않고 내비게이션 바가 바로 열린다.
import "./onboarding-c.css";
import { useRef } from "react";
import { HeapRoom, type HeapOwnerData, type HeapRoomData } from "@/components/heap/heap-room";
import { PaperFilters } from "./paper";
import { RoomTour } from "./room-tour";

// 다른 방에서 홈 버튼이 여는 곳: 온보딩이 끝난 러브쑤 방 (src/app/home/page.tsx)
const HOME_HREF = "/home";

export function VisitRoom({
  roomId,
  data,
  viewerName,
  signedIn,
  canEdit,
  owner,
}: {
  roomId: string;
  data: HeapRoomData;
  viewerName: string | null;
  signedIn: boolean;
  canEdit: boolean;
  owner: HeapOwnerData | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  return (
    <div className="oc-root oc-locked">
      <PaperFilters />
      <div className="oc-stage">
        <div ref={hostRef} className="oc-room-host live">
          <HeapRoom
            roomId={roomId}
            data={data}
            viewerName={viewerName}
            signedIn={signedIn}
            canEdit={canEdit}
            owner={owner}
            signInHere
            presence
          />
        </div>
        <RoomTour
          hostRef={hostRef}
          live
          skipped
          layoutItems={data.layout.items}
          viewerName={viewerName}
          signedIn={signedIn}
          homeHref={HOME_HREF}
        />
      </div>
    </div>
  );
}
