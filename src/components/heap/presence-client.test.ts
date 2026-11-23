import { describe, expect, it } from "vitest";
import { HIDDEN_PAUSE_MS, MAX_FAILS, PING_MS, backoffMs, createPresenceClient, type PresenceStatus } from "./presence-client";

// 가짜 웹소켓, 타이머, 문서. 서버 대신 테스트가 open/close/message 를 일으킨다.
class FakeSocket {
  static last: FakeSocket | null = null;
  static count = 0;
  readyState = 0;
  sent: string[] = [];
  closedWith: number | null = null;
  private handlers: Record<string, ((e: unknown) => void)[]> = {};
  constructor(
    public url: string,
    public protocols?: string[],
  ) {
    FakeSocket.last = this;
    FakeSocket.count += 1;
  }
  addEventListener(type: string, fn: (e: unknown) => void) {
    (this.handlers[type] ??= []).push(fn);
  }
  send(text: string) {
    this.sent.push(text);
  }
  close(code = 1000) {
    this.closedWith = code;
    this.readyState = 3;
  }
  fire(type: string, e: unknown = {}) {
    if (type === "open") this.readyState = 1;
    if (type === "close") this.readyState = 3;
    for (const fn of this.handlers[type] ?? []) fn(e);
  }
}

class FakeDoc {
  hidden = false;
  private fns = new Set<() => void>();
  addEventListener(_t: string, fn: () => void) {
    this.fns.add(fn);
  }
  removeEventListener(_t: string, fn: () => void) {
    this.fns.delete(fn);
  }
  set(hidden: boolean) {
    this.hidden = hidden;
    for (const fn of this.fns) fn();
  }
}

type Timer = { ms: number; fn: () => void; cancelled: boolean; id: number };

function setup(ticketStatus = 200) {
  FakeSocket.last = null;
  FakeSocket.count = 0;
  const timers: Timer[] = [];
  const statuses: PresenceStatus[] = [];
  const doc = new FakeDoc();
  let fetches = 0;
  const bodies: unknown[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    fetches += 1;
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ ticket: "tk.sig", url: "ws://x/room/r" }), { status: ticketStatus });
  }) as unknown as typeof fetch;
  const client = createPresenceClient({
    roomUuid: "11111111-2222-4333-8444-555555555555",
    fetchImpl,
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    setTimeoutImpl: ((fn: () => void, ms: number) => {
      const t = { fn, ms, cancelled: false, id: timers.length + 1 };
      timers.push(t);
      return t.id;
    }) as unknown as typeof setTimeout,
    clearTimeoutImpl: ((id: number) => {
      const t = timers.find((x) => x.id === id);
      if (t) t.cancelled = true;
    }) as unknown as typeof clearTimeout,
    // 흔들기 없이 최대 간격으로
    randomImpl: () => 1,
    doc,
    show: "creators",
  });
  client.onStatus((s) => statuses.push(s));
  const flush = () => new Promise((r) => setTimeout(r, 0));
  // 다시 붙기 타이머만 (ping, 숨김 타이머 제외)
  const retries = () => timers.filter((t) => t.ms !== PING_MS && t.ms !== HIDDEN_PAUSE_MS).map((t) => t.ms);
  return { client, timers, statuses, flush, doc, retries, fetchCount: () => fetches, bodies };
}

describe("backoffMs", () => {
  it("doubles from 1s and caps at 30s", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });
});

