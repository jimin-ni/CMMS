import type { Metadata } from "next";
import Link from "next/link";
import { CharacterBadge } from "@/components/snow-globe/character-badge";
import { MAKER_LINKS } from "@/components/snow-globe/links";

export const metadata: Metadata = { title: "제작자 소개" };

// 미니룸 스노우 글로브의 상세 화면에서 글로브를 누르면 오는 페이지.
// 저장소 링크, 물범(지민), 고양이(규노) 세 갈래로 이어진다.
export default function MakersPage() {
  const card = "flex items-center gap-5 rounded-sm border border-hairline bg-white p-5 transition hover:border-ink";
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-[32px] leading-[1.2] font-medium text-ink">제작자 소개</h1>
      <p className="mt-1 text-ash">스노우 글로브 속 물범과 고양이가 CMMS를 만들었어요.</p>

      <div className="mt-8 grid gap-4">
        <a href={MAKER_LINKS.repo} target="_blank" rel="noopener noreferrer" className={card}>
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-ink text-3xl text-white" aria-hidden>
            {"</>"}
          </span>
          <span>
            <b className="block text-lg font-medium text-ink">GitHub 저장소</b>
            <span className="text-sm text-ash">github.com/jimin-ni/CMMS</span>
          </span>
        </a>
        <Link href={MAKER_LINKS.jimin} className={card}>
          <CharacterBadge kind="seal" label="로우폴리 물범" />
          <span>
            <b className="block text-lg font-medium text-ink">물범 · 지민</b>
            <span className="text-sm text-ash">개발자 소개 보기</span>
          </span>
        </Link>
        <a href={MAKER_LINKS.gyuno} target="_blank" rel="noopener noreferrer" className={card}>
          <CharacterBadge kind="cat" label="흰색과 검은색 얼룩 고양이" />
          <span>
            <b className="block text-lg font-medium text-ink">고양이 · 규노</b>
            <span className="text-sm text-ash">개발자 소개 보기 (LinkedIn)</span>
          </span>
        </a>
      </div>
    </main>
  );
}
