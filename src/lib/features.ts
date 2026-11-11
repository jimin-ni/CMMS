export type FeatureCard = {
  title: string;
  description: string;
  owner: string;
  status: string;
  href?: string;
};

// 주요 기능 3종 (임시 화면용)
export const FEATURES: FeatureCard[] = [
  {
    title: "버블 1:1 채팅",
    description: "크리에이터와 구독자의 1:1 메시지, AI 반응 미리보기",
    owner: "주요 기능 1 (본인)",
    status: "개발 예정",
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
