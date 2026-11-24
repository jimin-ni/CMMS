// 방 하나 = DO 하나. 로그인한 방문자 최대 4명과 방 주인의 움직임을 서로에게 전한다 (docs/dev/presence.md).
// 다른 사람에게는 연결마다 새로 만든 peer id, 이름 공개 규칙에 맞춘 이름, 주인 표시만 보낸다.
// userKey(티켓의 u)는 같은 사람의 새 탭을 알아보는 데에만 쓴다.
// 자리: 방문자 4명 + 방 주인 자리 1개 (주인은 언제나 들어온다). 방문자 자리가 차 있으면,
// 5분 넘게 아무것도 하지 않은 방문자(ping 만 보낸 사람 포함)를 내보내고 새로 온 사람을 들인다.
// 살아 있음 확인: 브라우저가 25초마다 "ping" 을 보내고 런타임이 DO 를 깨우지 않고 "pong" 으로 답한다 (auto response).
// 두 사람 이상 있을 때만 1분마다 알람으로 응답이 끊긴 소켓을 닫는다. 혼자인 방과 빈 방은 깨우지 않는다.
import { DurableObject } from "cloudflare:workers";
import type { NameRule, PresenceTicket } from "../../../src/lib/heap/presence-ticket";
import { Bucket } from "./limit";
import { MAX_BYTES, parseClient, type ClientMsg, type PeerState, type XYZ, type XZ } from "./protocol";

export const TICKET_HEADER = "x-presence-ticket";
export const SUBPROTOCOL = "presence.v1";
// 방문자 자리 수. 방 주인은 이 수에 들지 않는다
export const VISITOR_SEATS = 4;
export const CLOSE_REPLACED = 4001;
export const CLOSE_FULL = 4003;
export const CLOSE_STALE = 4008;
export const CLOSE_IDLE = 4009;
export const CLOSE_POLICY = 1008;
export const PING = "ping";
export const PONG = "pong";
// 이 시간 동안 ping 도 메시지도 없으면 끊긴 것으로 본다 (브라우저는 25초마다 ping)
export const STALE_MS = 75_000;
// 방문자 자리가 찼을 때, 이 시간 넘게 움직임 없는 방문자는 새로 온 사람에게 자리를 내준다
export const IDLE_KICK_MS = 5 * 60_000;
export const SWEEP_MS = 60_000;
export const MAX_NAME = 24;
export const ANON_NAME = "방문자";
const COLOURS = 8;

type Sit = { p: XYZ; ry: number; kind: "seat" | "heap"; seat?: string };

type Attachment = {
  peer: string;
  userKey: string;
  name: string;
  rule: NameRule;
  owner: boolean;
  colour: number;
  state: PeerState;
  p: XZ | null;
  ry: number;
  // 앉아 있거나 더미를 보는 중이면 그 자리. 나중에 들어온 사람의 hello 가 쓴다
  sit: Sit | null;
  // 마지막으로 메시지를 받은 시각 (ms). ping 시각은 런타임이 따로 기억한다
  seen: number;
  // 다른 사람 숨기기: 이 사람에게는 다른 사람 소식을 보내지 않는다
  muted: boolean;
  // 개인 차단 (티켓의 h): 이 userKey 들의 소식은 이 사람에게 보내지 않는다
  hides?: string[];
  // 서버가 먼저 닫은 소켓. leave 를 이미 보냈다
  gone?: boolean;
};

export type PeerInfo = { peer: string; name: string; owner: boolean; colour: number; state: PeerState; p: XZ | null; ry: number; sit: Sit | null };

export type ServerMsg =
  | { t: "hello"; you: string; peers: PeerInfo[] }
  | { t: "join"; peer: string; name: string; owner: boolean; colour: number }
  | { t: "leave"; peer: string }
  | { t: "full" }
  | (Exclude<ClientMsg, { t: "mute" }> & { peer: string });

function colourOf(peer: string): number {
  let h = 0;
  for (const c of peer) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % COLOURS;
}

