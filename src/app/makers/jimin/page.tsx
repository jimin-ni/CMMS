import type { Metadata } from "next";
import Link from "next/link";
import { CharacterBadge } from "@/components/snow-globe/character-badge";

export const metadata: Metadata = { title: "지민 소개" };

// 물범(지민) 프로필. 내용은 아직 없다.
export default function JiminPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-16 text-center">
      <CharacterBadge kind="seal" label="로우폴리 물범" />
      <h1 className="mt-6 text-[32px] leading-[1.2] font-medium text-ink">지민</h1>
      <p className="mt-3 text-ash">개발 예정</p>
      <Link href="/makers" className="mt-8 text-sm text-ash underline hover:text-ink">
        제작자 소개로 돌아가기
      </Link>
    </main>
  );
}
