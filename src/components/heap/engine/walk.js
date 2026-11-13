// 걷는 사람: 모양, 이동, 앉기, 걸음 움직임.
import * as THREE from 'three';
import { flat } from './draw.js';

export function setupWalk(ctx) {
  const { C, WALLS, DOOR, scene, toast, setHint, syncUI, SEAT, enterSort } = ctx;

  // ---------- 걷는 사람 ----------
  const me = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.25, 0.45, 7), flat(C.accent)); body.position.y = 0.5;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), flat('#f2cfb3')); head.position.y = 0.95;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), flat('#3a2a22')); hair.position.set(0, 0.98, -0.02);
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 5), flat(C.olive)), legR = legL.clone();
  legL.geometry.translate(0, -0.15, 0); legL.position.set(-0.09, 0.3, 0); legR.position.set(0.09, 0.3, 0);
  const eyeGeo = new THREE.SphereGeometry(0.035, 5, 4), eyeMat = flat('#2a2230');
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat), eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.09, 0.97, 0.23); eyeR.position.set(0.09, 0.97, 0.23);
  for (const m of [body, head, hair, legL, legR]) { m.castShadow = true; me.add(m); }
  me.add(eyeL, eyeR);
  if (ctx.doorSpot) { me.position.copy(ctx.doorSpot); me.rotation.y = Math.atan2(WALLS[DOOR.wall].n.x, WALLS[DOOR.wall].n.z); }
  else me.position.set(2.2, 0, 2.4);
  scene.add(me);

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
    ctx.waypoints = best.path.slice(); ctx.walkTo = ctx.waypoints.shift(); ctx.arrive = 'seat'; ctx.seatTarget = s; ctx.seatFrom = best.st;
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
  function walkRoute(to, action) {
    if (ctx.perch) unperch();
    const from = me.position.clone().setY(0);
    ctx.waypoints = [to]; ctx.arrive = action;
    if (ctx.crossesTable(from, to)) {
      const corners = [[ctx.TBOX.x0, ctx.TBOX.z0], [ctx.TBOX.x1, ctx.TBOX.z0], [ctx.TBOX.x0, ctx.TBOX.z1], [ctx.TBOX.x1, ctx.TBOX.z1]].map(([x, z]) => new THREE.Vector3(x, 0, z));
      const ok = corners.filter(c => !ctx.crossesTable(from, c) && !ctx.crossesTable(c, to));
      if (ok.length) ctx.waypoints = [ok.sort((p, q) => (from.distanceTo(p) + p.distanceTo(to)) - (from.distanceTo(q) + q.distanceTo(to)))[0], to];
      else {
        const near = corners.filter(c => !ctx.crossesTable(from, c)).sort((p, q) => from.distanceTo(p) - from.distanceTo(q))[0];
        const second = near && corners.filter(c => c !== near && !ctx.crossesTable(near, c) && !ctx.crossesTable(c, to)).sort((p, q) => p.distanceTo(to) - q.distanceTo(to))[0];
        ctx.waypoints = second ? [near, second, to] : [to];
      }
    }
    ctx.walkTo = ctx.waypoints.shift();
  }

  const nearTable = () => me.position.distanceTo(SEAT) < 1.1;
  const nearShelf = () => !!ctx.shelfSpot && me.position.distanceTo(ctx.shelfSpot) < 1.1;
  const nearDoor = () => !!ctx.doorSpot && me.position.distanceTo(ctx.doorSpot) < 0.7;
  const nearBook = () => !!ctx.bookSpot && me.position.distanceTo(ctx.bookSpot) < 0.7;
  const UP = new THREE.Vector3(-1, 0, -1).normalize(), RIGHT = new THREE.Vector3(1, 0, -1).normalize();
  const mv = new THREE.Vector3();
  let walkPhase = 0;
  function arrived() {
    if (ctx.waypoints.length) { ctx.walkTo = ctx.waypoints.shift(); return; }
    const a = ctx.arrive; ctx.walkTo = null; ctx.arrive = null;
    if (a === 'sit') ctx.sit(); else if (a === 'sort') enterSort(); else if (a === 'door') ctx.openRooms(); else if (a === 'book') ctx.openGuestbook(); else if (a === 'seat') perchOn(ctx.seatTarget);
  }
  const WALK_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  function stepCharacter(dt) {
    if (ctx.perch) {
      if (ctx.anyOverlay() || !WALK_KEYS.some(k => ctx.keys.has(k))) { // 앉아 있다: 걷기 키를 누를 때까지 자세를 유지한다
        me.position.set(ctx.perch.pos.x, ctx.perch.pos.y - 0.28, ctx.perch.pos.z); me.rotation.y = ctx.perch.yaw; legL.rotation.x = legR.rotation.x = -1.2;
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
      if (ctx.arrive === 'seat' && !ctx.waypoints.length && gap <= 2.4 * dt) { me.position.x = ctx.walkTo.x; me.position.z = ctx.walkTo.z; mv.set(0, 0, 0); return arrived(); }
      if (gap < (ctx.waypoints.length ? 0.2 : 0.08)) { mv.set(0, 0, 0); return arrived(); }
      mv.normalize();
    }
    const moving = mv.lengthSq() > 0;
    if (moving) {
      const before = me.position.clone();
      me.position.addScaledVector(mv, 2.4 * dt); ctx.collide(me.position);
      if (ctx.walkTo && me.position.distanceTo(before) < 0.2 * 2.4 * dt) {
        if (ctx.waypoints.length) return arrived();
        if ((ctx.arrive === 'sit' && nearTable()) || (ctx.arrive === 'sort' && nearShelf()) || (ctx.arrive === 'door' && nearDoor()) || (ctx.arrive === 'book' && nearBook())) return arrived();
        ctx.walkTo = null; ctx.arrive = null;
      }
      const want = Math.atan2(mv.x, mv.z);
      let dr = want - me.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      me.rotation.y += dr * Math.min(1, dt * 12);
      walkPhase += dt * 11;
    } else walkPhase = 0;
    const swing = Math.sin(walkPhase) * 0.6;
    legL.rotation.x = swing; legR.rotation.x = -swing;
    me.position.y = moving ? Math.abs(Math.sin(walkPhase)) * 0.04 : 0;
    setHint(nearTable() ? 'near' : nearShelf() ? 'nearShelf' : nearDoor() ? 'nearDoor' : nearBook() ? 'nearBook' : 'room');
  }

  Object.assign(ctx, { unperch, me, nearTable, nearShelf, nearDoor, nearBook, sitOn, walkRoute, stepCharacter, legL, legR });
}
