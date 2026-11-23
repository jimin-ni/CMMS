// 방 함께 있기(presence) 연결 (docs/dev/presence.md). React 쪽(heap-room.tsx)이 만들어 엔진에 넘긴다.
// 엔진이 꾸미기 때문에 다시 마운트되어도 이 연결은 이어진다.
// 서버와 방문자 PC 를 지키는 규칙:
// - 끊기면 1초부터 두 배씩 최대 30초 간격으로 다시 붙는다. 간격은 50~100% 사이로 흔들어 배포 직후 모두가 한꺼번에 붙지 않게 한다.
// - 한 번도 열리지 못한 시도가 5번 이어지면 멈춘다 (출처나 티켓이 거절되는 설정 문제가 끝없는 재시도가 되지 않게).
// - 4001(새 탭이 대체), 4003(정원 초과), 1008(규칙 위반), 티켓 발급 거절(4xx)이면 다시 붙지 않는다.
// - 탭이 2분 넘게 가려져 있으면 연결을 놓고(자리를 비움), 다시 보이면 새로 붙는다.
// - 25초마다 "ping" 을 보낸다. 서버는 DO 를 깨우지 않고 "pong" 으로 답하고, 답이 끊긴 연결을 정리한다.
// 티켓은 주소가 아니라 웹소켓 subprotocol 로 보낸다 (로그와 기록에 남지 않게).

export type PresenceStatus = "idle" | "connecting" | "open" | "closed" | "full" | "replaced" | "paused";

// 서버가 보내는 메시지. 모양 검사는 엔진(presence.js)이 쓰는 필드만 한다. "reset" 은 연결이 끊겼다는 이 파일의 신호다.
export type PresenceIn = { t: string; [key: string]: unknown };
export type PresenceOut = { t: string; [key: string]: unknown };
export type PeerSit = { p: [number, number, number]; ry: number; kind: "seat" | "heap"; seat?: string };
export type PeerSnapshot = {
  peer: string;
  name: string;
  colour: number;
  state: string;
  p: [number, number] | null;
  ry: number;
  sit: PeerSit | null;
};

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

type DocLike = { hidden: boolean; addEventListener(t: string, fn: () => void): void; removeEventListener(t: string, fn: () => void): void };

type Options = {
  roomUuid: string;
  ticketUrl?: string;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  randomImpl?: () => number;
  doc?: DocLike | null;
};

