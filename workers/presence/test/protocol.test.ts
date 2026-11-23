import { describe, expect, it } from "vitest";
import { MAX_BYTES, parseClient } from "../src/protocol";
import { Bucket } from "../src/limit";

const j = (v: unknown) => JSON.stringify(v);

describe("parseClient accepts", () => {
  it("walk", () => expect(parseClient(j({ t: "walk", pts: [[0, 0], [1.5, -2]] }))).toEqual({ t: "walk", pts: [[0, 0], [1.5, -2]] }));
  it("pos", () => expect(parseClient(j({ t: "pos", p: [1, 2], ry: 0.5 }))).toEqual({ t: "pos", p: [1, 2], ry: 0.5 }));
  it("sit seat", () =>
    expect(parseClient(j({ t: "sit", p: [1, 0.4, 2], ry: 1, kind: "seat", seat: "3:01" }))).toEqual({ t: "sit", p: [1, 0.4, 2], ry: 1, kind: "seat", seat: "3:01" }));
  it("sit heap", () => expect(parseClient(j({ t: "sit", p: [0, 0, 0], ry: 0, kind: "heap" }))).toEqual({ t: "sit", p: [0, 0, 0], ry: 0, kind: "heap" }));
  it("stand", () => expect(parseClient(j({ t: "stand", p: [0, 1], ry: 0 }))).toEqual({ t: "stand", p: [0, 1], ry: 0 }));
  it("snap", () => expect(parseClient(j({ t: "snap", p: [0, 1], ry: 0, state: "idle" }))).toEqual({ t: "snap", p: [0, 1], ry: 0, state: "idle" }));
  it("state", () => expect(parseClient(j({ t: "state", state: "away" }))).toEqual({ t: "state", state: "away" }));
  it("drops unknown extra fields", () => expect(parseClient(j({ t: "state", state: "busy", evil: "x" }))).toEqual({ t: "state", state: "busy" }));
});

describe("parseClient rejects", () => {
  const bad: [string, string][] = [
    ["not json", "{"],
    ["array", j([1])],
    ["unknown t", j({ t: "teleport" })],
    ["oversize", j({ t: "state", state: "idle", pad: "x".repeat(MAX_BYTES) })],
    ["NaN-like", '{"t":"pos","p":[1e999,0],"ry":0}'],
    ["far coord", j({ t: "pos", p: [51, 0], ry: 0 })],
    ["string coord", j({ t: "pos", p: ["1", 0], ry: 0 })],
    ["empty pts", j({ t: "walk", pts: [] })],
    ["17 pts", j({ t: "walk", pts: Array.from({ length: 17 }, () => [0, 0]) })],
    ["bad state", j({ t: "state", state: "flying" })],
    ["bad kind", j({ t: "sit", p: [0, 0, 0], ry: 0, kind: "bed" })],
    ["long seat", j({ t: "sit", p: [0, 0, 0], ry: 0, kind: "seat", seat: "s".repeat(33) })],
    ["short p", j({ t: "stand", p: [0], ry: 0 })],
  ];
  for (const [name, raw] of bad) it(name, () => expect(parseClient(raw)).toBeNull());
});

describe("Bucket", () => {
  it("burst 40 then refills at 20/s", () => {
    const b = new Bucket();
    for (let i = 0; i < 40; i++) expect(b.take(0)).toBe(true);
    expect(b.take(0)).toBe(false);
    expect(b.take(50)).toBe(true);
    expect(b.take(50)).toBe(false);
  });
});
