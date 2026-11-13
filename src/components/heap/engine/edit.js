// 꾸미기: 방 안에서 가구를 집고, 끌고, 돌리고, 넣는다 (design/editor.md 의 B1, B2).
// 편집 중의 가구 목록, 고른 가구, 되돌리기 기록은 이 모듈이 갖는다. 화면 위 단추(위 막대, 가구 목록, 가구 위 막대, 기능 칸)는
// room-editor.tsx 가 그리고, 이 모듈과는 방 루트의 이벤트로만 이야기한다.
//   받는 것  heap:edit (true 면 들어오고 false 면 나간다, heap-room.tsx)
//            heap:editcmd { op, ... }  op: arm(template), rotate(dir), copy, remove, undo, redo, time(value), fn(index, fn), lit, select(index | null), cancel, reset(처음으로), discard(나가며 버리기)
//            heap:saved (editor-bridge.js 와 함께): 저장된 레이아웃이 새 기준이 된다
//   보내는 것 heap:editstate { items, sel, moving, canUndo, canRedo, dirty, time, notice }  바뀔 때마다
// 끄는 동안에는 그 가구의 그룹만 프레임마다 옮기고, 놓을 때 한 번 buildItems 로 다시 짓는다 (applyItems, editor-bridge.js).
// 가구끼리 겹치는 것은 막지 않는다. 막는 것은 서버가 거절하는 자리(opts.placementError = layout.ts 의 itemPlacementError)와,
// 기능에 닿지 못하게 하는 자리(사진 탁자와 그 앞자리, 문 앞, 방명록 앞, 창문·스크린·문 위의 액자)뿐이다. 방 밖은 막지 않고 안으로 당긴다.
import * as THREE from 'three';

const GRID = 0.25, WALL_SNAP = 0.3, EDGE_SNAP = 0.2, UNDO_MAX = 50, FN_DELAY = 300;
const OK = '#7d9a4a', BAD = '#c2452d', PICKED = '#A6613C';
// 엔진이 직접 만드는 가구의 이름 (알림 문구용). 모델은 카탈로그의 label 을 쓴다.
const HAND_LABEL = { bed: '침대', shelf: '앨범 책장', plant: '화분', snake: '산세베리아', lamp: '조명', books: '책 더미', frame: '벽 액자', calendar: '탁상 달력' };
const OVERLAYS = ['phone', 'pc', 'keepsake', 'calendar', 'grid', 'rooms', 'guestbook'];

const r2 = v => Math.round(v * 100) / 100;
const snapGrid = v => Math.round(v / GRID) * GRID;
const clamp = (v, lo, hi) => (lo > hi ? 0 : Math.min(hi, Math.max(lo, v)));
const normRot = r => ((Math.round(r / 90) * 90) % 360 + 360) % 360;

