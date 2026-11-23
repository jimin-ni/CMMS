import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { signTicket, type PresenceTicket } from "../../../src/lib/heap/presence-ticket";

const SECRET = "test-secret-not-real";
const ORIGIN = "http://localhost:3000";

let seq = 0;
function roomId(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
}

async function ticket(room: string, over: Partial<PresenceTicket> = {}): Promise<string> {
  seq += 1;
  return signTicket(SECRET, { r: room, u: `user-${seq}`, n: `사람${seq}`, exp: Math.floor(Date.now() / 1000) + 60, j: `j-${seq}`, ...over });
}

type Conn = {
  ws: WebSocket;
  msgs: Record<string, unknown>[];
  next: (pred: (m: Record<string, unknown>) => boolean, ms?: number) => Promise<Record<string, unknown>>;
  closed: Promise<number>;
};

async function open(room: string, token: string, origin = ORIGIN): Promise<Response> {
  return exports.default.fetch(`http://presence.test/room/${room}`, {
    headers: { Upgrade: "websocket", Origin: origin, "Sec-WebSocket-Protocol": `presence.v1, ${token}` },
  });
}

async function connect(room: string, token?: string): Promise<Conn> {
  const res = await open(room, token ?? (await ticket(room)));
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  const msgs: Record<string, unknown>[] = [];
  const waiters: { pred: (m: Record<string, unknown>) => boolean; resolve: (m: Record<string, unknown>) => void }[] = [];
  let resolveClosed!: (code: number) => void;
  const closed = new Promise<number>((r) => (resolveClosed = r));
  ws.addEventListener("message", (e) => {
    if (e.data === "pong") return;
    const m = JSON.parse(e.data as string);
    msgs.push(m);
    for (const w of [...waiters]) {
      if (w.pred(m)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(m);
      }
    }
  });
  ws.addEventListener("close", (e) => resolveClosed(e.code));
  ws.accept();
  const next = (pred: (m: Record<string, unknown>) => boolean, ms = 2000) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const hit = msgs.find(pred);
      if (hit) return resolve(hit);
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error("timeout waiting for message")), ms);
    });
  return { ws, msgs, next, closed };
}

const settle = () => new Promise((r) => setTimeout(r, 50));

