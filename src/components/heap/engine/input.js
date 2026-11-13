// 키보드와 포인터 입력.
import * as THREE from 'three';

export function setupInput(ctx) {
  const {
    canvas, camera, projParts, phoneParts, $, on, nearTable, sit, nearShelf, enterSort, nearDoor,
    openRooms, nearBook, openGuestbook, flip, eject, exitSort, putBack, stand, unperch, TABLE, pickables,
    controls, settle, setHint, clampPlace, toTop, startAnim, player, screen, openPlayer, albumAction,
    feed, openPhone, pickUp, tableTop, shelfParts, doorParts, bookParts, floor, openSlot, sitOn,
    walkRoute, SEAT,
  } = ctx;

  // ====================================================================================
  // 7. Input
  // ====================================================================================
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function rayFrom(ev) {
    const b = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  const isProj = o => projParts.includes(o), isPhone = o => phoneParts.includes(o);
  const keys = new Set();
  const OVERLAYS = ['phone', 'pc', 'keepsake', 'calendar', 'grid', 'rooms', 'guestbook'];
  const anyOverlay = () => OVERLAYS.some(id => !$(id).hidden);
  on(window, 'keydown', ev => {
    if (ev.target.closest?.('input, textarea')) { if (ev.key === 'Escape') $('guestbook').hidden = true; return; }
    if (ev.target.closest?.('.room-editor')) return; // a key pressed inside the 꾸미기 panel belongs to the panel (it closes itself on Esc)
    const k = ev.key.toLowerCase(); keys.add(k);
    if (ctx.mode === 'room' && !anyOverlay() && (k === 'e' || k === 'enter')) { if (nearTable()) sit(); else if (nearShelf()) enterSort(); else if (nearDoor()) openRooms(); else if (nearBook()) openGuestbook(); }
    if (ctx.mode === 'sit' && ctx.held && k === 'f') flip();
    if (k === 'escape') {
      for (const id of OVERLAYS) if (!$(id).hidden) { $(id).hidden = true; return; }
      if (ctx.mode === 'watch') eject();
      else if (ctx.mode === 'sort') exitSort();
      else if (ctx.held) putBack();
      else if (ctx.mode === 'sit') stand();
      else if (ctx.perch) unperch();
    }
  });
  on(window, 'keyup', ev => keys.delete(ev.key.toLowerCase()));
  on(window, 'blur', () => keys.clear());

  // dragging a card across the desk (sit mode). Capture phase so orbit controls stand aside.
  const deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TABLE.top + 0.12)), _hit = new THREE.Vector3();
  let down = null, dragOff = new THREE.Vector2();
  canvas.addEventListener('pointerdown', ev => {
    down = { x: ev.clientX, y: ev.clientY, card: null };
    if (ctx.mode !== 'sit' || ctx.held || ctx.camGoal) return;
    rayFrom(ev);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit) {
      down.card = hit.object.userData.card; controls.enabled = false;
      if (ray.ray.intersectPlane(deskPlane, _hit)) dragOff.set(down.card.userData.place.x - _hit.x, down.card.userData.place.z - _hit.z); // grab offset where it was pressed
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
    if (ctx.mode === 'room') { canvas.style.cursor = ray.intersectObjects([...ctx.build.slotMeshes, ...ctx.build.seatMeshes], false).length ? 'pointer' : ''; return; }
    if (ctx.mode !== 'sit' || ctx.camGoal) return;
    const hit = ray.intersectObjects([...pickables, ...projParts, ...phoneParts], false)[0];
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
    if (wasDrag || !d || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6) return;
    rayFrom(ev);
    if (ctx.mode === 'watch') { if (player.hidden && ray.intersectObject(screen, false).length) openPlayer(ctx.loaded.userData.reel); return; }
    if (ctx.camGoal) return;
    if (ctx.mode === 'sort') { const h = ctx.shelf && ray.intersectObjects(ctx.shelf.albums.flatMap(a => [a.mesh, a.label]), false)[0]; if (h) albumAction(h.object.userData.album); return; }
    if (ctx.mode === 'sit') {
      const hits = ray.intersectObjects([...pickables, ...projParts, ...phoneParts], false);
      if (ctx.held && hits[0]?.object.userData.card === ctx.held) return flip();
      const hit = hits.find(h => h.object.userData.card !== ctx.held);
      if (hit && isProj(hit.object)) return ctx.held ? feed() : setHint('needcard');
      if (hit && isPhone(hit.object)) return openPhone();
      if (ctx.held) return putBack();
      if (hit) pickUp(hit.object.userData.card);
      return;
    }
    const hit = ray.intersectObjects([tableTop, ...pickables, ...projParts, ...phoneParts, ...ctx.build.slotMeshes, ...ctx.build.seatMeshes, ...shelfParts, ...doorParts, ...bookParts, floor], false)[0];
    if (!hit) return;
    if (hit.object.userData.slot) return openSlot(hit.object.userData.slot); // a PC, a frame, a TV, a radio or a calendar: it acts where the visitor stands
    if (hit.object.userData.seats) return sitOn(hit.object.userData.seats, hit.point); // a chair, a sofa or a rug: walk there and sit
    const p = hit.point, onTableFoot = p.x > ctx.TBOX.x0 && p.x < ctx.TBOX.x1 && p.z > ctx.TBOX.z0 && p.z < ctx.TBOX.z1;
    if (doorParts.includes(hit.object)) walkRoute(ctx.doorSpot.clone(), 'door');
    else if (bookParts.includes(hit.object)) walkRoute(ctx.bookSpot.clone(), 'book');
    else if (shelfParts.includes(hit.object)) walkRoute(ctx.shelfSpot.clone(), 'sort');
    else if (hit.object === floor && !onTableFoot) walkRoute(p.clone().setY(0), null);
    else walkRoute(SEAT.clone(), 'sit');
  });

  Object.assign(ctx, { anyOverlay, keys });
}
