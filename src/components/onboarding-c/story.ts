// 온보딩 컨셉 C의 글, 스크롤 시간표, 둘러보기 대상. 방은 실제 2번 방을 힙 엔진으로 띄운다 (concept-c.tsx).

// 온보딩이 띄우는 방: 2번 방 (public/heap/rooms/index.json 의 두 번째, DB slug "dname")
export const ONBOARDING_ROOM_ID = "dname";

type LayoutItem = { type?: unknown; model?: unknown; fn?: { kind?: unknown } | null };

export type Step = {
  title: string;
  line: string;
  // 이 단계에서 떨어지는 가구. 탁자 위 사진 더미는 가구가 아니라 pile 로 따로 내린다.
  match: (item: LayoutItem) => boolean;
  pile?: boolean;
};

const model = (item: LayoutItem) => (typeof item.model === "string" ? item.model : "");

// 스크롤마다 글 하나, 가구 묶음 하나. 글은 기획 01 문서 §3의 목표 감정(향수, 다시 찾는 즐거움, 소속감)을 따른다.
// 어느 단계에도 맞지 않는 가구는 마지막 단계에 함께 놓인다.
export const STEPS: Step[] = [
  {
    title: "A Pile of Polaroids",
    line: "Every short, kept like a photo you can hold.",
    match: () => false,
    pile: true,
  },
  {
    title: "Dig & Rediscover",
    line: "Flip through the albums. Find the one you loved.",
    match: (it) => it.type === "shelf" || /bookcase|shelf/i.test(model(it)),
  },
  {
    title: "A Light Left On",
    line: "Warm light, soft music. The room waits for you.",
    match: (it) => it.type === "lamp" || /lamp|speaker|radio|television|tv/i.test(model(it)),
  },
  {
    title: "Stay a While",
    line: "No rush. Make yourself at home.",
    match: (it) => it.type === "bed" || it.type === "books" || /bed|sofa|couch|chair|rug|books/i.test(model(it)),
  },
  {
    title: "Grown Together",
    line: "Every visit leaves this room a little more alive.",
    match: (it) => it.type === "plant" || it.type === "snake" || /plant/i.test(model(it)),
  },
];

// layout.items 의 각 가구가 몇 번째 단계에 떨어지는지
export function stepOfItems(items: unknown): number[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const item = (raw && typeof raw === "object" ? raw : {}) as LayoutItem;
    const i = STEPS.findIndex((step) => step.match(item));
    return i < 0 ? STEPS.length - 1 : i;
  });
}

// 스크롤 진행도(0~1) 시간표
export const TIMELINE = {
  introOut: [0.025, 0.065] as const, // "Memories"와 스크롤 안내가 사라지는 구간
  reveal: [0.05, 0.16] as const, // 어둠이 걷히고 창문 빛과 빈 방이 보이는 구간
  stepsStart: 0.17,
  stepSpan: 0.13, // 한 단계: 글 → 가구 → 글이 사라짐
  dark: [0.85, 0.93] as const, // 배경이 다시 어두워지는 구간
  ready: [0.9, 0.95] as const, // "Ready to Start?"가 나타나는 구간
};

// 스크롤 전체 높이 (화면 높이의 배수)
export const SCROLL_SCREENS = 8;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// a에서 0, b에서 1로 올라가는 값
export const ramp = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

export function stepWindow(index: number) {
  const s = TIMELINE.stepsStart + index * TIMELINE.stepSpan;
  const k = TIMELINE.stepSpan;
  return {
    textIn: [s, s + 0.25 * k] as const,
    drop: [s + 0.3 * k, s + 0.7 * k] as const,
    textOut: [s + 0.85 * k, s + k] as const,
  };
}

// ---------- 방 안에서 둘러볼 곳 ----------
// 엔진이 알려 주는 것으로 센다: 모드(heap:mode)와 열린 창(overlay 의 hidden 이 풀림). 엔진을 고치지 않고 읽기만 한다.

export type SpotId = "pile" | "projector" | "shelf" | "phone" | "guestbook" | "door" | "pc" | "keepsake" | "calendar" | "music";

export const SPOTS: Record<SpotId, { name: string; story: string }> = {
  pile: { name: "The Polaroid Pile", story: "You sat down to dig. Pick one up, flip it, or feed it to the projector." },
  projector: { name: "The Projector", story: "Your favorite moment, back on the wall, from the original." },
  shelf: { name: "The Album Shelf", story: "Albums sorted for you. Some of these you may have forgotten." },
  phone: { name: "The Phone", story: "Messages from the creator land here." },
  guestbook: { name: "The Guestbook", story: "Names of everyone who stopped by. Today counts too." },
  door: { name: "The Door", story: "Other rooms are only a step away." },
  pc: { name: "The Computer", story: "All their links, kept in one place." },
  keepsake: { name: "A Keepsake", story: "Something they wanted to keep, and share with you." },
  calendar: { name: "The Calendar", story: "Dates they want you to remember." },
  music: { name: "The Music", story: "The room's own soundtrack. Stay and listen." },
};

// 엔진 모드 → 둘러본 곳
export const MODE_SPOT: Partial<Record<string, SpotId>> = { sit: "pile", watch: "projector", sort: "shelf" };
// 엔진이 여는 창의 id (heap-room.tsx) → 둘러본 곳
export const PANEL_SPOT: Record<string, SpotId> = {
  phone: "phone",
  guestbook: "guestbook",
  rooms: "door",
  pc: "pc",
  keepsake: "keepsake",
  calendar: "calendar",
  music: "music",
};
// 열려 있으면 안내 팝업을 잠시 내리는 창
export const PANEL_IDS = ["phone", "guestbook", "rooms", "pc", "keepsake", "calendar", "grid", "player", "music"];

// 이 방에 실제로 있는 곳만 센다. 탁자, 영사기, 휴대폰, 방명록, 문은 모든 방에 있다.
export function spotsFor(items: unknown): SpotId[] {
  const list = Array.isArray(items) ? (items as LayoutItem[]) : [];
  const kinds = new Set(list.map((it) => it?.fn?.kind).filter((k): k is string => typeof k === "string"));
  const spots: SpotId[] = ["pile", "projector"];
  if (list.some((it) => it?.type === "shelf")) spots.push("shelf");
  spots.push("phone", "guestbook", "door");
  for (const kind of ["pc", "keepsake", "calendar", "music"] as const) if (kinds.has(kind)) spots.push(kind);
  return spots;
}

// 방 안에서 이만큼 둘러보면 내비게이션 바를 보여 준다
export const NAV_AFTER = 3;
