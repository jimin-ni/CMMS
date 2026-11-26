// LLM 호출을 한곳에 모은다. 공급자, 모델, effort, 거절 처리, 비용 기록을 여기서만 정한다.
// 공급자는 AGENT_LLM_PROVIDER(openai | anthropic, 기본 openai), 모델은 AGENT_LLM_MODEL로 바꾼다.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { requireEnv } from "./config";

export type Provider = "openai" | "anthropic";
export type Effort = "low" | "medium" | "high";

const DEFAULT_MODEL: Record<Provider, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-opus-5-5",
};

// 100만 토큰당 달러: 입력, 출력, 캐시 읽기. 없는 모델은 비용을 null로 둔다.
const PRICES: Record<string, [number, number, number]> = {
  "gpt-5-mini": [0.25, 2, 0.025],
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-sonnet-5-5": [2, 10, 0.1],
};

export interface LlmUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number | null;
}

export class LlmRefusalError extends Error {
  constructor(public readonly detail: string | null) {
    super(`LLM이 요청을 거절했습니다 (${detail ?? "이유 없음"})`);
  }
}

export interface AskJsonOptions<S extends z.ZodType> {
  // 고정 지시문. 바뀌는 값을 넣지 않아야 캐시된다.
  system: string;
  prompt: string;
  schema: S;
  effort?: Effort;
  maxTokens?: number;
}

function provider(): Provider {
  const p = process.env.AGENT_LLM_PROVIDER ?? "openai";
  if (p !== "openai" && p !== "anthropic") throw new Error(`AGENT_LLM_PROVIDER 값이 잘못됐습니다: ${p}`);
  return p;
}

// 모델명이 날짜 붙은 이름(gpt-5-mini-2025-08-07)으로 와도 가격표를 찾는다.
function priceOf(model: string): [number, number, number] | undefined {
  const key = Object.keys(PRICES).find((k) => model === k || model.startsWith(`${k}-20`));
  return key ? PRICES[key] : undefined;
}

function toUsage(model: string, input: number, output: number, cached: number): LlmUsage {
  const price = priceOf(model);
  const costUsd = price ? (input * price[0] + output * price[1] + cached * price[2]) / 1_000_000 : null;
  return { model, inputTokens: input, outputTokens: output, cacheReadTokens: cached, costUsd };
}

let openai: OpenAI | null = null;
let anthropic: Anthropic | null = null;

async function askOpenAI<S extends z.ZodType>(opts: AskJsonOptions<S>, model: string) {
  // 스크리닝용 OPENAI_API_KEY와 한도를 나누려고 키를 따로 둔다.
  openai ??= new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY_CODE_REVIEW") });
  const res = await openai.responses.parse({
    model,
    instructions: opts.system,
    input: opts.prompt,
    max_output_tokens: opts.maxTokens ?? 16000,
    reasoning: { effort: opts.effort ?? "high" },
    text: { format: zodTextFormat(opts.schema, "result") },
  });
  // OpenAI input_tokens에는 캐시 읽기가 들어 있어 뺀다.
  const cached = res.usage?.input_tokens_details?.cached_tokens ?? 0;
  const usage = toUsage(res.model, (res.usage?.input_tokens ?? 0) - cached, res.usage?.output_tokens ?? 0, cached);

  const refusal = res.output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .find((c) => c.type === "refusal");
  if (refusal) throw new LlmRefusalError(refusal.refusal);
  if (res.status === "incomplete") throw new Error(`응답이 끝나지 않았습니다: ${res.incomplete_details?.reason ?? "?"}`);
  return { parsed: res.output_parsed, usage };
}

async function askAnthropic<S extends z.ZodType>(opts: AskJsonOptions<S>, model: string) {
  requireEnv("ANTHROPIC_API_KEY");
  anthropic ??= new Anthropic();
  const res = await anthropic.beta.messages.parse({
    model,
    max_tokens: opts.maxTokens ?? 16000,
    // Opus 5.5 기본 effort는 medium이라 직접 적는다.
    output_config: { effort: opts.effort ?? "high", format: betaZodOutputFormat(opts.schema) },
    // 거절되면 서버가 다른 모델로 다시 실행
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.prompt }],
  });
  const usage = toUsage(res.model, res.usage.input_tokens, res.usage.output_tokens, res.usage.cache_read_input_tokens ?? 0);

  if (res.stop_reason === "refusal") throw new LlmRefusalError(res.stop_details?.category ?? null);
  if (res.stop_reason === "max_tokens") throw new Error("응답이 max_tokens에서 잘렸습니다");
  return { parsed: res.parsed_output, usage };
}

// Zod 스키마 모양의 JSON으로 답을 받는다.
export async function askJson<S extends z.ZodType>(
  opts: AskJsonOptions<S>,
): Promise<{ data: z.infer<S>; usage: LlmUsage }> {
  const p = provider();
  const model = process.env.AGENT_LLM_MODEL || DEFAULT_MODEL[p];
  const { parsed, usage } = p === "openai" ? await askOpenAI(opts, model) : await askAnthropic(opts, model);
  console.log(
    `[llm] ${usage.model} in=${usage.inputTokens} out=${usage.outputTokens} ` +
      `cacheRead=${usage.cacheReadTokens} cost=$${usage.costUsd?.toFixed(4) ?? "?"}`,
  );
  if (parsed == null) throw new Error("LLM 응답이 스키마와 맞지 않습니다");
  return { data: parsed as z.infer<S>, usage };
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
