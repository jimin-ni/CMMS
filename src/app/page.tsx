import { Suspense } from "react";
import { OnboardingRoom } from "@/components/onboarding-c/onboarding-room";
import { LoadingScreen } from "@/components/onboarding-c/loading-screen";
import { moneygraphyPixel, moneygraphyRounded, pretendard } from "@/app/fonts/onboarding";

// 첫 화면: 온보딩 컨셉 C (/onboarding/c 와 같다). 화면 전체를 덮으므로 위의 헤더는 가려진다.
// 세션과 DB 읽기는 요청 시점 값이라 Suspense 안에서 읽는다 (cacheComponents). 기다리는 동안 대기 화면을 띄운다.
export default function HomePage() {
  return (
    <div className={`${moneygraphyPixel.variable} ${moneygraphyRounded.variable} ${pretendard.variable}`}>
      <Suspense fallback={<LoadingScreen />}>
        <OnboardingRoom concept="c" />
      </Suspense>
    </div>
  );
}
