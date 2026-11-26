import { describe, expect, it } from "vitest";
import { needsRecheck } from "./persist";

describe("needsRecheck (사후 재판정 대상)", () => {
  it("OpenAI를 못 거치고 공개한 글만 대상", () => {
    for (const openai of ["error", "timeout", "skipped_rate", "skipped_breaker"] as const) {
      expect(needsRecheck(openai, "published")).toBe(true);
    }
  });

  it("정상 판정, 앞 단계에서 걸림, 표면 제외, 키 없음은 대상 아님", () => {
    for (const openai of ["called", "skipped_earlier_hit", "skipped_surface", "skipped_no_key"] as const) {
      expect(needsRecheck(openai, "published")).toBe(false);
    }
  });

  it("이미 숨긴 글은 대상 아님", () => {
    expect(needsRecheck("timeout", "blocked")).toBe(false);
    expect(needsRecheck("error", "held")).toBe(false);
  });
});
