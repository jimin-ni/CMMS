"use server";

// 힙 방의 쪽지·방명록 신고, 작성자 차단(크리에이터·전체), 내려간 글 원문 보기 (문서 8장, 9장).
// 화면은 글 id만 보낸다. 작성자는 서버가 찾는다 (익명 쪽지도). 권한은 moderation/repo.ts의 쿼리에서 다시 확인한다.
import { getViewer } from "@/lib/session";
import { blockHeapAuthor, reportHeapPost, revealHeapOriginal, type HeapSurface } from "@/lib/moderation/repo";
import { blockAuthorOf, removeMyBlock, type HeapBlockResult } from "./blocks-repo";

export type HeapModerationResult = { ok: true; body?: string } | { ok: false; error: string };

const isSurface = (value: unknown): value is HeapSurface => value === "note" || value === "guestbook";

function done(r: { ok: boolean; error?: string }): HeapModerationResult {
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "처리하지 못했어요." };
}

export async function reportHeapPostAction(surface: HeapSurface, id: string): Promise<HeapModerationResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  if (!isSurface(surface)) return { ok: false, error: "잘못된 요청이에요." };
  return done(await reportHeapPost(surface, String(id), viewer));
}

export async function blockHeapAuthorAction(surface: HeapSurface, id: string): Promise<HeapModerationResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  if (!isSurface(surface)) return { ok: false, error: "잘못된 요청이에요." };
  return done(await blockHeapAuthor(surface, String(id), viewer));
}

export async function revealHeapOriginalAction(surface: HeapSurface, id: string): Promise<HeapModerationResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  if (!isSurface(surface)) return { ok: false, error: "잘못된 요청이에요." };
  const body = await revealHeapOriginal(surface, String(id), viewer);
  return body === null ? { ok: false, error: "원문을 볼 수 없어요." } : { ok: true, body };
}

// 개인 차단: 누구나 (로그인). 그 사람의 쪽지·방명록·방 안 캐릭터를 나에게서 가린다. 돌려주는 id는 이 방에서 바로 뺄 글.
export async function hidePersonAction(surface: HeapSurface, id: string): Promise<HeapBlockResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  if (!isSurface(surface)) return { ok: false, error: "잘못된 요청이에요." };
  return blockAuthorOf(surface, String(id), viewer.id);
}

// 마이페이지에서 가리기 풀기
export async function unhidePersonAction(blockId: string): Promise<HeapModerationResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "로그인이 필요합니다." };
  return (await removeMyBlock(viewer.id, String(blockId))) ? { ok: true } : { ok: false, error: "이미 풀린 차단이에요." };
}
