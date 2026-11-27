import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";

export const metadata: Metadata = { title: "개인정보 처리방침" };

// 회원가입 화면과 로그인 팝업의 가입 쪽, 동의 문장에서 여는 안내 화면 (새 탭). 왼쪽 위 화살표로 돌아간다. 본문은 확정되면 채운다.
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <BackButton />
      <article className="flex flex-col gap-4 rounded-sm border border-hairline bg-white p-8">
        <h1 className="text-[32px] leading-[1.2] font-medium text-ink">개인정보 처리방침</h1>
        <p className="text-sm text-ash">내용을 준비하고 있어요.</p>
      </article>
    </main>
  );
}
