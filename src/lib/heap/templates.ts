import studio from "./templates/studio.json";
import kitchenLiving from "./templates/kitchen-living.json";
import cabin from "./templates/cabin.json";

// 방을 만들 때 고르는 시작 템플릿. 가구와 색을 절반쯤만 채워 둔 방이다 (DECISIONS A3, E6).
// 방 데이터(layout)는 templates/*.json에 있고, 서버 액션이 고른 템플릿의 사본을 새 방에 넣는다.
// kitchen-living은 러브쑤 방의 저장본에서 기능 내용(개인 링크, 이메일, 기념품)을 뺀 복사본이다.
// 이미지는 public/heap/templates/<id>.png. 실행 중인 앱에서 찍은 방 그림이고 만들기 화면 배경으로 쓴다.
export const HEAP_TEMPLATE_IDS = ["studio", "kitchen-living", "cabin"] as const;
export type HeapTemplateId = (typeof HEAP_TEMPLATE_IDS)[number];

export type HeapTemplate = {
  id: HeapTemplateId;
  label: string;
  blurb: string;
  image: string;
  layout: Record<string, unknown>;
};

export const HEAP_TEMPLATES: readonly HeapTemplate[] = [
  {
    id: "studio",
    label: "스튜디오",
    blurb: "책상과 노트북, 침대, 선반이 있는 아담한 작업방 (8 x 8)",
    image: "/heap/templates/studio.png",
    layout: studio,
  },
  {
    id: "kitchen-living",
    label: "주방 거실",
    blurb: "주방과 식탁, 침대가 이어진 넓은 집 (11 x 8)",
    image: "/heap/templates/kitchen-living.png",
    layout: kitchenLiving,
  },
  {
    id: "cabin",
    label: "통나무집",
    blurb: "나무 바닥과 화덕 스토브, 화분이 있는 오두막 (9 x 8)",
    image: "/heap/templates/cabin.png",
    layout: cabin,
  },
];

// 알 수 없는 id(클라이언트가 보낸 값)는 null. 레이아웃은 호출하는 쪽에서 복사해 쓴다.
export function getTemplate(id: unknown): HeapTemplate | null {
  if (typeof id !== "string") return null;
  return HEAP_TEMPLATES.find((template) => template.id === id) ?? null;
}
