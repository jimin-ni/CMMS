// 재판정용 OpenAI Moderation 호출. 웹 서비스(src/lib/moderation/openai.ts)와 같은 모델과 요청을 쓰되,
// 사용자당 상한과 장애 차단기는 두지 않는다. 뒤에서 도는 일이라 시간 제한을 넉넉히 두고, 재시도는 Render가 맡는다.
import type { Moderate } from "../../../src/lib/moderation/openai";
import { MODERATION_POLICY } from "../../../src/lib/moderation/policy";
import { requireEnv } from "../common/config";

const ENDPOINT = "https://api.openai.com/v1/moderations";
const TIMEOUT_MS = 10_000;

export const moderateForRecheck: Moderate = async (text) => {
  const apiKey = requireEnv("OPENAI_API_KEY");
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODERATION_POLICY.openai.model, input: text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("[recheck] OpenAI 응답 오류", res.status);
      return { status: "error" };
    }
    const data = (await res.json()) as {
      results?: { flagged: boolean; categories: Record<string, boolean>; category_scores: Record<string, number> }[];
    };
    const r = data.results?.[0];
    if (!r) return { status: "error" };
    return { status: "called", flagged: r.flagged, categories: r.categories, scores: r.category_scores };
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { status: timeout ? "timeout" : "error" };
  }
};
