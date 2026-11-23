// 방 하나 = DO 하나. 로그인한 사람 최대 4명의 움직임을 서로에게 전한다 (docs/dev/presence.md).
// 다른 사람에게는 연결마다 새로 만든 peer id와 이름만 보낸다. userKey(티켓의 u)는 같은 사람의 새 탭을 알아보는 데에만 쓴다.
// 살아 있음 확인: 브라우저가 25초마다 "ping" 을 보내고 런타임이 DO 를 깨우지 않고 "pong" 으로 답한다 (auto response).
// 두 사람 이상 있을 때만 1분마다 알람으로 응답이 끊긴 소켓을 닫는다. 혼자인 방과 빈 방은 깨우지 않는다.
import { DurableObject } from "cloudflare:workers";
import type { PresenceTicket } from "../../../src/lib/heap/presence-ticket";
import { Bucket } from "./limit";
import { MAX_BYTES, parseClient, type ClientMsg, type PeerState, type XYZ, type XZ } from "./protocol";

export const TICKET_HEADER = "x-presence-ticket";
export const SUBPROTOCOL = "presence.v1";
export const CAPACITY = 4;
export const CLOSE_REPLACED = 4001;
export const CLOSE_FULL = 4003;
export const CLOSE_STALE = 4008;
export const CLOSE_POLICY = 1008;
export const PING = "ping";
export const PONG = "pong";
// 이 시간 동안 ping 도 메시지도 없으면 끊긴 것으로 본다 (브라우저는 25초마다 ping)
export const STALE_MS = 75_000;
export const SWEEP_MS = 60_000;
export const MAX_NAME = 24;
const COLOURS = 8;

type Sit = { p: XYZ; ry: number; kind: "seat" | "heap"; seat?: string };

type Attachment = {
  peer: string;
  userKey: string;
  name: string;
  colour: number;
  state: PeerState;
  p: XZ | null;
  ry: number;
  // 앉아 있거나 더미를 보는 중이면 그 자리. 나중에 들어온 사람의 hello 가 쓴다
  sit: Sit | null;
  // 마지막으로 메시지를 받은 시각 (ms). ping 시각은 런타임이 따로 기억한다
  seen: number;
  // 서버가 먼저 닫은 소켓. leave 를 이미 보냈다
  gone?: boolean;
};

export type PeerInfo = Omit<Attachment, "userKey" | "gone" | "seen">;

export type ServerMsg =
  | { t: "hello"; you: string; peers: PeerInfo[] }
  | { t: "join"; peer: string; name: string; colour: number }
  | { t: "leave"; peer: string }
  | { t: "full" }
  | (ClientMsg & { peer: string });

function colourOf(peer: string): number {
  let h = 0;
  for (const c of peer) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % COLOURS;
}

