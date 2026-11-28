"use client";

import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/settings/prefs";

// 화면 왼쪽 위의 뒤로 가기 화살표 (약관, 개인정보 처리방침).
// 가입 양식은 이 문서들을 새 탭으로 연다. 그 탭은 지나온 쪽이 없으니 탭을 닫아 가입 양식으로 돌아간다.
// 닫을 수 없는 탭(주소를 직접 연 탭 등)이면 첫 화면으로 간다.
export function BackButton() {
  const router = useRouter();
  const label = useLanguage() === "en" ? "Back" : "뒤로 가기";

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    window.close();
    // close 가 막히면 창이 그대로 남는다
    window.setTimeout(() => {
      if (!window.closed) router.push("/");
    }, 100);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      className="fixed left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-sm border border-ink bg-white text-ink hover:bg-cream"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
    </button>
  );
}
