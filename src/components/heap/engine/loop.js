// 카메라 구도, 크기 맞춤, 프레임 루프.
import * as THREE from 'three';

export function setupLoop(ctx) {
  const {
    Yv, camera, WALL_H, RX, RZ, HOST, canvas, renderer, scene, on,
    onDispose, stepCharacter, controls, me, legL, legR, $,
    tickClock, stepMotes, cards, inPile, supportAt, restPose, stepAnim,
  } = ctx;

  // 카메라 구도: 방(room), 사진 더미 보기(sit)
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
  // 더미 보기: 더미(HOST)의 윗면 높이를 보고, 퍼진 넓이에 맞춰 다가간다. 원래 탁자(2.6 x 1.8)는 전과 같은 (0, 2.0, 2.1) 이고,
  // 상자나 작은 탁자는 더 가까이 (최소 0.55 배). 바닥에 둔 더미는 서서 내려다보는 높이다
  // 더미가 없는 방은 SIT_CAM 이 null 이다 (modes.js 의 sit 이 막는다)
  let SIT_CAM = null;
  if (HOST) {
    const heapCentre = new THREE.Vector3(HOST.x, HOST.top, HOST.z);
    const spanW = HOST.box ? HOST.boxW + 0.6 : HOST.w, spanD = HOST.box ? HOST.boxD + 0.45 : HOST.d; // 상자는 벽까지 담기게 조금 넉넉히
    const heapK = THREE.MathUtils.clamp(Math.max(spanW / 2.6, spanD / 1.8), 0.55, 1);
    SIT_CAM = { pos: heapCentre.clone().add(new THREE.Vector3(0, 2.0 * heapK, 2.1 * heapK)), target: heapCentre.clone() };
  }

  // 프레임 루프
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock(), dir = new THREE.Vector3(), want = new THREE.Vector3(), wantQ = new THREE.Quaternion();
  const focusGoal = new THREE.Vector3(), focusLook = new THREE.Vector3(); // 온보딩 연출의 책장 줌 (intro.js)
  const roomGoal = new THREE.Vector3(), turnQ = new THREE.Quaternion();
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

  // 방 카메라로 다가간다: 팔로워가 보는 구도
  function roomCam(a) {
    const fit = Math.max(1, 1.25 / camera.aspect) * roomFit(camera.aspect);
    // 온보딩 연출(intro.js)은 거리를 늘리고 방을 살짝 돌린다. 보내지 않으면 dist 1, turn 0 이라 전과 같다
    const iv = ctx.introView;
    roomGoal.copy(ROOM_CAM.pos).sub(ROOM_CAM.target);
    if (iv?.turn) roomGoal.applyAxisAngle(Yv, iv.turn);
    roomGoal.multiplyScalar(fit * (iv?.dist ?? 1)).add(ROOM_CAM.target);
    // focus 가 있으면 같은 방향에서 focusPoint 로 다가간다 (온보딩 B: 책장으로 줌인했다가 돌아온다)
    let lookAt = ROOM_CAM.target;
    if (iv?.focus > 0 && iv.focusPoint) {
      focusGoal.copy(ROOM_CAM.pos).sub(ROOM_CAM.target).normalize().multiplyScalar(iv.focusDist).add(iv.focusPoint);
      roomGoal.lerp(focusGoal, iv.focus);
      lookAt = focusLook.copy(ROOM_CAM.target).lerp(iv.focusPoint, iv.focus);
    }
    camera.position.lerp(roomGoal, a); controls.target.lerp(lookAt, a);
    // 평면도에서 나오면 카메라의 위 방향이 아직 기울어 있다: 위치와 함께 Y 로 돌아오고, 다 오면 정확히 Y 가 된다
    if (!camera.up.equals(Yv)) { camera.up.lerp(Yv, a).normalize(); if (camera.up.y > 0.99999) camera.up.copy(Yv); }
    camera.lookAt(controls.target);
  }

  function frame() {
    if (ctx.disposed) return;
    const rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.05), t = clock.elapsedTime, a = reduced ? 1 : 1 - Math.exp(-dt * 7);
    ctx.globeStep?.(Math.min(rawDt, 0.1)); // 스노우 글로브의 떠오르기, 눈, 반짝임, 글로브 모드의 어둠과 창문 불빛 (globe.js)
    ctx.treeStep?.(t, rawDt); // 쪽지 트리 (tree.js): 트리 모드의 fov, 쪽지 움직임, 불빛. 카메라 분기보다 먼저 돈다
    if (ctx.mode === 'edit') { // 꾸미기는 자기 카메라(edit-camera.js)를 쓰고, 걷는 사람은 문 앞에 세워 둔다
      if (ctx.editPreview) roomCam(a); else ctx.editCam.step(a); // 팔로워로 보기는 방 카메라다 (edit.js)
      ctx.editFrame(); // 가구 위 막대와 말풍선은 이 프레임의 카메라로 자리를 잡는다
    } else if (ctx.mode === 'room') {
      stepCharacter(Math.min(rawDt, 0.2));
      roomCam(a);
    } else {
      camera.up.copy(Yv); // 앉기와 궤도 컨트롤은 Y 가 위인 카메라를 전제한다
      const seated = ctx.mode === 'sit' || ctx.globeFrom === 'sit'; // 앉아서 글로브를 보면 계속 앉아 있다
      me.position.y = seated ? -0.18 : 0; legL.rotation.x = legR.rotation.x = seated ? -1.2 : 0;
      if (ctx.camGoal) {
        camera.position.lerp(ctx.camGoal.pos, a); controls.target.lerp(ctx.camGoal.target, a); camera.lookAt(controls.target);
        if (camera.position.distanceTo(ctx.camGoal.pos) < 0.02 || reduced) { ctx.camGoal = null; controls.enabled = ctx.mode === 'sit' && !ctx.held && !ctx.dragging; }
      } else if (ctx.mode === 'sit') controls.update();
    }
    ctx.presenceStep?.(Math.min(rawDt, 0.2)); // 함께 있는 다른 사람 캐릭터와 내 움직임 알리기 (presence.js). 모든 모드에서 돈다
    ctx.sfxStep?.(Math.min(rawDt, 0.2)); // 걷는 발소리, 러그 위에서는 먹먹하게 (sfx.js)
    ctx.stepCue?.(Math.min(rawDt, 0.2)); // 가는 곳의 바닥 고리와 누른 물건의 빛 (walk.js). 더미 보기로 넘어가도 고리가 끝까지 사라지게 모드와 상관없이 돈다
    ctx.sparkleStep?.(Math.min(rawDt, 0.2)); // 누를 수 있는 물건 위의 반짝임 (sparkle.js)
    if (ctx.toastTimer > 0 && (ctx.toastTimer -= rawDt) <= 0) $('toast').textContent = '';
    const blink = Math.sin(t * 3) > -0.2; // 휴대폰 가구의 화면 점 (fixtures.js)
    for (const d of ctx.build.phoneDots ?? []) d.visible = blink;
    tickClock();
    const lampNow = Math.max(0, ctx.lampBase + Math.sin(t * 1.3) * 0.05);
    for (const l of ctx.build.lamps) if (l.light) l.light.intensity = l.fixed ?? lampNow; // 작은 빛(fixed)은 주인이 고른 세기 그대로
    stepMotes(t);
    // 카드
    const tn = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    camera.getWorldDirection(dir);
    const animDt = reduced ? 1 : Math.min(rawDt, 0.1);
    let heldArrived = false; // 집어 든 카드가 눈앞 자리에 다 왔다: card-view.js 가 그 자리에 HTML 카드를 겹친다
    for (const c of cards) {
      const d = c.userData.d;
      if (c === ctx.held) {
        const dist = Math.max(d.h / (1.5 * tn), d.w / (1.7 * tn * camera.aspect));
        want.copy(camera.position).addScaledVector(dir, dist); wantQ.copy(camera.quaternion);
        // 뒤집기는 각도를 따라 돌린다: 반 바퀴 목표를 한 번에 주면 slerp 가 도는 방향을 고르지 못한다 (modes.js 의 flip)
        const goal = (ctx.heldTurn || 0) * Math.PI, now = c.userData.turnNow ?? 0;
        c.userData.turnNow = reduced ? goal : now + (goal - now) * Math.min(1, a * 1.5);
        wantQ.multiply(turnQ.setFromAxisAngle(Yv, c.userData.turnNow));
        heldArrived = c.position.distanceTo(want) < d.h * 0.03 && c.quaternion.angleTo(wantQ) < 0.03 && Math.abs(goal - c.userData.turnNow) < 0.03;
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
    ctx.stepCardView(heldArrived);
    renderer.render(scene, camera);
    ctx.raf = requestAnimationFrame(frame);
  }

  // 공유(heap-room.tsx): 지금 구도를 한 장 그려 2D 캔버스에 옮겨 cb 에 준다. 화면 위 글자와 단추는 DOM 이라 들어가지 않는다.
  // 렌더러는 그린 뒤 버퍼를 지운다(preserveDrawingBuffer 끔): 그리고 바로 같은 틱에 옮겨야 빈 그림이 아니다.
  on(ctx.root, 'heap:capture', e => {
    if (typeof e.detail !== 'function') return;
    let out = null;
    try {
      if (!ctx.disposed && canvas.width && canvas.height) {
        renderer.render(scene, camera);
        out = document.createElement('canvas'); out.width = canvas.width; out.height = canvas.height;
        out.getContext('2d').drawImage(canvas, 0, 0);
      }
    } catch (err) { console.warn('[heap-room] capture', err); out = null; }
    e.detail(out);
  });

  Object.assign(ctx, { SIT_CAM, resize, ROOM_CAM, frame });
}
