import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth, pool } from "@/lib/auth";

// 가입 직후 본인 계정을 구독자(public)에서 크리에이터로만 바꾼다.
// admin으로는 바꿀 수 없고, 이미 다른 역할이면 아무것도 바꾸지 않는다.
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { role } = (await request.json().catch(() => ({}))) as { role?: string };
  if (role !== "creator") {
    return NextResponse.json({ error: "허용되지 않은 역할입니다." }, { status: 400 });
  }

  await pool.query(
    `update "user" set role = 'creator'
     where id = $1 and coalesce(role, 'public') = 'public'`,
    [session.user.id],
  );
  return NextResponse.json({ ok: true });
}
