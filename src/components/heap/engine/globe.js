// 스노우 글로브 모드. 글로브 소품(fixtures.js 의 BUILD.globe)을 누르면 글로브가 제자리에서 떠올라
// 지금 카메라 앞 화면 가운데로 다가온다. 카메라는 그대로라 뒤로 방이 보이고, 화면에는 출처 목록이 뜬다 (heap-room.tsx).
// 방은 어두워지고 집 창문의 불빛이 번진다. 끌면 카메라가 아니라 글로브가 돈다. 돌리는 동안에도 눈은 세상의 아래로 내린다.
// 들어올 때, 돌릴 때, 누를 때 3초 동안 눈이 내린다 (내리는 중에 다시 하면 3초를 새로 잰다).
// Esc 나 단추로 물러나면 글로브가 제자리로 돌아가고, 들어오기 전 모드(방 또는 앉기)로 돌아간다.
import * as THREE from 'three';
import { GLOBE_CENTRE_Y } from '../../snow-globe/model.js';

const SNOW_MS = 3000;
const SCREEN_H = 0.55; // 떠오른 글로브가 화면 높이에서 차지하는 몫
const FLOAT_S = 0.9; // 떠오르기와 돌아가기 시간 (초)
const DARK = 0.62; // 글로브 모드에서 방 노출을 줄이는 몫

