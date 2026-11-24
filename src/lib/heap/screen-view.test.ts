// 판정에 걸린 글이 다른 사람에게 새어 나가지 않는지 (쪽지·방명록 읽기가 쓰는 규칙)
import { describe, expect, it } from "vitest";
import { screenView } from "./screen-view";

describe("screenView", () => {
  it("hides blocked and held posts from everyone but the author", () => {
    for (const status of ["blocked", "held"]) {
      expect(screenView(status, false)).toBe("hide");
      expect(screenView(status, true)).toBe("own");
    }
  });

  it("shows removed posts to everyone as a placeholder, author included", () => {
    expect(screenView("removed", false)).toBe("removed");
    expect(screenView("removed", true)).toBe("removed");
  });

  it("hides an unknown status from non-authors", () => {
    expect(screenView("something-new", false)).toBe("hide");
  });

  it("leaves published posts alone", () => {
    expect(screenView("published", false)).toBe("plain");
  });
});
