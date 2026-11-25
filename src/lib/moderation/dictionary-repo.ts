// 판정 사전 관리 화면의 저장 계층. 사전(moderation_terms), DB regex(moderation_patterns), 허용 목록(moderation_allowlist).
// 단어는 관리자에게만 보인다. 권한 확인은 화면이 아니라 여기서 한다.
// 이번 범위의 쓰기는 허용 목록 추가·삭제뿐이다. 사전 켜고 끄기와 단어 추가는 아직 적재 스크립트(scripts/moderation-terms.mjs)로만 한다.
import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { moderationAllowlist, moderationPatterns, moderationTerms } from "@/lib/schema";
import type { Viewer } from "@/lib/session";

export type DictTerm = { id: number; term: string; lang: string; tag: string; source: string; version: string; enabled: boolean };
export type DictPattern = { id: number; name: string; pattern: string; version: string; enabled: boolean };
export type DictAllow = { id: number; term: string; note: string | null; createdAt: Date };

export type Dictionary = { terms: DictTerm[]; patterns: DictPattern[]; allowlist: DictAllow[] };

const isAdmin = (viewer: Viewer | null) => viewer?.role === "admin";

export async function readDictionary(viewer: Viewer): Promise<Dictionary | null> {
  if (!isAdmin(viewer)) return null;
  const [terms, patterns, allowlist] = await Promise.all([
    db.select().from(moderationTerms).orderBy(asc(moderationTerms.lang), asc(moderationTerms.term)),
    db.select().from(moderationPatterns).orderBy(asc(moderationPatterns.name)),
    db.select().from(moderationAllowlist).orderBy(asc(moderationAllowlist.term)),
  ]);
  return { terms, patterns, allowlist };
}

// 허용 목록 한 줄의 최대 길이. 정상 단어 예외라 짧다.
const ALLOW_MAX = 40;
const NOTE_MAX = 200;

export type DictWriteResult = { ok: true } | { ok: false; error: string };

export async function addAllowTerm(viewer: Viewer, rawTerm: string, rawNote: string): Promise<DictWriteResult> {
  if (!isAdmin(viewer)) return { ok: false, error: "관리자만 바꿀 수 있어요." };
  // 판정 쪽(buildLexicon)이 NFKC와 소문자로 맞춰 비교하므로 저장도 같은 형태로 한다.
  const term = rawTerm.normalize("NFKC").toLowerCase().trim();
  const note = rawNote.trim().slice(0, NOTE_MAX);
  if (!term) return { ok: false, error: "단어를 입력해 주세요." };
  if (term.length > ALLOW_MAX) return { ok: false, error: `${ALLOW_MAX}자 이하로 입력해 주세요.` };
  const inserted = await db
    .insert(moderationAllowlist)
    .values({ term, note: note ? `${note} (${viewer.name})` : `추가: ${viewer.name}` })
    .onConflictDoNothing({ target: moderationAllowlist.term })
    .returning({ id: moderationAllowlist.id });
  return inserted.length ? { ok: true } : { ok: false, error: "이미 허용 목록에 있어요." };
}

export async function removeAllowTerm(viewer: Viewer, id: number): Promise<DictWriteResult> {
  if (!isAdmin(viewer)) return { ok: false, error: "관리자만 바꿀 수 있어요." };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청이에요." };
  const deleted = await db
    .delete(moderationAllowlist)
    .where(eq(moderationAllowlist.id, id))
    .returning({ id: moderationAllowlist.id });
  return deleted.length ? { ok: true } : { ok: false, error: "이미 지워졌어요." };
}

// 화면 위 요약에 쓰는 개수. 판정 서버가 실제로 읽는 것은 enabled인 단어와 regex, 허용 목록 전체다.
export function summarize(d: Dictionary) {
  const on = d.terms.filter((t) => t.enabled).length;
  return { terms: d.terms.length, termsOn: on, patterns: d.patterns.length, patternsOn: d.patterns.filter((p) => p.enabled).length, allow: d.allowlist.length };
}
