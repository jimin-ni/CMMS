"use server";

import { redirect } from "next/navigation";
import { getViewer, type Viewer } from "@/lib/session";
import { HEAP_FUNNEL_POLICY } from "./policy";
import { HEAP_MESSAGES, HEAP_PLATFORM_NAME, type HeapReason } from "./messages";
import { validateLayout } from "./layout";
import { getTemplate } from "./templates";
import { checkRoomName, checkSlug, SLUG_MESSAGES, type SlugFailure } from "./slug";
import { takeAttempt } from "./rate-limit";
import { parseChannelInput } from "./youtube-api.mjs";
import { fetchYoutubeUploads, getYoutubeClient, resolveYoutubeChannel } from "./import";
import {
  isStorableLinkPlatform,
  parsePostUrl,
  splitPostLine,
  cleanPostTitle,
  type HeapLinkPlatform,
} from "./platform";
import type { ReelCounts } from "./caps";
import {
  addPastedReels,
  claimRoom,
  claimCreatorChannel,
  type PastedReelInput,
  type PastedReelStatus,
  getLastImportAt,
  getRoomByCreator,
  importReels,
  setReelExcluded,
  suggestFreeSlug,
  withImportLock,
  type ImportReelsResult,
} from "./repo";

// 크리에이터 깔때기의 쓰기: 방 만들기, 유튜브 채널 연결(영상 가져오기), 영상 빼기·되돌리기.
// 모든 액션이 세션과 역할(creator)을 서버에서 다시 확인한다. 방 주인은 세션의 사용자 ID로 찾고, 클라이언트가 보낸 방 ID나 사용자 ID는 쓰지 않는다.
// 입력은 형식과 길이를 검사한 뒤에 쓴다.

type Fail<R extends HeapReason> = { ok: false; reason: R; message: string };

function fail<R extends HeapReason>(reason: R): Fail<R> {
  return { ok: false, reason, message: HEAP_MESSAGES[reason] };
}

// 로그인했고 크리에이터 역할인 사용자. 아니면 실패 결과를 돌려준다.
async function requireCreator(): Promise<{ viewer: Viewer } | Fail<"not-signed-in" | "not-creator">> {
  const viewer = await getViewer();
  if (!viewer) return fail("not-signed-in");
  if (viewer.role !== "creator") return fail("not-creator");
  return { viewer };
}

// ---------- 방 만들기 ----------

export type ClaimRoomInput = { template: string; slug: string; name: string };

export type ClaimRoomFail =
  | Fail<
      | "not-signed-in"
      | "not-creator"
      | "too-many-attempts"
      | "invalid-template"
      | "invalid-room-name"
      | "already-has-room"
    >
  | (Fail<"invalid-slug"> & { slugReason: SlugFailure })
  // suggestion: 비어 있는 비슷한 주소 하나. 없으면 null.
  | (Fail<"slug-taken"> & { suggestion: string | null });

// 방 만들기: 템플릿, 주소, 방 이름을 받아 heap_rooms 한 줄을 만들고 /room/<주소>로 이동한다. 성공하면 돌아오지 않는다(redirect).
// 크리에이터 한 명에 방 하나다 (두 번째는 already-has-room). 주소는 만든 뒤 바꾸지 않는다.
export async function claimRoomAction(input: ClaimRoomInput): Promise<ClaimRoomFail> {
  const auth = await requireCreator();
  if ("ok" in auth) return auth;
  const { viewer } = auth;

  // 슬러그를 하나씩 찔러 보는 시도를 막는다. 형식이 틀린 시도도 센다.
  if (!takeAttempt(`claim:${viewer.id}`, HEAP_FUNNEL_POLICY.claimAttemptsPer10Min, 10 * 60 * 1000)) {
    return fail("too-many-attempts");
  }
  if (typeof input !== "object" || input === null) return fail("invalid-template");

  const template = getTemplate(input.template);
  if (!template) return fail("invalid-template");
  const slug = checkSlug(input.slug);
  if (!slug.ok) return { ...fail("invalid-slug"), message: SLUG_MESSAGES[slug.reason], slugReason: slug.reason };
  const name = checkRoomName(input.name);
  if (!name.ok) return fail("invalid-room-name");

  // 템플릿 사본이 방 검사를 통과하는지 다시 본다 (템플릿 파일을 고치다 어긋나도 깨진 방이 만들어지지 않는다).
  const layout = validateLayout(structuredClone(template.layout));
  if (!layout.ok) throw new Error(`템플릿 ${template.id}이(가) 방 검사를 통과하지 못합니다: ${layout.error}`);

  if (await getRoomByCreator(viewer.id)) return fail("already-has-room");

  const result = await claimRoom({ creatorId: viewer.id, slug: slug.slug, name: name.name, layout: layout.layout });
  if (!result.ok) {
    if (result.reason === "slug-taken") {
      return { ...fail("slug-taken"), suggestion: await suggestFreeSlug(slug.slug) };
    }
    return fail(result.reason);
  }
  redirect(`/room/${result.slug}`);
}

