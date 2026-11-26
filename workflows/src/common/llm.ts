// Claude 호출을 한곳에 모은다. 모델, effort, 거절 처리, 캐싱, 비용 기록을 여기서만 정한다.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { requireEnv } from "./config";

export const DEFAULT_MODEL = "claude-opus-5-5";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

// 100만 토큰당 달러: 입력, 출력, 캐시 읽기, 캐시 쓰기
const PRICES: Record<string, [number, number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2, 5],
  "claude-opus-5": [5, 25, 0.5, 6.25],
  "claude-opus-4-8": [5, 25, 0.5, 6.25],
  "claude-sonnet-5-5": [2, 10, 0.1, 2.5],
  "claude-sonnet-5": [2, 10, 0.2, 2.5],
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
};

export interface LlmUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number | null;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    requireEnv("ANTHROPIC_API_KEY");
    client = new Anthropic();
  }
  return client;
}

function toUsage(model: string, usage: Anthropic.Beta.BetaUsage): LlmUsage {
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const price = PRICES[model];
  const costUsd = price
    ? (usage.input_tokens * price[0] + usage.output_tokens * price[1] + read * price[2] + write * price[3]) / 1_000_000
    : null;
  return {
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: read,
    cacheWriteTokens: write,
    costUsd,
  };
}

export class LlmRefusalError extends Error {
  constructor(public readonly category: string | null) {
    super(`Claude가 요청을 거절했습니다 (분류: ${category ?? "없음"})`);
  }
}

export interface AskJsonOptions<S extends z.ZodType> {
  // 캐시되는 고정 지시문. 바뀌는 값을 넣지 않는다.
  system: string;
  prompt: string;
  schema: S;
  effort?: Effort;
  model?: string;
  maxTokens?: number;
}

// Zod 스키마 모양의 JSON으로 답을 받는다.
export async function askJson<S extends z.ZodType>(
  opts: AskJsonOptions<S>,
): Promise<{ data: z.infer<S>; usage: LlmUsage }> {
  const response = await getClient().beta.messages.parse({
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    // Opus 5.5 기본 effort는 medium이라 직접 적는다.
    output_config: { effort: opts.effort ?? "high", format: betaZodOutputFormat(opts.schema) },
    // 거절되면 서버가 다른 모델로 다시 실행
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.prompt }],
  });

  const usage = toUsage(response.model, response.usage);
  console.log(
    `[llm] ${usage.model} in=${usage.inputTokens} out=${usage.outputTokens} ` +
      `cacheRead=${usage.cacheReadTokens} cost=$${usage.costUsd?.toFixed(4) ?? "?"}`,
  );

  if (response.stop_reason === "refusal") {
    throw new LlmRefusalError(response.stop_details?.category ?? null);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error(`출력이 max_tokens(${opts.maxTokens ?? 16000})에서 잘렸습니다`);
  }
  if (response.parsed_output == null) {
    throw new Error("Claude 응답이 스키마와 맞지 않습니다");
  }
  return { data: response.parsed_output as z.infer<S>, usage };
}

// 여러 호출의 토큰과 비용 합계
export function sumUsage(list: LlmUsage[]): { calls: number; costUsd: number; inputTokens: number; outputTokens: number } {
  return {
    calls: list.length,
    costUsd: list.reduce((s, u) => s + (u.costUsd ?? 0), 0),
    inputTokens: list.reduce((s, u) => s + u.inputTokens, 0),
    outputTokens: list.reduce((s, u) => s + u.outputTokens, 0),
  };
}
