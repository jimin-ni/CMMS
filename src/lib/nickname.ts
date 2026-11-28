// 닉네임 규칙. 가입 화면(클라이언트)과 서버 검사가 같은 값을 쓴다.
// 길이 제한은 새로 정하거나 바꾸는 닉네임에만 적용한다. 이미 10자를 넘는 기존 계정은 그대로 둔다.
import type { Language } from "@/lib/settings/prefs";

export const NICKNAME_MAX = 10;

// 글자 수는 코드 포인트 기준으로 센다. 한글 한 글자, 이모지 한 개를 1자로 본다.
export function nicknameLength(name: string): number {
  return Array.from(name.trim()).length;
}

export type NicknameStatus = "ok" | "empty" | "too_long" | "rejected";

export const NICKNAME_STATUSES = ["ok", "empty", "too_long", "rejected"] as const satisfies readonly NicknameStatus[];

// 닉네임 안내 (설정의 언어별). 서버(auth.ts)는 기본 언어인 한국어 문구를 쓰고, 가입 화면은 오류 code(NICKNAME_*)로 고른 언어의 문구를 찾는다
export const NICKNAME_TEXT = {
  ko: {
    ok: "사용할 수 있는 닉네임이에요.",
    empty: "닉네임을 입력해 주세요.",
    too_long: `닉네임은 ${NICKNAME_MAX}자를 넘지 않게 입력해 주세요.`,
    rejected: "커뮤니티 가이드라인을 지키는 닉네임을 사용해 주세요.",
    rulesNotice: "커뮤니티 가이드라인을 어기는 닉네임은 제한될 수 있어요.",
  },
  en: {
    ok: "Nickname available.",
    empty: "Enter a nickname.",
    too_long: `Use ${NICKNAME_MAX} characters or fewer.`,
    rejected: "This nickname breaks our community rules.",
    rulesNotice: "Nicknames that violate our community rules may be restricted.",
  },
} as const satisfies Record<Language, Record<NicknameStatus | "rulesNotice", string>>;