describe("worker entry", () => {
  it("rejects missing ticket", async () => {
    const res = await exports.default.fetch(`http://presence.test/room/${roomId()}`, { headers: { Upgrade: "websocket", Origin: ORIGIN } });
    expect(res.status).toBe(401);
  });

  it("rejects bad origin", async () => {
    const room = roomId();
    expect((await open(room, await ticket(room), "https://evil.example")).status).toBe(403);
  });

  it("rejects expired ticket", async () => {
    const room = roomId();
    expect((await open(room, await ticket(room, { exp: 1 }))).status).toBe(401);
  });

  it("rejects a ticket for another room", async () => {
    const room = roomId();
    expect((await open(room, await ticket(roomId()))).status).toBe(401);
  });

  it("rejects a reused ticket", async () => {
    const room = roomId();
    const t = await ticket(room);
    await connect(room, t);
    expect((await open(room, t)).status).toBe(401);
  });

  it("rejects a ticket in the url instead of the subprotocol", async () => {
    const room = roomId();
    const t = await ticket(room);
    const res = await exports.default.fetch(`http://presence.test/room/${room}?t=${encodeURIComponent(t)}`, {
      headers: { Upgrade: "websocket", Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("echoes the subprotocol", async () => {
    const room = roomId();
    const res = await open(room, await ticket(room));
    expect(res.status).toBe(101);
    expect(res.headers.get("Sec-WebSocket-Protocol")).toBe("presence.v1");
    res.webSocket!.accept();
    res.webSocket!.close(1000);
  });

  it("rejects non-websocket", async () => {
    expect((await exports.default.fetch(`http://presence.test/room/${roomId()}`)).status).toBe(426);
  });
});

describe("room", () => {
  it("relays to others but not the sender, and hides user keys", async () => {
    const room = roomId();
    const a = await connect(room);
    const helloA = await a.next((m) => m.t === "hello");
    const b = await connect(room);
    const c = await connect(room);
    await a.next((m) => m.t === "join" && m.name !== undefined);
    a.ws.send(JSON.stringify({ t: "walk", pts: [[0, 0], [1, 1]] }));
    const atB = await b.next((m) => m.t === "walk");
    const atC = await c.next((m) => m.t === "walk");
    expect(atB.peer).toBe(helloA.you);
    expect(atC.peer).toBe(helloA.you);
    await settle();
    expect(a.msgs.some((m) => m.t === "walk")).toBe(false);
    const all = JSON.stringify([...a.msgs, ...b.msgs, ...c.msgs]);
    expect(all).not.toMatch(/user-\d+/);
  });

  it("5th connection gets full and 4003", async () => {
    const room = roomId();
    for (let i = 0; i < 4; i++) await connect(room);
    const e = await connect(room);
    await e.next((m) => m.t === "full");
    expect(await e.closed).toBe(4003);
  });

  it("same user in a new tab closes the old socket with 4001", async () => {
    const room = roomId();
    const first = await connect(room, await ticket(room, { u: "same-key" }));
    const other = await connect(room);
    const second = await connect(room, await ticket(room, { u: "same-key" }));
    expect(await first.closed).toBe(4001);
    const helloFirst = first.msgs.find((m) => m.t === "hello")!;
    await other.next((m) => m.t === "leave" && m.peer === helloFirst.you);
    await second.next((m) => m.t === "hello");
  });

  it("leave on close", async () => {
    const room = roomId();
    const a = await connect(room);
    const helloA = await a.next((m) => m.t === "hello");
    const b = await connect(room);
    a.ws.close(1000, "bye");
    await b.next((m) => m.t === "leave" && m.peer === helloA.you);
  });

  it("hello includes the last snap of existing peers", async () => {
    const room = roomId();
    const a = await connect(room);
    const helloA = await a.next((m) => m.t === "hello");
    const b = await connect(room);
    a.ws.send(JSON.stringify({ t: "snap", p: [2, -1], ry: 0.5, state: "busy" }));
    await b.next((m) => m.t === "snap");
    const c = await connect(room);
    const helloC = await c.next((m) => m.t === "hello");
    const peerA = (helloC.peers as Record<string, unknown>[]).find((p) => p.peer === helloA.you);
    expect(peerA).toMatchObject({ state: "busy", p: [2, -1], ry: 0.5 });
    expect(peerA).not.toHaveProperty("userKey");
  });

  it("oversized message closes only the sender with 1008", async () => {
    const room = roomId();
    const a = await connect(room);
    const b = await connect(room);
    const c = await connect(room);
    a.ws.send("x".repeat(600));
    expect(await a.closed).toBe(1008);
    b.ws.send(JSON.stringify({ t: "state", state: "idle" }));
    await c.next((m) => m.t === "state");
  });

  it("flood closes the sender with 1008", async () => {
    const room = roomId();
    const a = await connect(room);
    await connect(room);
    for (let i = 0; i < 60; i++) a.ws.send(JSON.stringify({ t: "state", state: "idle" }));
    expect(await a.closed).toBe(1008);
  });

  it("malformed message is dropped without closing", async () => {
    const room = roomId();
    const a = await connect(room);
    const b = await connect(room);
    a.ws.send(JSON.stringify({ t: "teleport" }));
    a.ws.send(JSON.stringify({ t: "state", state: "away" }));
    const got = await b.next((m) => m.t === "state");
    expect(got.state).toBe("away");
    expect(b.msgs.some((m) => m.t === "teleport")).toBe(false);
  });
});

describe("liveness and late joiners", () => {
  it("answers ping with pong", async () => {
    const room = roomId();
    const a = await connect(room);
    a.ws.send("ping");
    const got = await new Promise<string>((resolve) => {
      a.ws.addEventListener("message", (e) => {
        if (e.data === "pong") resolve("pong");
      });
    });
    expect(got).toBe("pong");
  });

  it("a silent socket loses its place, a pinging one keeps it", async () => {
    const room = roomId();
    const alive = await connect(room);
    const silent = await connect(room);
    const helloSilent = await silent.next((m) => m.t === "hello");
    // 테스트 설정의 끊김 기준은 600ms. alive 만 그 사이 ping 을 보낸다
    await new Promise((r) => setTimeout(r, 400));
    alive.ws.send("ping");
    await new Promise((r) => setTimeout(r, 400));
    const late = await connect(room);
    expect(await silent.closed).toBe(4008);
    await alive.next((m) => m.t === "leave" && m.peer === helloSilent.you);
    const helloLate = await late.next((m) => m.t === "hello");
    expect((helloLate.peers as unknown[]).length).toBe(1);
  });

  it("hello tells a late joiner who is seated and where", async () => {
    const room = roomId();
    const a = await connect(room);
    const helloA = await a.next((m) => m.t === "hello");
    const b = await connect(room);
    a.ws.send(JSON.stringify({ t: "sit", p: [1, 0.45, 2], ry: 1.5, kind: "seat", seat: "k3f9qa:01" }));
    await b.next((m) => m.t === "sit");
    a.ws.send(JSON.stringify({ t: "snap", p: [9, 9], ry: 0, state: "sit" }));
    await b.next((m) => m.t === "snap");
    const c = await connect(room);
    const helloC = await c.next((m) => m.t === "hello");
    const peerA = (helloC.peers as Record<string, unknown>[]).find((p) => p.peer === helloA.you);
    expect(peerA).toMatchObject({ state: "sit", p: [1, 2], sit: { p: [1, 0.45, 2], ry: 1.5, kind: "seat", seat: "k3f9qa:01" } });
  });

  it("cuts a long display name", async () => {
    const room = roomId();
    const a = await connect(room);
    await connect(room, await ticket(room, { n: "가".repeat(200) }));
    const join = await a.next((m) => m.t === "join");
    expect((join.name as string).length).toBe(24);
  });
});
