// 사전 비교 (문서 5-2). 단어 목록은 DB(moderation_terms)에 두고 공개 저장소에는 넣지 않는다.
// 이 파일은 순수 함수만 둔다. DB에서 읽는 부분은 lexicon-db.ts.
import type { Normalized } from "./normalize";

export type LexiconTerm = {
  term: string;
  lang: string; // "en", "ko" 등
  // 근거 종류. 판정 기록에는 단어 대신 이 값을 남긴다. 예: "sev5", "hate"
  tag: string;
};

export type Lexicon = {
  version: string;
  // 영어 등 띄어쓰기 언어: 단어 경계로 비교 (단어 하나 또는 여러 단어 구)
  words: Map<string, LexiconTerm>;
  phrases: { tokens: string[]; term: LexiconTerm }[];
  // 한국어 보조 사전: 공백을 지운 글에서 부분 일치
  substrings: LexiconTerm[];
  allow: Set<string>;
};

export const EMPTY_LEXICON: Lexicon = {
  version: "none",
  words: new Map(),
  phrases: [],
  substrings: [],
  allow: new Set(),
};

const SUBSTRING_LANGS = new Set(["ko", "ja", "zh"]);

export function buildLexicon(terms: LexiconTerm[], allowlist: string[], version: string): Lexicon {
  const lex: Lexicon = { version, words: new Map(), phrases: [], substrings: [], allow: new Set() };
  for (const a of allowlist) lex.allow.add(a.normalize("NFKC").toLowerCase().trim());
  for (const t of terms) {
    const term = t.term.normalize("NFKC").toLowerCase().trim();
    if (!term) continue;
    if (SUBSTRING_LANGS.has(t.lang)) {
      lex.substrings.push({ ...t, term: term.replace(/\s+/g, "") });
      continue;
    }
    const tokens = term.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (tokens.length === 1) lex.words.set(tokens[0], { ...t, term: tokens[0] });
    else if (tokens.length > 1) lex.phrases.push({ tokens, term: { ...t, term } });
  }
  return lex;
}

// 3글자 이하 짧은 단어는 정확히 같을 때만, 그보다 길면 흔한 어미(s, es, ed, ing, er)까지 본다.
const SUFFIXES = ["s", "es", "ed", "ing", "er", "ers", "y"];

function lookupWord(lex: Lexicon, token: string): LexiconTerm | null {
  if (lex.allow.has(token)) return null;
  const exact = lex.words.get(token);
  if (exact) return exact;
  for (const suf of SUFFIXES) {
    if (token.length - suf.length > 3 && token.endsWith(suf)) {
      const hit = lex.words.get(token.slice(0, -suf.length));
      if (hit) return hit;
    }
  }
  return null;
}

export function matchLexicon(lex: Lexicon, n: Normalized): LexiconTerm | null {
  for (let i = 0; i < n.tokens.length; i++) {
    const hit = lookupWord(lex, n.tokens[i]) ?? lookupWord(lex, n.squeezedTokens[i]);
    if (hit) return hit;
  }
  for (const p of lex.phrases) {
    const len = p.tokens.length;
    for (let i = 0; i + len <= n.tokens.length; i++) {
      if (p.tokens.every((t, k) => n.tokens[i + k] === t)) return p.term;
    }
  }
  for (const s of lex.substrings) {
    if (n.compact.includes(s.term) && ![...lex.allow].some((a) => a.includes(s.term) && n.compact.includes(a))) {
      return s;
    }
  }
  return null;
}
