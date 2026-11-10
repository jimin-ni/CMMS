// 가입 화면에서 직접 고를 수 있는 역할. admin은 여기에 포함하지 않는다.
export const SIGNUP_ROLES = ["public", "creator"] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

// 서버에서 최종 검사한다. 허용되지 않은 값(예: admin)은 모두 public으로 처리한다.
export function sanitizeSignupRole(value: unknown): SignupRole {
  return typeof value === "string" && (SIGNUP_ROLES as readonly string[]).includes(value)
    ? (value as SignupRole)
    : "public";
}
