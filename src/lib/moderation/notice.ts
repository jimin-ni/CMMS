// 판정 결과 안내 (쪽지, 방명록). 쓴 사람에게만 보인다. 버블 채팅(bubble/actions.ts)과 같은 문구와 모양이다.
// refresh가 true면 쓰기 차단이 새로 걸렸다는 뜻이다. 화면은 입력을 막는다.
import { MODERATION_TEXT } from "./policy";
import type { SaveNotice } from "./repo";

export type ModerationNotice = { tone: "warn" | "info" | "care"; text: string; refresh?: boolean };

export function noticeFor(saved: SaveNotice): ModerationNotice | undefined {
  switch (saved.kind) {
    case "published":
      return undefined;
    case "blocked":
      return saved.autoBlocked
        ? { tone: "warn", text: `${MODERATION_TEXT.blocked(saved.strikes)} ${MODERATION_TEXT.nowBlocked}`, refresh: true }
        : { tone: "warn", text: MODERATION_TEXT.blocked(saved.strikes) };
    case "contact_first":
      return { tone: "info", text: MODERATION_TEXT.contactFirst };
    case "hold_review":
      return { tone: "info", text: MODERATION_TEXT.holdReview };
    case "hold_self_harm":
      return { tone: "care", text: MODERATION_TEXT.selfHarm };
  }
}
