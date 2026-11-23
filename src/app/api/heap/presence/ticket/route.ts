import { randomUUID } from "node:crypto";
import { roomExists } from "@/lib/heap/repo";
import { signTicket, userKey } from "@/lib/heap/presence-ticket";
import { getViewer } from "@/lib/session";

// 방 함께 있기(presence) 입장 티켓 (docs/dev/presence.md). 로그인한 사람에게만, 60초짜리 1회용.
// 응답과 티켓 어디에도 사용자 id 원문을 넣지 않는다. 티켓의 u 는 비밀값으로 만든 userKey다.
const NO_STORE = { "Cache-Control": "no-store" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TICKET_TTL_SEC = 60;
// 다른 사람에게 보이는 이름의 최대 길이 (워커도 같은 길이로 자른다)
const MAX_NAME = 24;
// 한 사람이 10분에 받을 수 있는 티켓 수. 정상 사용(입장, 다시 붙기, 탭 복귀)은 넉넉히 들어오고 반복 호출은 막힌다.
// 서버 인스턴스마다 따로 세는 근사값이다 (opens/route.ts 와 같은 방식)
const USER_LIMIT = 30;
const USER_WINDOW_MS = 10 * 60 * 1000;
const MAX_KEYS = 5000;
const issued = new Map<string, { start: number; count: number }>();

function overLimit(userId: string): boolean {
  const now = Date.now();
  const cur = issued.get(userId);
  if (!cur || now - cur.start > USER_WINDOW_MS) {
    if (!cur && issued.size >= MAX_KEYS) {
      for (const [k, v] of issued) if (now - v.start > USER_WINDOW_MS) issued.delete(k);
      if (issued.size >= MAX_KEYS) return true;
    }
    issued.set(userId, { start: now, count: 1 });
    return false;
  }
  cur.count += 1;
  return cur.count > USER_LIMIT;
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.PRESENCE_TICKET_SECRET;
  const base = process.env.NEXT_PUBLIC_PRESENCE_URL;
  // 설정이 없으면 presence 를 끈다. 방은 혼자 쓰는 모습 그대로 돈다.
  if (!secret || !base) return Response.json({ off: true }, { status: 404, headers: NO_STORE });

  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "sign-in" }, { status: 401, headers: NO_STORE });
  if (overLimit(viewer.id)) return Response.json({ error: "rate" }, { status: 429, headers: NO_STORE });

  let roomUuid: unknown;
  try {
    roomUuid = ((await request.json()) as { roomUuid?: unknown }).roomUuid;
  } catch {
    return Response.json({ error: "body" }, { status: 400, headers: NO_STORE });
  }
  if (typeof roomUuid !== "string" || !UUID_PATTERN.test(roomUuid)) {
    return Response.json({ error: "room" }, { status: 400, headers: NO_STORE });
  }
  if (!(await roomExists(roomUuid))) return Response.json({ error: "room" }, { status: 404, headers: NO_STORE });

  const ticket = await signTicket(secret, {
    r: roomUuid,
    u: await userKey(secret, viewer.id),
    n: viewer.name.slice(0, MAX_NAME),
    exp: Math.floor(Date.now() / 1000) + TICKET_TTL_SEC,
    j: randomUUID(),
  });
  return Response.json({ ticket, url: `${base.replace(/\/$/, "")}/room/${roomUuid}` }, { headers: NO_STORE });
}
