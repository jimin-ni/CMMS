import { describe, expect, it } from "vitest";
import { countLinks, findContact } from "./contact";
import { buildLexicon, matchLexicon } from "./lexicon";
import { normalize } from "./normalize";
import type { Moderate, OpenAIModeration } from "./openai";
import { decideOpenAI, screen } from "./screen";
import { findPattern } from "./patterns";

// 테스트용 가짜 사전. 실제 사전은 DB(moderation_terms)에만 둔다.
const lexicon = buildLexicon(
  [
    { term: "badword", lang: "en", tag: "sev5" },
    { term: "ass", lang: "en", tag: "sev5" },
    { term: "dirty phrase", lang: "en", tag: "sev5" },
    { term: "나쁜말", lang: "ko", tag: "ko" },
  ],
  ["assassin", "class"],
  "test-1",
);

const called = (categories: Record<string, boolean> = {}): OpenAIModeration => ({
  status: "called",
  flagged: Object.values(categories).some(Boolean),
  categories,
  scores: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v ? 0.9 : 0.01])),
});
const moderateWith =
  (r: OpenAIModeration): Moderate =>
  async () =>
    r;
const run = (text: string, r: OpenAIModeration = called()) =>
  screen({ text, surface: "chat", authorId: "u1" }, { lexicon, moderate: moderateWith(r) });

describe("normalize", () => {
  it("우회 표기를 정규화한다", () => {
    expect(normalize("B@DW0RD").tokens).toEqual(["badword"]);
    expect(normalize("b.a.d.w.o.r.d").tokens).toEqual(["badword"]);
    expect(normalize("b a d w o r d").tokens).toEqual(["badword"]);
    expect(normalize("ＢＡＤＷＯＲＤ").tokens).toEqual(["badword"]);
    expect(normalize("baaaaadword").squeezedTokens).toEqual(["badword"]);
  });
  it("숫자만 있는 단어는 바꾸지 않는다", () => {
    expect(normalize("score 1300 on 2026-11-20").tokens).toContain("1300");
  });
});

describe("lexicon", () => {
  const hit = (s: string) => matchLexicon(lexicon, normalize(s));
  it("단어 경계로 잡는다", () => {
    expect(hit("you badword")).not.toBeNull();
    expect(hit("BADWORDS")).not.toBeNull();
    expect(hit("dirty phrase here")).not.toBeNull();
  });
  it("정상 단어 안의 짧은 욕설은 잡지 않는다 (Scunthorpe 문제)", () => {
    expect(hit("the assassin was cool")).toBeNull();
    expect(hit("first class seat")).toBeNull();
    expect(hit("passage")).toBeNull();
    expect(hit("asses")).toBeNull(); // 3글자 이하는 정확히 같을 때만
    expect(hit("ass")).not.toBeNull();
  });
  it("허용 목록은 어미를 뗀 형태에도 적용", () => {
    const lex = buildLexicon([{ term: "queen", lang: "en", tag: "hate" }], ["queen"], "t");
    expect(matchLexicon(lex, normalize("you are a queen"))).toBeNull();
    expect(matchLexicon(lex, normalize("queens of pop"))).toBeNull();
  });
  it("한국어 보조 사전은 공백을 지우고 부분 일치", () => {
    expect(hit("나 쁜 말 하지마")).not.toBeNull();
  });
});

describe("contact", () => {
  it.each([
    ["010-1234-5678", "phone"],
    ["010 1234 5678", "phone"],
    ["+82 10-1234-5678", "phone"],
    ["０１０-１２３４-５６７８", "phone"],
    ["call (555) 123-4567", "phone"],
    ["mail me a.b@example.com", "email"],
    ["me at gmail dot com", "email"],
    ["add me open.kakao.com/o/abc", "messenger"],
    ["discord.gg/abc", "messenger"],
    ["instagram.com/someone", "messenger"],
  ])("%s → %s", (text, kind) => {
    expect(findContact(text)).toBe(kind);
  });
  it.each([
    "2026-11-20 13:45",
    "I scored 98765 points",
    "order #123456789",
    "카톡 왔어요",
    "@러브쑤 hi!",
    "see you at 7 pm",
  ])("오탐 없음: %s", (text) => {
    expect(findContact(text)).toBeNull();
  });
  it("링크 개수", () => {
    expect(countLinks("https://a.com and www.b.com")).toBe(2);
    expect(countLinks("no links")).toBe(0);
  });
});

