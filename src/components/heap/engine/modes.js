// 방, 앉기, 상영, 책장 모드와 카드 집기.
import * as THREE from 'three';

export function setupModes(ctx) {
  const {
    controls, me, SEAT, setHint, SIT_CAM, syncUI, requestPile, NEAR, settle, request, CLOSE, clampPlace,
    HOST, gauss, toTop, startAnim, on, $,
    unperch,
  } = ctx;

  ctx.mode = 'room'; ctx.camGoal = null; ctx.held = null; ctx.heldFlipped = false; ctx.heldTurn = 0; ctx.loaded = null; ctx.hovered = null; ctx.dragging = null;
  ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = [];
  ctx.perch = null; ctx.seatTarget = null; // perch: the seat the visitor sits on in room mode · seatTarget: the seat being walked to
  ctx.seatFrom = null; ctx.perchFrom = null; // the stand point the walk to seatTarget ends at · the stand point the visitor came to the perch from (they get up there)

  const goTo = cam => { ctx.camGoal = cam; controls.enabled = false; };

  function sit() {
    if (!SEAT || !SIT_CAM) return; // 사진 더미가 없는 방
    ctx.mode = 'sit'; ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = []; ctx.perch = null;
    me.position.copy(SEAT); me.rotation.y = ctx.seatFace ?? Math.PI; // 서서 보는 더미는 옆에 서서 더미를 본다 (props.js)
    setHint('sit'); goTo(SIT_CAM); syncUI();
    requestPile(NEAR);
  }
  function stand() {
    if (ctx.held) putBack();
    ctx.mode = 'room'; ctx.hovered = null; controls.enabled = false; ctx.camGoal = null;
    me.position.copy(SEAT).add(new THREE.Vector3(0.6, 0, 0.5));
    setHint('room'); syncUI();
  }
  function glowCard(c, v) { // 두 면이 자기 그림으로 빛나, 어두운 방에서도 카드가 읽힌다
    for (const m of c.children) {
      const mat = m.material;
      if (!mat || !mat.map) continue;
      mat.emissive.set(v ? '#ffffff' : '#000000'); mat.emissiveMap = v ? mat.map : null; mat.emissiveIntensity = v; mat.needsUpdate = true;
    }
  }
  function pickUp(c) { ctx.held = c; ctx.heldFlipped = false; ctx.heldTurn = 0; c.userData.turnNow = 0; ctx.hovered = null; controls.enabled = false; settle(); setHint('held'); syncUI(); request(c, CLOSE, true); glowCard(c, ctx.readGlow); }
  function dropOnTop(c) { // 더미 가운데 쪽으로 살짝, 그리고 제자리로 떨어진다
    const p = c.userData.place;
    c.userData.place = clampPlace({ x: HOST.x + (p.x - HOST.x) * 0.5 + gauss() * 0.15, z: HOST.z + (p.z - HOST.z) * 0.5 + gauss() * 0.1, yaw: p.yaw + gauss() * 0.6, faceUp: true });
    toTop(c);
  }
  function putBack() {
    const c = ctx.held; ctx.held = null; ctx.heldFlipped = false; ctx.heldTurn = 0; glowCard(c, 0);
    dropOnTop(c); settle(); startAnim(c, 'drop');
    if (!ctx.camGoal && ctx.mode === 'sit') controls.enabled = true;
    setHint('sit'); syncUI();
  }
  // dir 1: 왼쪽 가장자리를 앞으로 당겨 왼쪽으로 돈다 · -1: 오른쪽으로. heldTurn 은 반 바퀴를 센 값이라 도는 방향이 남는다
  function flip(dir = 1) { if (!ctx.held) return; ctx.heldTurn += dir; ctx.heldFlipped = !ctx.heldFlipped; }
  // 집어 든 카드를 누른 자리(fx: 카드 가로의 0~1, 화면 기준). 앞면은 20 · 60 · 20 으로 나눠 양옆 20 만 뒤집고
  // 가운데 60 은 두 번 눌러 재생한다 (card-view.js). 뒷면은 어디를 눌러도 뒤집는다. 누른 쪽으로 당겨 돈다.
  function flipAt(fx) {
    if (!ctx.heldFlipped && fx >= 0.2 && fx <= 0.8) return;
    flip(fx < 0.5 ? 1 : -1);
  }
  on($('flip'), 'click', () => flip());

  on($('stand'), 'click', () => (ctx.perch ? unperch() : stand()));

  Object.assign(ctx, { sit, pickUp, goTo, flip, flipAt, putBack, stand });
}