function newPeerId(): string {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// 받은 메시지로 그 사람의 마지막 모습을 고친다. 새로 들어온 사람의 hello 에 쓰인다.
function applyToState(a: Attachment, m: ClientMsg): void {
  switch (m.t) {
    case "walk":
      a.state = "walk";
      a.p = m.pts[m.pts.length - 1];
      a.sit = null;
      break;
    case "pos":
      a.state = "walk";
      a.p = m.p;
      a.ry = m.ry;
      a.sit = null;
      break;
    case "sit":
      a.state = "sit";
      a.p = [m.p[0], m.p[2]];
      a.ry = m.ry;
      a.sit = { p: m.p, ry: m.ry, kind: m.kind, ...(m.seat ? { seat: m.seat } : {}) };
      break;
    case "stand":
      a.state = "idle";
      a.p = m.p;
      a.ry = m.ry;
      a.sit = null;
      break;
    case "snap":
      a.state = m.state;
      // 앉은 사람의 snap 은 자리를 지우지 않는다 (일어나면 stand 가 온다)
      if (!a.sit) {
        a.p = m.p;
        a.ry = m.ry;
      }
      break;
    case "state":
      a.state = m.state;
      break;
  }
}

export class Room extends DurableObject {
  private buckets = new Map<string, Bucket>();
  private staleMs: number;

  constructor(ctx: DurableObjectState, env: { PRESENCE_STALE_MS?: string }) {
    super(ctx, env as never);
    // 테스트만 짧게 바꾼다 (vitest.config.ts). 배포에는 이 값을 두지 않는다
    this.staleMs = Number(env?.PRESENCE_STALE_MS) || STALE_MS;
    // 런타임이 DO 를 깨우지 않고 답한다. 쉬는 방에 비용이 들지 않는다
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  async fetch(request: Request): Promise<Response> {
    let t: PresenceTicket;
    try {
      t = JSON.parse(decodeURIComponent(request.headers.get(TICKET_HEADER) ?? ""));
    } catch {
      return new Response("bad ticket", { status: 401 });
    }

    // 티켓은 한 번만 쓴다. 쓴 id 를 만료 시각까지 기억하고, 지난 것은 이때 지운다.
    const nowSec = Math.floor(Date.now() / 1000);
    const used = await this.ctx.storage.list<number>({ prefix: "j:" });
    const stale = [...used].filter(([, exp]) => exp < nowSec).map(([k]) => k);
    if (stale.length) await this.ctx.storage.delete(stale);
    if (used.has(`j:${t.j}`)) return new Response("ticket used", { status: 401 });
    await this.ctx.storage.put(`j:${t.j}`, t.exp);

    // 들어오기 전에 끊긴 소켓을 정리한다 (잠든 노트북이 자리를 붙잡지 않게)
    this.sweep();

    // 같은 사람이 새 탭으로 오면 이전 소켓을 닫는다.
    for (const ws of this.live()) {
      const a = this.att(ws);
      if (a && a.userKey === t.u) this.dropSocket(ws, a, CLOSE_REPLACED, "replaced");
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const headers = { "Sec-WebSocket-Protocol": SUBPROTOCOL };

    if (this.live().length >= CAPACITY) {
      server.accept();
      server.send(JSON.stringify({ t: "full" } satisfies ServerMsg));
      server.close(CLOSE_FULL, "full");
      return new Response(null, { status: 101, webSocket: client, headers });
    }

    const peer = newPeerId();
    const a: Attachment = {
      peer,
      userKey: t.u,
      name: t.n.slice(0, MAX_NAME),
      colour: colourOf(peer),
      state: "idle",
      p: null,
      ry: 0,
      sit: null,
      seen: Date.now(),
    };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(a);

    const peers = this.live()
      .filter((ws) => ws !== server)
      .map((ws) => this.att(ws))
      .filter((x): x is Attachment => !!x)
      .map(({ peer, name, colour, state, p, ry, sit }) => ({ peer, name, colour, state, p, ry, sit }));
    server.send(JSON.stringify({ t: "hello", you: peer, peers } satisfies ServerMsg));
    this.broadcast(server, { t: "join", peer, name: a.name, colour: a.colour });
    await this.armSweep();

    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const a = this.att(ws);
    if (!a || a.gone) return;
    if (typeof message !== "string" || message.length > MAX_BYTES) {
      this.dropSocket(ws, a, CLOSE_POLICY, "message");
      return;
    }
    let bucket = this.buckets.get(a.peer);
    if (!bucket) this.buckets.set(a.peer, (bucket = new Bucket()));
    if (!bucket.take(Date.now())) {
      this.dropSocket(ws, a, CLOSE_POLICY, "rate");
      return;
    }
    a.seen = Date.now();
    const m = parseClient(message);
    // 모양이 틀린 메시지는 조용히 버린다.
    if (!m) {
      ws.serializeAttachment(a);
      return;
    }
    applyToState(a, m);
    ws.serializeAttachment(a);
    this.broadcast(ws, { ...m, peer: a.peer });
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.onGone(ws);
    try {
      if (code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code)) ws.close(code, reason);
      else ws.close();
    } catch {
      // 이미 닫힌 소켓
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.onGone(ws);
  }

  // 1분마다: 끊긴 소켓을 닫는다. 두 사람 이상 남아 있을 때만 다시 건다.
  async alarm(): Promise<void> {
    this.sweep();
    await this.armSweep();
  }

  private async armSweep(): Promise<void> {
    if (this.live().length < 2) return;
    if ((await this.ctx.storage.getAlarm()) !== null) return;
    await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
  }

  private sweep(): void {
    const now = Date.now();
    for (const ws of this.live()) {
      const a = this.att(ws);
      if (!a) continue;
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
      if (now - Math.max(pinged, a.seen) > this.staleMs) this.dropSocket(ws, a, CLOSE_STALE, "stale");
    }
  }

  private onGone(ws: WebSocket): void {
    const a = this.att(ws);
    if (!a || a.gone) return;
    a.gone = true;
    try {
      ws.serializeAttachment(a);
    } catch {
      // 닫힌 소켓에는 붙일 수 없다. 아래 정리는 계속한다
    }
    this.buckets.delete(a.peer);
    this.broadcast(ws, { t: "leave", peer: a.peer });
  }

  // 서버가 먼저 닫을 때: 다른 사람에게 바로 leave 를 보내고 닫는다.
  private dropSocket(ws: WebSocket, a: Attachment, code: number, reason: string): void {
    a.gone = true;
    ws.serializeAttachment(a);
    this.buckets.delete(a.peer);
    this.broadcast(ws, { t: "leave", peer: a.peer });
    try {
      ws.close(code, reason);
    } catch {
      // 이미 닫히는 중
    }
  }

  private att(ws: WebSocket): Attachment | null {
    return (ws.deserializeAttachment() as Attachment | null) ?? null;
  }

  private live(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN && !this.att(ws)?.gone);
  }

  private broadcast(from: WebSocket, msg: ServerMsg): void {
    const text = JSON.stringify(msg);
    for (const ws of this.live()) {
      if (ws === from) continue;
      try {
        ws.send(text);
      } catch {
        // 닫히는 중인 소켓. close 처리에서 정리된다.
      }
    }
  }
}
