// 힙 액션이 돌려주는 실패 이유(reason)와 화면에 보여 줄 문구를 나눠 둔다.
// "use server" 파일은 함수만 내보낼 수 있어서 이 표는 따로 둔다.
export const HEAP_MESSAGES = {
  "not-signed-in": "로그인이 필요합니다.",
  "not-found": "방을 찾을 수 없어요.",
  "not-owner": "이 방의 주인만 할 수 있어요.",
  "invalid-name": "이름은 1자 이상 12자 이하로 적어 주세요.",
  "rate-limited": "오늘은 이미 남겼어요. 내일 다시 남길 수 있어요.",
  "invalid-layout": "방 꾸미기 내용이 올바르지 않아요.",
  // 방 만들기
  "not-creator": "크리에이터 계정만 할 수 있어요.",
  "invalid-template": "고를 수 없는 템플릿이에요.",
  "invalid-slug": "쓸 수 없는 주소예요.",
  "invalid-room-name": "방 이름은 1자 이상 40자 이하로, 줄바꿈 없이 적어 주세요.",
  "slug-taken": "이미 쓰고 있는 주소예요. 다른 주소를 골라 주세요.",
  "already-has-room": "이미 내 방이 있어요.",
  "too-many-attempts": "시도가 너무 많아요. 잠시 뒤에 다시 해 주세요.",
  // 영상 가져오기와 빼기
  "no-room": "먼저 내 미니홈을 만들어 주세요.",
  "invalid-channel": "유튜브 채널 주소(youtube.com/@이름 또는 /channel/UC…)나 @핸들을 적어 주세요.",
  "import-too-soon": "영상 가져오기는 10분에 한 번만 할 수 있어요. 잠시 뒤에 다시 해 주세요.",
  "channel-not-found": "채널을 찾지 못했어요. 주소를 다시 확인해 주세요.",
  "channel-taken": "이미 다른 크리에이터가 연결한 채널이에요.",
  "channel-limit": "연결할 수 있는 채널 수를 넘었어요.",
  "import-unavailable": "지금은 영상 가져오기를 쓸 수 없어요.",
  "import-failed": "영상을 가져오지 못했어요. 잠시 뒤에 다시 해 주세요.",
  "reel-not-found": "영상을 찾을 수 없어요.",
  "excluded-full": "뺄 수 있는 영상 수를 넘었어요.",
} as const;

export type HeapReason = keyof typeof HEAP_MESSAGES;
