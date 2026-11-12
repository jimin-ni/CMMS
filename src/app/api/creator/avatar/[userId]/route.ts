import { getAvatar } from "@/lib/creator/avatar";
import { getViewer } from "@/lib/session";

// 크리에이터 프로필 사진. 로그인한 사람만 볼 수 있다.
// 주소에 v(수정 시각)가 붙어 있어 사진이 바뀌면 주소도 바뀌므로 오래 캐시해도 된다.
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) {
    return new Response(null, { status: 401 });
  }

  const { userId } = await params;
  const avatar = await getAvatar(userId);
  if (!avatar) {
    return new Response(null, { status: 404 });
  }

  return new Response(new Uint8Array(avatar.content), {
    headers: {
      // 저장할 때 파일 내용으로 판별한 형식만 들어 있다.
      "content-type": avatar.contentType,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
