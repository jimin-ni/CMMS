// 판정 모듈의 서버 진입점. 사전·regex를 DB에서 읽어 메모리에 두고, 실제 OpenAI를 붙여 screen()을 부른다.
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { moderationAllowlist, moderationPatterns, moderationTerms } from "@/lib/schema";
import { buildLexicon, EMPTY_LEXICON, type Lexicon } from "./lexicon";
import { moderateWithOpenAI } from "./openai";
import { MODERATION_POLICY } from "./policy";
import { screen, type ScreenInput, type ScreenResult } from "./screen";

let cache: { lexicon: Lexicon; patterns: { name: string; re: RegExp }[]; loadedAt: number } | null = null;
let loading: Promise<void> | null = null;

async function load() {
  const [terms, allow, patterns] = await Promise.all([
    db
      .select({ term: moderationTerms.term, lang: moderationTerms.lang, tag: moderationTerms.tag, version: moderationTerms.version })
      .from(moderationTerms)
      .where(eq(moderationTerms.enabled, true)),
    db.select({ term: moderationAllowlist.term }).from(moderationAllowlist),
    db
      .select({ name: moderationPatterns.name, pattern: moderationPatterns.pattern, version: moderationPatterns.version })
      .from(moderationPatterns)
      .where(eq(moderationPatterns.enabled, true)),
  ]);
  // 사전 버전: 들어 있는 항목 버전 중 가장 큰 값과 개수
  const version = terms.length
    ? `${terms.map((t) => t.version).sort().at(-1)}#${terms.length}`
    : "none";
  const compiled: { name: string; re: RegExp }[] = [];
  for (const p of patterns) {
    try {
      compiled.push({ name: p.name, re: new RegExp(p.pattern, "iu") });
    } catch {
      console.warn("[moderation] 잘못된 regex는 건너뜀", p.name);
    }
  }
  cache = {
    lexicon: buildLexicon(terms, allow.map((a) => a.term), version),
    patterns: compiled,
    loadedAt: Date.now(),
  };
}

// 처음 판정할 때 읽고 5분마다 다시 읽는다. 다시 읽는 중에는 예전 값을 쓴다.
async function getLists() {
  const stale = !cache || Date.now() - cache.loadedAt > MODERATION_POLICY.lexiconReloadMs;
  if (stale && !loading) {
    loading = load()
      .catch((error) => {
        console.warn("[moderation] 사전을 읽지 못함", error);
        if (cache) cache.loadedAt = Date.now();
      })
      .finally(() => {
        loading = null;
      });
  }
  if (!cache && loading) await loading;
  return cache ?? { lexicon: EMPTY_LEXICON, patterns: [], loadedAt: 0 };
}

export async function screenText(input: ScreenInput): Promise<ScreenResult> {
  const lists = await getLists();
  return screen(input, { lexicon: lists.lexicon, extraPatterns: lists.patterns, moderate: moderateWithOpenAI });
}
