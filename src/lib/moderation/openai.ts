// OpenAI Moderation 호출 (문서 5-4). 텍스트만 보낸다. 이름·이메일은 보내지 않는다.
// 시간 제한, 사용자당 상한, 장애 차단기를 둔다. 실패하면 호출한 쪽이 통과로 처리한다.
// 상태(상한, 차단기)는 서버 프로세스 메모리에 둔다. 인스턴스가 여러 개면 인스턴스마다 따로 센다.
import { MODERATION_POLICY } from "./policy";

export type OpenAIModeration =
  | {
      status: "called";
      flagged: boolean;
      categories: Record<string, boolean>;
      scores: Record<string, number>;
    }
  // skipped_surface: 그 표면은 OpenAI를 부르지 않는다 (방명록 이름 12자, 문서 4장 기본값)
  | { status: "skipped_no_key" | "skipped_rate" | "skipped_breaker" | "skipped_surface" | "error" | "timeout" };

export type Moderate = (text: string, userId: string) => Promise<OpenAIModeration>;

const ENDPOINT = "https://api.openai.com/v1/moderations";
const P = MODERATION_POLICY.openai;

const userCalls = new Map<string, number[]>();
let failures: number[] = [];
let breakerOpenUntil = 0;

function takeUserSlot(userId: string, now: number): boolean {
  const recent = (userCalls.get(userId) ?? []).filter((t) => now - t < P.perUserWindowMs);
  if (recent.length >= P.perUserLimit) {
    userCalls.set(userId, recent);
    return false;
  }
  recent.push(now);
  userCalls.set(userId, recent);
  return true;
}

function recordFailure(now: number) {
  failures = failures.filter((t) => now - t < P.breakerWindowMs);
  failures.push(now);
  if (failures.length >= P.breakerFailures) {
    breakerOpenUntil = now + P.breakerOpenMs;
    failures = [];
    console.warn("[moderation] OpenAI 장애 차단기 작동", { until: new Date(breakerOpenUntil).toISOString() });
  }
}

export const moderateWithOpenAI: Moderate = async (text, userId) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { status: "skipped_no_key" };
  const now = Date.now();
  if (now < breakerOpenUntil) return { status: "skipped_breaker" };
  if (!takeUserSlot(userId, now)) return { status: "skipped_rate" };

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: P.model, input: text }),
      signal: AbortSignal.timeout(P.timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      recordFailure(Date.now());
      console.warn("[moderation] OpenAI 응답 오류", res.status);
      return { status: "error" };
    }
    const data = (await res.json()) as {
      results?: { flagged: boolean; categories: Record<string, boolean>; category_scores: Record<string, number> }[];
    };
    const r = data.results?.[0];
    if (!r) {
      recordFailure(Date.now());
      return { status: "error" };
    }
    failures = [];
    return { status: "called", flagged: r.flagged, categories: r.categories, scores: r.category_scores };
  } catch (error) {
    recordFailure(Date.now());
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { status: timeout ? "timeout" : "error" };
  }
};
