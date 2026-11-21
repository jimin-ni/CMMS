import type { Metadata } from "next";

export const metadata: Metadata = { title: "개인정보 처리방침" };

// 회원가입 화면의 동의 문장에서 여는 안내 화면. 본문은 확정되면 채운다.
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <article className="flex flex-col gap-4 rounded-sm border border-hairline bg-white p-8">
        <h1 className="text-[32px] leading-[1.2] font-medium text-ink">개인정보 처리방침</h1>
        <p className="text-sm text-ash">내용을 준비하고 있어요.</p>
      </article>
    </main>
  );
}
