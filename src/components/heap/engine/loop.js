// 카메라 구도, 크기 맞춤, 프레임 루프.
import * as THREE from 'three';

export function setupLoop(ctx) {
  const {
    Yv, camera, WALL_H, RX, RZ, TABLE, SEAT, SCREEN_C, WALLS, SCR, canvas, renderer, scene, on,
    onDispose, stepCharacter, controls, me, legL, legR, $, beamMat, projLight, screenOn, reelA, reelB,
    phoneDot, tickClock, stepMotes, cards, SLOT, inPile, supportAt, restPose, stepAnim,
  } = ctx;

  // 카메라 구도: 방(room), 앉기(sit), 영사기 보기(watch)
  const ROOM_CAM = { pos: new THREE.Vector3(9.4, 8.6, 9.4), target: new THREE.Vector3(0, 0.9, 0) };
  // 8 x 8 이 아닌 평면도는 방 카메라를 자기 시선 위에서 뒤로 물린다. needDist 는 바닥 모서리와 벽 윗부분을 담으려면 평범한 절두체 맞춤이
  // 얼마나 물러나야 하는지다. roomFit 은 이 방의 거리를 8 x 8 방의 거리로 나눈 값이라, 8 x 8 방은 전과 똑같이 잡히고
  // 다른 방도 그 방만큼 빡빡하게 잡힌다.
  const tA = new THREE.Vector3(); // needDist 의 임시 벡터
  const camDir = ROOM_CAM.pos.clone().sub(ROOM_CAM.target).normalize(), camRight = new THREE.Vector3().crossVectors(Yv, camDir).normalize(), camTop = new THREE.Vector3().crossVectors(camDir, camRight);
  function needDist(hx, hz, aspect) {
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    let D = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, WALL_H]) {
      tA.set(sx * hx, y, sz * hz).sub(ROOM_CAM.target);
      D = Math.max(D, tA.dot(camDir) + Math.max(Math.abs(tA.dot(camRight)) / aspect, Math.abs(tA.dot(camTop))) / tv);
    }
    return D;
  }
  const roomFit = aspect => needDist(RX, RZ, aspect) / needDist(4, 4, aspect);
  const tableCentre = new THREE.Vector3(TABLE.x, TABLE.top, TABLE.z);
  const SIT_CAM = { pos: tableCentre.clone().add(new THREE.Vector3(0, 2.0, 2.1)), target: tableCentre.clone() };
  const WATCH_CAM = { pos: SEAT.clone().add(new THREE.Vector3(0.7, 1.75, 2.1)), target: SCREEN_C.clone().addScaledVector(WALLS[SCR.wall].n, 1).add(new THREE.Vector3(0, -0.75, 0)) };

  // 프레임 루프
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock(), dir = new THREE.Vector3(), want = new THREE.Vector3(), wantQ = new THREE.Quaternion();
  const roomGoal = new THREE.Vector3(), FLIP = new THREE.Quaternion().setFromAxisAngle(Yv, Math.PI);
  // The canvas is sized by CSS: the whole room area, or what the 꾸미기 panel leaves of it. The observer catches both that and a window resize.
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    ctx.layoutMusic();
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (ctx.raf) renderer.render(scene, camera); // setSize 가 캔버스를 지우므로 다시 그려 빈 프레임이 보이지 않게 한다
  }
  on(window, 'resize', resize);
  const sizeWatch = new ResizeObserver(resize); sizeWatch.observe(canvas);
  onDispose(() => sizeWatch.disconnect());
  onDispose(() => cancelAnimationFrame(ctx.raf));

  function frame() {
    if (ctx.disposed) return;
    const rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.05), t = clock.elapsedTime, a = reduced ? 1 : 1 - Math.exp(-dt * 7);
    if (ctx.mode === 'room') {
      stepCharacter(Math.min(rawDt, 0.2));
      const fit = Math.max(1, 1.25 / camera.aspect) * roomFit(camera.aspect);
      roomGoal.copy(ROOM_CAM.target).addScaledVector(ROOM_CAM.pos.clone().sub(ROOM_CAM.target), fit);
      camera.position.lerp(roomGoal, a); controls.target.lerp(ROOM_CAM.target, a); camera.lookAt(controls.target);
    } else {
      const seated = ctx.mode === 'sit' || ctx.mode === 'watch';
      me.position.y = seated ? -0.18 : 0; legL.rotation.x = legR.rotation.x = seated ? -1.2 : 0;
      if (ctx.camGoal) {
        camera.position.lerp(ctx.camGoal.pos, a); controls.target.lerp(ctx.camGoal.target, a); camera.lookAt(controls.target);
        if (camera.position.distanceTo(ctx.camGoal.pos) < 0.02 || reduced) { ctx.camGoal = null; controls.enabled = ctx.mode === 'sit' && !ctx.held && !ctx.dragging; }
      } else if (ctx.mode === 'sit') controls.update();
    }
    if (ctx.toastTimer > 0 && (ctx.toastTimer -= rawDt) <= 0) $('toast').textContent = '';
    const on = ctx.mode === 'watch';
    const flick = 0.93 + 0.04 * Math.sin(t * 23) + 0.03 * Math.sin(t * 57);
    beamMat.opacity += ((on ? 0.07 * flick : 0) - beamMat.opacity) * a;
    projLight.intensity += ((on ? 2.2 * flick : 0) - projLight.intensity) * a;
    if (on) { screenOn.color.setScalar(flick); reelA.rotation.x = reelB.rotation.x = t * 3; }
    phoneDot.visible = Math.sin(t * 3) > -0.2;
    tickClock();
    const lampNow = Math.max(0, ctx.lampBase + Math.sin(t * 1.3) * 0.05);
    for (const l of ctx.build.lamps) if (l.light) l.light.intensity = lampNow;
    stepMotes(t);
    // 카드
    const tn = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    camera.getWorldDirection(dir);
    const animDt = reduced ? 1 : Math.min(rawDt, 0.1);
    for (const c of cards) {
      const d = c.userData.d;
      if (c === ctx.held) {
        const dist = Math.max(d.h / (1.5 * tn), d.w / (1.7 * tn * camera.aspect));
        want.copy(camera.position).addScaledVector(dir, dist); wantQ.copy(camera.quaternion);
        if (ctx.heldFlipped) wantQ.multiply(FLIP);
      } else if (c === ctx.loaded) {
        want.copy(SLOT.pos); want.y += d.h / 2; wantQ.copy(SLOT.quat);
      } else if (c === ctx.dragging) {
        const p = c.userData.place, below = cards.filter(o => o !== c && inPile(o));
        want.set(p.x, supportAt(p.x, p.z, below) + 0.05, p.z);
        wantQ.copy(restPose(c, []).quat);
        c.position.lerp(want, Math.min(1, a * 2.2)); c.quaternion.slerp(wantQ, a);
        continue;
      } else {
        if (c.userData.anim) { stepAnim(c, animDt); continue; }
        want.copy(c.userData.home.pos); wantQ.copy(c.userData.home.quat);
        if (c === ctx.hovered) want.y += 0.012;
      }
      c.position.lerp(want, a); c.quaternion.slerp(wantQ, a);
    }
    renderer.render(scene, camera);
    ctx.raf = requestAnimationFrame(frame);
  }

  Object.assign(ctx, { SIT_CAM, WATCH_CAM, resize, ROOM_CAM, frame });
}
