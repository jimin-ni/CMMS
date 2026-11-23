// 방 하나 = DO 하나. 로그인한 사람 최대 4명의 움직임을 서로에게 전한다 (docs/dev/presence.md).
// 다른 사람에게는 연결마다 새로 만든 peer id와 이름만 보낸다. userKey(티켓의 u)는 같은 사람의 새 탭을 알아보는 데에만 쓴다.
import { DurableObject } from "cloudflare:workers";
import type { PresenceTicket } from "../../../src/lib/heap/presence-ticket";
import { Bucket } from "./limit";
import { MAX_BYTES, parseClient, type ClientMsg, type PeerState, type XZ } from "./protocol";

export const TICKET_HEADER = "x-presence-ticket";
export const CAPACITY = 4;
export const CLOSE_REPLACED = 4001;
export const CLOSE_FULL = 4003;
export const CLOSE_POLICY = 1008;
const COLOURS = 8;

type Attachment = {
  peer: string;
  userKey: string;
  name: string;
  colour: number;
  state: PeerState;
  p: XZ | null;
  ry: number;
  // 서버가 먼저 닫은 소켓. leave 를 이미 보냈다
  gone?: boolean;
};

export type PeerInfo = Omit<Attachment, "userKey" | "gone">;

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
      break;
    case "pos":
      a.state = "walk";
      a.p = m.p;
      a.ry = m.ry;
      break;
    case "sit":
      a.state = "sit";
      a.p = [m.p[0], m.p[2]];
      a.ry = m.ry;
      break;
    case "stand":
      a.state = "idle";
      a.p = m.p;
      a.ry = m.ry;
      break;
    case "snap":
      a.state = m.state;
      a.p = m.p;
      a.ry = m.ry;
      break;
    case "state":
      a.state = m.state;
      break;
  }
}

export class Room extends DurableObject {
  private buckets = new Map<string, Bucket>();

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

    // 같은 사람이 새 탭으로 오면 이전 소켓을 닫는다.
    for (const ws of this.live()) {
      const a = this.att(ws);
      if (a && a.userKey === t.u) this.dropSocket(ws, a, CLOSE_REPLACED, "replaced");
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    if (this.live().length >= CAPACITY) {
      server.accept();
      server.send(JSON.stringify({ t: "full" } satisfies ServerMsg));
      server.close(CLOSE_FULL, "full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const peer = newPeerId();
    const a: Attachment = { peer, userKey: t.u, name: t.n, colour: colourOf(peer), state: "idle", p: null, ry: 0 };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(a);

    const peers = this.live()
      .filter((ws) => ws !== server)
      .map((ws) => this.att(ws))
      .filter((x): x is Attachment => !!x)
      .map(({ peer, name, colour, state, p, ry }) => ({ peer, name, colour, state, p, ry }));
    server.send(JSON.stringify({ t: "hello", you: peer, peers } satisfies ServerMsg));
    this.broadcast(server, { t: "join", peer, name: a.name, colour: a.colour });

    return new Response(null, { status: 101, webSocket: client });
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
    const m = parseClient(message);
    // 모양이 틀린 메시지는 조용히 버린다.
    if (!m) return;
    applyToState(a, m);
    ws.serializeAttachment(a);
    this.broadcast(ws, { ...m, peer: a.peer });
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.onGone(ws);
    if (code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code)) ws.close(code, reason);
    else ws.close();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.onGone(ws);
  }

  private onGone(ws: WebSocket): void {
    const a = this.att(ws);
    if (!a || a.gone) return;
    a.gone = true;
    ws.serializeAttachment(a);
    this.buckets.delete(a.peer);
    this.broadcast(ws, { t: "leave", peer: a.peer });
  }

  // 서버가 먼저 닫을 때: 다른 사람에게 바로 leave 를 보내고 닫는다.
  private dropSocket(ws: WebSocket, a: Attachment, code: number, reason: string): void {
    a.gone = true;
    ws.serializeAttachment(a);
    this.buckets.delete(a.peer);
    this.broadcast(ws, { t: "leave", peer: a.peer });
    ws.close(code, reason);
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
