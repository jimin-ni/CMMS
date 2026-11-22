import { HEAP_FUNNEL_POLICY } from "@/lib/heap/policy";
import { createYoutubeClient, parseIsoDuration } from "./youtube-api.mjs";

// YouTube 채널 가져오기와 영상 고르기의 API 쪽. 네트워크만 쓰고 DB는 건드리지 않는다 (DB는 repo.importReels, repo.addPickedReels가 한다).
// 서버에서만 불러 쓴다. YOUTUBE_API_KEY는 여기서 환경 변수로만 읽고 반환값에도 오류에도 싣지 않는다.
// 쿼터: 채널 확인 1유닛 + 재생목록(업로드 목록 포함) 쪽당 1유닛 + 영상 정보 50개 묶음당 1유닛 + 재생목록 제목 1유닛.
// search.list는 쓰지 않는다.

export type YoutubeClient = ReturnType<typeof createYoutubeClient>;

// 키가 없으면 null. 호출하는 쪽이 "가져오기를 쓸 수 없음"으로 돌려준다.
export function getYoutubeClient(): YoutubeClient | null {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  return createYoutubeClient(key);
}

export type YoutubeChannel = {
  // UC…로 시작하는 채널 ID
  externalId: string;
  title: string;
  url: string;
  uploadsPlaylistId: string;
};

export type ImportCandidate = {
  externalId: string;
  sourceUrl: string;
  title: string;
  wide: boolean;
  viewCount: number | null;
  publishedAt: Date | null;
  // 영상을 올린 채널 ID(UC…)와 이름
  channelExternalId: string;
  channelTitle: string;
};

// 채널 확인. 핸들이나 채널 ID로 찾지 못하면 null.
export async function resolveYoutubeChannel(
  client: YoutubeClient,
  ref: { kind: "handle" | "id"; value: string },
): Promise<YoutubeChannel | null> {
  const params: Record<string, string> = { part: "snippet,contentDetails" };
  if (ref.kind === "handle") params.forHandle = ref.value;
  else params.id = ref.value;
  const data = await client.get("channels", params);
  const item = data?.items?.[0];
  const id = item?.id;
  const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
  if (typeof id !== "string" || !/^UC[A-Za-z0-9_-]{22}$/.test(id) || typeof uploads !== "string") return null;
  return {
    externalId: id,
    title: cleanText(item?.snippet?.title, 100),
    url: `https://www.youtube.com/channel/${id}`,
    uploadsPlaylistId: uploads,
  };
}

// 제어 문자를 빼고 앞뒤 공백을 다듬어 maxChars(코드포인트)로 자른다.
function cleanText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  return Array.from(value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim())
    .slice(0, maxChars)
    .join("");
}

// 재생목록(채널의 업로드 목록도 재생목록이다)의 영상 ID를 앞에서부터 maxPages쪽(쪽당 50개)까지 읽는다. 쪽당 1유닛.
// more: 읽지 않은 쪽이 남았으면 true.
export async function fetchPlaylistVideoIds(
  client: YoutubeClient,
  playlistId: string,
  maxPages: number,
): Promise<{ ids: string[]; more: boolean }> {
  const ids: string[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const params: Record<string, string> = { part: "contentDetails", playlistId, maxResults: "50" };
    if (pageToken) params.pageToken = pageToken;
    const data = await client.get("playlistItems", params);
    for (const item of data?.items ?? []) {
      const id = item?.contentDetails?.videoId;
      if (typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id) && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    pageToken = typeof data?.nextPageToken === "string" ? data.nextPageToken : undefined;
    if (!pageToken) break;
  }
  return { ids, more: pageToken !== undefined };
}

// 영상 정보를 50개씩 묶어 조회한다 (묶음당 1유닛). 결과는 ids의 순서를 따른다.
// 빼는 것: 라이브·예정(길이 0), 공개가 아닌 영상, 다른 곳에 퍼가기가 막힌 영상(공식 플레이어로 재생할 수 없다),
// onlyChannel이 있으면 그 채널의 영상이 아닌 것.
export async function fetchYoutubeVideos(
  client: YoutubeClient,
  ids: readonly string[],
  onlyChannel?: string,
): Promise<ImportCandidate[]> {
  const found = new Map<string, ImportCandidate>();
  for (let i = 0; i < ids.length; i += 50) {
    const data = await client.get("videos", {
      part: "snippet,contentDetails,statistics,status",
      id: ids.slice(i, i + 50).join(","),
      maxResults: "50",
    });
    for (const item of data?.items ?? []) {
      const id = item?.id;
      if (typeof id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(id)) continue;
      const channelId = item?.snippet?.channelId;
      if (typeof channelId !== "string" || !/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) continue;
      if (onlyChannel && channelId !== onlyChannel) continue;
      if (item?.status?.privacyStatus !== "public" || item?.status?.embeddable !== true) continue;
      if (item?.snippet?.liveBroadcastContent && item.snippet.liveBroadcastContent !== "none") continue;
      const seconds = parseIsoDuration(item?.contentDetails?.duration);
      if (seconds === null || seconds <= 0) continue;

      const short = seconds <= HEAP_FUNNEL_POLICY.shortMaxSeconds;
      const views = Number(item?.statistics?.viewCount);
      const published = new Date(item?.snippet?.publishedAt);
      found.set(id, {
        externalId: id,
        sourceUrl: short ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
        title: cleanText(item?.snippet?.title, 300),
        wide: !short,
        viewCount: Number.isSafeInteger(views) && views >= 0 ? views : null,
        publishedAt: Number.isNaN(published.getTime()) ? null : published,
        channelExternalId: channelId,
        channelTitle: cleanText(item?.snippet?.channelTitle, 100),
      });
    }
  }
  return ids.flatMap((id) => found.get(id) ?? []);
}

// 채널 업로드 목록의 최근 영상부터 maxPages쪽까지. 채널 ID가 맞지 않는 영상은 뺀다. 결과는 게시 시각이 최근인 순서다.
export async function fetchYoutubeUploads(
  client: YoutubeClient,
  channel: YoutubeChannel,
  maxPages: number = HEAP_FUNNEL_POLICY.importMaxPages,
): Promise<ImportCandidate[]> {
  const { ids } = await fetchPlaylistVideoIds(client, channel.uploadsPlaylistId, maxPages);
  const out = await fetchYoutubeVideos(client, ids, channel.externalId);
  // 최근 순. 게시 시각을 모르는 것은 뒤로 보낸다.
  return out.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
}

// 재생목록의 제목. 없거나 볼 수 없는 재생목록이면 null (1유닛).
export async function fetchPlaylistTitle(client: YoutubeClient, playlistId: string): Promise<string | null> {
  const data = await client.get("playlists", { part: "snippet", id: playlistId, maxResults: "1" });
  const item = data?.items?.[0];
  if (item?.id !== playlistId) return null;
  return cleanText(item?.snippet?.title, 100);
}