function newPeerId(): string {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// who 의 이름을 viewer 에게 보여 줄 모양으로. 방 주인은 언제나 이름이 보인다.
// followers: 팔로워 관계(subscriptions)가 아직 없어 방에 있는 로그인한 사람 모두에게 보인다.
// viewer 가 who 를 개인 차단했는가
export function hides(viewer: { hides?: string[] }, who: { userKey: string }): boolean {
  return !!viewer.hides?.includes(who.userKey);
}

export function nameFor(who: { name: string; rule: NameRule; owner: boolean }, viewer: { owner: boolean }): string {
  if (who.owner) return who.name;
  if (who.rule === "followers") return who.name;
  if (who.rule === "creators" && viewer.owner) return who.name;
  return ANON_NAME;
}

function infoFor(a: Attachment, viewer: Attachment): PeerInfo {
  return { peer: a.peer, name: nameFor(a, viewer), owner: a.owner, colour: a.colour, state: a.state, p: a.p, ry: a.ry, sit: a.sit };
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
    case "mute":
      a.muted = m.on;
      break;
  }
}

export class Room extends DurableObject {
  private buckets = new Map<string, Bucket>();
  private staleMs: number;
  private idleMs: number;

  constructor(ctx: DurableObjectState, env: { PRESENCE_STALE_MS?: string; PRESENCE_IDLE_MS?: string }) {
    super(ctx, env as never);
    // 테스트만 짧게 바꾼다 (vitest.config.ts). 배포에는 이 값들을 두지 않는다
    this.staleMs = Number(env?.PRESENCE_STALE_MS) || STALE_MS;
    this.idleMs = Number(env?.PRESENCE_IDLE_MS) || IDLE_KICK_MS;
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

    // 방문자 자리가 찼다: 오래 가만히 있던 방문자가 있으면 그 자리를 내주고, 없으면 정원 초과. 주인은 언제나 들어온다
    if (!t.o && !this.freeVisitorSeat()) {
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
      rule: t.v,
      owner: t.o,
      colour: colourOf(peer),
      state: "idle",
      p: null,
      ry: 0,
      sit: null,
      seen: Date.now(),
      muted: false,
      ...(t.h?.length ? { hides: t.h } : {}),
    };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(a);

    this.sendHello(server, a);
    this.broadcast(server, (viewer) => ({ t: "join", peer, name: nameFor(a, viewer), owner: a.owner, colour: a.colour }));
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
    const wasMuted = a.muted;
    applyToState(a, m);
    ws.serializeAttachment(a);
    if (m.t === "mute") {
      // 다시 보기로 바꾸면 지금 방의 모습을 처음부터 보낸다
      if (wasMuted && !a.muted) this.sendHello(ws, a);
      return;
    }
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

  // 방문자 자리가 하나 있게 만든다. 자리가 차 있으면 가장 오래 가만히 있던 방문자(기준 이상)를 내보낸다
  private freeVisitorSeat(): boolean {
    const visitors = this.live()
      .map((ws) => ({ ws, a: this.att(ws) }))
      .filter((x): x is { ws: WebSocket; a: Attachment } => !!x.a && !x.a.owner);
    if (visitors.length < VISITOR_SEATS) return true;
    const now = Date.now();
    const idlest = visitors.filter((x) => now - x.a.seen >= this.idleMs).sort((x, y) => x.a.seen - y.a.seen)[0];
    if (!idlest) return false;
    this.dropSocket(idlest.ws, idlest.a, CLOSE_IDLE, "idle");
    return true;
  }

  private sendHello(ws: WebSocket, me: Attachment): void {
    const peers = this.live()
      .filter((x) => x !== ws)
      .map((x) => this.att(x))
      .filter((x): x is Attachment => !!x && !hides(me, x))
      .map((x) => infoFor(x, me));
    ws.send(JSON.stringify({ t: "hello", you: me.peer, peers } satisfies ServerMsg));
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

  // 보낸 사람을 뺀 모두에게. 다른 사람 숨기기를 켠 사람은 받지 않는다 (다시 켜면 hello 로 따라잡는다).
  // msg 가 함수면 받는 사람마다 만든다 (이름 공개 규칙)
  private broadcast(from: WebSocket, msg: ServerMsg | ((viewer: Attachment) => ServerMsg)): void {
    const same = typeof msg === "function" ? null : JSON.stringify(msg);
    const sender = this.att(from);
    for (const ws of this.live()) {
      if (ws === from) continue;
      const viewer = this.att(ws);
      if (!viewer || viewer.muted || (sender && hides(viewer, sender))) continue;
      try {
        ws.send(same ?? JSON.stringify((msg as (v: Attachment) => ServerMsg)(viewer)));
      } catch {
        // 닫히는 중인 소켓. close 처리에서 정리된다.
      }
    }
  }
}