export const SUBPROTOCOL = "presence.v1";
export const PING_MS = 25_000;
export const HIDDEN_PAUSE_MS = 120_000;
export const MAX_FAILS = 5;
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
  const random = opts.randomImpl ?? Math.random;
  const doc: DocLike | null = opts.doc !== undefined ? opts.doc : typeof document !== "undefined" ? document : null;
  const ticketUrl = opts.ticketUrl ?? "/api/heap/presence/ticket";

  let status: PresenceStatus = "idle";
  let ws: WebSocket | null = null;
  let attempt = 0;
  // 한 번도 열리지 못하고 끝난 시도가 이어진 수
  let fails = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let sent = 0;
  let recv = 0;
  const listeners = new Set<(m: PresenceIn) => void>();
  const statusListeners = new Set<(s: PresenceStatus) => void>();
  const known = new Map<string, PeerSnapshot>();

  // 그만두었거나 탭이 가려져 쉬는 중 (await 사이에 바뀔 수 있어 함수로 읽는다)
  const halted = () => stopped || status === "paused";

  const setStatus = (s: PresenceStatus) => {
    if (s === status) return;
    status = s;
    for (const fn of statusListeners) fn(s);
  };

  // 받은 메시지로 사람 목록을 고친다 (서버 room.ts 의 applyToState 와 같은 규칙)
  const track = (m: PresenceIn) => {
    if (m.t === "hello") {
      known.clear();
      for (const p of (m.peers as PeerSnapshot[]) ?? []) known.set(p.peer, { ...p, sit: p.sit ?? null });
      return;
    }
    if (m.t === "reset") return known.clear();
    if (m.t === "join") {
      known.set(String(m.peer), { peer: String(m.peer), name: String(m.name), colour: Number(m.colour) || 0, state: "idle", p: null, ry: 0, sit: null });
      return;
    }
    if (m.t === "leave") return void known.delete(String(m.peer));
    const k = known.get(String(m.peer));
    if (!k) return;
    const xz = (v: unknown) => (Array.isArray(v) && v.length >= 2 ? ([Number(v[0]), Number(v[v.length === 3 ? 2 : 1])] as [number, number]) : null);
    if (m.t === "walk") {
      const pts = m.pts as unknown[];
      k.p = xz(pts[pts.length - 1]);
      k.state = "walk";
      k.sit = null;
    } else if (m.t === "pos" || m.t === "stand") {
      k.p = xz(m.p);
      k.ry = Number(m.ry);
      k.state = m.t === "pos" ? "walk" : "idle";
      k.sit = null;
    } else if (m.t === "sit") {
      k.p = xz(m.p);
      k.ry = Number(m.ry);
      k.state = "sit";
      k.sit = { p: m.p as [number, number, number], ry: Number(m.ry), kind: m.kind === "heap" ? "heap" : "seat", ...(m.seat ? { seat: String(m.seat) } : {}) };
    } else if (m.t === "snap") {
      k.state = String(m.state);
      if (!k.sit) {
        k.p = xz(m.p);
        k.ry = Number(m.ry);
      }
    } else if (m.t === "state") k.state = String(m.state);
  };

  const emit = (m: PresenceIn) => {
    track(m);
    for (const fn of listeners) fn(m);
  };

  const clearTimer = (t: ReturnType<typeof setTimeout> | null) => {
    if (t !== null) cancel(t);
  };

  const stopPing = () => {
    clearTimer(pingTimer);
    pingTimer = null;
  };
  const schedulePing = () => {
    stopPing();
    pingTimer = later(() => {
      pingTimer = null;
      if (ws && ws.readyState === 1) ws.send("ping");
      schedulePing();
    }, PING_MS);
  };

  // 한 번도 열리지 못한 시도가 끝났다. 5번째면 멈춘다
  const failed = () => {
    fails += 1;
    if (fails >= MAX_FAILS) {
      setStatus("closed");
      return;
    }
    retry();
  };

  const retry = () => {
    if (halted()) return;
    setStatus("connecting");
    const wait = backoffMs(attempt) * (0.5 + 0.5 * random());
    attempt += 1;
    retryTimer = later(() => {
      retryTimer = null;
      void connect();
    }, Math.round(wait));
  };

  async function connect(): Promise<void> {
    if (halted()) return;
    setStatus("connecting");
    let ticket: string, url: string;
    try {
      const res = await fetchImpl(ticketUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomUuid: opts.roomUuid }),
        cache: "no-store",
      });
      if (halted()) return;
      // 로그인 안 함, 방 없음, presence 꺼짐, 너무 자주 요청함: 다시 해도 같으니 멈춘다.
      if (res.status >= 400 && res.status < 500) {
        setStatus("closed");
        return;
      }
      if (!res.ok) return failed();
      ({ ticket, url } = (await res.json()) as { ticket: string; url: string });
      if (typeof ticket !== "string" || typeof url !== "string") return failed();
    } catch {
      return failed();
    }
    if (halted()) return;

    let sock: WebSocket;
    try {
      sock = new WS(url, [SUBPROTOCOL, ticket]);
    } catch {
      // 잘못된 주소 (https 페이지에서 ws:// 등). 설정 문제라 다시 해도 같다
      setStatus("closed");
      return;
    }
    ws = sock;
    let opened = false;
    sock.addEventListener("open", () => {
      opened = true;
      attempt = 0;
      fails = 0;
      setStatus("open");
      schedulePing();
    });
    sock.addEventListener("message", (e: MessageEvent) => {
      if (e.data === "pong") return;
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
      stopPing();
      emit({ t: "reset" });
      if (halted()) return;
      if (e.code === CLOSE_REPLACED) setStatus("replaced");
      else if (e.code === CLOSE_FULL) setStatus("full");
      else if (e.code === CLOSE_POLICY) setStatus("closed");
      else if (!opened) failed();
      else retry();
    });
  }

  // 탭이 오래 가려져 있으면 자리를 비운다. 다시 보이면 새로 붙는다
  const onVisibility = () => {
    if (!doc || stopped) return;
    if (doc.hidden) {
      clearTimer(hideTimer);
      hideTimer = later(() => {
        hideTimer = null;
        if (stopped || !doc.hidden) return;
        if (status === "closed" || status === "full" || status === "replaced") return;
        clearTimer(retryTimer);
        retryTimer = null;
        setStatus("paused");
        stopPing();
        ws?.close(1000, "hidden");
        ws = null;
      }, HIDDEN_PAUSE_MS);
    } else {
      clearTimer(hideTimer);
      hideTimer = null;
      if (status === "paused") {
        attempt = 0;
        fails = 0;
        status = "idle";
        void connect();
      }
    }
  };

  return {
    start() {
      if (status !== "idle") return;
      doc?.addEventListener("visibilitychange", onVisibility);
      void connect();
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
      doc?.removeEventListener("visibilitychange", onVisibility);
      clearTimer(retryTimer);
      clearTimer(hideTimer);
      stopPing();
      retryTimer = hideTimer = null;
      try {
        ws?.close(1000, "bye");
      } catch {
        // 이미 닫힘
      }
      ws = null;
      setStatus("closed");
    },
  };
}
