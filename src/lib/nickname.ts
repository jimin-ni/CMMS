// 닉네임 규칙. 가입 화면(클라이언트)과 서버 검사가 같은 값을 쓴다.
// 길이 제한은 새로 정하거나 바꾸는 닉네임에만 적용한다. 이미 10자를 넘는 기존 계정은 그대로 둔다.
export const NICKNAME_MAX = 10;

// 글자 수는 코드 포인트 기준으로 센다. 한글 한 글자, 이모지 한 개를 1자로 본다.
export function nicknameLength(name: string): number {
  return Array.from(name.trim()).length;
}

export type NicknameStatus = "ok" | "empty" | "too_long" | "rejected";

export const NICKNAME_TEXT = {
  ok: "Nickname available.",
  empty: "Enter a nickname.",
  too_long: `Use ${NICKNAME_MAX} characters or fewer.`,
  rejected: "This nickname breaks our community rules.",
  rulesNotice: "Nicknames that violate our community rules may be restricted.",
} as const satisfies Record<NicknameStatus | "rulesNotice", string>;
