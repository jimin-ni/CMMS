// 힙 미니룸의 플랫폼 목록과 팬 조각 주소 해석. 순수 함수만 둔다 (DB·네트워크 접근 없음).
// 목록은 db/migrations/0007_heap_rooms.sql의 check와 같아야 한다.

// 크리에이터 채널과 영상(heap_creator_channels, heap_reels)
export const HEAP_CHANNEL_PLATFORMS = [
  "youtube",
  "chzzk",
  "twitch",
  "soop",
  "instagram",
  "tiktok",
] as const;
export type HeapChannelPlatform = (typeof HEAP_CHANNEL_PLATFORMS)[number];

// 팬 조각(heap_pieces)
export const HEAP_PIECE_PLATFORMS = ["youtube", "x", "chzzk", "naver_cafe"] as const;
export type HeapPiecePlatform = (typeof HEAP_PIECE_PLATFORMS)[number];

// 크리에이터가 채널 탭에 붙여 넣는 게시물 링크(판정 J12, F2/F3). 가져오기는 없고 링크 하나가 카드 하나가 된다.
export const HEAP_LINK_PLATFORMS = ["instagram", "tiktok", "x"] as const;
export type HeapLinkPlatform = (typeof HEAP_LINK_PLATFORMS)[number];

// 그중 지금 DB에 넣을 수 있는 것. heap_reels.platform의 check가 받는 값과 같아야 한다
// (0007: youtube, chzzk, twitch, soop, instagram, tiktok). x는 check를 넓히는 마이그레이션이 있어야 저장할 수 있다.
export const HEAP_LINK_PLATFORMS_STORABLE = ["instagram", "tiktok"] as const;
export type HeapStorableLinkPlatform = (typeof HEAP_LINK_PLATFORMS_STORABLE)[number];

export function isStorableLinkPlatform(platform: HeapLinkPlatform): platform is HeapStorableLinkPlatform {
  return (HEAP_LINK_PLATFORMS_STORABLE as readonly string[]).includes(platform);
}

export type ParsedPiece = {
  platform: HeapPiecePlatform;
  // 플랫폼 안에서 게시물을 식별하는 값. 같은 방의 중복 검사에 쓴다.
  externalId: string;
  // 추적 파라미터를 뺀 https 정규 주소
  sourceUrl: string;
  // 주소만으로는 알 수 없어 항상 null. 유튜브 썸네일은 클라이언트가 ID로 만든다.
  thumbnailUrl: string | null;
  // 가로면 true, 세로면 false, 알 수 없으면 null
  wide: boolean | null;
};

type Hit = { externalId: string; sourceUrl: string; wide?: boolean };

