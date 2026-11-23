import { describe, expect, it } from "vitest";
import { validateLayout } from "./layout";

// 작은 빛(glow)의 세기(level)가 저장 검사를 지나 그대로 남는지. 빠지면 다시 불러올 때 세기가 3 으로 돌아간다.
const heap = { type: "heap", x: 0, z: 0 };
const check = (item: Record<string, unknown>) => validateLayout({ door: { wall: "back", at: 2 }, items: [heap, item] });

describe("glow level", () => {
  it("keeps a valid level", () => {
    const r = check({ type: "glow", x: 1, z: 1, level: 5 });
    expect(r.ok && (r.layout.items as Record<string, unknown>[])[1]).toEqual({ type: "glow", x: 1, z: 1, level: 5 });
  });
  it("rejects a level out of range or not whole", () => {
    expect(check({ type: "glow", x: 1, z: 1, level: 6 }).ok).toBe(false);
    expect(check({ type: "glow", x: 1, z: 1, level: 2.5 }).ok).toBe(false);
  });
  it("rejects level on other furniture", () => {
    expect(check({ type: "lamp", x: 1, z: 1, level: 3 }).ok).toBe(false);
  });
});
