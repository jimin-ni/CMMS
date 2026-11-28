import { Suspense } from "react";
import { redirect } from "next/navigation";
import { loadMyPageData } from "@/lib/mypage/data";
import { MyBook } from "@/components/mypage/my-book";
import { LoadingScreen } from "@/components/onboarding-c/loading-screen";
import { moneygraphyPixel, moneygraphyRounded, pretendard } from "@/app/fonts/onboarding";

// 마이페이지 주소로 바로 들어온 경우. 보통은 방 안 내비게이션 바의 이름 버튼이 방 위에 띄운다 (room-tour.tsx).
// 세션과 DB 읽기는 요청 시점 값이라 Suspense 안에서 읽는다 (cacheComponents).
async function MyPageContent() {
  const data = await loadMyPageData();
  if (!data) redirect("/login");
  return <MyBook {...data} />;
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
