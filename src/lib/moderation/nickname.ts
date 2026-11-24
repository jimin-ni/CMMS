// 닉네임 판정. 가입 전 확인 API와 Better Auth 저장 직전 훅이 같은 함수를 쓴다.
import "server-only";
import { nicknameLength, NICKNAME_MAX, type NicknameStatus } from "@/lib/nickname";
import { screenText } from "./server";

// key: OpenAI 사용자당 호출 상한을 셀 때 쓰는 값. 가입 전에는 계정이 없어 IP 등을 넘긴다.
export async function checkNickname(name: string, key: string): Promise<NicknameStatus> {
  const length = nicknameLength(name);
  if (length === 0) return "empty";
  if (length > NICKNAME_MAX) return "too_long";
  // 닉네임은 모두에게 보이므로 공개(publish)만 통과로 본다. 연락처, 검토 대상도 거절한다.
  const result = await screenText({ text: name.trim(), surface: "nickname", authorId: `nickname:${key}` });
  return result.outcome === "publish" ? "ok" : "rejected";
}

// x-forwarded-for의 첫 칸은 클라이언트가 마음대로 쓸 수 있다. Render 프록시가 맨 뒤에 붙인 값을 쓴다.
export function clientKey(headers: Headers | undefined | null): string {
  const hops = (headers?.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  return hops.at(-1) ?? "unknown";
}
