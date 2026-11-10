// 버블 대화 규칙. 숫자를 바꿀 때는 이 파일만 고치면 된다.
export const BUBBLE_POLICY = {
  // 글자 수는 한글 기준으로 센다(코드포인트 단위).
  subscriberMaxChars: 200,
  creatorMaxChars: 500,

  // 본인이 보낸 메시지를 지울 수 있는 시간
  deleteWindowMs: 10 * 60 * 1000,

  // 도배 방지: 연속 전송 간격과 시간창당 최대 개수
  minIntervalMs: 10 * 1000,
  windowMs: 10 * 60 * 1000,
  maxPerWindow: 15,

  // AI 미리보기에 넣는 최근 대화 개수와 메시지당 자르는 길이
  previewContextMessages: 10,
  previewContextCharsPerMessage: 200,
} as const;

export function maxCharsFor(role: "admin" | "creator" | "public"): number {
  return role === "public" ? BUBBLE_POLICY.subscriberMaxChars : BUBBLE_POLICY.creatorMaxChars;
}

export function validateBody(
  raw: string,
  maxChars: number,
): { ok: true; body: string } | { ok: false; error: string } {
  const body = raw.trim();
  if (body.length === 0) {
    return { ok: false, error: "메시지를 입력해 주세요." };
  }
  const length = Array.from(body).length;
  if (length > maxChars) {
    return { ok: false, error: `메시지는 ${maxChars}자까지 보낼 수 있어요. (현재 ${length}자)` };
  }
  return { ok: true, body };
}
