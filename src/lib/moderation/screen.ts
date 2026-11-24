// 판정 모듈 (문서 5-5). 세 표면(채팅, 쪽지, 방명록)이 같은 결과를 내도록 판정은 이 함수 하나로만 한다.
// DB에 쓰지 않고 결과만 돌려준다. 방 주인인지, 연락처가 처음인지는 결과를 받은 repo 계층이 정한다.
import { createHash } from "node:crypto";
import { findContact } from "./contact";
import { matchLexicon, type Lexicon } from "./lexicon";
import { normalize } from "./normalize";
import type { Moderate, OpenAIModeration } from "./openai";
import { MODERATION_POLICY } from "./policy";
import { findPattern } from "./patterns";

export type Surface = "chat" | "note" | "guestbook" | "nickname";

export type ScreenInput = {
  text: string; // 원문
  surface: Surface;
  authorId: string;
};

export type ScreenOutcome =
  | "publish" // 공개 저장
  | "block" // 위반. 숨김 저장 + 경고
  | "contact" // 연락처. 처음이면 경고 없이 숨김, 2번째부터 block과 같음 (repo가 정함)
  | "hold_self_harm" // 확인 필요. 숨김 저장, 경고 없음, 관리자만 원문
  | "hold_review"; // 오탐 위험 카테고리. 숨김 저장, 경고 없음, 검토 목록

export type OpenAIStatus = OpenAIModeration["status"] | "skipped_earlier_hit";

export type ScreenResult = {
  outcome: ScreenOutcome;
  // 근거 종류만. 예: "lexicon:en:sev5", "regex:contact:phone", "openai:harassment"
  reasons: string[];
  scores: Record<string, number> | null;
  openai: OpenAIStatus;
  versions: { lexicon: string; patterns: string; thresholds: string; model: string | null };
  normalizedHash: string;
};

export type ScreenDeps = {
  lexicon: Lexicon;
  moderate: Moderate;
  // DB(moderation_patterns)에 둔 우회 표기 regex. 정규화한 글과 원문 양쪽에 돌린다.
  extraPatterns?: { name: string; re: RegExp }[];
  // 단계별 진행 기록. 개발 중 콘솔 확인용 (server.ts). 걸린 사전 단어는 넘기지 않고 근거 종류만 넘긴다.
  trace?: (step: TraceStep) => void;
};

export type TraceStep =
  | { stage: "lexicon" | "regex" | "contact"; hit: string | null }
  | { stage: "openai"; status: OpenAIStatus; ms: number; flagged?: string[] }
  | { stage: "decision"; outcome: ScreenOutcome; reasons: string[] };

const P = MODERATION_POLICY;

export function hashNormalized(text: string): string {
  return createHash("sha256").update(normalize(text).text).digest("hex");
}

// OpenAI 결과를 우리 처리 묶음으로 바꾼다 (문서 5-4 표).
export function decideOpenAI(r: Extract<OpenAIModeration, { status: "called" }>): {
  outcome: ScreenOutcome;
  reasons: string[];
} {
  const hit = (c: string) => r.categories[c] === true;
  const hard = P.hardBlockCategories.filter(
    (c) => hit(c) || (r.scores[c] ?? 0) >= (P.hardBlockScoreFloor[c] ?? Infinity),
  );
  if (hard.length) return { outcome: "block", reasons: hard.map((c) => `openai:${c}`) };

  // 자해는 점수 기준 카테고리와 harassment보다 먼저 본다. 자해 글은 경고 없이 관리자만 봐야 하는데,
  // 자해 글에 violence가 함께 붙는 경우가 많다 (평가셋 18-1).
  const selfHarm = P.selfHarmCategories.filter(hit);
  if (selfHarm.length) return { outcome: "hold_self_harm", reasons: selfHarm.map((c) => `openai:${c}`) };

  const scored = Object.entries(P.scoreThresholds)
    .filter(([c, th]) => (th === null ? hit(c) : (r.scores[c] ?? 0) >= th))
    .map(([c]) => c);
  if (scored.length) return { outcome: "block", reasons: scored.map((c) => `openai:${c}`) };

  if (hit("harassment")) {
    return { outcome: P.harassmentMode === "block" ? "block" : "hold_review", reasons: ["openai:harassment"] };
  }

  return { outcome: "publish", reasons: [] };
}

export async function screen(input: ScreenInput, deps: ScreenDeps): Promise<ScreenResult> {
  const n = normalize(input.text);
  const base = {
    normalizedHash: createHash("sha256").update(n.text).digest("hex"),
    versions: {
      lexicon: deps.lexicon.version,
      patterns: P.versions.patterns,
      thresholds: P.versions.thresholds,
      model: null as string | null,
    },
  };
  const early = (outcome: ScreenOutcome, reason: string): ScreenResult => ({
    ...base,
    outcome,
    reasons: [reason],
    scores: null,
    openai: "skipped_earlier_hit",
  });

  const trace = deps.trace ?? (() => {});
  const done = (r: ScreenResult): ScreenResult => {
    trace({ stage: "decision", outcome: r.outcome, reasons: r.reasons });
    return r;
  };

  // 싼 것부터. 앞에서 걸리면 뒤는 부르지 않는다.
  const term = matchLexicon(deps.lexicon, n);
  const lexiconHit = term ? `lexicon:${term.lang}:${term.tag}` : null;
  trace({ stage: "lexicon", hit: lexiconHit });
  if (lexiconHit) return done(early("block", lexiconHit));

  let patternHit: string | null = null;
  const pattern = findPattern(n.text);
  if (pattern) patternHit = `regex:${pattern}`;
  else {
    const db = (deps.extraPatterns ?? []).find((p) => p.re.test(n.text) || p.re.test(input.text));
    if (db) patternHit = `regex:db:${db.name}`;
  }
  trace({ stage: "regex", hit: patternHit });
  if (patternHit) return done(early("block", patternHit));

  const contact = findContact(input.text);
  const contactHit = contact ? `regex:contact:${contact}` : null;
  trace({ stage: "contact", hit: contactHit });
  if (contactHit) return done(early("contact", contactHit));

  const started = Date.now();
  const ai = await deps.moderate(input.text, input.authorId);
  if (ai.status !== "called") {
    trace({ stage: "openai", status: ai.status, ms: Date.now() - started });
    // 판정 실패: 사전·regex를 통과했으므로 공개 (문서 6-4)
    return done({ ...base, outcome: "publish", reasons: [], scores: null, openai: ai.status });
  }
  trace({
    stage: "openai",
    status: "called",
    ms: Date.now() - started,
    flagged: Object.entries(ai.categories)
      .filter(([, v]) => v)
      .map(([c]) => `${c}=${(ai.scores[c] ?? 0).toFixed(2)}`),
  });
  const decided = decideOpenAI(ai);
  return done({
    ...base,
    versions: { ...base.versions, model: P.openai.model },
    outcome: decided.outcome,
    reasons: decided.reasons,
    scores: ai.scores,
    openai: "called",
  });
}
