import { Suspense } from "react";
import { OnboardingRoom } from "@/components/onboarding-c/onboarding-room";
import { LoadingScreen } from "@/components/onboarding-c/loading-screen";
import { moneygraphyPixel, moneygraphyRounded, pretendard } from "@/app/fonts/onboarding";

// 홈: 온보딩이 끝난 상태의 러브쑤 방 (첫 화면에서 Esc 로 건너뛴 것과 같다). 설정 화면에서 노트 바깥을 누르면 여기로 온다.
// 세션과 DB 읽기는 요청 시점 값이라 Suspense 안에서 읽는다 (cacheComponents).
export default function HomeRoomPage() {
  return (
    <div className={`${moneygraphyPixel.variable} ${moneygraphyRounded.variable} ${pretendard.variable}`}>
      <Suspense fallback={<LoadingScreen />}>
        <OnboardingRoom concept="c" screen="home" />
      </Suspense>
    </div>
  );
}
