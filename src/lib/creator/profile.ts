import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { creatorProfiles } from "@/lib/schema";

// 크리에이터 성격(페르소나). AI 반응 미리보기가 참고한다.
// DB 제약(1000자)과 같은 값
export const PERSONA_MAX = 1000;

export async function getPersona(userId: string): Promise<string> {
  const rows = await db
    .select({ persona: creatorProfiles.persona })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId));
  return rows[0]?.persona ?? "";
}

export async function savePersona(userId: string, persona: string): Promise<void> {
  await db
    .insert(creatorProfiles)
    .values({ userId, persona })
    .onConflictDoUpdate({
      target: creatorProfiles.userId,
      set: { persona, updatedAt: sql`now()` },
    });
}
