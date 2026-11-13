import { HEAP_POLICY } from "@/lib/heap/policy";
import { getRoomChangesSince } from "@/lib/heap/repo";
import { getViewer } from "@/lib/session";

// 실시간 읽기: ?since=<ISO 시각> 뒤에 바뀐 방명록, 조각, 방문 수를 돌려준다. roomId는 방의 uuid.
// 지금은 클라이언트가 폴링한다. 로그인하지 않아도 읽을 수 있고, 그때는 조각의 voted가 항상 false다.
const NO_STORE = { "Cache-Control": "no-store" };
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const sinceParam = new URL(request.url).searchParams.get("since");
  const since = sinceParam ? parseStrictIso(sinceParam) : null;
  if (!since) {
    return Response.json({ error: "잘못된 요청이에요." }, { status: 400, headers: NO_STORE });
  }

  const { roomId } = await params;
  const viewer = await getViewer();
  const changes = await getRoomChangesSince(roomId, since, viewer?.id ?? null);
  if (!changes) {
    return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404, headers: NO_STORE });
  }

  const { serverTime, ...rest } = changes;
  // 늦게 커밋된 변경을 놓치지 않도록 다음 기준점을 조금 앞당긴다. 겹쳐서 온 줄은 클라이언트가 id로 합친다.
  return Response.json(
    { ...rest, cursor: new Date(serverTime.getTime() - HEAP_POLICY.changesCursorOverlapMs).toISOString() },
    { headers: NO_STORE },
  );
}
