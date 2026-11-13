// 방, 앉기, 상영, 책장 모드와 카드 집기.
import * as THREE from 'three';
import { ytUrl } from './format.js';

export function setupModes(ctx) {
  const {
    controls, me, SEAT, setHint, SIT_CAM, syncUI, requestPile, NEAR, settle, request, CLOSE, clampPlace,
    TABLE, gauss, toTop, startAnim, on, $, drawProjection, screen, screenOn, WATCH_CAM, screenIdle,
    unperch,
  } = ctx;

  ctx.mode = 'room'; ctx.camGoal = null; ctx.held = null; ctx.heldFlipped = false; ctx.loaded = null; ctx.hovered = null; ctx.dragging = null;
  ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = [];
  ctx.perch = null; ctx.seatTarget = null; // perch: the seat the visitor sits on in room mode · seatTarget: the seat being walked to
  ctx.seatFrom = null; ctx.perchFrom = null; // the stand point the walk to seatTarget ends at · the stand point the visitor came to the perch from (they get up there)

  const goTo = cam => { ctx.camGoal = cam; controls.enabled = false; };

  function sit() {
    ctx.mode = 'sit'; ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = []; ctx.perch = null;
    me.position.copy(SEAT); me.rotation.y = Math.PI;
    setHint('sit'); goTo(SIT_CAM); syncUI();
    requestPile(NEAR);
  }
  function stand() {
    if (ctx.loaded) eject();
    if (ctx.held) putBack();
    ctx.mode = 'room'; ctx.hovered = null; controls.enabled = false; ctx.camGoal = null;
    me.position.copy(SEAT).add(new THREE.Vector3(0.6, 0, 0.5));
    setHint('room'); syncUI();
  }
  function glowCard(c, v) { // both faces glow by their own picture, so the card reads in a dim room
    for (const m of c.children) {
      const mat = m.material;
      if (!mat || !mat.map) continue;
      mat.emissive.set(v ? '#ffffff' : '#000000'); mat.emissiveMap = v ? mat.map : null; mat.emissiveIntensity = v; mat.needsUpdate = true;
    }
  }
  function pickUp(c) { ctx.held = c; ctx.heldFlipped = false; ctx.hovered = null; controls.enabled = false; settle(); setHint('held'); syncUI(); request(c, CLOSE, true); glowCard(c, ctx.readGlow); }
  function dropOnTop(c) { // gently toward the middle of the pile, then fall into place
    const p = c.userData.place;
    c.userData.place = clampPlace({ x: TABLE.x + (p.x - TABLE.x) * 0.5 + gauss() * 0.15, z: TABLE.z + (p.z - TABLE.z) * 0.5 + gauss() * 0.1, yaw: p.yaw + gauss() * 0.6, faceUp: true });
    toTop(c);
  }
  function putBack() {
    const c = ctx.held; ctx.held = null; ctx.heldFlipped = false; glowCard(c, 0);
    dropOnTop(c); settle(); startAnim(c, 'drop');
    if (!ctx.camGoal && ctx.mode === 'sit') controls.enabled = true;
    setHint('sit'); syncUI();
  }
  function flip() { if (ctx.held) ctx.heldFlipped = !ctx.heldFlipped; }
  on($('flip'), 'click', flip);

  function feed() {
    ctx.loaded = ctx.held; ctx.held = null; ctx.heldFlipped = false; ctx.mode = 'watch'; glowCard(ctx.loaded, 0);
    const { reel, img } = ctx.loaded.userData;
    drawProjection(reel, img); screen.material = screenOn;
    if (reel.kind !== 'fan') $('ytlink').href = ytUrl(reel);
    setHint('watch'); goTo(WATCH_CAM); syncUI();
    if (reel.kind !== 'fan') ctx.openPlayer(reel); // a fan piece is just projected
  }
  function eject() {
    ctx.closePlayer();
    const c = ctx.loaded; ctx.loaded = null; dropOnTop(c); settle(); startAnim(c, 'drop');
    screen.material = screenIdle;
    ctx.mode = 'sit'; setHint('sit'); goTo(SIT_CAM); syncUI();
  }
  on($('stand'), 'click', () => (ctx.perch ? unperch() : stand()));
  on($('eject'), 'click', eject);

  Object.assign(ctx, { sit, pickUp, feed, goTo, flip, eject, putBack, stand });
}