describe("threats", () => {
  it("상대를 향한 위협을 잡는다", () => {
    expect(findPattern(normalize("I'll find you").text)).not.toBeNull();
    expect(findPattern(normalize("im gonna kill you").text)).not.toBeNull();
    expect(findPattern(normalize("just kys").text)).not.toBeNull();
  });
  it("성적 요구를 잡는다", () => {
    expect(findPattern(normalize("send me pics of your body").text)).not.toBeNull();
    expect(findPattern(normalize("what color is your underwear").text)).not.toBeNull();
  });
  it("관용 표현은 잡지 않는다", () => {
    expect(findPattern(normalize("kill me, this is so good").text)).toBeNull();
    expect(findPattern(normalize("you're killing it!").text)).toBeNull();
  });
});

describe("decideOpenAI", () => {
  const d = (c: Record<string, boolean>) =>
    decideOpenAI(called(c) as Extract<OpenAIModeration, { status: "called" }>);
  it("바로 위반 카테고리", () => {
    expect(d({ "sexual/minors": true }).outcome).toBe("block");
    expect(d({ hate: true }).outcome).toBe("block");
  });
  it("harassment는 정책에 따라 hold_review", () => {
    expect(d({ harassment: true }).outcome).toBe("hold_review");
  });
  it("자해는 harassment, violence보다 우선", () => {
    expect(d({ harassment: true, "self-harm/intent": true }).outcome).toBe("hold_self_harm");
    expect(d({ violence: true, "self-harm": true }).outcome).toBe("hold_self_harm");
  });
  it("violence는 점수 기준", () => {
    const r = (score: number) =>
      decideOpenAI({ status: "called", flagged: true, categories: { violence: true }, scores: { violence: score } });
    expect(r(0.52).outcome).toBe("publish");
    expect(r(0.87).outcome).toBe("block");
  });
  it("sexual은 flagged가 없어도 점수 0.5 이상이면 위반", () => {
    const r = (score: number) =>
      decideOpenAI({ status: "called", flagged: false, categories: {}, scores: { sexual: score } });
    expect(r(0.6).outcome).toBe("block");
    expect(r(0.38).outcome).toBe("publish");
  });
  it("아무것도 없으면 공개", () => {
    expect(d({}).outcome).toBe("publish");
  });
});

describe("screen", () => {
  it("사전에 걸리면 OpenAI를 부르지 않는다", async () => {
    let calledCount = 0;
    const r = await screen(
      { text: "badword", surface: "chat", authorId: "u1" },
      {
        lexicon,
        moderate: async () => {
          calledCount++;
          return called();
        },
      },
    );
    expect(r.outcome).toBe("block");
    expect(r.reasons).toEqual(["lexicon:en:sev5"]);
    expect(r.openai).toBe("skipped_earlier_hit");
    expect(calledCount).toBe(0);
  });
  it("연락처는 contact", async () => {
    expect((await run("010-1234-5678")).outcome).toBe("contact");
  });
  it("OpenAI 실패 시 통과", async () => {
    for (const status of ["error", "timeout", "skipped_no_key", "skipped_rate", "skipped_breaker"] as const) {
      const r = await run("hello", { status });
      expect(r.outcome).toBe("publish");
      expect(r.openai).toBe(status);
    }
  });
  it("같은 글은 같은 해시", async () => {
    const a = await run("Hello World");
    const b = await run("hello   world!!");
    expect(a.normalizedHash).toBe(b.normalizedHash);
  });
  it("OpenAI 판정 기록에 모델과 점수가 남는다", async () => {
    const r = await run("hello", called({ hate: true }));
    expect(r.outcome).toBe("block");
    expect(r.versions.model).toBe("omni-moderation-latest");
    expect(r.scores?.hate).toBeGreaterThan(0.5);
  });
});
