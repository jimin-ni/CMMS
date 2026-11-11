import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { creatorAvatars } from "@/lib/schema";

// 크리에이터 프로필 사진. 크리에이터만 등록하고, 로그인한 사람에게 /api/creator/avatar/[userId]로 보여준다.

// DB 제약(512KB)과 같은 값. Server Action 기본 요청 한도(1MB) 안에 들어온다.
export const AVATAR_MAX_BYTES = 512 * 1024;

export type AvatarType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

// 브라우저가 알려 주는 MIME이나 확장자는 믿지 않고 파일 앞부분으로 형식을 판별한다.
// SVG는 스크립트를 담을 수 있어 받지 않는다.
export function detectImageType(bytes: Uint8Array): AvatarType | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

// 사진을 바꾸면 주소의 v 값이 바뀌어 브라우저 캐시를 새로 받는다.
export function avatarUrl(userId: string, updatedAt: Date | null | undefined): string | null {
  return updatedAt ? `/api/creator/avatar/${encodeURIComponent(userId)}?v=${updatedAt.getTime()}` : null;
}

export async function saveAvatar(userId: string, content: Buffer, contentType: AvatarType) {
  await db
    .insert(creatorAvatars)
    .values({ userId, content, contentType })
    .onConflictDoUpdate({
      target: creatorAvatars.userId,
      set: { content, contentType, updatedAt: sql`now()` },
    });
}

export async function deleteAvatar(userId: string) {
  await db.delete(creatorAvatars).where(eq(creatorAvatars.userId, userId));
}

export async function getAvatar(userId: string) {
  const rows = await db
    .select({ content: creatorAvatars.content, contentType: creatorAvatars.contentType })
    .from(creatorAvatars)
    .where(eq(creatorAvatars.userId, userId));
  return rows[0] ?? null;
}

export async function getAvatarUrl(userId: string): Promise<string | null> {
  const rows = await db
    .select({ updatedAt: creatorAvatars.updatedAt })
    .from(creatorAvatars)
    .where(eq(creatorAvatars.userId, userId));
  return avatarUrl(userId, rows[0]?.updatedAt);
}
