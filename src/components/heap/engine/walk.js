// 걷는 사람: 모양, 이동, 앉기, 걸음 움직임.
import * as THREE from 'three';
import { makeFigure, seatLegs, stepGait, turnToward, SIT_DROP, WALK_SPEED } from './figure.js';

export function setupWalk(ctx) {
  const { C, WALLS, DOOR, scene, toast, setHint, syncUI, SEAT, enterSort } = ctx;

  // ---------- 걷는 사람 ----------
  const fig = makeFigure(C);
  const me = fig.group, { legL, legR } = fig;
  if (ctx.doorSpot) { me.position.copy(ctx.doorSpot); me.rotation.y = Math.atan2(WALLS[DOOR.wall].n.x, WALLS[DOOR.wall].n.z); }
  else me.position.set(2.2, 0, 2.4);
  scene.add(me);

  // ---------- 걷기 표시 ----------
  // 가는 곳의 바닥 고리: 커지며 사라진다. 누른 물건: 도착하거나 걷기를 그만둘 때까지 은은하게 빛난다 (재질을 복제해 바꾸고 되돌린다).
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.19, 24), new THREE.MeshBasicMaterial({ color: '#A6613C', transparent: true, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; marker.visible = false; marker.renderOrder = 2;
  scene.add(marker);
  let markerAge = 0, litAge = 0, hintAge = 0;
  const MARK_LIFE = 0.7;
  function showMarker(p) { marker.position.set(p.x, 0.012, p.z); marker.visible = true; markerAge = 0; }
  // 빛나는 메시: 누른 물건(lit)과 온보딩의 아직 안 둘러본 곳(hinted). 재질은 공유될 수 있어 메시마다 한 번 복제해 바꾸고,
  // 둘 다에서 빠지면 되돌린다 (glow: 메시 → { orig, copy }). 두 빛이 한 메시를 두고 서로 재질을 덮어쓰지 않는다
  const glow = new Map();
  let lit = new Set(), hinted = new Set(), hintSpots = [];
  const glowable = m => m?.isMesh && !Array.isArray(m.material) && !!m.material?.emissive;
  function syncGlow() {
    for (const m of [...lit, ...hinted]) {
      if (glow.has(m)) continue;
      const copy = m.material.clone(); copy.emissive.set('#A6613C');
      glow.set(m, { orig: m.material, copy }); m.material = copy;
    }
    for (const [m, g] of glow) {
      if (lit.has(m) || hinted.has(m)) continue;
      if (m.material === g.copy) m.material = g.orig;
      g.copy.dispose(); glow.delete(m);
    }
  }
  function unlight() { if (lit.size) { lit = new Set(); syncGlow(); } }
  function light(meshes) { lit = new Set(meshes.filter(glowable)); litAge = 0; syncGlow(); }

  // 온보딩 안내 (heap:hint, detail: 아직 둘러보지 않은 곳의 id 목록, onboarding-c/story.ts 의 SpotId). 빈 목록이면 끈다.
  // 가구 모델은 늦게 읽히고 꾸미기가 가구를 다시 지으므로, 메시는 1초마다 다시 찾는다
  function hintMeshes() {
    const out = [], want = new Set(hintSpots), b = ctx.build;
    for (const m of b?.slotMeshes ?? []) if (want.has(m.userData.slot?.fn?.kind)) out.push(m);
    if (want.has('door')) out.push(...(ctx.doorParts ?? []));
    if (want.has('shelf')) out.push(...(ctx.shelfParts ?? []));
    if (want.has('pile')) {
      if (ctx.heapBoxParts?.length) out.push(...ctx.heapBoxParts);
      else if (ctx.HOST && b) { // 더미를 받친 가구 (좌식 탁자 같은 것). 바닥에 깔린 러그는 빼고 위에 선 부분만
        b.items.forEach((o, i) => {
          if (o === ctx.HOST.item || !b.groups[i]) return;
          const e = ctx.opts.itemHalfExtents?.(o);
          if (!e || Math.abs(o.x - ctx.HOST.x) > e.hx || Math.abs(o.z - ctx.HOST.z) > e.hz) return;
          b.groups[i].traverse(m => { if (m.isMesh && m.position.y > 0.05) out.push(m); });
        });
      }
    }
    return out.filter(glowable);
  }
  function refreshHints() { hinted = new Set(hintSpots.length ? hintMeshes() : []); syncGlow(); }
  let hintClock = 0;
  ctx.on(ctx.root, 'heap:hint', e => { hintSpots = Array.isArray(e.detail) ? e.detail : []; refreshHints(); });
  // 걸을 점들을 정하고 표시를 띄운다. 길이 없으면 false
  function followPath(path, action, meshes) {
    if (!path?.length) { toast('거기까지 갈 길이 없어요'); return false; }
    ctx.waypoints = path.slice(); ctx.walkTo = ctx.waypoints.shift(); ctx.arrive = action;
    showMarker(path[path.length - 1]); light(meshes ?? []);
    return true;
  }
  // 프레임마다 (loop.js). 더미 보기로 넘어가도 고리가 끝까지 사라지게 모드와 상관없이 돈다
  function stepCue(dt) {
    if (marker.visible) {
      markerAge += dt;
      const k = Math.min(1, markerAge / MARK_LIFE);
      marker.scale.setScalar(0.7 + 0.6 * k); marker.material.opacity = 0.9 * (1 - k);
      if (k >= 1) marker.visible = false;
    }
    if (lit.size && !ctx.walkTo) unlight();
    if (hintSpots.length && (hintClock += dt) > 1) { hintClock = 0; refreshHints(); }
    if (!glow.size) return;
    litAge += dt; hintAge += dt;
    // 누른 물건은 또렷이 고동치고, 안내는 그보다 옅게 천천히 숨 쉰다
    const litI = 0.22 + 0.12 * Math.sin(litAge * 5), hintI = 0.1 + 0.05 * Math.sin(hintAge * 2.2);
    for (const [m, g] of glow) g.copy.emissiveIntensity = lit.has(m) ? litI : hintI;
  }

  function sitOn(seats, point) { // 이 가구에서 클릭한 자리에 가장 가까운 자리
    const s = seats.reduce((a, b) => (Math.hypot(a.pos.x - point.x, a.pos.z - point.z) <= Math.hypot(b.pos.x - point.x, b.pos.z - point.z) ? a : b));
    if (!ctx.seatUsable(s)) { toast('여기에는 앉을 수 없어요'); return; }
    if (ctx.perch) unperch();
    const from = me.position.clone().setY(0);
    let best = null;
    for (const st of s.stands) {
      if (!ctx.walkFree(st.x, st.z)) continue;
      const path = ctx.planPath(from, st);
      if (!path) continue;
      let len = 0, prev = from; for (const p of path) { len += prev.distanceTo(p); prev = p; }
      if (!best || len < best.len) best = { st, path, len };
    }
    if (!best) { toast('거기까지 갈 길이 없어요'); return; }
    ctx.seatTarget = s; ctx.seatFrom = best.st;
    followPath(best.path, 'seat', ctx.build.seatMeshes.filter(m => m.userData.seats === seats));
  }
  function perchOn(s) {
    if (!s || !ctx.seatFrom || Math.hypot(me.position.x - ctx.seatFrom.x, me.position.z - ctx.seatFrom.z) > 0.3) return; // 걸음이 계획된 stand 점에서만
    ctx.perch = s; ctx.perchFrom = ctx.seatFrom; ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = [];
    setHint('perch'); syncUI();
  }
  function unperch() {
    if (!ctx.perch) return;
    ctx.perch = null;
    me.position.copy(ctx.perchFrom).setY(0); ctx.collide(me.position); // 자리에 들어선 바닥으로 되돌린다
    setHint('room'); syncUI();
  }
  // 가구를 돌아가는 길 (path.js 의 A*). 가는 곳이 막혀 있으면 가장 가까운 빈 자리까지 간 뒤 동작한다.
  // meshes: 누른 물건 (도착할 때까지 빛난다)
  function walkRoute(to, action, meshes) {
    if (ctx.perch) unperch();
    const from = me.position.clone().setY(0);
    followPath(ctx.planPath(from, to, { snap: true }), action, meshes);
  }

  const nearTable = () => !!SEAT && me.position.distanceTo(SEAT) < 1.1; // 사진 더미를 보는 자리 (더미가 없는 방은 없다)
  const nearShelf = () => !!ctx.shelfSpot && me.position.distanceTo(ctx.shelfSpot) < 1.1;
  const nearDoor = () => !!ctx.doorSpot && me.position.distanceTo(ctx.doorSpot) < 0.7;
  const UP = new THREE.Vector3(-1, 0, -1).normalize(), RIGHT = new THREE.Vector3(1, 0, -1).normalize();
  const mv = new THREE.Vector3();
  function arrived() {
    if (ctx.waypoints.length) { ctx.walkTo = ctx.waypoints.shift(); return; }
    const a = ctx.arrive; ctx.walkTo = null; ctx.arrive = null;
    unlight();
    if (a === 'sit') ctx.sit(); else if (a === 'sort') enterSort(); else if (a === 'door') ctx.openRooms(); else if (a === 'seat') perchOn(ctx.seatTarget); else if (a === 'slot') ctx.openSlot(ctx.slotTarget);
  }
  const WALK_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  function stepCharacter(dt) {
    if (ctx.perch) {
      if (ctx.anyOverlay() || !WALK_KEYS.some(k => ctx.keys.has(k))) { // 앉아 있다: 걷기 키를 누를 때까지 자세를 유지한다
        me.position.set(ctx.perch.pos.x, ctx.perch.pos.y - SIT_DROP, ctx.perch.pos.z); me.rotation.y = ctx.perch.yaw; seatLegs(fig);
        return;
      }
      unperch();
    }
    mv.set(0, 0, 0);
    if (!ctx.anyOverlay()) {
      if (ctx.keys.has('w') || ctx.keys.has('arrowup')) mv.add(UP);
      if (ctx.keys.has('s') || ctx.keys.has('arrowdown')) mv.sub(UP);
      if (ctx.keys.has('d') || ctx.keys.has('arrowright')) mv.add(RIGHT);
      if (ctx.keys.has('a') || ctx.keys.has('arrowleft')) mv.sub(RIGHT);
    }
    if (mv.lengthSq()) { ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = []; mv.normalize(); }
    else if (ctx.walkTo) {
      mv.subVectors(ctx.walkTo, me.position).setY(0);
      const gap = mv.length();
      // 자리는 stand 점에서만 들어서므로 그 위로 마지막 걸음이 넘치지 않는다: 한 걸음 안이면 방문자가 자리에 앉는다
      if (ctx.arrive === 'seat' && !ctx.waypoints.length && gap <= WALK_SPEED * dt) { me.position.x = ctx.walkTo.x; me.position.z = ctx.walkTo.z; mv.set(0, 0, 0); return arrived(); }
      if (gap < (ctx.waypoints.length ? 0.2 : 0.08)) { mv.set(0, 0, 0); return arrived(); }
      mv.normalize();
    }
    const moving = mv.lengthSq() > 0;
    if (moving) {
      const before = me.position.clone();
      me.position.addScaledVector(mv, WALK_SPEED * dt); ctx.collide(me.position);
      if (ctx.walkTo && me.position.distanceTo(before) < 0.2 * WALK_SPEED * dt) {
        if (ctx.waypoints.length) return arrived();
        if ((ctx.arrive === 'sit' && nearTable()) || (ctx.arrive === 'sort' && nearShelf()) || (ctx.arrive === 'door' && nearDoor()) || ctx.arrive === 'slot') return arrived();
        ctx.walkTo = null; ctx.arrive = null;
      }
      turnToward(fig, mv.x, mv.z, dt);
    }
    stepGait(fig, moving, dt);
    setHint(nearTable() ? 'near' : nearShelf() ? 'nearShelf' : nearDoor() ? 'nearDoor' : ctx.nearTree?.() ? 'nearTree' : 'room');
  }

  Object.assign(ctx, { unperch, me, fig, nearTable, nearShelf, nearDoor, sitOn, walkRoute, stepCharacter, stepCue, legL, legR });
}
