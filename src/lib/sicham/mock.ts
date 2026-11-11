// 시참(시청자 참여) 목업 데이터.
// 공통 인프라/실데이터가 붙기 전까지 화면을 잡기 위한 임시 데이터입니다.
// 게임 이름은 저작권을 피하려고 실제 게임에서 조금씩 바꾼 패러디 이름입니다.

export type GameId = "pubz" | "minecroft" | "overwitch" | "godfielder";

// 입장 방식 라이브러리 (초기 3종).
export type JoinMethod = "reveal-string" | "search-invite" | "platform-invite";

export type Game = {
  id: GameId;
  title: string; // 표시 이름 (패러디)
  genre: string;
  // 섬네일 대역: 그라데이션 두 색과 이모지 한 글자로 게임을 구분합니다.
  from: string;
  to: string;
  emoji: string;
  slots: number; // 한 판에 함께 넣을 수 있는 시청자 자리 수
  joinMethod: JoinMethod;
  handleLabel?: string; // 참여 전 입력받는 게임 핸들 이름 (없으면 불필요)
};

export type Creator = {
  id: string;
  name: string;
  avatar: string; // 이모지 대역
  live: boolean;
  gameId?: GameId; // 방송 중인 게임 (live일 때만)
  viewers?: number;
  streamId?: string; // live일 때 연결되는 방 id
  scheduled?: boolean; // 예약 시참 (오프라인이지만 신청 사전 오픈)
};

export type Stream = {
  id: string;
  creatorId: string;
  gameId: GameId;
  title: string;
  viewers: number;
  lookingFor: number; // 지금 모집 중인 빈 자리 수
  waiting: number; // 참여 신청 대기 인원
};

export const GAMES: Record<GameId, Game> = {
  pubz: {
    id: "pubz",
    title: "펍지 (PUBZ)",
    genre: "배틀로얄",
    from: "#c9a227",
    to: "#6b4e37",
    emoji: "🪂",
    slots: 4,
    joinMethod: "search-invite",
    handleLabel: "PUBG 이름",
  },
  minecroft: {
    id: "minecroft",
    title: "마인크라프트 (MineCroft)",
    genre: "샌드박스",
    from: "#6a994e",
    to: "#386641",
    emoji: "⛏️",
    slots: 8, // 실제로는 유동. 목업에서는 8로 둠
    joinMethod: "reveal-string",
    handleLabel: "마인크래프트 유저네임",
  },
  overwitch: {
    id: "overwitch",
    title: "오버와치 (OverWitch)",
    genre: "팀 FPS",
    from: "#8fb0cf",
    to: "#4a6fa5",
    emoji: "🎯",
    slots: 6,
    joinMethod: "search-invite",
    handleLabel: "배틀태그",
  },
  godfielder: {
    id: "godfielder",
    title: "갓필더 (GodFielder)",
    genre: "카드 배틀",
    from: "#b5838d",
    to: "#6d4b53",
    emoji: "🃏",
    slots: 8, // 한 판 8, 세션은 ~12
    joinMethod: "reveal-string",
    handleLabel: undefined, // 핸들 불필요
  },
};

export const GAME_ORDER: GameId[] = ["pubz", "minecroft", "overwitch", "godfielder"];

export const CREATORS: Creator[] = [
  {
    id: "c-nabi",
    name: "별빛나비",
    avatar: "🦋",
    live: true,
    gameId: "pubz",
    viewers: 1240,
    streamId: "s-nabi",
  },
  {
    id: "c-haru",
    name: "하루게임즈",
    avatar: "🌙",
    live: true,
    gameId: "minecroft",
    viewers: 612,
    streamId: "s-haru",
  },
  {
    id: "c-gon",
    name: "곰도리TV",
    avatar: "🐻",
    live: true,
    gameId: "overwitch",
    viewers: 2980,
    streamId: "s-gon",
  },
  {
    id: "c-sol",
    name: "솔의하루",
    avatar: "🌻",
    live: true,
    gameId: "godfielder",
    viewers: 430,
    streamId: "s-sol",
  },
  // 예약 시참: 오프라인이지만 신청이 미리 열린 상태
  { id: "c-mu", name: "무무스트리머", avatar: "🐮", live: false, scheduled: true },
  { id: "c-pix", name: "픽셀대장", avatar: "👾", live: false },
];

