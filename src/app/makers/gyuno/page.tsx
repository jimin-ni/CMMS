import type { Metadata } from "next";
import Link from "next/link";
import { CharacterBadge } from "@/components/snow-globe/character-badge";

export const metadata: Metadata = { title: "규노 소개" };

// 고양이(규노) 프로필. 내용은 아직 없다.
export default function GyunoPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-16 text-center">
      <CharacterBadge kind="cat" label="흰색과 검은색 얼룩 고양이" />
      <h1 className="mt-6 text-[32px] leading-[1.2] font-medium text-ink">규노</h1>
      <p className="mt-3 text-ash">개발 예정</p>
      <Link href="/makers" className="mt-8 text-sm text-ash underline hover:text-ink">
        제작자 소개로 돌아가기
      </Link>
    </main>
  );
}