// ---------- 유튜브 채널 연결 (영상 가져오기) ----------

export type ConnectChannelResult =
  | {
      ok: true;
      channel: { title: string; url: string };
      // 업로드 목록에서 가져올 수 있다고 본 영상 수 (공개, 퍼가기 허용, 라이브 아님)
      fetched: number;
      added: ImportReelsResult["added"];
      refreshed: number;
      skippedByCap: number;
      skippedExcluded: number;
      // 가져온 뒤 힙에 보이는 영상 수 (갈래별)
      visible: ImportReelsResult["visible"];
    }
  | Fail<
      | "not-signed-in"
      | "not-creator"
      | "no-room"
      | "invalid-channel"
      | "too-many-attempts"
      | "channel-not-found"
      | "channel-taken"
      | "channel-limit"
      | "import-unavailable"
      | "import-failed"
    >
  // retryAfterSec: 다시 해 볼 수 있기까지 남은 초(대략)
  | (Fail<"import-too-soon"> & { retryAfterSec: number });

// 유튜브 채널(채널 주소 또는 @핸들)을 방 주인의 채널로 연결하고, 채널의 공개 영상을 방으로 가져온다.
// 방은 세션의 사용자로 찾는다 (방 ID를 받지 않는다). 가져오기는 크리에이터당 importMinIntervalMs에 한 번이고 동시에 하나만 돈다.
// 다시 불러도 같은 결과다 (이미 있는 영상은 새로 고치기만 하고, 힙에서 뺀 영상은 다시 넣지 않는다).
//
// 한계: 이 채널이 정말 이 크리에이터의 것인지는 확인하지 못한다 (소유 증명은 OAuth가 필요하다). 대신 이미 다른 크리에이터가
// 연결한 채널은 거절한다 (channel-taken). 채널 설명에 확인 코드를 적게 하는 식의 증명은 다음 단계다.
export async function connectYoutubeChannelAction(channel: string): Promise<ConnectChannelResult> {
  const auth = await requireCreator();
  if ("ok" in auth) return auth;
  const { viewer } = auth;

  const room = await getRoomByCreator(viewer.id);
  if (!room) return fail("no-room");
  const ref = parseChannelInput(channel);
  if (!ref) return fail("invalid-channel");

  // 채널을 찾는 데서 끝나는 시도(없는 핸들 등)는 DB에 기록이 남지 않아서 메모리 제한기가 센다.
  // 프로세스 메모리 제한기라 인스턴스마다 따로 센다. DB로 세는 제한기는 마이그레이션 0008 뒤에 붙인다.
  if (!takeAttempt(`import:${viewer.id}`, HEAP_FUNNEL_POLICY.importAttemptsPer10Min, 10 * 60 * 1000)) {
    return fail("too-many-attempts");
  }
  const client = getYoutubeClient();
  if (!client) return fail("import-unavailable");

  type Outcome =
    | { kind: "tooSoon"; retryAfterSec: number }
    | { kind: "notFound" | "taken" | "limit" | "noRoom" }
    | { kind: "done"; found: { title: string; url: string }; fetched: number; result: ImportReelsResult };

  try {
    const run = await withImportLock(viewer.id, async (): Promise<Outcome> => {
      const interval = HEAP_FUNNEL_POLICY.importMinIntervalMs;
      const last = await getLastImportAt(viewer.id);
      const elapsed = last ? Date.now() - last.getTime() : interval;
      if (elapsed < interval) return { kind: "tooSoon", retryAfterSec: Math.ceil((interval - elapsed) / 1000) };

      const found = await resolveYoutubeChannel(client, ref);
      if (!found) return { kind: "notFound" };
      // 채널 확인과 넣기는 한 트랜잭션이라 같은 채널을 두 사람이 동시에 연결할 수 없다 (늦은 쪽은 channel-taken).
      // 채널 행의 updated_at이 가져오기 간격의 기준이다. 업로드를 읽기 전에 먼저 갱신해, 중간에 실패해도 간격이 지켜진다.
      const saved = await claimCreatorChannel(
        {
          creatorId: viewer.id,
          platform: "youtube",
          externalId: found.externalId,
          channelUrl: found.url,
          title: found.title,
        },
        HEAP_FUNNEL_POLICY.importChannelsMax,
      );
      if (!saved.ok) return { kind: saved.reason === "channel-taken" ? "taken" : "limit" };
      const candidates = await fetchYoutubeUploads(client, found);
      const result = await importReels({ roomId: room.id, creatorId: viewer.id, channelId: saved.id, candidates });
      if ("ok" in result) return { kind: "noRoom" };
      return { kind: "done", found: { title: found.title, url: found.url }, fetched: candidates.length, result };
    });

    // 락을 못 잡았다 = 같은 크리에이터의 가져오기가 지금 돌고 있다.
    if (!run.locked) return { ...fail("import-too-soon"), retryAfterSec: 60 };
    const outcome = run.value;
    switch (outcome.kind) {
      case "tooSoon":
        return { ...fail("import-too-soon"), retryAfterSec: outcome.retryAfterSec };
      case "notFound":
        return fail("channel-not-found");
      case "taken":
        return fail("channel-taken");
      case "limit":
        return fail("channel-limit");
      case "noRoom":
        return fail("no-room");
      case "done":
        return { ok: true, channel: outcome.found, fetched: outcome.fetched, ...outcome.result };
    }
  } catch (error) {
    // 오류 메시지에는 API 키가 들어 있지 않다 (youtube-api.mjs). 그래도 화면에는 일반 문구만 돌려준다.
    console.error("[heap import]", error instanceof Error ? error.message : "알 수 없는 오류");
    return fail("import-failed");
  }
}

