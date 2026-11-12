// 구독자가 보내기 전에 크리에이터의 예상 반응을 얼굴 이모지로 보여주는 AI 미리보기.
// TypeSafe AI의 Jev 모델(System One API)이 크리에이터 성격과 대화 문맥을 읽고 반응 목록에서 하나를 고른다.
// TYPESAFE_API_KEY가 없거나 호출에 실패하면 "unavailable"을 돌려주고 화면에는 아무것도 띄우지 않는다.
// API 문서: https://docs.typesafe.ai/api/

import { FACE_REACTIONS, findReaction, type Reaction } from "./reactions";

export type ContextMessage = { role: "creator" | "subscriber"; body: string };

// 개발 환경(npm run dev)에서만 붙는다. Jev에 보낸 요청 본문과 받은 원본 응답(또는 오류)을 담는다.
// 요청에 구독자 초안과 대화가 들어 있으므로 운영 빌드에서는 절대 붙이지 않는다. API 키는 헤더에만 있어 담기지 않는다.
export type PreviewDebug = { request: unknown; response?: unknown; error?: string };

export type PreviewResult = (
  | { status: "ok"; reaction: Reaction; confidence: number }
  | { status: "unavailable"; reason: string }
) & { debug?: PreviewDebug };

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const TIMEOUT_MS = 5000;
const DEBUG = process.env.NODE_ENV === "development";

// 질문 이름은 모델에 전달되지 않으므로 할 일을 instructions에 모두 적는다.
const INSTRUCTIONS = `You predict how a creator will react to a fan's message in a fan chat app.
Read the creator's persona, the recent conversation, and the fan's unsent draft.
Choose the facial expression the creator would most likely show right after reading the draft.
Follow the persona closely: it describes the creator's usual mood and how they treat fans.
Messages may be in Korean.`;

export async function previewReaction(
  persona: string,
  context: ContextMessage[],
  draft: string,
): Promise<PreviewResult> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return { status: "unavailable", reason: "AI 미리보기 설정이 아직 없어요." };
  }

  const request = {
    model: process.env.BUBBLE_PREVIEW_MODEL ?? "jev-latest",
    state: {
      creator_persona: persona || "(no persona given; assume a friendly creator)",
      conversation: context.map((m) => ({ from: m.role, text: m.body })),
      fan_draft: draft,
    },
    questions: {
      reaction: {
        type: "choice",
        instructions: INSTRUCTIONS,
        criteria: Object.fromEntries(FACE_REACTIONS.map((r) => [r.id, r.description])),
      },
    },
  };
  const debug = (extra: Omit<PreviewDebug, "request">) =>
    DEBUG ? { debug: { request, ...extra } } : {};

  try {
    const res = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        status: "unavailable",
        reason: "AI 미리보기를 가져오지 못했어요.",
        ...debug({ error: `HTTP ${res.status}`, response: DEBUG ? await res.text() : undefined }),
      };
    }

    const data = (await res.json()) as {
      answers?: { reaction?: { choice?: string; confidence?: number } };
    };
    const answer = data.answers?.reaction;
    const reaction = answer?.choice ? findReaction(answer.choice) : undefined;
    if (!reaction) {
      return {
        status: "unavailable",
        reason: "AI 미리보기를 처리하지 못했어요.",
        ...debug({ response: data, error: "반응 목록에 없는 선택" }),
      };
    }
    return { status: "ok", reaction, confidence: answer?.confidence ?? 0, ...debug({ response: data }) };
  } catch (e) {
    return {
      status: "unavailable",
      reason: "AI 미리보기를 처리하지 못했어요.",
      ...debug({ error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }),
    };
  }
}
