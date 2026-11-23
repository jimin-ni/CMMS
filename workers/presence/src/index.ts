// presence 워커 입구. /room/<uuid> 웹소켓만 받는다. 티켓은 주소가 아니라 Sec-WebSocket-Protocol 에 싣는다:
// "presence.v1, <티켓>". 주소에 두면 로그와 기록에 남기 때문이다.
// Origin과 티켓(서명·만료·방)을 여기서 확인하고, 확인한 티켓 내용을 방 DO에 넘긴다.
import { verifyTicket } from "../../../src/lib/heap/presence-ticket";
import { Room, SUBPROTOCOL, TICKET_HEADER } from "./room";

export { Room };

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  PRESENCE_TICKET_SECRET: string;
  // 쉼표로 나눈 허용 출처. 예: http://localhost:3000
  ALLOWED_ORIGINS: string;
}

const ROOM_PATH = /^\/room\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

// "presence.v1, <티켓>" 에서 티켓을 꺼낸다. presence.v1 이 없으면 null
export function ticketFrom(header: string | null): string | null {
  const parts = (header ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2 || !parts.includes(SUBPROTOCOL)) return null;
  return parts.find((s) => s !== SUBPROTOCOL) ?? null;
}

function allowed(origin: string | null, list: string): boolean {
  if (!origin) return false;
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = ROOM_PATH.exec(url.pathname);
    if (!match) return new Response("not found", { status: 404 });
    if (request.method !== "GET" || request.headers.get("Upgrade") !== "websocket") {
      return new Response("websocket only", { status: 426 });
    }
    if (!allowed(request.headers.get("Origin"), env.ALLOWED_ORIGINS ?? "")) {
      return new Response("forbidden", { status: 403 });
    }
    if (!env.PRESENCE_TICKET_SECRET) return new Response("not configured", { status: 503 });

    const roomUuid = match[1];
    const res = await verifyTicket(env.PRESENCE_TICKET_SECRET, ticketFrom(request.headers.get("Sec-WebSocket-Protocol")) ?? "", roomUuid, Math.floor(Date.now() / 1000));
    if (!res.ok) return new Response("bad ticket", { status: 401 });

    // 바깥에서 온 헤더는 버리고, 확인한 티켓만 실어 DO로 보낸다 (DO는 이 워커를 거쳐서만 닿는다).
    const headers = new Headers({ Upgrade: "websocket", [TICKET_HEADER]: encodeURIComponent(JSON.stringify(res.t)) });
    return env.ROOM.getByName(roomUuid).fetch(new Request(request.url, { headers }));
  },
} satisfies ExportedHandler<Env>;