export function setupEdit(ctx) {
  const {
    root, opts, on, $, canvas, camera, scene, RX, RZ, WALLS, TABLE, DOOR, WIN, SCR, GB, SEAT, me,
    tableTop, projParts, phoneParts, doorParts, bookParts, screen, getCatalogue,
  } = ctx;
  const room = { w: 2 * RX, d: 2 * RZ }, tableAt = { x: TABLE.x, z: TABLE.z };
  const FRAME_Y = opts.policy.frameY, FRAME_M = opts.policy.frameWallMargin;

  // 편집 상태. move: 커서에 붙은 가구 { i, isNew, base, rot, kids, kidsBase, grab, cand, why }
  //   i 는 지금 build 의 번호다. 새 가구는 ed.items 끝(ed.items.length)에 붙어 지어지고, 놓을 때 ed.items 에 들어간다.
  // press: 가구를 눌렀지만 아직 움직이지 않았다 · hist/future: { items, time } JSON · tag: 이어지는 고침을 한 걸음으로 묶는 표 (기능 칸의 글자)
  const ed = {
    on: false, items: [], time: 'auto', sel: null, move: null, press: null, hist: [], future: [], tag: null, saved: '',
    alt: false, last: null, notice: null, seq: 0, fnTimer: 0,
  };
  ctx.onDispose(() => clearTimeout(ed.fnTimer));

  // ---------- 규칙 ----------
  const entryOf = it => (it.type === 'model' ? ctx.catalogue?.models?.find(m => m.id === it.model) : null);
  const isRug = it => entryOf(it)?.category === 'rug';
  const labelOf = it => entryOf(it)?.label ?? HAND_LABEL[it.type] ?? it.model ?? it.type;
  // 바닥에서 차지하는 반쪽 크기 (회전한 뒤). 액자는 벽을 따라 FRAME_M 이다. 크기를 모르는 가구는 0.25 로 본다.
  const ext = it => (it.type === 'frame' ? { hx: FRAME_M, hz: 0.06 } : opts.itemHalfExtents(it) ?? { hx: 0.25, hz: 0.25 });
  // 가구 위에 선 것들: 바닥에 선 (러그나 액자가 아닌) 가구의 바닥 안에 가운데가 있고 y 가 있는 가구. 끌고 돌리고 넣을 때 함께 간다.
  function kidsOf(i, items = ed.items) {
    const h = items[i];
    if (!h || h.y || h.type === 'frame' || isRug(h)) return [];
    const e = ext(h);
    return items.flatMap((o, j) => (j !== i && o.y > 0 && o.type !== 'frame' && Math.abs(o.x - h.x) <= e.hx && Math.abs(o.z - h.z) <= e.hz ? [j] : []));
  }
  // 벽의 열린 곳: 액자를 걸 수 없는 자리 (벽을 따라 at 에서 half 안)
  const OPENINGS = [
    WIN && { wall: WIN.wall, at: WIN.at, half: WIN.w / 2 + 0.08, name: '창문' },
    SCR && { wall: SCR.wall, at: SCR.at, half: SCR.w / 2 + 0.07, name: '스크린' },
    DOOR && { wall: DOOR.wall, at: DOOR.at, half: 0.56, name: '문' },
  ].filter(Boolean);
  // 비워 둘 바닥: 사진 탁자, 그 앞의 방석, 문 앞, 방명록 앞. 바닥에 선 가구만 본다 (러그와 가구 위의 물건은 길을 막지 않는다).
  const zoneAt = (wall, at, along, off, why) => {
    const p = WALLS[wall].point(at, 0, off);
    return wall === 'back' ? { x: p.x, z: p.z, hx: along, hz: off, why } : { x: p.x, z: p.z, hx: off, hz: along, why };
  };
  const ZONES = [
    { x: TABLE.x, z: TABLE.z, hx: TABLE.w / 2, hz: TABLE.d / 2, why: '사진 탁자 자리예요' },
    { x: SEAT.x, z: SEAT.z, hx: 0.4, hz: 0.4, why: '사진 탁자 앞자리는 비워 둬요' },
    DOOR && zoneAt(DOOR.wall, DOOR.at, 0.6, 0.6, '문 앞은 비워 둬요'),
    GB && zoneAt(GB.wall, GB.at, 0.4, 0.6, '방명록 자리예요'),
  ].filter(Boolean);
  // 이 자리가 왜 안 되는지, 되면 null. 서버의 문구가 먼저다.
  function why(it) {
    const server = opts.placementError(it, room, tableAt);
    if (server) return server;
    if (it.type === 'frame') {
      const wall = it.rot === 90 ? 'left' : 'back', u = wall === 'back' ? it.x : it.z;
      const o = OPENINGS.find(o => o.wall === wall && Math.abs(u - o.at) < FRAME_M + o.half - 0.02);
      return o ? `${o.name} 자리와 겹쳐요` : null;
    }
    if (it.y || isRug(it)) return null;
    const e = ext(it);
    const z = ZONES.find(q => Math.abs(it.x - q.x) < e.hx + q.hx - 0.02 && Math.abs(it.z - q.z) < e.hz + q.hz - 0.02);
    return z ? z.why : null;
  }
  // 주인 가구가 base 에서 cand 로 갈 때 그 위의 물건이 가는 자리 (돌린 만큼 주인의 가운데를 돌아간다)
  function kidAt(kid, base, cand) {
    const d = (cand.rot || 0) - (base.rot || 0), a = THREE.MathUtils.degToRad(d), dx = kid.x - base.x, dz = kid.z - base.z;
    const c = Math.cos(a), s = Math.sin(a);
    return { ...kid, x: r2(cand.x + dx * c + dz * s), z: r2(cand.z - dx * s + dz * c), rot: normRot((kid.rot || 0) + d) };
  }
  const kidsWhy = (m, cand) => {
    for (const k of m.kidsBase) { const w = opts.placementError(kidAt(k, m.base, cand), room, tableAt); if (w) return `위에 올린 ${labelOf(k)}: ${w}`; }
    return null;
  };

  // ---------- 그리는 도우미: 발판, 격자 ----------
  const tileMat = new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
  const tile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tileMat);
  tile.rotation.x = -Math.PI / 2; tile.renderOrder = 2; tile.visible = false;
  const wallTile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tileMat);
  wallTile.renderOrder = 2; wallTile.visible = false;
  const gridPts = [];
  for (let x = -RX; x <= RX + 1e-6; x += 0.5) gridPts.push(x, 0.014, -RZ, x, 0.014, RZ);
  for (let z = -RZ; z <= RZ + 1e-6; z += 0.5) gridPts.push(-RX, 0.014, z, RX, 0.014, z);
  const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
  const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: '#F3EADB', transparent: true, opacity: 0.35, depthWrite: false }));
  grid.visible = false;
  scene.add(tile, wallTile, grid); // dispose 는 scene.js 가 장면째 한다
  function showTile(it, color) {
    tileMat.color.set(color);
    if (it.type === 'frame') {
      const wall = it.rot === 90 ? 'left' : 'back';
      wallTile.position.copy(WALLS[wall].point(wall === 'back' ? it.x : it.z, it.y ?? FRAME_Y, 0.04)); wallTile.rotation.y = WALLS[wall].rotY;
      wallTile.scale.set(2 * FRAME_M + 0.1, 0.9, 1); wallTile.visible = true; tile.visible = false;
      return;
    }
    const e = ext(it);
    tile.position.set(it.x, (it.y || 0) + 0.02, it.z); tile.scale.set(2 * e.hx, 2 * e.hz, 1); tile.visible = true; wallTile.visible = false;
  }

  // ---------- 상태 알리기, 되돌리기 ----------
  const snap = () => JSON.stringify({ items: ed.items, time: ed.time });
  const keyOf = (items, time) => JSON.stringify({ items, time });
  function emit() {
    if (ctx.disposed) return;
    root.dispatchEvent(new CustomEvent('heap:editstate', { detail: {
      on: ed.on, items: ed.items.map(it => ({ ...it })), sel: ed.sel, time: ed.time,
      moving: ed.move ? { isNew: ed.move.isNew, label: labelOf(ed.move.base) } : null,
      canUndo: ed.hist.length > 0, canRedo: ed.future.length > 0, dirty: snap() !== ed.saved, notice: ed.notice,
    } }));
  }
  function notice(text, undo = false) { ed.notice = { text, undo, seq: ++ed.seq }; }
  // 지금 상태를 되돌리기 기록에 넣는다. tag 가 바로 앞과 같으면 넣지 않는다 (글자 하나마다 한 걸음이 되지 않게).
  function pushUndo(tag = null) {
    if (tag && tag === ed.tag) return;
    ed.hist.push(snap()); if (ed.hist.length > UNDO_MAX) ed.hist.shift();
    ed.future = []; ed.tag = tag;
  }
  function setTime(v) { ed.time = v; root.dispatchEvent(new CustomEvent('heap:time', { detail: v })); }
  function restore(s) {
    const o = JSON.parse(s);
    ed.items = o.items; ed.sel = null; ed.tag = null;
    if (o.time !== ed.time) setTime(o.time);
    rebuild();
  }
  function undo() { endMove(); if (!ed.hist.length) return; ed.future.push(snap()); restore(ed.hist.pop()); ed.notice = null; }
  function redo() { endMove(); if (!ed.future.length) return; ed.hist.push(snap()); restore(ed.future.pop()); ed.notice = null; }

  // ---------- 다시 짓기 ----------
  // ed.items (그리고 커서에 붙은 새 가구)로 다시 짓는다. 끄는 중이면 그 가구를 커서 자리에 다시 둔다.
  function rebuild() {
    clearTimeout(ed.fnTimer); ed.fnTimer = 0;
    const list = ed.move?.isNew ? [...ed.items, ed.move.cand ?? ed.move.base] : ed.items;
    ctx.applyItems(list);
    if (ed.move) showMove();
  }
  function flushFn() { if (ed.fnTimer) rebuild(); }

  // ---------- 커서 아래 ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hitV = new THREE.Vector3();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const backPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), RZ), leftPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), RX);
  function rayFrom(ev) {
    const b = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  const FIXED = new Map([
    ...[tableTop, ...projParts, ...phoneParts].map(m => [m, '사진 탁자는']), ...doorParts.map(m => [m, '문은']),
    ...bookParts.map(m => [m, '방명록은']), [screen, '스크린은'],
  ]);
  // 누른 곳의 가구 번호(item) 또는 고정된 것의 이름(fixed)
  function pick(ev) {
    rayFrom(ev);
    const hits = ray.intersectObjects([ctx.build.group, ...FIXED.keys()], true);
    for (const h of hits) {
      if (FIXED.has(h.object)) return { fixed: FIXED.get(h.object) };
      for (let o = h.object; o; o = o.parent) {
        const i = o.userData.itemIndex;
        if (i != null) { if (i < ed.items.length) return { item: i, point: h.point }; break; }
      }
    }
    return null;
  }
  // 커서가 가리키는 자리에 m 의 가구를 놓으면 어디가 되는지 (스냅과 방 안으로 당기기를 마친 항목)
  function resolve(m, ev) {
    rayFrom(ev);
    const it = { ...m.base, rot: m.rot };
    if (it.type === 'frame') { // 벽 액자: 뒷벽이나 왼쪽 벽을 따라서만 움직인다
      const pb = ray.ray.intersectPlane(backPlane, new THREE.Vector3()), pl = ray.ray.intersectPlane(leftPlane, new THREE.Vector3());
      const wall = pb && pb.x >= -RX ? 'back' : pl ? 'left' : null;
      if (!wall) return m.cand;
      const half = WALLS[wall].half;
      let u = wall === 'back' ? pb.x : pl.z;
      if (!ed.alt) u = snapGrid(u);
      u = r2(clamp(u, -half + FRAME_M, half - FRAME_M));
      return wall === 'back' ? { ...it, x: u, z: r2(-RZ), rot: 0, y: FRAME_Y } : { ...it, x: r2(-RX), z: u, rot: 90, y: FRAME_Y };
    }
    floorPlane.constant = -(it.y || 0); // 가구 위의 물건은 자기 높이의 평면에서 커서를 따른다
    if (!ray.ray.intersectPlane(floorPlane, hitV)) return m.cand;
    let x = hitV.x + m.grab.x, z = hitV.z + m.grab.z;
    const e = ext(it), skip = new Set([m.isNew ? -1 : m.i, ...m.kids]);
    if (!ed.alt) {
      x = snapGrid(x); z = snapGrid(z);
      if (!it.y && !isRug(it)) ed.items.forEach((o, j) => { // 이웃의 가장자리에 붙는다
        if (skip.has(j) || o.y || o.type === 'frame' || isRug(o)) return;
        const oe = ext(o);
        if (Math.abs(z - o.z) < e.hz + oe.hz + 0.1) { const r = o.x + oe.hx + e.hx, l = o.x - oe.hx - e.hx; if (Math.abs(x - r) < EDGE_SNAP) x = r; else if (Math.abs(x - l) < EDGE_SNAP) x = l; }
        if (Math.abs(x - o.x) < e.hx + oe.hx + 0.1) { const f = o.z + oe.hz + e.hz, b = o.z - oe.hz - e.hz; if (Math.abs(z - f) < EDGE_SNAP) z = f; else if (Math.abs(z - b) < EDGE_SNAP) z = b; }
      });
      if (x - e.hx < -RX + WALL_SNAP) x = -RX + e.hx; if (x + e.hx > RX - WALL_SNAP) x = RX - e.hx; // 벽에 붙는다
      if (z - e.hz < -RZ + WALL_SNAP) z = -RZ + e.hz; if (z + e.hz > RZ - WALL_SNAP) z = RZ - e.hz;
    }
    it.x = r2(clamp(x, -RX + e.hx, RX - e.hx)); it.z = r2(clamp(z, -RZ + e.hz, RZ - e.hz)); // 방 밖으로는 나가지 않는다
    return it;
  }
  // m.cand 대로 그룹(그리고 위의 물건)을 옮긴다. 다시 짓지 않는다.
  function showMove() {
    const m = ed.move, groups = ctx.build.groups, c = m.cand;
    const g = groups[m.i];
    if (g) { g.visible = !!c; if (c) { g.position.set(c.x, 0, c.z); g.rotation.y = THREE.MathUtils.degToRad(c.rot || 0); } }
    if (c) m.kids.forEach((j, n) => {
      const k = kidAt(m.kidsBase[n], m.base, c), kg = groups[j];
      if (kg) { kg.position.set(k.x, 0, k.z); kg.rotation.y = THREE.MathUtils.degToRad(k.rot || 0); }
    });
  }
  function update(ev) {
    const m = ed.move;
    m.cand = resolve(m, ev);
    m.why = m.cand ? why(m.cand) ?? kidsWhy(m, m.cand) : null;
    showMove();
  }

  // ---------- 동작 ----------
  function select(i) { ed.sel = i; }
  // 새 가구를 커서에 붙인다. template 은 room-editor.tsx 가 만든 항목 (x, z 는 상관없다)
  function arm(template) {
    endMove(); ed.sel = null;
    const base = { ...template, x: 0, z: 0, rot: normRot(template.rot || 0) };
    ed.move = { i: ed.items.length, isNew: true, base, rot: base.rot, kids: [], kidsBase: [], grab: { x: 0, z: 0 }, cand: null, why: null };
    grid.visible = true;
    rebuild();
    if (ed.last?.overCanvas) update(ed.last);
  }
  function startDrag(press, ev) {
    const i = press.item, base = { ...ed.items[i] }, kids = kidsOf(i);
    let grab = { x: 0, z: 0 };
    if (base.type !== 'frame') {
      rayFrom(press); floorPlane.constant = -(base.y || 0);
      if (ray.ray.intersectPlane(floorPlane, hitV)) grab = { x: base.x - hitV.x, z: base.z - hitV.z };
    }
    ed.move = { i, isNew: false, base, rot: normRot(base.rot || 0), kids, kidsBase: kids.map(j => ({ ...ed.items[j] })), grab, cand: base, why: null };
    grid.visible = true; ed.press = null;
    try { canvas.setPointerCapture?.(ev.pointerId); } catch { /* 이미 떨어진 포인터: 붙잡지 않아도 root 에서 계속 받는다 */ }
    update(ev);
  }
  // 끌던 것을 내려놓지 않고 끝낸다: 새 가구는 사라지고, 옮기던 가구는 제자리로 간다
  function endMove() {
    ed.press = null;
    if (!ed.move) return;
    ed.move = null; grid.visible = false;
    rebuild();
  }
  function cancel() { if (ed.move) endMove(); else ed.sel = null; }
  // 커서에 붙은 새 가구를 내려놓는다. keep(Shift)이면 같은 가구가 커서에 남는다
  function placeNew(ev, keep) {
    const m = ed.move;
    update(ev);
    if (!m.cand) return;
    if (m.why) { notice(`거기엔 놓을 수 없어요 · ${m.why}`); return; }
    pushUndo();
    ed.items = [...ed.items, m.cand];
    if (keep) { m.i = ed.items.length; m.base = { ...m.cand }; }
    else { ed.move = null; grid.visible = false; ed.sel = ed.items.length - 1; }
    ed.notice = null; seatNote(ed.items.length - 1);
    rebuild();
  }
  function dropDrag(ev) {
    const m = ed.move;
    if (overDock(ev)) { ed.move = null; grid.visible = false; remove(m.i); return; }
    ed.move = null; grid.visible = false;
    const c = m.cand;
    if (m.why || !c) { notice(`제자리로 돌아갔어요 · ${m.why}`); rebuild(); return; }
    if (c.x === m.base.x && c.z === m.base.z && c.rot === normRot(m.base.rot || 0)) { rebuild(); return; }
    pushUndo();
    const next = ed.items.slice();
    next[m.i] = c; m.kids.forEach((j, n) => { next[j] = kidAt(m.kidsBase[n], m.base, c); });
    ed.items = next; ed.notice = null; seatNote(m.i);
    rebuild();
  }
  function rotate(dir) {
    if (ed.move) {
      if (ed.move.base.type === 'frame') return;
      ed.move.rot = normRot(ed.move.rot + 90 * dir);
      if (ed.last) update(ed.last);
      return;
    }
    if (ed.sel == null) return;
    const i = ed.sel, base = ed.items[i];
    if (base.type === 'frame') { notice('액자는 벽을 따라서만 움직여요'); return; }
    const c = { ...base, rot: normRot((base.rot || 0) + 90 * dir) }, e = ext(c);
    if (!c.y) { c.x = r2(clamp(c.x, -RX + e.hx, RX - e.hx)); c.z = r2(clamp(c.z, -RZ + e.hz, RZ - e.hz)); }
    const kids = kidsOf(i), m = { base, kidsBase: kids.map(j => ed.items[j]) };
    const w = why(c) ?? kidsWhy(m, c);
    if (w) { notice(`돌릴 자리가 없어요 · ${w}`); return; }
    pushUndo();
    const next = ed.items.slice();
    next[i] = c; kids.forEach((j, n) => { next[j] = kidAt(m.kidsBase[n], base, c); });
    ed.items = next; ed.notice = null;
    rebuild();
  }
  // 가구를 넣는다. 그 위에 선 물건도 함께 간다. 알림의 되돌리기로 돌아온다
  function remove(i) {
    if (ed.move?.isNew) { endMove(); return; }
    const it = ed.items[i]; if (!it) return;
    const kids = new Set(kidsOf(i));
    pushUndo();
    ed.items = ed.items.filter((_, j) => j !== i && !kids.has(j)); ed.sel = null;
    notice(`넣어 뒀어요 · ${labelOf(it)}${kids.size ? ` 외 ${kids.size}개` : ''}`, true);
    rebuild();
  }
  // 고른 가구와 같은 것을 커서에 붙인다. 기능은 따라가지 않는다 (달력은 빈 달력이 된다)
  function copy() {
    if (ed.sel == null || ed.move) return;
    const t = { ...ed.items[ed.sel] };
    delete t.fn;
    if (t.type === 'calendar') t.fn = { kind: 'calendar', entries: [] };
    arm(t);
    notice(`${labelOf(t)} 하나 더 · 놓을 곳을 눌러 주세요`);
  }
  function setFn(i, fn) {
    const it = ed.items[i]; if (!it) return;
    pushUndo(`fn:${i}`);
    const next = { ...it }; delete next.fn; if (fn) next.fn = fn;
    ed.items = ed.items.map((o, j) => (j === i ? next : o));
    clearTimeout(ed.fnTimer); ed.fnTimer = setTimeout(rebuild, FN_DELAY); // 글자마다 다시 짓지 않는다
  }
  function toggleLit() {
    const i = ed.sel, it = ed.items[i]; if (!it) return;
    pushUndo();
    const next = { ...it }; if (it.lit === false) delete next.lit; else next.lit = false;
    ed.items = ed.items.map((o, j) => (j === i ? next : o));
    rebuild();
  }
  // 처음으로: 마지막으로 저장한 모습. 되돌리기로 돌아올 수 있다
  function reset() {
    endMove(); pushUndo();
    ed.items = ctx.original.items.map(it => ({ ...it })); ed.sel = null;
    if (ed.time !== ctx.original.time) setTime(ctx.original.time);
    notice('마지막으로 저장한 모습으로 돌아왔어요', true);
    rebuild();
  }
  // 앉는 가구가 다른 가구와 겹치면 저장은 되지만 그 자리에는 앉을 수 없다 (예전 꾸미기 패널의 안내)
  function seatNote(i) {
    const it = ed.items[i], cat = entryOf(it)?.category;
    if (!it || it.y || (cat !== 'chair' && cat !== 'sofa')) return;
    const e = ext(it);
    const clash = ed.items.some((o, j) => {
      if (j === i || o.y || o.type === 'frame' || isRug(o)) return false;
      const f = ext(o);
      return Math.abs(it.x - o.x) < e.hx + f.hx - 0.01 && Math.abs(it.z - o.z) < e.hz + f.hz - 0.01;
    });
    if (clash) notice('다른 가구와 겹쳐요. 저장은 되지만 이 자리에는 앉을 수 없어요.');
  }
  function discard() {
    endMove();
    ed.items = ctx.original.items.map(it => ({ ...it })); ed.sel = null; ed.hist = []; ed.future = []; ed.tag = null; ed.notice = null;
    if (ed.time !== ctx.original.time) setTime(ctx.original.time);
    rebuild();
  }
  const overDock = ev => { const d = root.querySelector('.ed-dock')?.getBoundingClientRect(); return !!d && ev.clientX >= d.left && ev.clientX <= d.right && ev.clientY >= d.top && ev.clientY <= d.bottom; };

  // ---------- 들어오기, 나가기 ----------
  function enter() {
    if (ed.on || ctx.disposed) return;
    if (ctx.perch) ctx.unperch();
    for (const id of OVERLAYS) $(id).hidden = true;
    ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = [];
    ctx.mode = 'edit';
    if (ctx.doorSpot) me.position.copy(ctx.doorSpot); // 걷는 사람은 문 앞에서 기다린다
    me.position.y = 0;
    ctx.syncUI();
    ed.on = true; ed.items = ctx.build.items.map(it => ({ ...it })); ed.time = ctx.timeChoice; ed.sel = null;
    ed.hist = []; ed.future = []; ed.tag = null; ed.notice = null; ed.move = null; ed.press = null;
    ed.saved = keyOf(ctx.original.items, ctx.original.time);
    emit();
    getCatalogue().then(() => { if (ed.on) emit(); }); // 이름과 러그 여부는 카탈로그에서 온다
  }
  function exit() {
    if (!ed.on) return;
    const had = !!ed.move || !!ed.fnTimer;
    ed.move = null; ed.press = null; ed.sel = null; ed.on = false;
    grid.visible = tile.visible = wallTile.visible = false;
    canvas.style.cursor = '';
    if (had) rebuild();
    ctx.mode = 'room'; ctx.setHint('room'); ctx.syncUI();
    emit();
  }
  on(root, 'heap:edit', e => { if (e.detail) enter(); else exit(); });
  on(root, 'heap:saved', e => {
    const l = e.detail;
    if (l && Array.isArray(l.items)) { ed.saved = keyOf(l.items, l.time ?? 'auto'); if (ed.on) emit(); }
  });
  on(root, 'heap:editcmd', e => {
    const c = e.detail;
    if (!ed.on || !c || typeof c !== 'object') return;
    if (c.op !== 'fn') { ed.tag = null; flushFn(); }
    switch (c.op) {
      case 'arm': if (c.template && typeof c.template === 'object') arm(c.template); break;
      case 'rotate': rotate(c.dir === -1 ? -1 : 1); break;
      case 'copy': copy(); break;
      case 'remove': if (ed.sel != null) remove(ed.sel); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'time': if (c.value !== ed.time) { pushUndo(); setTime(c.value); } break;
      case 'fn': if (Number.isInteger(c.index)) setFn(c.index, c.fn); break;
      case 'lit': toggleLit(); break;
      case 'select': endMove(); select(Number.isInteger(c.index) && c.index < ed.items.length ? c.index : null); break;
      case 'cancel': cancel(); break;
      case 'reset': reset(); break;
      case 'discard': discard(); break;
      default: return;
    }
    emit();
  });

  // ---------- 포인터와 키 ----------
  // 방 루트의 capture 단계에서 받아 캔버스까지 내려보내지 않는다: 편집 중에는 걷기, 앉기, 기능 가구 누르기가 꺼진다 (input.js)
  const remember = ev => { ed.last = { clientX: ev.clientX, clientY: ev.clientY, overCanvas: ev.target === canvas || !!ed.move }; ed.alt = ev.altKey; };
  on(root, 'pointerdown', ev => {
    if (!ed.on || ev.target !== canvas) return;
    ev.stopPropagation(); remember(ev); flushFn(); ed.tag = null;
    if (ev.button === 2) { cancel(); emit(); return; }
    if (ev.button !== 0) return;
    if (ed.move?.isNew) { placeNew(ev, ev.shiftKey); emit(); return; }
    const hit = pick(ev);
    if (hit?.item != null) { ed.sel = hit.item; ed.press = { item: hit.item, clientX: ev.clientX, clientY: ev.clientY }; ed.notice = null; }
    else { ed.sel = null; ed.notice = null; if (hit?.fixed) notice(`${hit.fixed} 이 화면에서 옮기지 않아요 (고정)`); }
    emit();
  }, { capture: true });
  on(root, 'pointermove', ev => {
    if (!ed.on) return;
    remember(ev);
    if (ed.press && !ed.move && Math.hypot(ev.clientX - ed.press.clientX, ev.clientY - ed.press.clientY) > 5) { startDrag(ed.press, ev); emit(); }
    if (ed.move) {
      if (ev.target === canvas || !ed.move.isNew) update(ev);
      root.querySelector('.ed-dock')?.classList.toggle('drop', !ed.move.isNew && overDock(ev));
      canvas.style.cursor = 'grabbing';
      if (ev.target === canvas) ev.stopPropagation();
      return;
    }
    if (ev.target !== canvas) return;
    ev.stopPropagation();
    if (!ev.buttons) canvas.style.cursor = pick(ev)?.item != null ? 'grab' : '';
  }, { capture: true });
  on(root, 'pointerup', ev => {
    if (!ed.on) return;
    if (ev.target === canvas) ev.stopPropagation();
    ed.press = null;
    root.querySelector('.ed-dock')?.classList.remove('drop');
    if (ed.move && !ed.move.isNew) { dropDrag(ev); canvas.style.cursor = ''; emit(); }
  }, { capture: true });
  on(root, 'contextmenu', ev => { if (ed.on && ev.target === canvas) ev.preventDefault(); }, { capture: true });
  on(window, 'keydown', ev => {
    if (!ed.on) return;
    if (ev.key === 'Alt') { ed.alt = true; ev.preventDefault(); if (ed.move && ed.last) { update(ed.last); } return; }
    if (ev.target.closest?.('input, textarea, select, .ed-sheet')) return; // 기능 칸의 글자는 칸의 것이다
    const k = ev.key.toLowerCase(), mod = ev.ctrlKey || ev.metaKey;
    let done = true;
    if (mod && k === 'z') { if (ev.shiftKey) redo(); else undo(); }
    else if (mod && k === 'y') redo();
    else if (mod && k === 'd') { flushFn(); copy(); }
    else if (mod || ev.altKey) done = false; // Ctrl+S 는 room-editor.tsx 가 받는다
    else if (k === 'r') rotate(ev.shiftKey ? -1 : 1);
    else if (k === 'delete' || k === 'backspace') { if (ed.move?.isNew) endMove(); else if (ed.sel != null && !ed.move) remove(ed.sel); }
    else if (k === 'escape') cancel();
    else done = false;
    if (!done) return;
    ev.preventDefault(); ev.stopPropagation(); ed.tag = null;
    emit();
  }, { capture: true });
  on(window, 'keyup', ev => { if (ev.key === 'Alt' && ed.on) { ed.alt = false; if (ed.move && ed.last) update(ed.last); } });
  on(window, 'blur', () => { ed.alt = false; });

  // ---------- 프레임마다: 발판, 가구 위 막대, 이유 칩 ----------
  const bb = new THREE.Box3(), top = new THREE.Vector3();
  function editFrame() {
    const m = ed.move, bar = root.querySelector('#ed-bar'), chip = root.querySelector('#ed-why');
    if (m?.cand) showTile(m.cand, m.why ? BAD : OK);
    else if (!m && ed.sel != null && ed.items[ed.sel]) showTile(ed.items[ed.sel], PICKED);
    else tile.visible = wallTile.visible = false;
    if (chip) {
      const show = !!(m?.why && ed.last);
      if (show) {
        const rr = root.getBoundingClientRect();
        chip.textContent = m.why; chip.style.left = `${ed.last.clientX - rr.left + 14}px`; chip.style.top = `${ed.last.clientY - rr.top + 14}px`;
      }
      if (chip.hidden === show) chip.hidden = !show;
    }
    const g = !m && ed.sel != null ? ctx.build.groups[ed.sel] : null;
    if (bar && g) {
      bb.setFromObject(g);
      if (bb.isEmpty()) top.set(g.position.x, 1, g.position.z); else top.set((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2);
      top.project(camera);
      const cr = canvas.getBoundingClientRect(), rr = root.getBoundingClientRect();
      const x = cr.left - rr.left + (top.x + 1) / 2 * cr.width, y = cr.top - rr.top + (1 - top.y) / 2 * cr.height;
      bar.style.left = `${Math.round(clamp(x, cr.left - rr.left + 120, cr.right - rr.left - 120))}px`;
      bar.style.top = `${Math.round(clamp(y, cr.top - rr.top + 52, cr.bottom - rr.top))}px`;
    }
  }

  Object.assign(ctx, { editFrame });
}
