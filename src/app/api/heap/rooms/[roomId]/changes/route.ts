import {
  ZERO_UUID,
  getRoomChangesSince,
  type HeapChangesCursor,
  type HeapChangesPosition,
} from "@/lib/heap/repo";
import { getViewer } from "@/lib/session";

// 실시간 읽기: ?since=<기준점> 뒤에 바뀐 방명록, 조각, 방문 수를 돌려준다. roomId는 방의 uuid.
// 기준점은 응답의 cursor를 그대로 되돌려 보내는 불투명 문자열이다. 방 화면이 처음 여는 값만 ISO 시각이다.
// 한 번에 주는 줄 수에는 상한이 있다. 응답의 more가 true면 받은 cursor로 이어서 읽는다.
// 지금은 클라이언트가 폴링한다. 로그인하지 않아도 읽을 수 있고, 그때는 조각의 voted가 항상 false다.
const NO_STORE = { "Cache-Control": "no-store" };
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,400}$/;

// 달력 값이 실제로 있는 날짜와 시각인지 확인한 뒤 Date로 바꾼다. 2026-02-31이나 24:00:00은 다음 날로 밀려서 통과하므로 직접 거른다.
function parseStrictIso(value: string): Date | null {
  if (!ISO_PATTERN.test(value)) return null;
  const [y, mo, d, h, mi, s] = value.slice(0, 19).split(/[-T:]/).map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth || h > 23 || mi > 59 || s > 59) return null;
  const offset = /[+-](\d{2}):(\d{2})$/.exec(value);
  if (offset && (Number(offset[1]) > 23 || Number(offset[2]) > 59)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// 기준점 문자열 = base64url("방명록시각|방명록id|조각시각|조각id"). 시각은 UTC ISO(마이크로초까지), id는 소문자 uuid.
function encodePosition(pos: HeapChangesPosition): string {
  return `${pos.ts}|${pos.id}`;
}

function encodeCursor(cursor: HeapChangesCursor): string {
  return Buffer.from(`${encodePosition(cursor.guestbook)}|${encodePosition(cursor.pieces)}`).toString("base64url");
}

function parsePosition(ts: string, id: string): HeapChangesPosition | null {
  if (!UTC_ISO_PATTERN.test(ts) || !parseStrictIso(ts) || !UUID_PATTERN.test(id)) return null;
  return { ts, id };
}

function decodeCursor(value: string): HeapChangesCursor | null {
  if (!CURSOR_PATTERN.test(value)) return null;
  const decoded = Buffer.from(value, "base64url").toString("utf8");
  // 다시 인코딩했을 때 같아야 한다. 같은 뜻의 다른 문자열은 받지 않는다.
  if (Buffer.from(decoded).toString("base64url") !== value) return null;
  const parts = decoded.split("|");
  if (parts.length !== 4) return null;
  const guestbook = parsePosition(parts[0], parts[1]);
  const pieces = parsePosition(parts[2], parts[3]);
  return guestbook && pieces ? { guestbook, pieces } : null;
}

// 예전 방식(ISO 시각 하나)도 받는다. 두 목록이 같은 시각에서 시작한다.
function parseSince(value: string): HeapChangesCursor | null {
  const date = parseStrictIso(value);
  if (date) {
    const pos = { ts: date.toISOString(), id: ZERO_UUID };
    return { guestbook: pos, pieces: pos };
  }
  return decodeCursor(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const sinceParam = new URL(request.url).searchParams.get("since");
  const since = sinceParam ? parseSince(sinceParam) : null;
  if (!since) {
    return Response.json({ error: "잘못된 요청이에요." }, { status: 400, headers: NO_STORE });
  }

  const { roomId } = await params;
  const viewer = await getViewer();
  const changes = await getRoomChangesSince(roomId, since, viewer?.id ?? null);
  if (!changes) {
    return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404, headers: NO_STORE });
  }

  const { voteThreshold, creatorVisitedAt, guestbook, pieces, removedPieceIds, visits, more, nextCursor } = changes;
  return Response.json(
    { voteThreshold, creatorVisitedAt, guestbook, pieces, removedPieceIds, visits, more, cursor: encodeCursor(nextCursor) },
    { headers: NO_STORE },
  );
}
