export type FeatureCard = {
  title: string;
  description: string;
  owner: string;
  status: string;
  // 카드를 누르면 이동할 화면. 없으면 이동하지 않는다.
  href?: string;
};

// 주요 기능 3종 (임시 화면용)
export const FEATURES: FeatureCard[] = [
  {
    title: "버블 채팅",
    description: "크리에이터 1명과 구독자 여러 명의 대화방, AI 반응 미리보기",
    owner: "주요 기능 1 (본인)",
    status: "개발 중",
    href: "/bubble",
  },
  {
    title: "미니게임 + 경쟁 순위 보드",
    description: "미니게임 결과를 집계해 순위를 보여줍니다",
    owner: "주요 기능 2 (팀원 A)",
    status: "준비 중",
  },
  {
    title: "시참 도구",
    description: "방송 접속 코드 공유, 투표, 룰렛, 닉네임 교환",
    owner: "주요 기능 3 (팀원 B)",
    status: "준비 중",
    href: "/sicham",
  },
];
