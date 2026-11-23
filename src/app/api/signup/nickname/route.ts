import { NextResponse } from "next/server";
import { checkNickname, clientKey } from "@/lib/moderation/nickname";

// 가입 화면의 닉네임 확인. 로그인 전에 부른다. 결과만 돌려주고 아무것도 저장하지 않는다.
// 실제 저장 때는 Better Auth 훅(src/lib/auth.ts)이 같은 검사를 다시 한다.
export async function POST(request: Request) {
  const { name } = (await request.json().catch(() => ({}))) as { name?: unknown };
  if (typeof name !== "string") {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const status = await checkNickname(name, clientKey(request.headers));
  return NextResponse.json({ status });
}
