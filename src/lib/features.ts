export type FeatureCard = {
  title: string;
  description: string;
  owner: string;
  status: string;
  // 카드를 누르면 이동할 화면. 없으면 이동하지 않는다.
  href?: string;
};

// 주요 기능 (임시 화면용)
export const FEATURES: FeatureCard[] = [
  {
    title: "버블 채팅",
    description: "크리에이터 1명과 구독자 여러 명의 대화방, AI 반응 미리보기",
    owner: "주요 기능 1 (본인)",
    status: "개발 중",
    href: "/bubble",
  },
  {
    title: "힙 미니룸",
    description: "크리에이터의 방. 지난 영상이 사진 더미로 쌓이고, 팬이 들러 방명록을 남긴다",
    owner: "주요 기능 2 (윤)",
    status: "개발 중",
    href: "/rooms",
  },
];
