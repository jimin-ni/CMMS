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
  { id: "b", title: "온보딩 컨셉 B", description: "최초 접속 온보딩 시안 B", status: "준비 중" },
  { id: "c", title: "온보딩 컨셉 C", description: "최초 접속 온보딩 시안 C", status: "준비 중" },
];

export function findOnboardingConcept(id: string): OnboardingConcept | undefined {
  return ONBOARDING_CONCEPTS.find((concept) => concept.id === id);
}
