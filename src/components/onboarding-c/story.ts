// 온보딩 컨셉 C의 글과 스크롤 시간표. 3D 장면(room-scene.ts)과 화면 글(concept-c.tsx)이 같은 값을 읽는다.

export type ItemId = "pile" | "shelf" | "screen" | "lamp" | "tree" | "guestbook" | "bed";

export type StoryItem = {
  id: ItemId;
  // 스크롤 중에 가구와 함께 나오는 제목과 한 줄 설명
  title: string;
  line: string;
  // 방 안에서 눌렀을 때 아래 팝업에 나오는 이름과 이야기
  name: string;
  story: string;
};

// 2번 방(dname)에 원래 있는 가구 순서대로 쌓는다. 글은 기획 01 문서 §3의 목표 감정(향수, 다시 찾는 즐거움, 소속감)을 따른다.
export const STORY: StoryItem[] = [
  {
    id: "pile",
    title: "A Pile of Polaroids",
    line: "Every short, kept like a photo you can hold.",
    name: "The Polaroid Pile",
    story: "Pick one up. Each card is a moment from the archive.",
  },
  {
    id: "shelf",
    title: "Dig & Rediscover",
    line: "Flip through the old ones. Find the one you loved.",
    name: "The Album Shelf",
    story: "Albums sorted by season. Some of these you may have forgotten.",
  },
  {
    id: "screen",
    title: "Press Play, Again",
    line: "That clip you laughed at, back on screen.",
    name: "The Little Screen",
    story: "Any polaroid you pick plays right here, from the original.",
  },
  {
    id: "lamp",
    title: "A Light Left On",
    line: "A warm room that waits, even while they're away.",
    name: "The Reading Lamp",
    story: "Click, and it glows. The room is always open for you.",
  },
  {
    id: "tree",
    title: "Leave a Little Note",
    line: "Hang your words on the tree. They will read it.",
    name: "The Note Tree",
    story: "Every paper leaf is a note from a fan. Yours could be next.",
  },
  {
    id: "guestbook",
    title: "We Were Here",
    line: "Sign the guestbook. Fans build this place together.",
    name: "The Guestbook",
    story: "Names of everyone who stopped by. Today counts too.",
  },
  {
    id: "bed",
    title: "Stay a While",
    line: "No rush. Make yourself at home.",
    name: "The Cozy Bed",
    story: "Soft and a little messy. Just like a real room.",
  },
];

// 스크롤 진행도(0~1) 시간표
export const TIMELINE = {
  introOut: [0.025, 0.065] as const, // "Memories"와 스크롤 안내가 사라지는 구간
  reveal: [0.05, 0.16] as const, // 창문 빛이 들고 빈 방이 보이는 구간
  itemsStart: 0.17,
  itemSpan: 0.1, // 가구 하나: 글 → 가구 → 글이 사라짐
  dark: [0.88, 0.95] as const, // 배경이 어두워지는 구간
  ready: [0.93, 0.97] as const, // "Ready to Start?"가 나타나는 구간
};

// 스크롤 전체 높이 (화면 높이의 배수). 가구 하나에 한 화면쯤 스크롤한다.
export const SCROLL_SCREENS = 10;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// a에서 0, b에서 1로 올라가는 값
export const ramp = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

export function itemWindow(index: number) {
  const s = TIMELINE.itemsStart + index * TIMELINE.itemSpan;
  return {
    textIn: [s, s + 0.025] as const,
    drop: [s + 0.03, s + 0.07] as const,
    textOut: [s + 0.085, s + 0.1] as const,
  };
}

// 방 안에서 이만큼 둘러보면 내비게이션 바를 보여 준다
export const NAV_AFTER = 3;
