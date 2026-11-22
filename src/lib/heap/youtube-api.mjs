// YouTube Data API 호출과 주소 해석. 순수 JavaScript라서 앱(src/lib/heap/import.ts)과
// 스크립트(scripts/heap-import-channels.mjs)가 같이 쓴다. DB 접근은 없다.
// API 키는 요청 헤더로만 보내고, 오류 메시지와 반환값에 싣지 않는다.

const API = "https://www.googleapis.com/youtube/v3";

// 호출마다 쿼터 1유닛으로 센다. (search.list는 쓰지 않는다. channels, playlistItems, videos는 모두 1유닛.)
// 키가 없으면 만들 때 던진다.
/** @param {string | undefined} apiKey */
export function createYoutubeClient(apiKey) {
  if (!apiKey) throw new Error("YOUTUBE_API_KEY가 없습니다. .env.local을 확인하세요.");
  let units = 0;
  return {
    /**
     * @param {string} path  예: "channels"
     * @param {Record<string, string>} params
     * @returns {Promise<any>}
     */
    async get(path, params) {
      units += 1;
      let res;
      try {
        res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, {
          headers: { "x-goog-api-key": apiKey },
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new Error(`YouTube API ${path} 연결 실패`);
      }
      if (!res.ok) {
        let reason = "";
        try {
          reason = (await res.json())?.error?.errors?.[0]?.reason ?? "";
        } catch {}
        throw new Error(`YouTube API ${path} 실패: HTTP ${res.status} ${reason}`.trim());
      }
      return res.json();
    },
    units: () => units,
  };
}

const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com"];
const HANDLE = /^@[\p{L}\p{N}._-]{3,30}$/u;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const CHANNEL_TAB = /\/(?:videos|shorts|streams|featured|playlists|community|about)$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
// 재생목록 ID (PL…, UU…, OL… 등). 모양만 본다. 실제로 있는지는 API가 답한다.
const PLAYLIST_ID = /^[A-Za-z0-9_-]{12,64}$/;

// 퍼센트 인코딩된 핸들을 풀고 모양을 검사한다. 맞지 않으면 null.
/** @param {string} raw */
function cleanHandle(raw) {
  let handle;
  try {
    handle = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return HANDLE.test(handle) ? handle : null;
}

// 크리에이터가 붙여 넣은 채널 주소 또는 @핸들을 해석한다.
// 받는 것: @핸들, youtube.com/@핸들, youtube.com/channel/UC…(24자). 그 밖의 주소(영상, 검색, /c/ 이름, /user/ 이름)는 null이다.
/** @param {unknown} input @returns {{ kind: "handle" | "id", value: string } | null} */
export function parseChannelInput(input) {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (raw.length === 0 || raw.length > 200) return null;

  if (raw.startsWith("@")) {
    const handle = cleanHandle(raw);
    return handle ? { kind: "handle", value: handle } : null;
  }

  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  if (!YOUTUBE_HOSTS.includes(url.hostname)) return null;

  // 채널 화면의 탭 주소(/@이름/videos, /channel/UC…/shorts 등)는 채널 주소로 본다.
  const path = url.pathname.replace(/\/$/, "").replace(CHANNEL_TAB, "");
  const handleMatch = /^\/(@[^/]+)$/.exec(path);
  if (handleMatch) {
    const handle = cleanHandle(handleMatch[1]);
    return handle ? { kind: "handle", value: handle } : null;
  }
  const idMatch = /^\/channel\/([^/]+)$/.exec(path);
  if (idMatch && CHANNEL_ID.test(idMatch[1])) return { kind: "id", value: idMatch[1] };
  return null;
}

// 방 주인이 힙에 영상을 넣으려고 붙여 넣은 유튜브 주소를 해석한다. 영상 하나, 재생목록, 채널(주소나 @핸들) 중 하나다.
// 받는 영상 주소: youtube.com/watch?v=…, youtu.be/…, youtube.com/shorts/…, youtube.com/live/…
// 받는 재생목록 주소: youtube.com/playlist?list=…. watch 주소에 list가 같이 붙어 있으면 영상 하나로 본다 (v가 더 구체적이다).
// 채널은 parseChannelInput과 같은 규칙이다. 그 밖의 주소는 null.
/**
 * @param {unknown} input
 * @returns {{ kind: "video", id: string } | { kind: "playlist", id: string } | { kind: "channel", ref: { kind: "handle" | "id", value: string } } | null}
 */
export function parseYoutubeSource(input) {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (raw.length === 0 || raw.length > 2048) return null;
  if (raw.startsWith("@")) {
    const ref = parseChannelInput(raw);
    return ref ? { kind: "channel", ref } : null;
  }

  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;

  if (url.hostname === "youtu.be") {
    const id = path.slice(1);
    return VIDEO_ID.test(id) ? { kind: "video", id } : null;
  }
  if (!YOUTUBE_HOSTS.includes(url.hostname)) return null;

  if (path === "/watch") {
    const id = url.searchParams.get("v") ?? "";
    return VIDEO_ID.test(id) ? { kind: "video", id } : null;
  }
  const short = /^\/(?:shorts|live)\/([^/]+)$/.exec(path);
  if (short) return VIDEO_ID.test(short[1]) ? { kind: "video", id: short[1] } : null;
  if (path === "/playlist") {
    const id = url.searchParams.get("list") ?? "";
    return PLAYLIST_ID.test(id) ? { kind: "playlist", id } : null;
  }
  const ref = parseChannelInput(raw);
  return ref ? { kind: "channel", ref } : null;
}

// creator.json의 링크 목록에서 YouTube @핸들만 뽑는다 (스크립트용). 같은 핸들은 한 번만.
/** @param {{ url?: unknown }[] | undefined} links @returns {string[]} */
export function youtubeHandles(links) {
  /** @type {string[]} */
  const handles = [];
  for (const link of links ?? []) {
    if (typeof link.url !== "string") continue;
    const parsed = parseChannelInput(link.url);
    if (parsed?.kind === "handle" && !handles.includes(parsed.value)) handles.push(parsed.value);
  }
  return handles;
}

// ISO 8601 길이("PT1M30S", "PT45S", "P0D")를 초로 바꾼다. 읽지 못하면 null. 라이브·예정 영상은 0이다.
/** @param {unknown} value @returns {number | null} */
export function parseIsoDuration(value) {
  if (typeof value !== "string") return null;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match) return null;
  const [, d, h, m, s] = match.map((part) => Number(part ?? 0));
  return d * 86400 + h * 3600 + m * 60 + s;
}