export const STREAMS: Stream[] = [
  // 펍지
  {
    id: "s-nabi",
    creatorId: "c-nabi",
    gameId: "pubz",
    title: "시참 스쿼드 모집! 치킨 가즈아",
    viewers: 1240,
    lookingFor: 3,
    waiting: 5,
  },
  {
    id: "s-raon",
    creatorId: "c-raon",
    gameId: "pubz",
    title: "초보 환영 1인칭 듀오",
    viewers: 318,
    lookingFor: 1,
    waiting: 2,
  },
  // 마인크라프트
  {
    id: "s-haru",
    creatorId: "c-haru",
    gameId: "minecroft",
    title: "시청자랑 같이 마을 짓기",
    viewers: 612,
    lookingFor: 4,
    waiting: 1,
  },
  // 오버와치
  {
    id: "s-gon",
    creatorId: "c-gon",
    gameId: "overwitch",
    title: "경쟁전 한 자리 땜빵 구함",
    viewers: 2980,
    lookingFor: 1,
    waiting: 11,
  },
  {
    id: "s-vel",
    creatorId: "c-vel",
    gameId: "overwitch",
    title: "빠른대전 풀파티 시참",
    viewers: 540,
    lookingFor: 2,
    waiting: 4,
  },
  // 갓필더
  {
    id: "s-sol",
    creatorId: "c-sol",
    gameId: "godfielder",
    title: "1:1 카드 배틀 도전자 받음",
    viewers: 430,
    lookingFor: 1,
    waiting: 3,
  },
];

// STREAMS가 참조하지만 팔로우 줄에는 없는 크리에이터까지 이름을 찾을 수 있게 보강합니다.
const EXTRA_CREATORS: Record<string, { name: string; avatar: string }> = {
  "c-raon": { name: "라온플레이", avatar: "🎧" },
  "c-vel": { name: "벨로시티", avatar: "⚡" },
};

export function creatorName(creatorId: string): { name: string; avatar: string } {
  const known = CREATORS.find((creator) => creator.id === creatorId);
  if (known) return { name: known.name, avatar: known.avatar };
  return EXTRA_CREATORS[creatorId] ?? { name: "알 수 없음", avatar: "👤" };
}

export function getStream(streamId: string): Stream | undefined {
  return STREAMS.find((stream) => stream.id === streamId);
}

export function streamsByGame(gameId: GameId): Stream[] {
  return STREAMS.filter((stream) => stream.gameId === gameId);
}

export function liveFollowedCreators(): Creator[] {
  // 목업에서는 CREATORS 전체를 "팔로우한 크리에이터"로 간주합니다.
  // live가 위로 오도록 정렬합니다.
  return [...CREATORS].sort((a, b) => Number(b.live) - Number(a.live));
}

// 방 목업의 대기열/참가자용 가상 시청자.
// handle = 게임 핸들(스트리머에게만 보임). collab = 고정된 합방 파트너.
export type Viewer = {
  id: string;
  name: string;
  avatar: string;
  handle?: string;
  answer?: string; // 수락 질문 답
  collab?: boolean;
};

export function mockWaitingViewers(count: number): Viewer[] {
  const pool: Viewer[] = [
    { id: "v-tokki", name: "토끼", avatar: "🐰", handle: "bunbun99", answer: "2" },
    { id: "v-nuri", name: "누리꾼23", avatar: "🐸", handle: "greenFrog", answer: "2" },
    { id: "v-star", name: "별다방단골", avatar: "⭐", handle: "starbucks_fan", answer: "2" },
    { id: "v-kim", name: "김시청", avatar: "🧢", handle: "kim_watch", answer: "2" },
    {
      id: "v-long",
      name: "엄청나게긴닉네임을쓰는시청자",
      avatar: "🦭",
      handle: "a_very_long_handle_too",
      answer: "2",
    },
    { id: "v-hoo", name: "후추", avatar: "🌶️", handle: "pepper", answer: "2" },
    { id: "v-dal", name: "달밤산책", avatar: "🌝", handle: "moonwalk", answer: "2" },
  ];
  return pool.slice(0, Math.min(count, pool.length));
}

export function mockCurrentParticipants(count: number): Viewer[] {
  const pool: Viewer[] = [
    { id: "p-collab", name: "합방파트너", avatar: "🤝", handle: "co_host", collab: true },
    { id: "p-mint", name: "민트초코", avatar: "🍫", handle: "mintchoco" },
    { id: "p-navy", name: "네이비", avatar: "🧭", handle: "navy_blue" },
    { id: "p-coco", name: "코코넛", avatar: "🥥", handle: "coconut" },
    { id: "p-sun", name: "해바라기", avatar: "🌻", handle: "sunflower" },
  ];
  return pool.slice(0, Math.min(count, pool.length));
}
