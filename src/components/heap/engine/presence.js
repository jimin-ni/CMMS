// 방 함께 있기 (docs/dev/presence.md): 같은 방에 있는 다른 사람의 캐릭터를 그리고, 내 움직임을 알린다.
// opts.presence(presence-client.ts)가 없으면 아무것도 하지 않는다. 혼자 보는 방에는 비용이 없다.
// 내 쪽 코드(walk.js, modes.js)는 건드리지 않고, 프레임마다 내 상태를 읽어 바뀐 것만 보낸다.
// 다른 사람 캐릭터는 입력 레이캐스트 목록에 없으므로 왼쪽 클릭은 뒤의 바닥이나 가구로 간다. 캐릭터끼리는 부딪히지 않는다.
import * as THREE from 'three';
import { flat } from './draw.js';
import { makeFigure, seatLegs, stepGait, turnToward, wrapAngle, SIT_DROP, HEAP_SIT_Y, WALK_SPEED } from './figure.js';
import { disposeScene } from './util.js';

// 다른 사람 몸 색 (서버가 주는 colour 0..7). 방의 흙빛과 어울리는 따뜻한 색들
const BODY = ['#A6613C', '#565344', '#7a8b6f', '#c9a15b', '#8c5a6b', '#5d7389', '#b77d5a', '#6f6a8c'];
const POS_EVERY = 0.2; // WASD 이동 중 위치를 보내는 간격 (초)
const SNAP_EVERY = 3; // 움직이는 동안 현재 모습을 보내는 간격 (초)
const POP = 0.25; // 들어오고 나갈 때 커지고 작아지는 시간 (초)
const MAX_PTS = 16;

const r2 = v => Math.round(v * 100) / 100;
const ang = a => r2(wrapAngle(a));
const xz = v => [r2(v.x), r2(v.z)];

