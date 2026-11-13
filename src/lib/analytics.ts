// GA로 보내는 이벤트. 루트 레이아웃의 GTM이 dataLayer를 읽어 GA4로 넘긴다.
// GTM에는 이벤트 이름마다 맞춤 이벤트 트리거와 GA4 이벤트 태그가 있어야 한다.
// 이메일, 이름, 메시지 내용 같은 개인정보는 보내지 않는다(Google 정책). 아래 타입에 없는 값은 넣지 않는다.
type UserRole = "admin" | "creator" | "public";

type AnalyticsEvent =
  | { event: "sign_up"; method: "email"; user_role: UserRole }
  | { event: "login"; method: "email"; user_role: UserRole | "unknown" }
  | { event: "chat_message_send"; chat_type: "bubble_room" | "creator_talk" };

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

export function trackEvent(payload: AnalyticsEvent) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}
