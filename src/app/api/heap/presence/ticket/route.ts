import { randomUUID } from "node:crypto";
import { roomExists } from "@/lib/heap/repo";
import { signTicket, userKey } from "@/lib/heap/presence-ticket";
import { getViewer } from "@/lib/session";

// 방 함께 있기(presence) 입장 티켓 (docs/dev/presence.md). 로그인한 사람에게만, 60초짜리 1회용.
// 응답과 티켓 어디에도 사용자 id 원문을 넣지 않는다. 티켓의 u 는 비밀값으로 만든 userKey다.
const NO_STORE = { "Cache-Control": "no-store" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TICKET_TTL_SEC = 60;

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.PRESENCE_TICKET_SECRET;
  const base = process.env.NEXT_PUBLIC_PRESENCE_URL;
  // 설정이 없으면 presence 를 끈다. 방은 혼자 쓰는 모습 그대로 돈다.
  if (!secret || !base) return Response.json({ off: true }, { status: 404, headers: NO_STORE });

  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "sign-in" }, { status: 401, headers: NO_STORE });

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
    n: viewer.name,
    exp: Math.floor(Date.now() / 1000) + TICKET_TTL_SEC,
    j: randomUUID(),
  });
  return Response.json({ ticket, url: `${base.replace(/\/$/, "")}/room/${roomUuid}` }, { headers: NO_STORE });
}