export function setupPresence(ctx) {
  const client = ctx.opts.presence;
  if (!client) return;
  const { scene, camera, C, root } = ctx;

  // 이름표는 캔버스 위의 HTML. 글자는 textContent 로만 넣는다
  const tags = document.createElement('div');
  tags.className = 'presence-tags';
  tags.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2';
  root.appendChild(tags);
  ctx.onDispose(() => tags.remove());

  // peer → { fig, tag, state, path: Vector3[], target: Vector3 | null, seat: {p, ry} | null, heapSpot, pop, leaving }
  const peers = new Map();
  // 다른 사람 캐릭터의 형상과 재질은 사람마다 새로 만든 것이다. 지울 때 GPU 메모리도 돌려준다
  ctx.onDispose(() => { for (const p of peers.values()) { scene.remove(p.fig.group); disposeScene(p.fig.group); } peers.clear(); });

  function spawnAt() {
    if (ctx.doorSpot) return ctx.doorSpot.clone().setY(0);
    return new THREE.Vector3(2.2, 0, 2.4);
  }

  function addPeer({ peer, name, owner, colour, state, p, ry, sit }) {
    if (peers.has(peer)) return peers.get(peer);
    const fig = makeFigure(C, flat(BODY[(colour | 0) % BODY.length]));
    const at = Array.isArray(p) ? new THREE.Vector3(p[0], 0, p[1]) : spawnAt();
    fig.group.position.copy(at);
    fig.group.rotation.y = typeof ry === 'number' ? ry : 0;
    fig.group.scale.setScalar(0.01);
    fig.group.name = 'presence-peer';
    scene.add(fig.group);
    const tag = document.createElement('div');
    tag.textContent = String(name ?? '').slice(0, 24);
    // 방 주인 표시: 서버가 서명된 티켓으로 정한 사람에게만. 이름은 누구나 지을 수 있으므로 이것이 진짜 주인을 가린다
    if (owner === true) {
      const badge = document.createElement('span');
      badge.textContent = '방 주인';
      badge.style.cssText = 'margin-left:6px;padding:0 6px;border-radius:999px;background:#A6613C;color:#fbf6ec;font-size:10px';
      tag.appendChild(badge);
    }
    tag.style.cssText = 'position:absolute;transform:translate(-50%,-100%);padding:2px 8px;border-radius:999px;background:rgba(251,246,236,.86);color:#3a2a22;font:600 12px/1.4 var(--font-pretendard, sans-serif);white-space:nowrap';
    tags.appendChild(tag);
    const it = { fig, tag, state: state || 'idle', path: [], target: null, seat: null, heapSpot: null, pop: 0, leaving: false };
    peers.set(peer, it);
    // 먼저 와서 앉아 있던 사람 (hello 와 연결의 사람 목록이 자리를 준다)
    if (sit && Array.isArray(sit.p)) {
      if (sit.kind === 'heap') { it.atHeap = true; assignHeapSpots(); }
      else it.seat = { p: new THREE.Vector3(sit.p[0], sit.p[1], sit.p[2]), ry: sit.ry };
    }
    return it;
  }

  function dropPeer(peer, now = false) {
    const it = peers.get(peer);
    if (!it) return;
    if (now) { scene.remove(it.fig.group); disposeScene(it.fig.group); it.tag.remove(); peers.delete(peer); return; }
    it.leaving = true; it.pop = 0;
  }

  // 더미를 보는 사람들은 더미 둘레의 서로 다른 자리에 선다 (peer 순서로 나눔)
  function heapSpots() {
    const centre = ctx.HOST ? new THREE.Vector3(ctx.HOST.x, 0, ctx.HOST.z) : ctx.SEAT?.clone();
    if (!centre || !ctx.SEAT) return [];
    const base = Math.atan2(ctx.SEAT.x - centre.x, ctx.SEAT.z - centre.z), rad = Math.max(0.9, ctx.SEAT.distanceTo(centre));
    return [0.9, -0.9, 1.8, -1.8].map(d => {
      const a = base + d;
      const p = new THREE.Vector3(centre.x + Math.sin(a) * rad, 0, centre.z + Math.cos(a) * rad);
      return { p, ry: Math.atan2(centre.x - p.x, centre.z - p.z) };
    });
  }
  function assignHeapSpots() {
    const spots = heapSpots(), sitting = [...peers.entries()].filter(([, it]) => it.heapSpot !== null || it.atHeap).map(([k]) => k).sort();
    sitting.forEach((k, i) => { const it = peers.get(k); it.heapSpot = spots[i % Math.max(1, spots.length)] ?? null; });
  }

  function onMessage(m) {
    switch (m.t) {
      case 'hello':
        for (const k of [...peers.keys()]) dropPeer(k, true);
        for (const p of m.peers ?? []) addPeer(p);
        sendSnap(); // 새로 들어온 나를 이미 있던 사람들이 정확히 그리도록
        return;
      case 'join': addPeer(m); sendSnap(); return;
      case 'leave': dropPeer(m.peer); return;
      case 'reset': for (const k of [...peers.keys()]) dropPeer(k); return;
    }
    const it = peers.get(m.peer);
    if (!it) return;
    const fig = it.fig.group;
    switch (m.t) {
      case 'walk': {
        const pts = m.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
        if (fig.position.distanceTo(pts[0]) > 1.5) fig.position.copy(pts[0]);
        it.seat = null; it.atHeap = false; it.heapSpot = null; it.target = null;
        it.path = pts.slice(1); it.state = 'walk';
        assignHeapSpots();
        break;
      }
      case 'pos':
        it.seat = null; it.atHeap = false; it.heapSpot = null; it.path = [];
        it.target = new THREE.Vector3(m.p[0], 0, m.p[1]); it.targetRy = m.ry; it.state = 'walk';
        break;
      case 'sit':
        it.path = []; it.target = null; it.state = 'sit';
        if (m.kind === 'heap') { it.atHeap = true; it.seat = null; assignHeapSpots(); }
        else { it.atHeap = false; it.heapSpot = null; it.seat = { p: new THREE.Vector3(m.p[0], m.p[1], m.p[2]), ry: m.ry }; }
        break;
      case 'stand':
        it.seat = null; it.atHeap = false; it.heapSpot = null; it.path = []; it.target = null; it.state = 'idle';
        fig.position.set(m.p[0], 0, m.p[1]); fig.rotation.y = m.ry;
        assignHeapSpots();
        break;
      case 'snap': {
        it.state = m.state;
        if ((it.seat || it.atHeap) && m.state === 'sit') break; // 앉은 사람의 snap 은 자리를 바꾸지 않는다
        // 걷는 중이 아니면 0.3초에 걸쳐 맞춘다. 걷는 중이면 크게 어긋났을 때만
        const want = new THREE.Vector3(m.p[0], 0, m.p[1]), off = fig.position.distanceTo(want);
        if (!it.path.length && !it.seat && !it.atHeap && off > 0.05) { it.target = want; it.targetRy = m.ry; it.correcting = 0.3; }
        else if (off > 1.5) fig.position.copy(want);
        break;
      }
      case 'state': it.state = m.state; break;
    }
  }
  const offMsg = client.on(onMessage);
  ctx.onDispose(offMsg);
  // 연결은 엔진보다 먼저 열린다 (heap-room.tsx). 엔진이 뜨기 전에 받은 사람들, 다시 마운트되기 전부터 있던 사람들로 시작한다
  for (const p of client.peers()) addPeer(p);
  // 정원 초과, 다른 탭이 대체: 엔진이 뜨기 전에 일어났어도 한 번 알린다
  const notify = s => {
    if (s === 'full') ctx.toast('방이 가득 찼어요. 혼자 둘러볼 수 있어요');
    else if (s === 'replaced') ctx.toast('다른 탭에서 이 방을 열었어요');
    else if (s === 'kicked') ctx.toast('한동안 움직임이 없어 다른 방문자에게 자리를 내줬어요');
  };
  notify(client.status());
  ctx.onDispose(client.onStatus(notify));

  // ---------- 내 쪽: 바뀐 것만 보낸 ----------
  const me = () => ctx.me;
  let lastWaypoints = null, lastPerch = null, lastMode = ctx.mode, lastState = null;
  let posClock = 0, snapClock = 0, wasMoving = false;
  const lastPos = new THREE.Vector3(NaN, 0, NaN);

  function myState() {
    if (ctx.mode === 'edit') return 'away';
    if (ctx.mode === 'tree' || ctx.mode === 'sort' || ctx.mode === 'watch' || ctx.anyOverlay?.()) return 'busy';
    if (ctx.mode === 'sit' || ctx.perch) return 'sit';
    return wasMoving ? 'walk' : 'idle';
  }
  function sendSnap() {
    const m = me();
    if (m) client.send({ t: 'snap', p: xz(m.position), ry: ang(m.rotation.y), state: myState() });
  }

  function stepOut(dt) {
    const m = me();
    if (!m || (client.active && !client.active())) return; // 나 숨기기: 보낼 곳이 없다
    // 새 길: walk.js 의 followPath 는 길마다 새 waypoints 배열을 만든다
    if (ctx.walkTo && ctx.waypoints !== lastWaypoints) {
      const pts = [xz(m.position), xz(ctx.walkTo), ...ctx.waypoints.map(xz)].slice(0, MAX_PTS);
      client.send({ t: 'walk', pts });
    }
    lastWaypoints = ctx.walkTo ? ctx.waypoints : null;

    const moved = Number.isFinite(lastPos.x) && Math.hypot(m.position.x - lastPos.x, m.position.z - lastPos.z) > 0.002;
    lastPos.copy(m.position);
    // 길 없이 움직인다 = 걷기 키(WASD)
    if (moved && !ctx.walkTo && ctx.mode === 'room' && !ctx.perch) {
      if ((posClock += dt) >= POS_EVERY) { posClock = 0; client.send({ t: 'pos', p: xz(m.position), ry: ang(m.rotation.y) }); }
    } else posClock = POS_EVERY; // 다음 첫 걸음은 바로 보낸다

    // 앉기와 일어나기
    if (ctx.perch !== lastPerch) {
      if (ctx.perch) client.send({ t: 'sit', p: [r2(ctx.perch.pos.x), r2(ctx.perch.pos.y), r2(ctx.perch.pos.z)], ry: ang(ctx.perch.yaw), kind: 'seat' });
      else if (lastPerch) client.send({ t: 'stand', p: xz(m.position), ry: ang(m.rotation.y) });
      lastPerch = ctx.perch;
    }
    if (ctx.mode !== lastMode) {
      if (ctx.mode === 'sit') client.send({ t: 'sit', p: [r2(m.position.x), 0, r2(m.position.z)], ry: ang(m.rotation.y), kind: 'heap' });
      else if (lastMode === 'sit') client.send({ t: 'stand', p: xz(m.position), ry: ang(m.rotation.y) });
      lastMode = ctx.mode;
    }

    // 움직이는 동안 3초마다, 멈출 때 한 번
    if (moved) { if ((snapClock += dt) >= SNAP_EVERY) { snapClock = 0; sendSnap(); } }
    else if (wasMoving) { snapClock = 0; wasMoving = false; sendSnap(); }
    wasMoving = moved;

    const s = myState();
    if (s !== lastState) {
      if (s === 'busy' || s === 'away') client.send({ t: 'state', state: s });
      else if (lastState === 'busy' || lastState === 'away') sendSnap(); // 돌아왔다: 상태와 지금 자리를 함께
    }
    lastState = s;
  }

  // ---------- 다른 사람: 프레임마다 ----------
  const v = new THREE.Vector3(), head = new THREE.Vector3();
  function stepPeers(dt) {
    if (!peers.size) return; // 혼자면 아무 일도 하지 않는다
    const hideAll = ctx.mode === 'sit'; // 내가 더미를 보는 동안 내 화면에서 다른 사람을 숨긴다
    const rect = ctx.renderer?.domElement?.getBoundingClientRect?.();
    const rootRect = root.getBoundingClientRect();
    for (const [peer, it] of peers) {
      const g = it.fig.group;
      // 커지고 작아지기
      it.pop = Math.min(POP, it.pop + dt);
      const k = it.pop / POP;
      g.scale.setScalar(Math.max(0.01, it.leaving ? 1 - k : k));
      if (it.leaving && k >= 1) { dropPeer(peer, true); continue; }

      let moving = false;
      if (it.seat) {
        g.position.set(it.seat.p.x, it.seat.p.y - SIT_DROP, it.seat.p.z); g.rotation.y = it.seat.ry; seatLegs(it.fig);
      } else if (it.atHeap && it.heapSpot) {
        g.position.set(it.heapSpot.p.x, HEAP_SIT_Y, it.heapSpot.p.z); g.rotation.y = it.heapSpot.ry; seatLegs(it.fig);
      } else {
        const goal = it.path[0] ?? it.target;
        if (goal) {
          v.subVectors(goal, g.position).setY(0);
          const gap = v.length();
          const speed = it.correcting ? Math.max(gap / it.correcting, 0.5) : (it.path.length ? WALK_SPEED : WALK_SPEED * 1.2);
          const stepLen = speed * dt;
          if (gap <= stepLen || gap < 0.01) {
            g.position.x = goal.x; g.position.z = goal.z;
            if (it.path.length) it.path.shift();
            else { it.target = null; if (typeof it.targetRy === 'number') g.rotation.y = it.targetRy; it.correcting = 0; }
          } else {
            g.position.addScaledVector(v.normalize(), stepLen);
            if (!it.correcting) turnToward(it.fig, v.x, v.z, dt);
            moving = !it.correcting;
          }
          if (it.correcting) it.correcting = Math.max(0, it.correcting - dt);
        }
        stepGait(it.fig, moving, dt);
      }

      const visible = !hideAll && it.state !== 'away';
      g.visible = visible;
      // 이름표: 머리 위를 화면 좌표로
      if (visible && rect) {
        head.set(g.position.x, g.position.y + 1.35, g.position.z).project(camera);
        const x = rect.left - rootRect.left + (head.x + 1) / 2 * rect.width, y = rect.top - rootRect.top + (1 - head.y) / 2 * rect.height;
        const onScreen = head.z < 1 && x > -50 && y > -50 && x < rootRect.width + 50 && y < rootRect.height + 50;
        it.tag.style.display = onScreen ? '' : 'none';
        it.tag.style.left = `${x}px`; it.tag.style.top = `${y}px`;
        it.tag.style.opacity = String(it.leaving ? 1 - k : k);
      } else it.tag.style.display = 'none';
    }
  }

  ctx.presenceStep = dt => { stepOut(dt); stepPeers(dt); };
  // 다시 마운트된 엔진(꾸미기 뒤)의 내 자리를 바로 알린다. 아직 연결 전이면 hello 가 오면서 보낸다
  sendSnap();
  // 디버그 사이드바가 읽는 값 (peer id 와 이름만)
  ctx.presencePeers = () => [...peers.entries()].map(([peer, it]) => ({ peer, name: it.tag.firstChild?.textContent ?? '', state: it.state }));
}