describe("presence client", () => {
  it("sends the ticket as a subprotocol, never in the url", async () => {
    const { client, flush } = setup();
    client.start();
    await flush();
    expect(FakeSocket.last?.url).toBe("ws://x/room/r");
    expect(FakeSocket.last?.protocols).toEqual(["presence.v1", "tk.sig"]);
    client.send({ t: "state", state: "idle" });
    expect(FakeSocket.last?.sent).toEqual([]);
    FakeSocket.last!.fire("open");
    expect(client.status()).toBe("open");
    client.send({ t: "state", state: "idle" });
    expect(FakeSocket.last?.sent).toEqual(['{"t":"state","state":"idle"}']);
  });

  it("pings every 25s while open", async () => {
    const { client, timers, flush } = setup();
    client.start();
    await flush();
    FakeSocket.last!.fire("open");
    const ping = timers.find((t) => t.ms === PING_MS && !t.cancelled)!;
    ping.fn();
    expect(FakeSocket.last?.sent).toEqual(["ping"]);
    FakeSocket.last!.fire("message", { data: "pong" });
    expect(client.counts().recv).toBe(0);
  });

  it("4001 means replaced and never reconnects", async () => {
    const { client, retries, flush } = setup();
    client.start();
    await flush();
    FakeSocket.last!.fire("open");
    FakeSocket.last!.fire("close", { code: 4001 });
    expect(client.status()).toBe("replaced");
    expect(retries()).toEqual([]);
  });

  it("4003 means full and never reconnects", async () => {
    const { client, retries, flush } = setup();
    client.start();
    await flush();
    FakeSocket.last!.fire("close", { code: 4003 });
    expect(client.status()).toBe("full");
    expect(retries()).toEqual([]);
  });

  it("1008 stops without a loop", async () => {
    const { client, retries, flush } = setup();
    client.start();
    await flush();
    FakeSocket.last!.fire("open");
    FakeSocket.last!.fire("close", { code: 1008 });
    expect(client.status()).toBe("closed");
    expect(retries()).toEqual([]);
  });

  it("a dropped open connection reconnects with backoff and resets after open", async () => {
    const { client, timers, retries, flush } = setup();
    const seen: string[] = [];
    client.on((m) => seen.push(m.t));
    client.start();
    await flush();
    FakeSocket.last!.fire("open");
    FakeSocket.last!.fire("close", { code: 1006 });
    expect(seen).toContain("reset");
    expect(retries()).toEqual([1000]);
    timers.find((t) => t.ms === 1000)!.fn();
    await flush();
    FakeSocket.last!.fire("open");
    FakeSocket.last!.fire("close", { code: 4008 });
    expect(retries()).toEqual([1000, 1000]);
  });

  it("stops after 5 attempts that never opened (rejected origin or ticket)", async () => {
    const { client, timers, retries, flush, fetchCount } = setup();
    client.start();
    await flush();
    for (let i = 0; i < MAX_FAILS; i++) {
      FakeSocket.last!.fire("close", { code: 1006 });
      const next = timers.filter((t) => t.ms !== PING_MS && !t.cancelled).at(-1);
      if (i < MAX_FAILS - 1) {
        next!.fn();
        await flush();
      }
    }
    expect(client.status()).toBe("closed");
    expect(retries()).toEqual([1000, 2000, 4000, 8000]);
    expect(fetchCount()).toBe(MAX_FAILS);
  });

  it("jitter keeps the wait between half and full backoff", async () => {
    const timers: number[] = [];
    FakeSocket.last = null;
    const client = createPresenceClient({
      roomUuid: "r",
      fetchImpl: (async () => new Response(JSON.stringify({ ticket: "t", url: "ws://x" }))) as unknown as typeof fetch,
      WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
      setTimeoutImpl: ((_fn: () => void, ms: number) => {
        timers.push(ms);
        return 1;
      }) as unknown as typeof setTimeout,
      clearTimeoutImpl: (() => {}) as unknown as typeof clearTimeout,
      randomImpl: () => 0,
      doc: null,
    });
    client.start();
    await new Promise((r) => setTimeout(r, 0));
    FakeSocket.last!.fire("open");
    FakeSocket.last!.fire("close", { code: 1006 });
    expect(timers.filter((ms) => ms !== PING_MS)).toEqual([500]);
  });

  it("a bad socket url stops instead of throwing", async () => {
    const { client, flush } = setup();
    const Throwing = function () {
      throw new SyntaxError("bad url");
    } as unknown as typeof WebSocket;
    const c = createPresenceClient({
      roomUuid: "r",
      fetchImpl: (async () => new Response(JSON.stringify({ ticket: "t", url: "nope" }))) as unknown as typeof fetch,
      WebSocketImpl: Throwing,
      doc: null,
    });
    c.start();
    await flush();
    await flush();
    expect(c.status()).toBe("closed");
    client.close();
  });

  it("a non-json ticket response retries instead of hanging", async () => {
    const timers: number[] = [];
    const c = createPresenceClient({
      roomUuid: "r",
      fetchImpl: (async () => new Response("<html>")) as unknown as typeof fetch,
      WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
      setTimeoutImpl: ((_fn: () => void, ms: number) => {
        timers.push(ms);
        return 1;
      }) as unknown as typeof setTimeout,
      clearTimeoutImpl: (() => {}) as unknown as typeof clearTimeout,
      randomImpl: () => 1,
      doc: null,
    });
    c.start();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(c.status()).toBe("connecting");
    expect(timers).toEqual([1000]);
  });

  it("a tab hidden for 2 minutes gives up its place and comes back when shown", async () => {
    const { client, timers, flush, doc } = setup();
    client.start();
    await flush();
    const first = FakeSocket.last!;
    first.fire("open");
    doc.set(true);
    const hide = timers.find((t) => t.ms === HIDDEN_PAUSE_MS && !t.cancelled)!;
    hide.fn();
    expect(client.status()).toBe("paused");
    expect(first.closedWith).toBe(1000);
    first.fire("close", { code: 1000 });
    expect(client.status()).toBe("paused");
    doc.set(false);
    await flush();
    expect(FakeSocket.count).toBe(2);
    FakeSocket.last!.fire("open");
    expect(client.status()).toBe("open");
  });

  it("a briefly hidden tab keeps its connection", async () => {
    const { client, timers, flush, doc } = setup();
    client.start();
    await flush();
    FakeSocket.last!.fire("open");
    doc.set(true);
    doc.set(false);
    expect(timers.find((t) => t.ms === HIDDEN_PAUSE_MS)!.cancelled).toBe(true);
    expect(client.status()).toBe("open");
  });

  it("401 from the ticket route stops without retry", async () => {
    const { client, retries, flush } = setup(401);
    client.start();
    await flush();
    expect(client.status()).toBe("closed");
    expect(FakeSocket.count).toBe(0);
    expect(retries()).toEqual([]);
  });

  it("keeps the current peers, seats included, for a late or remounted engine", async () => {
    const { client, flush } = setup();
    client.start();
    await flush();
    const s = FakeSocket.last!;
    s.fire("open");
    const msg = (m: unknown) => s.fire("message", { data: JSON.stringify(m) });
    msg({ t: "hello", you: "me", peers: [{ peer: "a", name: "가", owner: true, colour: 1, state: "idle", p: null, ry: 0, sit: null }] });
    msg({ t: "join", peer: "b", name: "나", colour: 2 });
    msg({ t: "sit", peer: "a", p: [1, 0.45, 2], ry: 0.5, kind: "seat" });
    msg({ t: "snap", peer: "a", p: [9, 9], ry: 0, state: "sit" });
    msg({ t: "walk", peer: "b", pts: [[0, 0], [3, 4]] });
    expect(client.peers()).toEqual([
      { peer: "a", name: "가", owner: true, colour: 1, state: "sit", p: [1, 2], ry: 0.5, sit: { p: [1, 0.45, 2], ry: 0.5, kind: "seat" } },
      { peer: "b", name: "나", owner: false, colour: 2, state: "walk", p: [3, 4], ry: 0, sit: null },
    ]);
    msg({ t: "leave", peer: "a" });
    expect(client.peers().map((p) => p.peer)).toEqual(["b"]);
    s.fire("close", { code: 1006 });
    expect(client.peers()).toEqual([]);
  });

  it("asks for a ticket with the room and the name rule", async () => {
    const { client, flush, bodies } = setup();
    client.start();
    await flush();
    expect(bodies[0]).toEqual({ roomUuid: "11111111-2222-4333-8444-555555555555", show: "creators" });
  });

  it("4009 (moved out for being idle) does not reconnect", async () => {
    const { client, retries, flush } = setup();
    client.start();
    await flush();
    FakeSocket.last!.fire("open");
    FakeSocket.last!.fire("close", { code: 4009 });
    expect(client.status()).toBe("kicked");
    expect(retries()).toEqual([]);
  });

  it("hide others: tells the server, clears peers, and re-sends after a reconnect", async () => {
    const { client, timers, flush } = setup();
    const seen: string[] = [];
    client.on((m) => seen.push(m.t));
    client.start();
    await flush();
    FakeSocket.last!.fire("open");
    FakeSocket.last!.fire("message", { data: JSON.stringify({ t: "hello", you: "me", peers: [{ peer: "a", name: "가", owner: false, colour: 0, state: "idle", p: null, ry: 0, sit: null }] }) });
    client.setMuted(true);
    expect(FakeSocket.last!.sent).toEqual(['{"t":"mute","on":true}']);
    expect(seen.at(-1)).toBe("reset");
    expect(client.peers()).toEqual([]);
    FakeSocket.last!.fire("close", { code: 1006 });
    timers.find((t) => t.ms === 1000)!.fn();
    await flush();
    FakeSocket.last!.fire("open");
    expect(FakeSocket.last!.sent).toEqual(['{"t":"mute","on":true}']);
    client.setMuted(false);
    expect(FakeSocket.last!.sent.at(-1)).toBe('{"t":"mute","on":false}');
  });

  it("close() stops everything", async () => {
    const { client, retries, flush, doc } = setup();
    client.start();
    await flush();
    client.close();
    FakeSocket.last!.fire("close", { code: 1006 });
    doc.set(true);
    expect(retries()).toEqual([]);
    expect(client.status()).toBe("closed");
  });
});

describe("presence hub", () => {
  it("forwards the attached connection and clears figures when it is swapped", async () => {
    const { createPresenceHub } = await import("./presence-client");
    const hub = createPresenceHub();
    const seen: string[] = [];
    hub.on((m) => seen.push(m.t));
    const mk = () => {
      const fns = new Set<(m: { t: string }) => void>();
      return {
        on: (fn: (m: { t: string }) => void) => (fns.add(fn), () => fns.delete(fn)),
        onStatus: () => () => {},
        fire: (t: string) => fns.forEach((fn) => fn({ t })),
      };
    };
    const a = mk(), b = mk();
    expect(hub.active()).toBe(false);
    hub.attach(a as never);
    a.fire("hello");
    hub.attach(b as never);
    a.fire("walk");
    b.fire("join");
    hub.attach(null);
    expect(seen).toEqual(["hello", "reset", "join", "reset"]);
    expect(hub.active()).toBe(false);
    expect(hub.peers()).toEqual([]);
  });
});
