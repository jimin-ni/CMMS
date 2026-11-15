import { getRoomCreatorId, isRoomTarget, listOpenStats, recordOpen, type HeapOpenKind } from "@/lib/heap/analytics-repo";
import { getViewer } from "@/lib/session";

// 열람 수 집계(DECISIONS M). POST는 엔진이 navigator.sendBeacon으로 던지는 쏘고 잊는 호출이라 항상 204를 돌려준다.
// 방에 없는 대상, 주인 본인, 한도 초과는 조용히 버린다. 숫자는 근사값이다 (IP 한도와 메모리 카운터를 쓴다).
// GET ?days=7|30은 방 주인에게만 통계를 준다.
const NO_STORE = { "Cache-Control": "no-store" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY = 4096;
const MAX_TARGET = 2048;
const IP_LIMIT = 60;
const IP_WINDOW_MS = 10 * 60 * 1000;

// 서버리스 인스턴스마다 따로 센다. 정확한 제한이 아니라 부풀리기 억제용이다.
const hits = new Map<string, { start: number; count: number }>();
let lastPrune = 0;

function overLimit(ip: string, roomId: string): boolean {
  const now = Date.now();
  if (now - lastPrune > IP_WINDOW_MS) {
    lastPrune = now;
    for (const [key, v] of hits) if (now - v.start > IP_WINDOW_MS) hits.delete(key);
  }
  const key = `${ip}|${roomId}`;
  const cur = hits.get(key);
  if (!cur || now - cur.start > IP_WINDOW_MS) {
    hits.set(key, { start: now, count: 1 });
    return false;
  }
  cur.count += 1;
  return cur.count > IP_LIMIT;
}

const done = () => new Response(null, { status: 204, headers: NO_STORE });

export async function POST(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    if (!UUID_PATTERN.test(roomId)) return done();
    const text = await request.text();
    if (text.length > MAX_BODY) return done();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return done();
    }
    const { kind, target } = (body ?? {}) as { kind?: unknown; target?: unknown };
    if ((kind !== "link" && kind !== "reel") || typeof target !== "string") return done();
    if (target.length < 1 || target.length > MAX_TARGET) return done();

    const creatorId = await getRoomCreatorId(roomId);
    if (!creatorId) return done();
    const viewer = await getViewer();
    if (viewer?.id === creatorId) return done();

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (overLimit(ip, roomId)) return done();
    if (!(await isRoomTarget(roomId, kind as HeapOpenKind, target))) return done();
    await recordOpen(roomId, kind as HeapOpenKind, target);
  } catch {
    // 집계 실패는 화면에 영향을 주지 않는다.
  }
  return done();
}

export async function GET(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const days = new URL(request.url).searchParams.get("days");
  if (!UUID_PATTERN.test(roomId) || (days !== "7" && days !== "30")) {
    return Response.json({ error: "잘못된 요청이에요." }, { status: 400, headers: NO_STORE });
  }
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "로그인이 필요해요." }, { status: 401, headers: NO_STORE });
  const creatorId = await getRoomCreatorId(roomId);
  if (!creatorId || creatorId !== viewer.id) {
    return Response.json({ error: "방 주인만 볼 수 있어요." }, { status: 403, headers: NO_STORE });
  }
  const stats = await listOpenStats(roomId, days === "7" ? 7 : 30);
  return Response.json(stats, { headers: NO_STORE });
}
