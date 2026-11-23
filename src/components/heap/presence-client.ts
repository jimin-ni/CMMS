// 방 함께 있기(presence) 연결 (docs/dev/presence.md). React 쪽(heap-room.tsx)이 만들어 엔진에 넘긴다.
// 엔진이 꾸미기 때문에 다시 마운트되어도 이 연결은 이어진다. 끊기면 1초부터 두 배씩 최대 30초 간격으로 다시 붙는다.
// 4001(새 탭이 대체), 4003(정원 초과), 1008(규칙 위반), 티켓 거절이면 다시 붙지 않는다.

export type PresenceStatus = "idle" | "connecting" | "open" | "closed" | "full" | "replaced";

// 서버가 보내는 메시지. 모양 검사는 엔진(presence.js)이 쓰는 필드만 한다. "reset" 은 연결이 끊겼다는 이 파일의 신호다.
export type PresenceIn = { t: string; [key: string]: unknown };
export type PresenceOut = { t: string; [key: string]: unknown };
export type PeerSnapshot = { peer: string; name: string; colour: number; state: string; p: [number, number] | null; ry: number };

export type PresenceClient = {
  start(): void;
  send(msg: PresenceOut): void;
  on(fn: (msg: PresenceIn) => void): () => void;
  onStatus(fn: (s: PresenceStatus) => void): () => void;
  status(): PresenceStatus;
  // 디버그 사이드바용: 보낸·받은 메시지 수
  counts(): { sent: number; recv: number };
  // 지금 같은 방에 있는 사람들의 마지막 모습. 엔진이 늦게 뜨거나 다시 마운트될 때 이것으로 시작한다
  peers(): PeerSnapshot[];
  close(): void;
};

type Options = {
  roomUuid: string;
  ticketUrl?: string;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
};

const CLOSE_REPLACED = 4001;
const CLOSE_FULL = 4003;
const CLOSE_POLICY = 1008;

export function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

export function createPresenceClient(opts: Options): PresenceClient {
  const fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  const WS = opts.WebSocketImpl ?? WebSocket;
  const later = opts.setTimeoutImpl ?? setTimeout;
  const cancel = opts.clearTimeoutImpl ?? clearTimeout;
  const ticketUrl = opts.ticketUrl ?? "/api/heap/presence/ticket";

  let status: PresenceStatus = "idle";
  let ws: WebSocket | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let sent = 0;
  let recv = 0;
  const listeners = new Set<(m: PresenceIn) => void>();
  const statusListeners = new Set<(s: PresenceStatus) => void>();
  const known = new Map<string, PeerSnapshot>();

  // 받은 메시지로 사람 목록을 고친다 (서버 room.ts 의 applyToState 와 같은 규칙)
  const track = (m: PresenceIn) => {
    if (m.t === "hello") {
      known.clear();
      for (const p of (m.peers as PeerSnapshot[]) ?? []) known.set(p.peer, { ...p });
      return;
    }
    if (m.t === "reset") return known.clear();
    if (m.t === "join") {
      known.set(String(m.peer), { peer: String(m.peer), name: String(m.name), colour: Number(m.colour) || 0, state: "idle", p: null, ry: 0 });
      return;
    }
    if (m.t === "leave") return void known.delete(String(m.peer));
    const k = known.get(String(m.peer));
    if (!k) return;
    const xz = (v: unknown) => (Array.isArray(v) && v.length >= 2 ? ([Number(v[0]), Number(v[v.length === 3 ? 2 : 1])] as [number, number]) : null);
    if (m.t === "walk") { const pts = m.pts as unknown[]; k.p = xz(pts[pts.length - 1]); k.state = "walk"; }
    else if (m.t === "pos" || m.t === "stand") { k.p = xz(m.p); k.ry = Number(m.ry); k.state = m.t === "pos" ? "walk" : "idle"; }
    else if (m.t === "sit") { k.p = xz(m.p); k.ry = Number(m.ry); k.state = "sit"; }
    else if (m.t === "snap") { k.p = xz(m.p); k.ry = Number(m.ry); k.state = String(m.state); }
    else if (m.t === "state") k.state = String(m.state);
  };

  const setStatus = (s: PresenceStatus) => {
    if (s === status) return;
    status = s;
    for (const fn of statusListeners) fn(s);
  };
  const emit = (m: PresenceIn) => {
    track(m);
    for (const fn of listeners) fn(m);
  };

  const retry = () => {
    if (stopped) return;
    setStatus("connecting");
    timer = later(() => {
      timer = null;
      void connect();
    }, backoffMs(attempt));
    attempt += 1;
  };

  async function connect(): Promise<void> {
    if (stopped) return;
    setStatus("connecting");
    let res: Response;
    try {
      res = await fetchImpl(ticketUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomUuid: opts.roomUuid }),
        cache: "no-store",
      });
    } catch {
      retry();
      return;
    }
    if (stopped) return;
    // 로그인 안 함, 방 없음, presence 꺼짐: 다시 해도 같으니 멈춘다.
    if (res.status >= 400 && res.status < 500) {
      setStatus("closed");
      return;
    }
    if (!res.ok) {
      retry();
      return;
    }
    const { ticket, url } = (await res.json()) as { ticket: string; url: string };
    if (stopped) return;

    const sock = new WS(`${url}?t=${encodeURIComponent(ticket)}`);
    ws = sock;
    sock.addEventListener("open", () => {
      attempt = 0;
      setStatus("open");
    });
    sock.addEventListener("message", (e: MessageEvent) => {
      let m: unknown;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (typeof m === "object" && m !== null && typeof (m as PresenceIn).t === "string") {
        recv += 1;
        emit(m as PresenceIn);
      }
    });
    sock.addEventListener("close", (e: CloseEvent) => {
      if (ws === sock) ws = null;
      emit({ t: "reset" });
      if (stopped) return;
      if (e.code === CLOSE_REPLACED) setStatus("replaced");
      else if (e.code === CLOSE_FULL) setStatus("full");
      else if (e.code === CLOSE_POLICY) setStatus("closed");
      else retry();
    });
  }

  return {
    start() {
      if (status === "idle") void connect();
    },
    send(msg) {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(msg));
        sent += 1;
      }
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onStatus(fn) {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
    status: () => status,
    counts: () => ({ sent, recv }),
    peers: () => [...known.values()].map((p) => ({ ...p })),
    close() {
      stopped = true;
      if (timer !== null) cancel(timer);
      timer = null;
      ws?.close(1000, "bye");
      ws = null;
      setStatus("closed");
    },
  };
}