type Rule = {
  platform: HeapPiecePlatform;
  // 정확히 일치해야 하는 호스트 이름 (부분 일치 없음)
  hosts: readonly string[];
  // 경로 전체와 맞아야 한다. 마지막 슬래시 하나는 미리 뗀다.
  path: RegExp;
  toHit: (match: RegExpExecArray, query: URLSearchParams) => Hit | null;
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com"];
const X_HOSTS = ["x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"];
const CHZZK_HOSTS = ["chzzk.naver.com", "m.chzzk.naver.com"];
const CAFE_HOSTS = ["cafe.naver.com", "m.cafe.naver.com"];
// 카페 주소 자리에 올 수 없는 경로 이름 (네이버 카페 화면 경로)
const CAFE_RESERVED = ["f-e", "ca-fe"];

const youtubeWatch = (id: string): Hit => ({
  externalId: id,
  sourceUrl: `https://www.youtube.com/watch?v=${id}`,
});

// 위에서부터 차례로 맞춰 본다. 채널·프로필·홈·검색 주소는 어느 줄에도 맞지 않아 걸러진다.
const RULES: readonly Rule[] = [
  {
    platform: "youtube",
    hosts: YOUTUBE_HOSTS,
    path: /^\/watch$/,
    toHit: (_match, query) => {
      const id = query.get("v") ?? "";
      return YOUTUBE_ID.test(id) ? youtubeWatch(id) : null;
    },
  },
  {
    platform: "youtube",
    hosts: ["youtu.be"],
    path: /^\/([A-Za-z0-9_-]{11})$/,
    toHit: (match) => youtubeWatch(match[1]),
  },
  {
    platform: "youtube",
    hosts: YOUTUBE_HOSTS,
    path: /^\/live\/([A-Za-z0-9_-]{11})$/,
    toHit: (match) => youtubeWatch(match[1]),
  },
  {
    // 쇼츠 주소로 온 영상만 세로로 확정한다.
    platform: "youtube",
    hosts: YOUTUBE_HOSTS,
    path: /^\/shorts\/([A-Za-z0-9_-]{11})$/,
    toHit: (match) => ({
      externalId: match[1],
      sourceUrl: `https://www.youtube.com/shorts/${match[1]}`,
      wide: false,
    }),
  },
  {
    // 게시물 주소 뒤의 /photo/1, /video/1은 뗀다.
    // 주소 속 사용자 이름은 게시물 번호와 맞는지 확인할 수 없으므로 버리고, 번호만 쓰는 주소로 저장한다.
    // (남의 게시물 번호에 다른 사람 이름을 붙인 주소가 그대로 남지 않게 한다.)
    platform: "x",
    hosts: X_HOSTS,
    path: /^\/[A-Za-z0-9_]{1,15}\/status\/(\d{1,20})(?:\/(?:photo|video)\/\d)?$/,
    toHit: (match) => ({
      externalId: match[1],
      sourceUrl: `https://x.com/i/web/status/${match[1]}`,
    }),
  },
  {
    platform: "chzzk",
    hosts: CHZZK_HOSTS,
    path: /^\/clips\/([A-Za-z0-9_-]{1,64})$/,
    toHit: (match) => ({
      externalId: `clip:${match[1]}`,
      sourceUrl: `https://chzzk.naver.com/clips/${match[1]}`,
    }),
  },
  {
    platform: "chzzk",
    hosts: CHZZK_HOSTS,
    path: /^\/video\/(\d{1,20})$/,
    toHit: (match) => ({
      externalId: `video:${match[1]}`,
      sourceUrl: `https://chzzk.naver.com/video/${match[1]}`,
    }),
  },
  {
    // 카페 주소(영문 이름) + 게시물 번호.
    // 숫자 카페 ID 주소(/f-e/cafes/<id>/articles/<no>)는 받지 않는다. 같은 글이 두 가지 ID를 갖게 되어
    // 방 안 중복 검사를 빠져나가기 때문이다. 이름과 숫자 ID를 맞춰 볼 방법이 생기면 그때 받는다.
    platform: "naver_cafe",
    hosts: CAFE_HOSTS,
    path: /^\/([A-Za-z0-9_-]{1,40})\/(\d{1,20})$/,
    toHit: (match) => {
      const cafe = match[1].toLowerCase();
      if (CAFE_RESERVED.includes(cafe)) return null;
      return {
        externalId: `${cafe}:${match[2]}`,
        sourceUrl: `https://cafe.naver.com/${cafe}/${match[2]}`,
      };
    },
  },
];

// 팬이 붙여 넣은 주소를 해석한다. 받는 게시물 주소가 아니면 null.
// http로 온 주소는 https로 올리고, 정규 주소는 뽑아낸 ID로 다시 만들어 추적 파라미터를 버린다.
export function parsePieceUrl(input: string): ParsedPiece | null {
  const raw = input.trim();
  if (raw.length === 0 || raw.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // user@host 꼴로 호스트를 속이는 주소와 포트가 붙은 주소는 받지 않는다.
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;

  const host = url.hostname;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;

  for (const rule of RULES) {
    if (!rule.hosts.includes(host)) continue;
    const match = rule.path.exec(path);
    if (!match) continue;
    const hit = rule.toHit(match, url.searchParams);
    if (!hit) continue;
    return {
      platform: rule.platform,
      externalId: hit.externalId,
      sourceUrl: hit.sourceUrl,
      thumbnailUrl: null,
      wide: hit.wide ?? null,
    };
  }
  return null;
}

// ---------- 크리에이터가 붙여 넣는 게시물 링크 ----------
// 인스타그램·틱톡·X 게시물 주소 하나를 카드 한 장으로 만든다. 네트워크를 쓰지 않으므로 제목도 썸네일도 주소에서 알 수 있는 것뿐이다.
// 재생은 플랫폼의 공식 임베드로만 한다 (내려받기·재호스팅·스트림 추출 없음).

export type ParsedPost = {
  platform: HeapLinkPlatform;
  // 플랫폼 안에서 게시물을 식별하는 값. 같은 방의 중복 검사에 쓴다.
  externalId: string;
  // 추적 파라미터를 뺀 https 정규 주소
  sourceUrl: string;
  // 주소에 적힌 계정 이름(@ 없이). 카드 제목의 기본값에만 쓴다. 게시물의 주인인지는 확인할 수 없다.
  handle: string | null;
  // 게시물 카드는 모두 세로다.
  wide: false;
};

const INSTAGRAM_HOSTS = ["instagram.com", "www.instagram.com", "m.instagram.com"];
const TIKTOK_HOSTS = ["tiktok.com", "www.tiktok.com", "m.tiktok.com"];
// 인스타그램 게시물 코드와 계정 이름
const IG_CODE = "[A-Za-z0-9_-]{5,32}";
const IG_USER = "[A-Za-z0-9._]{1,30}";

type PostRule = {
  platform: HeapLinkPlatform;
  hosts: readonly string[];
  path: RegExp;
  // match[1]이 계정 이름(없으면 빈 문자열), match[2]가 게시물 ID
  toHit: (match: RegExpExecArray) => { externalId: string; sourceUrl: string; handle: string | null } | null;
};

const POST_RULES: readonly PostRule[] = [
  {
    // /p/<코드>, /reel/<코드>, /reels/<코드>, /tv/<코드>, 그리고 앞에 계정 이름이 붙은 꼴.
    // 같은 게시물이 /p/ 와 /reel/ 두 주소를 가지므로 코드만 ID로 쓴다 (한 방에 한 번만 들어간다).
    platform: "instagram",
    hosts: INSTAGRAM_HOSTS,
    path: new RegExp(`^(?:/(${IG_USER}))?/(?:p|reel|reels|tv)/(${IG_CODE})$`),
    toHit: (match) => ({
      externalId: match[2],
      // 임베드와 원본 모두 /p/<코드> 로 열린다 (릴스도 같다). 계정 이름은 주소에 넣지 않는다.
      sourceUrl: `https://www.instagram.com/p/${match[2]}/`,
      handle: match[1] ?? null,
    }),
  },
  {
    // 틱톡 영상 주소. 짧은 주소(vm.tiktok.com/…)는 받지 않는다: 펼치려면 그 서버에 요청을 보내야 한다.
    // 틱톡 원본 주소는 계정 이름이 있어야 열리므로 주소에 그대로 둔다.
    platform: "tiktok",
    hosts: TIKTOK_HOSTS,
    path: /^\/@([A-Za-z0-9._]{1,24})\/video\/(\d{1,20})$/,
    toHit: (match) => ({
      externalId: match[2],
      sourceUrl: `https://www.tiktok.com/@${match[1]}/video/${match[2]}`,
      handle: match[1],
    }),
  },
  {
    // X 게시물. 주소 속 계정 이름이 게시물 번호와 맞는지 확인할 수 없어 주소에는 넣지 않는다 (팬 조각 규칙과 같다).
    platform: "x",
    hosts: X_HOSTS,
    path: /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,20})(?:\/(?:photo|video)\/\d)?$/,
    toHit: (match) => ({
      externalId: match[2],
      sourceUrl: `https://x.com/i/web/status/${match[2]}`,
      handle: match[1],
    }),
  },
];

