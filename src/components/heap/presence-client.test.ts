import { describe, expect, it } from "vitest";
import { backoffMs, createPresenceClient, type PresenceStatus } from "./presence-client";

// 가짜 웹소켓과 타이머. 서버 대신 테스트가 open/close/message 를 일으킨다.
class FakeSocket {
  static last: FakeSocket | null = null;
  static count = 0;
  readyState = 0;
  sent: string[] = [];
  private handlers: Record<string, ((e: unknown) => void)[]> = {};
  constructor(public url: string) {
    FakeSocket.last = this;
    FakeSocket.count += 1;
  }
  addEventListener(type: string, fn: (e: unknown) => void) {
    (this.handlers[type] ??= []).push(fn);
  }
  send(text: string) {
    this.sent.push(text);
  }
  close() {
    this.readyState = 3;
  }
  fire(type: string, e: unknown = {}) {
    if (type === "open") this.readyState = 1;
    if (type === "close") this.readyState = 3;
    for (const fn of this.handlers[type] ?? []) fn(e);
  }
}

function setup(ticketStatus = 200) {
  FakeSocket.last = null;
  FakeSocket.count = 0;
  const timers: { ms: number; fn: () => void }[] = [];
  const statuses: PresenceStatus[] = [];
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ ticket: "tk", url: "ws://x/room/r" }), { status: ticketStatus })) as unknown as typeof fetch;
  const client = createPresenceClient({
    roomUuid: "11111111-2222-4333-8444-555555555555",
    fetchImpl,
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    setTimeoutImpl: ((fn: () => void, ms: number) => {
      timers.push({ fn, ms });
      return timers.length;
    }) as unknown as typeof setTimeout,
    clearTimeoutImpl: (() => {}) as unknown as typeof clearTimeout,
  });
  client.onStatus((s) => statuses.push(s));
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { client, timers, statuses, flush };
}

describe("backoffMs", () => {
  it("doubles from 1s and caps at 30s", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });
});

describe("presence client", () => {
  it("opens with the ticket in the url and sends while open", async () => {
    const { client, flush } = setup();
    client.start();
    await flush();
    expect(FakeSocket.last?.url).toBe("ws://x/room/r?t=tk");
    client.send({ t: "state", state: "idle" });
    expect(FakeSocket.last?.sent).toEqual([]);
    FakeSocket.last!.fire("open");
    expect(client.status()).toBe("open");
    client.send({ t: "state", state: "idle" });
    expect(FakeSocket.last?.sent).toEqual(['{"t":"state","state":"idle"}']);
  });

  it("4001 means replaced and never reconnects", async () => {
    const { client, timers, flush } = setup();
    client.start();
    await flush();
    FakeSocket.last!.fire("open");
    FakeSocket.last!.fire("close", { code: 4001 });
    expect(client.status()).toBe("replaced");
    expect(timers).toEqual([]);
  });

  it("4003 means full and never reconnects", async () => {
    const { client, timers, flush } = setup();
    client.start();
    await flush();
    FakeSocket.last!.fire("close", { code: 4003 });
    expect(client.status()).toBe("full");
    expect(timers).toEqual([]);
  });

  it("1008 stops without a loop", async () => {
    const { client, timers, flush } = setup();
    client.start();
    await flush();
    FakeSocket.last!.fire("open");
    FakeSocket.last!.fire("close", { code: 1008 });
    expect(client.status()).toBe("closed");
    expect(timers).toEqual([]);
  });

  it("an abnormal close reconnects with backoff and resets after open", async () => {
    const { client, timers, flush } = setup();
    const seen: string[] = [];
    client.on((m) => seen.push(m.t));
    client.start();
    await flush();
    FakeSocket.last!.fire("open");
    FakeSocket.last!.fire("close", { code: 1006 });
    expect(seen).toContain("reset");
    expect(timers.map((t) => t.ms)).toEqual([1000]);
    timers[0].fn();
    await flush();
    expect(FakeSocket.count).toBe(2);
    FakeSocket.last!.fire("close", { code: 1006 });
    expect(timers.map((t) => t.ms)).toEqual([1000, 2000]);
    timers[1].fn();
    await flush();
    FakeSocket.last!.fire("open");
    FakeSocket.last!.fire("close", { code: 1006 });
    expect(timers.map((t) => t.ms)).toEqual([1000, 2000, 1000]);
  });

  it("401 from the ticket route stops without retry", async () => {
    const { client, timers, flush } = setup(401);
    client.start();
    await flush();
    expect(client.status()).toBe("closed");
    expect(FakeSocket.count).toBe(0);
    expect(timers).toEqual([]);
  });

  it("close() stops reconnecting", async () => {
    const { client, timers, flush } = setup();
    client.start();
    await flush();
    client.close();
    FakeSocket.last!.fire("close", { code: 1006 });
    expect(timers).toEqual([]);
  });
});
