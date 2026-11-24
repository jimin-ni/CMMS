// 키보드와 포인터 입력.
import * as THREE from 'three';

export function setupInput(ctx) {
  const {
    canvas, camera, $, on, nearTable, sit, nearShelf, enterSort, nearDoor,
    openRooms, flip, exitSort, putBack, stand, unperch, HOST, pickables,
    controls, settle, setHint, clampPlace, toTop, startAnim, albumAction,
    pickUp, shelfParts, doorParts, floor, openSlot, sitOn,
    walkRoute, SEAT,
  } = ctx;

  // 키보드와 포인터 입력
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function rayFrom(ev) {
    const b = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  // 마지막 rayFrom 의 누른 자리가 집어 든 카드 가로의 어디인지 (0 왼쪽 ~ 1 오른쪽, 화면 기준). 카드는 카메라를 보고 있다
  const _pc = new THREE.Vector3(), _pe = new THREE.Vector3();
  function heldFx(c) {
    _pc.copy(c.position).project(camera);
    _pe.set(c.userData.d.w / 2, 0, 0).applyQuaternion(camera.quaternion).add(c.position).project(camera);
    return (ndc.x - _pc.x) / (2 * Math.abs(_pe.x - _pc.x)) + 0.5;
  }
  const keys = new Set();
  const OVERLAYS = ['phone', 'pc', 'keepsake', 'calendar', 'grid', 'rooms', 'guestbook'];
  const anyOverlay = () => OVERLAYS.some(id => !$(id).hidden);
  on(window, 'keydown', ev => {
    if (ev.target.closest?.('input, textarea')) { if (ev.key === 'Escape') $('guestbook').hidden = true; return; }
    if (ctx.mode === 'edit') return; // 꾸미기 중의 키는 edit.js 가 받는다
    const k = ev.key.toLowerCase(); keys.add(k);
    if (ctx.mode === 'room' && !anyOverlay() && (k === 'e' || k === 'enter')) { if (nearTable()) sit(); else if (nearShelf()) enterSort(); else if (nearDoor()) openRooms(); else if (ctx.nearTree?.()) ctx.enterTree(); }
    if (ctx.mode === 'sit' && ctx.held && k === 'f') flip();
    if (k === 'escape') {
      for (const id of OVERLAYS) if (!$(id).hidden) { $(id).hidden = true; return; }
      if (ctx.mode === 'globe') ctx.exitGlobe();
      else if (ctx.mode === 'sort') exitSort();
      else if (ctx.mode === 'tree') ctx.treeEscape(); // 열린 쪽지를 접고, 한 번 더 누르면 나간다 (tree.js)
      else if (ctx.held) putBack();
      else if (ctx.mode === 'sit') stand();
      else if (ctx.perch) unperch();
    }
  });
  on(window, 'keyup', ev => keys.delete(ev.key.toLowerCase()));
  on(window, 'blur', () => keys.clear());

  // 탁자 위에서 카드 끌기(앉은 모드). 궤도 컨트롤이 비켜서도록 capture 단계에 건다.
  const deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -((HOST?.top ?? 0) + (HOST?.box ? 0.15 : 0.12))), _hit = new THREE.Vector3();
  let down = null, dragOff = new THREE.Vector2();
  canvas.addEventListener('pointerdown', ev => {
    down = { x: ev.clientX, y: ev.clientY, card: null };
    if (ctx.mode !== 'sit' || ctx.held || ctx.camGoal) return;
    rayFrom(ev);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit) {
      down.card = hit.object.userData.card; controls.enabled = false;
      if (ray.ray.intersectPlane(deskPlane, _hit)) dragOff.set(down.card.userData.place.x - _hit.x, down.card.userData.place.z - _hit.z); // 눌린 자리에서 잡은 오프셋
    }
  }, { capture: true });
  canvas.addEventListener('pointermove', ev => {
    if (down?.card && !ctx.dragging && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) {
      ctx.dragging = down.card; ctx.hovered = null; canvas.setPointerCapture?.(ev.pointerId);
      settle(); setHint('drag');
    }
    if (ctx.dragging) {
      rayFrom(ev);
      if (ray.ray.intersectPlane(deskPlane, _hit)) Object.assign(ctx.dragging.userData.place, clampPlace({ x: _hit.x + dragOff.x, z: _hit.z + dragOff.y, yaw: ctx.dragging.userData.place.yaw, faceUp: ctx.dragging.userData.place.faceUp }));
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (ev.buttons) return;
    rayFrom(ev);
    if (ctx.mode === 'sort') { canvas.style.cursor = ctx.shelf && ray.intersectObjects(ctx.shelf.albums.flatMap(a => [a.mesh, a.label]), false).length ? 'pointer' : 'default'; return; }
    if (ctx.mode === 'globe') { canvas.style.cursor = ctx.globeHover(ray) ? 'pointer' : 'grab'; return; }
    if (ctx.mode === 'room') { canvas.style.cursor = ray.intersectObjects([...ctx.build.slotMeshes, ...ctx.build.seatMeshes], false).length ? 'pointer' : ''; return; }
    if (ctx.mode !== 'sit' || ctx.camGoal) return;
    const hit = ray.intersectObjects([...pickables, ...ctx.build.slotMeshes], false)[0];
    ctx.hovered = hit && !ctx.held && hit.object.userData.card ? hit.object.userData.card : null;
    canvas.style.cursor = hit ? 'pointer' : 'grab';
  });
  canvas.addEventListener('pointerup', ev => {
    const wasDrag = ctx.dragging;
    if (ctx.dragging) {
      const c = ctx.dragging; ctx.dragging = null; toTop(c); settle(); startAnim(c, 'drop'); c.userData.anim.arc = 0.02;
      setHint('sit');
    }
    if (ctx.mode === 'sit' && !ctx.held && !ctx.camGoal) controls.enabled = true;
    const d = down; down = null;
    if (ctx.mode === 'edit') return; // 꾸미기 중의 누르기는 edit.js 몫이다 (capture 가 먼저 받지만 한 번 더 막는다)
    if (ctx.mode === 'tree') return; // 트리 모드의 누르기는 tree.js 가 받는다: 아래의 방 걷기로 흘러가면 안 된다
    if (wasDrag || !d || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6) return;
    rayFrom(ev);
    if (ctx.camGoal) return;
    if (ctx.mode === 'globe') return ctx.globeClick(ray); // 글로브 모드 (globe.js)
    if (ctx.mode === 'sort') { const h = ctx.shelf && ray.intersectObjects(ctx.shelf.albums.flatMap(a => [a.mesh, a.label]), false)[0]; if (h) albumAction(h.object.userData.album); return; }
    if (ctx.mode === 'sit') {
      const hits = ray.intersectObjects([...pickables, ...ctx.build.slotMeshes], false);
      if (ctx.held && hits[0]?.object.userData.card === ctx.held) return ctx.flipAt(heldFx(ctx.held)); // 3D 로 남는 카드 (팬 작품, 눈앞에 오는 중)
      const hit = hits.find(h => h.object.userData.card !== ctx.held);
      if (hit?.object.userData.slot) return openSlot(hit.object.userData.slot); // 더미 곁의 휴대폰, 방명록
      if (ctx.held) return putBack();
      if (hit) pickUp(hit.object.userData.card);
      return;
    }
    const hit = ray.intersectObjects([...(ctx.heapBoxParts || []), ...pickables, ...ctx.build.slotMeshes, ...ctx.build.seatMeshes, ...shelfParts, ...doorParts, floor], false)[0];
    if (!hit) return;
    // 기능 가구(PC, 액자, TV, 라디오, 달력, 휴대폰, 방명록, 트리): 물건 아래 바닥에서 가장 가까운 빈 자리로 걸어간 뒤 동작한다
    const slot = hit.object.userData.slot;
    if (slot) { ctx.slotTarget = slot; return walkRoute(hit.point.clone().setY(0), 'slot', ctx.build.slotMeshes.filter(m => m.userData.slot === slot)); }
    if (hit.object.userData.seats) return sitOn(hit.object.userData.seats, hit.point); // 의자, 소파, 러그: 그곳까지 걸어가 앉는다
    const p = hit.point;
    if (doorParts.includes(hit.object)) walkRoute(ctx.doorSpot.clone(), 'door', doorParts);
    else if (shelfParts.includes(hit.object)) walkRoute(ctx.shelfSpot.clone(), 'sort', shelfParts);
    else if (hit.object === floor) walkRoute(p.clone().setY(0), null);
    else if (SEAT) walkRoute(SEAT.clone(), 'sit', ctx.heapBoxParts || []); // 사진 더미(카드, 상자): 더미를 보는 자리로 걸어가 본다
  });

  Object.assign(ctx, { anyOverlay, keys });
}
