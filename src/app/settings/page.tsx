import { Suspense } from "react";
import { OnboardingRoom } from "@/components/onboarding-c/onboarding-room";
import { moneygraphyPixel, moneygraphyRounded, pretendard } from "@/app/fonts/onboarding";

// 설정 화면 (임시): 내비게이션 바의 설정 버튼이 연다. 설정 화면이 정해질 때까지 온보딩 컨셉 B를 띄우고 첫 장 제목만 "setting"이다.
// 세션과 DB 읽기는 요청 시점 값이라 Suspense 안에서 읽는다 (cacheComponents).
export default function SettingsPage() {
  return (
    <div className={`${moneygraphyPixel.variable} ${moneygraphyRounded.variable} ${pretendard.variable}`}>
      <Suspense fallback={<div className="fixed inset-0 z-[60] bg-[#0c0a08]" />}>
        <OnboardingRoom concept="b" screen="settings" />
      </Suspense>
    </div>
  );
}
