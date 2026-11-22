import { describe, expect, it } from "vitest";
import { parseChannelInput, parseYoutubeSource } from "./youtube-api.mjs";

// 주소 해석이 조용히 틀리면 남의 영상이 엉뚱한 종류로 들어가거나, 받아야 할 주소가 거절된다.
const VID = "dQw4w9WgXcQ";
const CH = "UC_x5XG1OV2P6uZZ5FSM9Ttw";
const PL = "PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb";

describe("parseYoutubeSource", () => {
  it("영상 주소 네 가지를 영상 하나로 읽는다", () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${VID}&t=30s`,
      `https://youtu.be/${VID}?si=abc`,
      `https://youtube.com/shorts/${VID}`,
      `https://m.youtube.com/live/${VID}/`,
      `youtube.com/watch?v=${VID}`,
    ]) {
      expect(parseYoutubeSource(url)).toEqual({ kind: "video", id: VID });
    }
  });

  it("watch 주소에 list가 붙어 있으면 영상 하나다", () => {
    expect(parseYoutubeSource(`https://www.youtube.com/watch?v=${VID}&list=${PL}`)).toEqual({ kind: "video", id: VID });
  });

  it("재생목록 주소를 읽는다", () => {
    expect(parseYoutubeSource(`https://www.youtube.com/playlist?list=${PL}`)).toEqual({ kind: "playlist", id: PL });
  });

  it("채널 주소, 탭 주소, @핸들을 채널로 읽는다", () => {
    expect(parseYoutubeSource("@lovesoo")).toEqual({ kind: "channel", ref: { kind: "handle", value: "@lovesoo" } });
    expect(parseYoutubeSource("https://www.youtube.com/@lovesoo/videos")).toEqual({
      kind: "channel",
      ref: { kind: "handle", value: "@lovesoo" },
    });
    expect(parseYoutubeSource(`https://www.youtube.com/channel/${CH}/shorts`)).toEqual({
      kind: "channel",
      ref: { kind: "id", value: CH },
    });
  });

  it("받지 않는 주소는 null이다", () => {
    for (const bad of [
      "",
      "hello",
      `https://www.youtube.com/watch?v=short`,
      `https://youtu.be/${VID}/extra`,
      `https://evil.com/watch?v=${VID}`,
      `https://youtube.com.evil.com/watch?v=${VID}`,
      `https://user@www.youtube.com/watch?v=${VID}`,
      `https://www.youtube.com:8443/watch?v=${VID}`,
      `javascript://www.youtube.com/watch?v=${VID}`,
      "https://www.youtube.com/playlist?list=PL",
      "https://www.youtube.com/results?search_query=x",
      "https://www.youtube.com/c/somename",
      `https://www.youtube.com/@lovesoo/videos/extra`,
    ]) {
      expect(parseYoutubeSource(bad)).toBeNull();
    }
    expect(parseYoutubeSource(42)).toBeNull();
  });
});

describe("parseChannelInput", () => {
  it("영상 주소는 채널로 읽지 않는다 (채널 연결이 영상 주소를 받지 않게)", () => {
    expect(parseChannelInput(`https://www.youtube.com/watch?v=${VID}`)).toBeNull();
    expect(parseChannelInput(`https://www.youtube.com/shorts/${VID}`)).toBeNull();
  });
});
