export type OnboardingConcept = {
  // 주소에 쓰는 이름. /onboarding/[id]
  id: string;
  title: string;
  description: string;
  status: string;
};

// 최초 접속 온보딩 시안 (08 문서 §7-1). 내용은 시안을 정한 뒤 채운다.
export const ONBOARDING_CONCEPTS: OnboardingConcept[] = [
  { id: "a", title: "온보딩 컨셉 A", description: "최초 접속 온보딩 시안 A", status: "준비 중" },
  { id: "b", title: "온보딩 컨셉 B", description: "바인더 노트를 넘기듯 스크롤하며 러브쑤와 함께 만드는 방을 소개하는 시안", status: "시안" },
  { id: "c", title: "온보딩 컨셉 C", description: "스크롤하면 빈 방에 가구가 하나씩 쌓이고, 방 안을 둘러보게 하는 시안", status: "시안" },
];

export function findOnboardingConcept(id: string): OnboardingConcept | undefined {
  return ONBOARDING_CONCEPTS.find((concept) => concept.id === id);
}
