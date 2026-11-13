// 힙 액션이 돌려주는 실패 이유(reason)와 화면에 보여 줄 문구를 나눠 둔다.
// "use server" 파일은 함수만 내보낼 수 있어서 이 표는 따로 둔다.
export const HEAP_MESSAGES = {
  "not-signed-in": "로그인이 필요합니다.",
  "not-found": "방을 찾을 수 없어요.",
  "not-owner": "이 방의 주인만 할 수 있어요.",
  "invalid-name": "이름은 1자 이상 12자 이하로 적어 주세요.",
  "rate-limited": "오늘은 이미 남겼어요. 내일 다시 남길 수 있어요.",
  "invalid-layout": "방 꾸미기 내용이 올바르지 않아요.",
} as const;

export type HeapReason = keyof typeof HEAP_MESSAGES;
