// 판정 모듈의 서버 진입점. 사전·regex를 DB에서 읽어 메모리에 두고, 실제 OpenAI를 붙여 screen()을 부른다.
import "server-only";
import { db } from "@/lib/db";
import { EMPTY_LEXICON, type Lexicon } from "./lexicon";
import { moderateWithOpenAI } from "./openai";
import { loadScreenLists } from "./persist";
import { MODERATION_POLICY } from "./policy";
import { screen, type ScreenInput, type ScreenResult, type TraceStep } from "./screen";

let cache: { lexicon: Lexicon; patterns: { name: string; re: RegExp }[]; loadedAt: number } | null = null;
let loading: Promise<void> | null = null;

// 읽는 쿼리는 persist.ts에 있다 (Render Workflow의 사후 재판정과 같은 사전을 쓰기 위해).
async function load() {
  const { lexicon, patterns, counts } = await loadScreenLists(db);
  if (process.env.NODE_ENV === "development" || process.env.MODERATION_DEBUG === "1") {
    console.log(`[moderation] 사전 읽음: 단어 ${counts.terms}개, 허용 목록 ${counts.allow}개, DB regex ${patterns.length}개`);
  }
  cache = { lexicon, patterns, loadedAt: Date.now() };
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

// 판정 단계 콘솔 로그. npm run dev(development)에서 켜지고, 운영에서는 MODERATION_DEBUG=1일 때만 켠다.
// 글 원문과 걸린 사전 단어는 찍지 않는다. 근거 종류, OpenAI 상태·시간·걸린 카테고리만 찍는다.
const DEBUG = process.env.NODE_ENV === "development" || process.env.MODERATION_DEBUG === "1";

const STAGE_LABEL: Record<TraceStep["stage"], string> = {
  lexicon: "1 사전",
  regex: "2 regex",
  contact: "3 연락처",
  openai: "4 OpenAI",
  decision: "결과",
};

function makeTrace(input: ScreenInput, lexiconVersion: string) {
  const id = Math.random().toString(36).slice(2, 7);
  const head = `[moderation ${id}] ${input.surface} author=${input.authorId.slice(0, 8)} chars=${Array.from(input.text).length}`;
  console.log(`${head} 시작 (사전 ${lexiconVersion})`);
  return (step: TraceStep) => {
    const label = STAGE_LABEL[step.stage];
    if (step.stage === "openai") {
      const flagged = step.flagged?.length ? ` 걸림 ${step.flagged.join(", ")}` : "";
      console.log(`${head} ${label}: ${step.status} ${step.ms}ms${flagged}`);
    } else if (step.stage === "decision") {
      console.log(`${head} ${label}: ${step.outcome}${step.reasons.length ? ` (${step.reasons.join(", ")})` : ""}`);
    } else {
      console.log(`${head} ${label}: ${step.hit ?? "통과"}`);
    }
  };
}

export async function screenText(input: ScreenInput): Promise<ScreenResult> {
  const lists = await getLists();
  return screen(input, {
    lexicon: lists.lexicon,
    extraPatterns: lists.patterns,
    // 방명록 이름(12자)은 짧아 OpenAI 판정이 흔들린다. 평가셋으로 확인하기 전까지 사전·regex만 쓴다 (문서 4장).
    moderate: input.surface === "guestbook" ? async () => ({ status: "skipped_surface" }) : moderateWithOpenAI,
    trace: DEBUG ? makeTrace(input, lists.lexicon.version) : undefined,
  });
}
