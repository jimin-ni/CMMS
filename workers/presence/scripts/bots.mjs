// 로컬 확인용 봇. 비밀값(.dev.vars)으로 티켓을 직접 만들어 presence 워커(wrangler dev)에 붙는다.
// DB도 계정도 쓰지 않는다. 봇은 방 가구를 모르므로 가구를 뚫고 지나갈 수 있다.
//   node scripts/bots.mjs <방 uuid> [--n 3] [--w 8] [--d 8] [--url ws://localhost:3001] [--quiet]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { signTicket, userKey } from "../../../src/lib/heap/presence-ticket.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const room = args.find((a) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(a));
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
if (!room) {
  console.error("사용법: node scripts/bots.mjs <방 uuid> [--n 3] [--w 8] [--d 8]");
  process.exit(1);
}
const N = Number(opt("n", 3));
const W = Number(opt("w", 8));
const D = Number(opt("d", 8));
const BASE = opt("url", "ws://localhost:3001");
const ORIGIN = "http://localhost:3000";
const QUIET = args.includes("--quiet");

const vars = fs.readFileSync(path.join(here, "..", ".dev.vars"), "utf8");
const SECRET = /^PRESENCE_TICKET_SECRET=(.+)$/m.exec(vars)?.[1].trim();
if (!SECRET) {
  console.error(".dev.vars 에 PRESENCE_TICKET_SECRET 이 없어요.");
  process.exit(1);
}

const rand = (a, b) => a + Math.random() * (b - a);
const point = () => [Number(rand(-W / 2 + 0.5, W / 2 - 0.5).toFixed(2)), Number(rand(-D / 2 + 0.5, D / 2 - 0.5).toFixed(2))];
const short = (m) => {
  const { t, peer, ...rest } = m;
  const body = t === "hello" ? `you=${m.you} peers=${m.peers.map((p) => `${p.name}(${p.peer})`).join(",") || "-"}` : JSON.stringify(rest);
  return `${t}${peer ? ` peer=${peer}` : ""} ${body}`;
};

class Bot {
  constructor(i) {
    this.i = i;
    this.name = `봇${i}`;
    this.p = point();
    this.ry = 0;
    this.timers = [];
  }

  async connect() {
    const ticket = await signTicket(SECRET, {
      r: room,
      u: await userKey(SECRET, `bot-${this.i}`),
      n: this.name,
      exp: Math.floor(Date.now() / 1000) + 60,
      j: randomUUID(),
    });
    // 티켓은 subprotocol 로 (브라우저와 같다). Node 의 WebSocket(undici)은 headers 옵션도 받는다: 워커가 Origin 을 확인한다.
    const ws = new WebSocket(`${BASE}/room/${room}`, { protocols: ["presence.v1", ticket], headers: { Origin: ORIGIN } });
    this.ws = ws;
    ws.addEventListener("open", () => {
      console.log(`[${this.name}] 연결됨`);
      this.send({ t: "snap", p: this.p, ry: this.ry, state: "idle" });
      this.loop();
      this.timers.push(setInterval(() => this.send({ t: "snap", p: this.p, ry: this.ry, state: "idle" }), 3000));
      // 살아 있음 확인 (브라우저와 같은 25초). 워커는 75초 넘게 조용한 연결을 닫는다
      this.timers.push(setInterval(() => this.ws?.readyState === WebSocket.OPEN && this.ws.send("ping"), 25_000));
    });
    ws.addEventListener("message", (e) => {
      if (e.data === "pong") return;
      const m = JSON.parse(e.data);
      if (!QUIET || m.t === "hello" || m.t === "join" || m.t === "leave" || m.t === "full") console.log(`[${this.name}] <- ${short(m)}`);
    });
    ws.addEventListener("close", (e) => {
      console.log(`[${this.name}] 닫힘 ${e.code}`);
      this.stop();
    });
    ws.addEventListener("error", () => console.log(`[${this.name}] 연결 오류 (wrangler dev 가 3001 에서 도나요?)`));
  }

  send(m) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  // 2~6초마다 걷기, WASD 같은 연속 이동, 멈춤 중 하나.
  loop() {
    const next = setTimeout(() => {
      const r = Math.random();
      if (r < 0.5) {
        const pts = [this.p, ...Array.from({ length: 1 + Math.floor(rand(1, 4)) }, point)];
        this.p = pts[pts.length - 1];
        this.send({ t: "walk", pts });
      } else if (r < 0.75) {
        const dir = rand(0, Math.PI * 2);
        let k = 0;
        const burst = setInterval(() => {
          this.p = [
            Math.max(-W / 2 + 0.5, Math.min(W / 2 - 0.5, this.p[0] + Math.cos(dir) * 0.48)),
            Math.max(-D / 2 + 0.5, Math.min(D / 2 - 0.5, this.p[1] + Math.sin(dir) * 0.48)),
          ].map((v) => Number(v.toFixed(2)));
          this.ry = Number((Math.PI / 2 - dir).toFixed(2));
          this.send({ t: "pos", p: this.p, ry: this.ry });
          if (++k >= 10) clearInterval(burst);
        }, 200);
        this.timers.push(burst);
      }
      this.loop();
    }, rand(2000, 6000));
    this.timers.push(next);
  }

  stop() {
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.timers = [];
  }

  leave() {
    this.stop();
    this.ws?.close(1000, "bye");
  }
}

const bots = Array.from({ length: N }, (_, k) => new Bot(k + 1));
for (const b of bots) await b.connect();

// 마지막 봇은 45초마다 나갔다가 5초 뒤 다시 들어온다 (입장·퇴장 확인).
const last = bots[bots.length - 1];
setInterval(() => {
  console.log(`[${last.name}] 나갔다 다시 들어옵니다`);
  last.leave();
  setTimeout(() => last.connect(), 5000);
}, 45_000);

process.on("SIGINT", () => {
  for (const b of bots) b.leave();
  setTimeout(() => process.exit(0), 300);
});