// 크리에이터가 붙여 넣은 게시물 주소를 해석한다. 받는 주소가 아니면 null.
export function parsePostUrl(input: string): ParsedPost | null {
  const raw = input.trim();
  if (raw.length === 0 || raw.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // user@host 꼴로 호스트를 속이는 주소와 포트가 붙은 주소는 받지 않는다.
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;

  const host = url.hostname;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;

  for (const rule of POST_RULES) {
    if (!rule.hosts.includes(host)) continue;
    const match = rule.path.exec(path);
    if (!match) continue;
    const hit = rule.toHit(match);
    if (!hit) continue;
    return { platform: rule.platform, ...hit, wide: false };
  }
  return null;
}

// 붙여 넣은 한 줄: "<주소>" 또는 "<주소> | <제목>". 제목을 적지 않으면 null이고, 부르는 쪽이 계정 이름이나 플랫폼 이름으로 채운다.
export function splitPostLine(line: string): { url: string; title: string | null } {
  const bar = line.indexOf("|");
  if (bar < 0) return { url: line.trim(), title: null };
  const title = cleanPostTitle(line.slice(bar + 1));
  return { url: line.slice(0, bar).trim(), title: title === "" ? null : title };
}

// 제어 문자를 빼고 앞뒤 공백을 다듬어 maxChars(코드포인트)로 자른다. import.ts의 cleanText와 같은 규칙이다.
export function cleanPostTitle(value: string, maxChars: number = 100): string {
  return Array.from(
    value
      .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
    .slice(0, maxChars)
    .join("");
}
