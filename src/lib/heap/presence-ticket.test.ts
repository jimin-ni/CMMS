import { describe, expect, it } from "vitest";
import { signTicket, userKey, verifyTicket, type PresenceTicket } from "./presence-ticket";

const SECRET = "test-secret-not-real";
const ROOM = "6f1c2b8e-0d4a-4c1e-9b7a-2f3e4d5c6b7a";

async function ticket(over: Partial<PresenceTicket> = {}): Promise<{ t: PresenceTicket; token: string }> {
  const t: PresenceTicket = { r: ROOM, u: "k", n: "윤", exp: 1000, j: "j1", o: false, v: "hidden", ...over };
  return { t, token: await signTicket(SECRET, t) };
}

describe("presence ticket", () => {
  it("round trip", async () => {
    const { t, token } = await ticket();
    const res = await verifyTicket(SECRET, token, ROOM, 999);
    expect(res).toEqual({ ok: true, t });
  });

  it("expired", async () => {
    const { token } = await ticket({ exp: 1000 });
    expect(await verifyTicket(SECRET, token, ROOM, 1001)).toEqual({ ok: false, why: "expired" });
  });

  it("other room", async () => {
    const { token } = await ticket();
    expect(await verifyTicket(SECRET, token, "00000000-0000-4000-8000-000000000000", 999)).toEqual({ ok: false, why: "room" });
  });

  it("tampered payload", async () => {
    const { token } = await ticket();
    const [body, sig] = token.split(".");
    const flipped = (body[0] === "A" ? "B" : "A") + body.slice(1);
    expect(await verifyTicket(SECRET, `${flipped}.${sig}`, ROOM, 999)).toEqual({ ok: false, why: "sig" });
  });

  it("wrong secret", async () => {
    const { token } = await ticket();
    expect(await verifyTicket("other-secret", token, ROOM, 999)).toEqual({ ok: false, why: "sig" });
  });

  it("garbage", async () => {
    expect(await verifyTicket(SECRET, "abc", ROOM, 999)).toEqual({ ok: false, why: "format" });
    expect(await verifyTicket(SECRET, "", ROOM, 999)).toEqual({ ok: false, why: "format" });
  });

  it("signed but malformed payload", async () => {
    const token = await signTicket(SECRET, { r: ROOM } as unknown as PresenceTicket);
    expect(await verifyTicket(SECRET, token, ROOM, 999)).toEqual({ ok: false, why: "format" });
  });

  it("rejects an unknown name rule or a missing owner flag", async () => {
    const bad1 = await signTicket(SECRET, { r: ROOM, u: "k", n: "n", exp: 1000, j: "j", o: false, v: "everyone" } as unknown as PresenceTicket);
    expect(await verifyTicket(SECRET, bad1, ROOM, 999)).toEqual({ ok: false, why: "format" });
    const bad2 = await signTicket(SECRET, { r: ROOM, u: "k", n: "n", exp: 1000, j: "j", v: "hidden" } as unknown as PresenceTicket);
    expect(await verifyTicket(SECRET, bad2, ROOM, 999)).toEqual({ ok: false, why: "format" });
  });

  it("userKey is stable and hides id", async () => {
    const id = "Xq9userIdAbc123";
    const a = await userKey(SECRET, id);
    expect(await userKey(SECRET, id)).toBe(a);
    expect(await userKey(SECRET, "other")).not.toBe(a);
    expect(a).not.toContain(id);
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});
