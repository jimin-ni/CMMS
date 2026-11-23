// 개인 차단 (0013 heap_blocks). 보는 사람 한 명에게서만 상대의 쪽지·방명록·방 안 캐릭터를 가린다. 상대의 쓰기는 막지 않는다.
// 크리에이터 차단·전체 차단(쓰기 막기)은 moderation/repo.ts의 sanctions다.
// 화면은 글 id만 보낸다. 상대의 사용자 id는 서버 안에서만 쓰고 응답에 싣지 않는다 (익명 쪽지 작성자도).
import "server-only";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { heapBlocks, heapGuestbook, heapNotes, user } from "@/lib/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABEL_MAX = 40;

// 보는 사람이 가린 사람의 글을 빼는 조건. 로그인하지 않았으면 조건이 없다.
export function notBlockedBy(viewerId: string | null, authorColumn: AnyPgColumn): SQL | undefined {
  if (viewerId === null) return undefined;
  return sql`not exists (select 1 from ${heapBlocks}
    where ${heapBlocks.blockerId} = ${viewerId} and ${heapBlocks.blockedId} = ${authorColumn})`;
}

export type HeapBlockResult =
  | { ok: true; hiddenNoteIds: string[]; hiddenGuestbookIds: string[] }
  | { ok: false; error: string };

// 쪽지나 방명록 줄의 작성자를 가린다. 돌려주는 id는 그 방에서 지금 가려진 글 (화면이 바로 뺀다).
export async function blockAuthorOf(
  surface: "note" | "guestbook",
  postId: string,
  viewerId: string,
): Promise<HeapBlockResult> {
  if (!UUID.test(postId)) return { ok: false, error: "글을 찾을 수 없어요." };

  let target: { authorId: string; roomId: string; label: string } | null = null;
  if (surface === "note") {
    const [row] = await db
      .select({
        authorId: heapNotes.authorId,
        roomId: heapNotes.roomId,
        displayName: heapNotes.displayName,
        anonymous: heapNotes.anonymous,
        accountName: user.name,
      })
      .from(heapNotes)
      .leftJoin(user, eq(user.id, heapNotes.authorId))
      .where(eq(heapNotes.id, postId));
    // 이름은 쪽지에 보이던 그대로 (notes-repo.ts의 toNote와 같다). 익명 작성자의 계정 이름은 쓰지 않는다.
    if (row) {
      const shown = row.displayName ?? (row.anonymous ? null : row.accountName);
      target = { authorId: row.authorId, roomId: row.roomId, label: shown ?? "익명 쪽지" };
    }
  } else {
    const [row] = await db
      .select({ authorId: heapGuestbook.userId, roomId: heapGuestbook.roomId, name: heapGuestbook.name })
      .from(heapGuestbook)
      .where(eq(heapGuestbook.id, postId));
    if (row) target = { authorId: row.authorId, roomId: row.roomId, label: row.name };
  }
  if (!target) return { ok: false, error: "글을 찾을 수 없어요." };
  if (target.authorId === viewerId) return { ok: false, error: "내 글은 가릴 수 없어요." };

  await db
    .insert(heapBlocks)
    .values({ blockerId: viewerId, blockedId: target.authorId, label: Array.from(target.label).slice(0, LABEL_MAX).join("") })
    .onConflictDoNothing();

  const [notes, lines] = await Promise.all([
    db
      .select({ id: heapNotes.id })
      .from(heapNotes)
      .where(and(eq(heapNotes.roomId, target.roomId), eq(heapNotes.authorId, target.authorId))),
    db
      .select({ id: heapGuestbook.id })
      .from(heapGuestbook)
      .where(and(eq(heapGuestbook.roomId, target.roomId), eq(heapGuestbook.userId, target.authorId))),
  ]);
  return { ok: true, hiddenNoteIds: notes.map((n) => n.id), hiddenGuestbookIds: lines.map((l) => l.id) };
}

export type HeapBlockEntry = { id: string; label: string; createdAt: Date };

// 마이페이지의 가린 사람 목록. 차단 행 id와 그때 보이던 이름만.
export async function listMyBlocks(viewerId: string): Promise<HeapBlockEntry[]> {
  return db
    .select({ id: heapBlocks.id, label: heapBlocks.label, createdAt: heapBlocks.createdAt })
    .from(heapBlocks)
    .where(eq(heapBlocks.blockerId, viewerId))
    .orderBy(desc(heapBlocks.createdAt));
}

export async function removeMyBlock(viewerId: string, blockId: string): Promise<boolean> {
  if (!UUID.test(blockId)) return false;
  const rows = await db
    .delete(heapBlocks)
    .where(and(eq(heapBlocks.id, blockId), eq(heapBlocks.blockerId, viewerId)))
    .returning({ id: heapBlocks.id });
  return rows.length > 0;
}

// 내가 가린 사람의 id (presence 티켓 라우트가 userKey로 바꿔 화면에 준다. 원문 id는 내보내지 않는다).
export async function listBlockedUserIds(viewerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: heapBlocks.blockedId })
    .from(heapBlocks)
    .where(eq(heapBlocks.blockerId, viewerId));
  return rows.map((r) => r.id);
}