// ---------- 게시물 링크 붙여넣기 (판정 J12) ----------

// 링크 한 줄의 결과. unsupported = 알아봤지만 아직 저장할 수 없는 플랫폼(X), unknown = 받는 주소가 아님.
export type PasteLinkStatus = PastedReelStatus | "unsupported" | "unknown";

export type PasteLinkRow = {
  // 화면에 보여 줄 원문 (앞 120자)
  line: string;
  platform: HeapLinkPlatform | null;
  status: PasteLinkStatus;
};

export type AddPostLinksResult =
  | { ok: true; rows: PasteLinkRow[]; added: number; visible: ReelCounts }
  | Fail<"not-signed-in" | "not-creator" | "no-room" | "too-many-attempts" | "no-links" | "too-many-links">;

// 크리에이터가 채널 탭에 붙여 넣은 게시물 주소(한 줄에 하나, "<주소> | <제목>"도 받는다)를 방의 카드로 만든다.
// 네트워크를 쓰지 않는다: 제목도 썸네일도 주소와 창작자가 적은 글에서만 온다 (판정 F2/F3, 공식 임베드로만 재생).
// 방은 세션의 사용자로 찾고, 상한과 중복은 repo가 한 트랜잭션에서 지킨다.
export async function addPostLinksAction(text: unknown): Promise<AddPostLinksResult> {
  const auth = await requireCreator();
  if ("ok" in auth) return auth;
  const { viewer } = auth;

  if (typeof text !== "string" || text.length > HEAP_FUNNEL_POLICY.pasteTextMaxChars) return fail("no-links");
  if (!takeAttempt(`paste:${viewer.id}`, HEAP_FUNNEL_POLICY.pasteAttemptsPer10Min, 10 * 60 * 1000)) {
    return fail("too-many-attempts");
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return fail("no-links");
  if (lines.length > HEAP_FUNNEL_POLICY.pasteLinksMax) return fail("too-many-links");

  const room = await getRoomByCreator(viewer.id);
  if (!room) return fail("no-room");

  // 줄 하나씩 해석한다. 받을 수 있는 것만 links로 모으고, 나머지는 그 줄의 결과로 바로 남긴다.
  const rows: PasteLinkRow[] = [];
  const links: PastedReelInput[] = [];
  // 같은 게시물을 두 줄에 적으면 둘째 줄은 이번 붙여넣기 안의 중복이다.
  const seen = new Set<string>();
  for (const line of lines) {
    const shown = line.slice(0, 120);
    const { url, title } = splitPostLine(line);
    const post = parsePostUrl(url);
    if (!post) {
      rows.push({ line: shown, platform: null, status: "unknown" });
      continue;
    }
    if (!isStorableLinkPlatform(post.platform)) {
      rows.push({ line: shown, platform: post.platform, status: "unsupported" });
      continue;
    }
    const key = `${post.platform}:${post.externalId}`;
    if (seen.has(key)) {
      rows.push({ line: shown, platform: post.platform, status: "duplicate" });
      continue;
    }
    seen.add(key);
    rows.push({ line: shown, platform: post.platform, status: "unknown" });
    links.push({
      platform: post.platform,
      externalId: post.externalId,
      sourceUrl: post.sourceUrl,
      // 제목을 적지 않으면 계정 이름, 그것도 없으면 플랫폼 이름으로 둔다.
      title: cleanPostTitle(
        title ?? (post.handle ? `@${post.handle}` : HEAP_PLATFORM_NAME[post.platform]),
        HEAP_FUNNEL_POLICY.pasteTitleMaxChars,
      ),
    });
  }
  if (links.length === 0) {
    return { ok: true, rows, added: 0, visible: { shorts: 0, long: 0, instagram: 0 } };
  }

  const result = await addPastedReels({ roomId: room.id, creatorId: viewer.id, links });
  if ("ok" in result) return fail("no-room");
  // DB가 정한 결과를 줄에 되돌려 붙인다. 줄과 링크는 같은 순서라 앞에서부터 짝이 맞는다.
  let next = 0;
  for (const row of rows) {
    if (row.status !== "unknown" || row.platform === null) continue;
    const link = links[next];
    if (!link) break;
    next += 1;
    row.status = result.outcome[`${link.platform}:${link.externalId}`] ?? "added";
  }
  return { ok: true, rows, added: result.added, visible: result.visible };
}

// ---------- 영상 빼기·되돌리기 ----------

export type SetExcludedResult =
  | { ok: true; changed: boolean }
  | Fail<"not-signed-in" | "not-creator" | "no-room" | "reel-not-found" | "excluded-full">;

async function setExcluded(reelId: unknown, excluded: boolean): Promise<SetExcludedResult> {
  const auth = await requireCreator();
  if ("ok" in auth) return auth;
  if (typeof reelId !== "string") return fail("reel-not-found");
  const result = await setReelExcluded(auth.viewer.id, reelId, excluded);
  return result.ok ? result : fail(result.reason);
}

// 영상 하나를 내 힙에서 뺀다 (영상 ID는 방 화면이 가진 heap_reels.id). 영상 행은 지우지 않고 방 layout의 excludedReels에 적는다.
export async function excludeReelAction(reelId: string): Promise<SetExcludedResult> {
  return setExcluded(reelId, true);
}

// 뺀 영상을 힙으로 되돌린다.
export async function restoreReelAction(reelId: string): Promise<SetExcludedResult> {
  return setExcluded(reelId, false);
}
