// 쪽지·방명록의 판정 상태(0013)를 보는 사람에게 어떻게 보일지 정한다. DB를 쓰지 않는다 (테스트가 직접 부른다).
// hide: 보내지 않는다. removed: 자리는 두고 글을 삭제 문구로 바꾼다. own: 쓴 사람에게 상태와 함께 그대로. plain: 평소대로.
export type ScreenView = "hide" | "removed" | "own" | "plain";

export function screenView(status: string, mine: boolean): ScreenView {
  if (status === "published") return "plain";
  if (status === "removed") return "removed";
  // blocked, held: 쓴 사람에게만. 모르는 값도 숨긴다 (새 상태가 생겨도 새어 나가지 않게).
  return mine ? "own" : "hide";
}
