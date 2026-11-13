// 꾸미기의 카메라 (design/editor.md 의 B6): 방 카메라와 같은 방향(yaw)에서 방 전체를 위 막대와 아래 가구 목록 사이에 맞춘다.
// 그 위에 휠 확대, 오른쪽 끌기 이동, T 로 바꾸는 위에서 본 카메라(평면도)가 있다. 같은 방, 같은 장면이고 카메라만 다르다.
// 상태는 맞춘 구도에 대한 상대값이다: zoom(거리 배율)과 pan(맞춘 과녁에서 옮긴 만큼, 수평). 캔버스 크기가 바뀌어도 구도는 따라간다.
// 과녁은 방 바닥 위(조금 넓게)에서만, 거리는 맞춘 거리의 MIN_ZOOM..MAX_ZOOM 배에서만 움직여 방을 화면 밖으로 잃지 않는다.
// 꾸미기를 나가면 reset() 이 상태를 지우고, loop.js 가 방 카메라로 돌아간다 (위 방향은 loop.js 가 Y 로 되돌린다).
import * as THREE from 'three';

const MIN_ZOOM = 0.3, MAX_ZOOM = 1.15, MARGIN = 1.05, WHEEL = 0.0015;

export function setupEditCamera(ctx) {
  const { camera, ROOM_CAM, RX, RZ, WALL_H, Yv } = ctx;

  // 방 카메라의 방향 (과녁에서 카메라 쪽)과 위에서 본 방향. 평면도는 뒷벽이 화면 위, 왼쪽 벽이 화면 왼쪽이다.
  const VIEWS = {
    room: { dir: ROOM_CAM.pos.clone().sub(ROOM_CAM.target).normalize(), up: Yv.clone() },
    plan: { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  };
  // 화면에 담을 점: 바닥의 네 모서리와 두 벽(뒷벽, 왼쪽 벽)의 윗모서리
  const PTS = [
    [-RX, 0, -RZ], [RX, 0, -RZ], [-RX, 0, RZ], [RX, 0, RZ],
    [-RX, WALL_H, -RZ], [RX, WALL_H, -RZ], [-RX, WALL_H, RZ],
  ].map(p => new THREE.Vector3(...p));

  const st = { plan: false, zoom: 1, pan: new THREE.Vector3() };
  const right = new THREE.Vector3(), top = new THREE.Vector3(), tv = new THREE.Vector3();

  // 이 방향과 화면비에서 방 전체가 들어오는 과녁과 거리. 원근 때문에 가까운 모서리가 더 크게 보이므로, 점들을 실제로 투영해
  // 화면 위의 상자를 가운데로 옮기고(과녁 이동) 가장자리에 MARGIN 만큼 남게 물러서기(거리)를 몇 번 되풀이한다.
  function fitOf(view, aspect) {
    const { dir, up } = VIEWS[view];
    right.crossVectors(up, dir).normalize(); top.crossVectors(dir, right);
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const target = new THREE.Vector3(0, 0, 0);
    let D = 0;
    for (const p of PTS) { tv.copy(p).sub(target); D = Math.max(D, tv.dot(dir) + Math.max(Math.abs(tv.dot(right)) / aspect, Math.abs(tv.dot(top))) / tan); }
    for (let n = 0; n < 8; n++) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of PTS) {
        tv.copy(p).sub(target);
        const z = Math.max(0.1, D - tv.dot(dir)), x = tv.dot(right) / (z * tan * aspect), y = tv.dot(top) / (z * tan);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      target.addScaledVector(right, ((x0 + x1) / 2) * D * tan * aspect).addScaledVector(top, ((y0 + y1) / 2) * D * tan);
      D *= Math.max((x1 - x0) / 2, (y1 - y0) / 2) * MARGIN;
    }
    return { target, dist: D };
  }

  // 지금 상태의 목표 구도 { pos, target, up }
  const goal = { pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3(), dist: 1, fit: null };
  function computeGoal() {
    const view = st.plan ? 'plan' : 'room', fit = fitOf(view, camera.aspect || 1);
    goal.fit = fit;
    goal.dist = fit.dist * st.zoom;
    goal.target.copy(fit.target).add(st.pan);
    goal.pos.copy(goal.target).addScaledVector(VIEWS[view].dir, goal.dist);
    goal.up.copy(VIEWS[view].up);
    return goal;
  }
  // 과녁이 방 바닥 위에 있게 pan 을 자른다 (맞춘 과녁이 방 밖이면 그 자리까지는 허락한다)
  function clampPan() {
    const f = goal.fit.target;
    const tx = THREE.MathUtils.clamp(f.x + st.pan.x, Math.min(-RX, f.x), Math.max(RX, f.x));
    const tz = THREE.MathUtils.clamp(f.z + st.pan.z, Math.min(-RZ, f.z), Math.max(RZ, f.z));
    st.pan.set(tx - f.x, 0, tz - f.z);
  }

  // 목표 구도의 카메라 (확대와 이동은 움직이는 중의 카메라가 아니라 도착할 구도에서 잰다: 휠을 빨리 굴려도 커서 아래가 흔들리지 않는다)
  const gcam = new THREE.PerspectiveCamera();
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(), hit = new THREE.Vector3();
  // y: 커서 아래 점을 잴 수평면의 높이 (없으면 과녁 높이)
  function rayGoal(ev, canvas, y) {
    computeGoal();
    gcam.fov = camera.fov; gcam.aspect = camera.aspect; gcam.near = camera.near; gcam.far = camera.far; gcam.updateProjectionMatrix();
    gcam.position.copy(goal.pos); gcam.up.copy(goal.up); gcam.lookAt(goal.target); gcam.updateMatrixWorld();
    const b = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, gcam);
    plane.set(Yv, -(y ?? goal.target.y));
    return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }

  // 휠: 커서 아래의 점(과녁 높이)을 그 자리에 두고 다가가거나 물러선다
  function zoomAt(ev, canvas, deltaY) {
    const P = rayGoal(ev, canvas);
    const z = THREE.MathUtils.clamp(st.zoom * Math.exp(deltaY * WHEEL), MIN_ZOOM, MAX_ZOOM), k = z / st.zoom;
    if (k === 1) return;
    if (P) { const t = goal.target.clone().sub(P).multiplyScalar(k).add(P); st.pan.set(t.x - goal.fit.target.x, 0, t.z - goal.fit.target.z); }
    st.zoom = z;
    computeGoal(); clampPan();
  }
  // 오른쪽 끌기: 누른 곳의 바닥이 커서를 따라온다 (카메라를 수평으로 옮기므로 바닥의 그 점은 정확히 커서 아래에 남는다)
  let grab = null;
  function panStart(ev, canvas) { grab = rayGoal(ev, canvas, 0); }
  function panMove(ev, canvas) {
    if (!grab) return;
    const P = rayGoal(ev, canvas, 0);
    if (!P) return;
    st.pan.x += grab.x - P.x; st.pan.z += grab.z - P.z;
    computeGoal(); clampPan();
  }
  function panEnd() { grab = null; }

  function fit() { st.zoom = 1; st.pan.set(0, 0, 0); grab = null; }
  function setPlan(v) { st.plan = !!v; fit(); }
  function reset() { st.plan = false; fit(); }
  const fitted = () => st.zoom === 1 && st.pan.lengthSq() === 0;

  // loop.js 가 꾸미기 중의 프레임마다 부른다. a 는 그 프레임의 따라가기 비율
  function step(a) {
    computeGoal();
    camera.position.lerp(goal.pos, a); ctx.controls.target.lerp(goal.target, a);
    if (!camera.up.equals(goal.up)) { camera.up.lerp(goal.up, a).normalize(); if (camera.up.distanceToSquared(goal.up) < 1e-8) camera.up.copy(goal.up); }
    camera.lookAt(ctx.controls.target);
  }

  ctx.editCam = { step, zoomAt, panStart, panMove, panEnd, fit, setPlan, reset, get plan() { return st.plan; }, fitted };
}
