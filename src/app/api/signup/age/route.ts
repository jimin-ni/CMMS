import { NextResponse } from "next/server";
import { getViewer } from "@/lib/session";
import { recordAgeCheck } from "@/lib/moderation/repo";

// 가입 직후 "만 14세 이상인가요?" 답을 한 번만 저장한다 (문서 3-3).
// 이미 답한 계정은 바꾸지 않는다. 바꾸는 것은 관리자만 할 수 있다.
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { is14OrOlder } = (await request.json().catch(() => ({}))) as { is14OrOlder?: unknown };
  if (typeof is14OrOlder !== "boolean") {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  await recordAgeCheck(viewer.id, is14OrOlder);
  return NextResponse.json({ ok: true });
}
