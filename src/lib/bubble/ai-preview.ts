// 구독자가 보내기 전에 크리에이터의 예상 반응을 보여주는 AI 미리보기.
// ANTHROPIC_API_KEY가 없으면 "unavailable"을 돌려주고 화면에는 준비 중으로 표시한다.

export type ContextMessage = { role: "creator" | "subscriber"; body: string };

export type PreviewResult =
  | { status: "ok"; fit: "맞음" | "애매" | "어긋남"; expectedReaction: string; reason: string }
  | { status: "unavailable"; reason: string };

const SYSTEM_PROMPT = `너는 크리에이터와 구독자의 1:1 대화를 돕는 판단 도우미다.
주어진 최근 대화 문맥을 보고, 구독자의 새 메시지에 대해 크리에이터가 어떻게 반응할지 예측한다.
또한 그 메시지가 지금까지의 대화 흐름과 자연스럽게 이어지는지(문맥 반영 여부)를 판단한다.
반드시 아래 JSON 한 개만 출력한다. 다른 설명은 붙이지 않는다.
{"fit": "맞음" | "애매" | "어긋남", "expectedReaction": "예상 반응 한 문장", "reason": "판단 이유 한 문장"}`;

export async function previewReaction(
  context: ContextMessage[],
  draft: string,
): Promise<PreviewResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { status: "unavailable", reason: "AI 미리보기 설정이 아직 없어요." };
  }

  const history = context
    .map((m) => `[${m.role === "creator" ? "크리에이터" : "구독자"}] ${m.body}`)
    .join("\n");
  const userText = `최근 대화:\n${history || "(대화 없음)"}\n\n구독자의 새 메시지 초안:\n${draft}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.BUBBLE_PREVIEW_MODEL ?? "claude-haiku-5-5",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userText }],
      }),
    });
    if (!res.ok) {
      return { status: "unavailable", reason: "AI 미리보기를 가져오지 못했어요." };
    }

    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((b) => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as {
      fit?: string;
      expectedReaction?: string;
      reason?: string;
    };

    const fit = parsed.fit === "맞음" || parsed.fit === "어긋남" ? parsed.fit : "애매";
    return {
      status: "ok",
      fit,
      expectedReaction: parsed.expectedReaction ?? "",
      reason: parsed.reason ?? "",
    };
  } catch {
    return { status: "unavailable", reason: "AI 미리보기를 처리하지 못했어요." };
  }
}