export function setupGlobe(ctx) {
  const { renderer, camera, controls, scene, $, on, onDispose, Yv } = ctx;
  const G = () => ctx.build.globe;
  let dim = 0, snowTimer = 0;
  // 떠오르기: lift 0 (탁자 위) ~ 1 (카메라 앞). held 는 지금 떠 있는(또는 돌아가는) 글로브
  let lift = 0, held = null, spinYaw = 0, spinPitch = 0;
  const floatPos = new THREE.Vector3(), camPos = new THREE.Vector3(), camRight = new THREE.Vector3(), baseYaw = { v: 0 };
  const homeM = new THREE.Matrix4(), homePos = new THREE.Vector3(), homeQ = new THREE.Quaternion(), homeS = new THREE.Vector3();
  const worldM = new THREE.Matrix4(), floatQ = new THREE.Quaternion(), qB = new THREE.Quaternion(), down = new THREE.Vector3(), invQ = new THREE.Quaternion();
  ctx.globeFrom = null;
  onDispose(() => clearTimeout(snowTimer));

  function snow() {
    G()?.snow.start(SNOW_MS);
    $('globe-snow').classList.add('on');
    clearTimeout(snowTimer);
    snowTimer = setTimeout(() => $('globe-snow').classList.remove('on'), SNOW_MS);
  }

  // 카메라 앞 자리: 카메라가 가는 구도(camGoal, 없으면 지금 카메라)의 시선 위, 글로브 높이가 화면의 SCREEN_H 가 되는 거리.
  // 방 모드의 카메라(loop.js 의 roomCam)는 controls.target 을 쓰지 않으므로 지금 카메라의 시선을 읽는다
  const look = new THREE.Vector3();
  function aim() {
    const goal = ctx.camGoal;
    camPos.copy(goal ? goal.pos : camera.position);
    if (goal) look.copy(goal.target).sub(camPos).normalize(); else camera.getWorldDirection(look);
    const g = G(), height = g.unit * (GLOBE_CENTRE_Y + 1);
    const dist = height / (SCREEN_H * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    floatPos.copy(camPos).addScaledVector(look, dist).addScaledVector(Yv, -g.unit * GLOBE_CENTRE_Y); // root 는 받침 바닥이다
    baseYaw.v = Math.atan2(camPos.x - floatPos.x, camPos.z - floatPos.z); // 집 앞(지역 +z)이 카메라를 본다
    camRight.crossVectors(look, Yv).normalize();
  }

  function enterGlobe() {
    const g = G();
    if (!g || (ctx.mode !== 'room' && ctx.mode !== 'sit')) return;
    if (ctx.held) ctx.putBack();
    ctx.globeFrom = ctx.mode; // 방에서 눌렀으면 그 자리에 서서, 더미를 보다가 눌렀으면 앉은 채로 본다
    ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = [];
    ctx.mode = 'globe'; ctx.hovered = null; controls.enabled = false;
    if (held !== g) { // 제자리에서 떼어 장면에 둔다 (세상 자리를 그대로 지킨다)
      held = g; g.root.updateMatrixWorld(); homeM.copy(g.root.matrix);
      scene.attach(g.root);
    }
    spinYaw = 0; spinPitch = 0;
    aim();
    ctx.setHint('globe'); ctx.syncUI();
    snow();
  }

  function exitGlobe() {
    if (ctx.mode !== 'globe') return;
    clearTimeout(snowTimer); $('globe-snow').classList.remove('on');
    const back = ctx.globeFrom ?? 'room';
    ctx.mode = back; ctx.globeFrom = null;
    if (!ctx.camGoal) controls.enabled = back === 'sit' && !ctx.held;
    ctx.setHint(back); ctx.syncUI();
  }
  on($('globeexit'), 'click', exitGlobe);

  // 끌기 (input.js): 가로는 세상 위축, 세로는 화면 오른쪽 축으로 글로브를 돌린다. 돌리면 눈이 내린다
  function globeDrag(dx, dy) {
    spinYaw += dx * 0.012;
    spinPitch = THREE.MathUtils.clamp(spinPitch + dy * 0.012, -1.2, 1.2);
    if (!G()?.snow.active || Math.abs(dx) + Math.abs(dy) > 4) snow();
  }

  // 글로브 모드에서 누르면 어디를 눌러도 눈이 내린다
  const onGlobe = ray => { const g = G(); return !!g && ray.intersectObjects(g.hitMeshes, false).length > 0; };
  const globeClick = () => snow();

  // 매 프레임 (loop.js)
  function globeStep(dt) {
    const g = G();
    if (held && held !== g) { scene.remove(held.root); held.dispose(); held = null; lift = 0; } // 방을 다시 지었다: 떠 있던 옛 글로브를 치운다
    if (!g) { if (ctx.mode === 'globe') exitGlobe(); return; }

    // 떠오르기와 돌아가기. 오는 길에 위로 살짝 떠오른다
    const want = ctx.mode === 'globe' ? 1 : 0;
    if (held === g && (lift > 0 || want)) {
      lift = THREE.MathUtils.clamp(lift + (want ? dt : -dt) / FLOAT_S, 0, 1);
      if (want) aim(); // 카메라가 아직 자리로 가는 중이면 따라간다
      worldM.multiplyMatrices(g.anchor.matrixWorld, homeM).decompose(homePos, homeQ, homeS); // 소품 묶음 안의 제자리 (세상 좌표)
      const e = lift * lift * (3 - 2 * lift); // 부드럽게
      g.root.position.lerpVectors(homePos, floatPos, e).addScaledVector(Yv, Math.sin(Math.PI * e) * 0.12);
      qB.setFromAxisAngle(Yv, baseYaw.v + spinYaw); floatQ.setFromAxisAngle(camRight, -spinPitch).multiply(qB);
      g.root.quaternion.slerpQuaternions(homeQ, floatQ, e);
      if (lift === 0 && !want) { g.anchor.add(g.root); homeM.decompose(g.root.position, g.root.quaternion, g.root.scale); held = null; } // 소품 묶음으로 돌려 붙인다
    }

    // 눈: 글로브 지역 좌표의 아래를 넘긴다
    g.root.getWorldQuaternion(invQ).invert();
    g.snow.step(dt, down.set(0, -1, 0).applyQuaternion(invQ));

    // 방 어둡히기와 창문 불빛. 노출의 기준은 시간대(time.js 의 baseExposure)다
    if (dim === 0 && want === 0) return;
    dim = Math.abs(want - dim) < 0.002 ? want : dim + (want - dim) * Math.min(1, dt * 3);
    g.setGlow(dim);
    renderer.toneMappingExposure = (ctx.baseExposure ?? renderer.toneMappingExposure) * (1 - DARK * dim);
  }

  Object.assign(ctx, { enterGlobe, exitGlobe, globeClick, globeDrag, globeHover: onGlobe, globeStep });
}
