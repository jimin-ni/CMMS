// 스노우 글로브를 누르면 보이는 출처 표기 목록 (heap-room.tsx 의 글로브 모드 패널).
// [임시] 2026-11-25 초안. 라이선스를 아직 확인하지 못한 항목은 license 를 "확인 중"으로 둔다.
export type Credit = { name: string; by?: string; license: string; url?: string; note?: string };
export type CreditGroup = { title: string; items: Credit[] };

export const CREDITS: CreditGroup[] = [
  {
    title: "3D 에셋",
    items: [
      { name: "Furniture Kit 2.0", by: "Kenney", license: "CC0 1.0", url: "https://kenney.nl/assets/furniture-kit" },
      { name: "Holiday Kit 2.0", by: "Kenney", license: "CC0 1.0", url: "https://kenney.nl/assets/holiday-kit" },
    ],
  },
  {
    title: "데이터셋",
    items: [
      {
        name: "ProfanityBench",
        by: "BibbyResearch (Hugging Face)",
        license: "MIT",
        url: "https://huggingface.co/datasets/BibbyResearch/ProfanityBench",
        note: "채팅 판정 사전의 후보 단어",
      },
    ],
  },
  {
    title: "글꼴",
    items: [
      { name: "Oswald", license: "SIL OFL 1.1", url: "https://fonts.google.com/specimen/Oswald" },
      { name: "Nunito", license: "SIL OFL 1.1", url: "https://fonts.google.com/specimen/Nunito" },
      { name: "Pretendard", by: "orioncactus", license: "SIL OFL 1.1", url: "https://github.com/orioncactus/pretendard" },
      { name: "양진체", license: "확인 중" },
      { name: "머니그라피 Pixel · Rounded", license: "확인 중" },
    ],
  },
];
