// Heap miniroom engine, ported from .claude/session-artifacts/heap-poc/miniroom/room.html (its <script type="module"> body).
// The body of run() keeps the source's order and indentation so the two can be diffed.
// Browser only: load it with a dynamic import from a client component.
import * as THREE from 'three';
import { createContext } from './context.js';
import { setupData } from './data.js';
import { setupHud } from './hud.js';
import { setupCardArt } from './card-art.js';
import { setupScene } from './scene.js';
import { setupShell } from './shell.js';
import { setupFurniture } from './furniture.js';
import { setupSlots } from './slots.js';
import { setupModels } from './models.js';
import { setupShelf } from './shelf.js';
import { setupTime } from './time.js';
import { setupProps } from './props.js';
import { setupHeap } from './heap.js';
import { setupThumbs } from './thumbs.js';
import { flat } from './draw.js';
import { ytUrl, ksDay, seoulDay, fmtDay } from './format.js';
import { el, link, shortUrl } from './dom.js';
import { thumbUrl } from './util.js';

// ids of the nodes heap-room.tsx renders and the engine fills or shows
const LISTS = ['albumrow', 'player-frame', 'music-frame', 'phone-feed', 'pc-list', 'ks-body', 'cal-body', 'grid-list', 'gb-list', 'roomlist'];
const HIDDEN = ['visit', 'albumrow', 'stand', 'flip', 'srclink', 'eject', 'ytlink', 'sortexit', 'player', 'player-note', 'music', 'music-note', 'music-link', 'phone', 'pc', 'keepsake', 'calendar', 'grid', 'guestbook', 'rooms', 'rooms-legend'];

/**
 * Mounts the room into `root` (the element heap-room.tsx renders) and returns a dispose function.
 * Live hooks, as CustomEvents dispatched on `root`: `heap:time` (section 4b), `heap:items` and `heap:get` (section 6).
 * The engine dispatches two of its own on `root`: `heap:mode` (detail: 'room' | 'sit' | 'watch' | 'sort') whenever the mode is set,
 * and `heap:ready` once the room is on screen.
 * `modelBase` is the folder that holds the furniture models and their catalogue.json. Left out, it is "models/" beside `dataBase`.
 * @param {HTMLElement} root
 * `data` is what the server read from the database (page.tsx maps it): { roomUuid, name, serverTime, rooms, layout, reels, pieces, guestbook, visits, creatorVisit }.
 * creator.json (links, albums) is still fetched from `dataBase`; a room without one gets empty links and albums.
 * Writes go through opts.recordVisit() and opts.addGuestbook(name) (server actions, wired in heap-room.tsx). Reads of what others changed: a poll every opts.pollMs.
 * opts.bubbleHref is where the phone leads (the owner's 버블 room or the list), opts.navigate(href) opens it, opts.parseLink(url) says whether a keepsake link is a YouTube post (platform.ts).
 * opts.isSafeLink / isWebLink / isEmail are the server's link checks (slots.ts): a link reaches an href only after one of them says yes.
 * opts.parseMusic(url) is slots.ts's parseMusicUrl: { video, list } (embed ids that passed a regex) or null. data.rooms[].changed puts a dot on that room in the door's list.
 * @param {{ roomId: string, roomUuid: string, dataBase: string, modelBase?: string, data: any, viewerName: string | null, signedIn: boolean, pollMs: number, bubbleHref: string, navigate: (href: string) => void, parseLink: (url: string) => ({ platform: string, externalId: string, wide: boolean | null } | null), parseMusic: (url: string) => ({ video: string | null, list: string | null } | null), isSafeLink: (v: unknown) => boolean, isWebLink: (v: unknown) => boolean, isEmail: (v: unknown) => boolean, recordVisit: () => Promise<any>, addGuestbook: (name: string) => Promise<any>, onNavigate: (roomId: string) => void }} opts
 * @returns {() => void}
 */
export function mountRoom(root, opts) {
const ctx = createContext(root, opts);
const { ac, cleanups, dataBase, prevTitle, $, on } = ctx;

async function run() {
const { rand, gauss } = ctx;
await setupData(ctx);
const { layout, C, creator, DATA, fanReels, fanReelOf, ROOMS, roomId } = ctx;
if (ctx.disposed) return;
setupHud(ctx);
const { setHint, syncUI, toast, creatorVisit, renderMeta, renderCreatorVisit } = ctx;
setupCardArt(ctx);
setupScene(ctx);
const { WALLS, scene, Yv, camera, WALL_H, RX, RZ, controls, canvas, Xv, floor, renderer } = ctx;
setupShell(ctx);
const { DOOR, tA, WIN, doorParts, stepMotes } = ctx;
setupFurniture(ctx);
const { buildItems, shelfParts, OBST } = ctx;
setupSlots(ctx);
const { startSlots, keepsakeLook, newestReel } = ctx;
setupModels(ctx);
const { getCatalogue } = ctx;
buildItems(layout.items || [], true);
setupShelf(ctx);
const { linkShelf, updateAlbums, enterSort, exitSort, albumAction } = ctx;
setupTime(ctx);
const { tickClock } = ctx;
setupProps(ctx);
const {
  TABLE, SEAT, SCREEN_C, SCR, drawProjection, screen, screenOn, screenIdle, projParts, phoneParts,
  tableTop, bookParts, beamMat, projLight, reelA, reelB, phoneDot, SLOT,
} = ctx;
// ---------- character ----------
const me = new THREE.Group();
ctx.me = me;
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
setupHeap(ctx);
const {
  settle, clampPlace, toTop, startAnim, cards, makeCard, pickables, inPile, supportAt, restPose,
  stepAnim, buildHeap,
} = ctx;
setupThumbs(ctx);
const { requestPile, NEAR, request, CLOSE } = ctx;
// ====================================================================================
// 6. Modes: room · sit (sift, move cards) · watch (projector) · sort (album shelf)
// ====================================================================================
const ROOM_CAM = { pos: new THREE.Vector3(9.4, 8.6, 9.4), target: new THREE.Vector3(0, 0.9, 0) };
// A floor plan other than 8 x 8 moves the room camera along its own line of sight. needDist is how far back a plain frustum fit
// has to sit to hold the floor corners and the wall tops. roomFit is this room's distance over the 8 x 8 room's, so that room is
// framed exactly as before and any other room is framed as tightly as that one is.
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
ctx.mode = 'room'; ctx.camGoal = null; ctx.held = null; ctx.heldFlipped = false; ctx.loaded = null; ctx.hovered = null; ctx.presenting = null; ctx.dragging = null;
ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = [];
ctx.perch = null; ctx.seatTarget = null; // perch: the seat the visitor sits on in room mode · seatTarget: the seat being walked to
ctx.seatFrom = null; ctx.perchFrom = null; // the stand point the walk to seatTarget ends at · the stand point the visitor came to the perch from (they get up there)
const goTo = cam => { ctx.camGoal = cam; controls.enabled = false; };
ctx.goTo = goTo;
// Live room contents, for a creator's editor. Dispatch on the element given to mountRoom once the room is up (#status hidden):
//   root.dispatchEvent(new CustomEvent('heap:items', { detail: itemsArray }))
//     replaces everything built from layout.items. Same item shapes as layout.json.
//   root.dispatchEvent(new CustomEvent('heap:get', { detail: cb }))
//     calls cb({ room: { w, d }, layout, items, catalogue, table, door, window, time, original }) once the model catalogue has been read
//     (catalogue is null if it could not be). items is a copy of the list now in the room; catalogue is catalogue.json as it is.
//     table { x, z, w, d }, door { wall, at } and window { wall, at, w } are the fixed parts a floor plan shows (door and window may be null).
//     creatorLinks is the links list of creator.json (the PC's fallback) and linktree its linktree address or null: the editor offers them when an owner sets up a PC.
//     seats lists the seat points of the items built so far, { id, kind, x, y, z, yaw } each (see addSeats): the models that sit on loaded after the first build.
//     time is the room's time choice as it was given ('auto', a name or an hour); original { items, time } is the layout as last saved in the database;
//     layout is the whole stored layout (a copy): the editor merges its items, time and room into it before saving.
//   root.dispatchEvent(new CustomEvent('heap:saved', { detail: layout }))
//     tells the engine the editor saved this whole layout: it becomes the new original / 처음으로 target.
// Walls, floor, table, heap, projector, phone and guestbook stay as they were built.
on(root, 'heap:items', e => {
  if (!Array.isArray(e.detail)) return;
  if (ctx.perch) unperch(); // the seat is about to be rebuilt
  buildItems(e.detail.filter(it => it && typeof it === 'object').map(it => ({ ...it })));
  // music that no longer has its radio, speaker or TV (or whose link was changed) stops
  if (ctx.musicUrl && !ctx.build.items.some(it => it.fn?.kind === 'music' && it.fn.url === ctx.musicUrl)) closeMusic();
  linkShelf(); updateAlbums(); startSlots();
  if (ctx.mode === 'sort') { if (ctx.shelf) enterSort(); else exitSort(); }
});
on(root, 'heap:edit', e => { if (e.detail) closeMusic(); }); // heap-room.tsx: the 꾸미기 panel opened (true) or closed (false); the panel takes the dock's corner, so the music stops
on(root, 'heap:saved', e => {
  const l = e.detail;
  if (!l || typeof l !== 'object' || !Array.isArray(l.items)) return;
  ctx.baseLayout = structuredClone(l);
  ctx.original = { items: l.items.map(it => ({ ...it })), time: l.time ?? 'auto' };
});
on(root, 'heap:get', e => {
  if (typeof e.detail !== 'function') return;
  getCatalogue().then(catalogue => {
    if (ctx.disposed) return;
    e.detail({
      room: { w: 2 * RX, d: 2 * RZ }, layout: structuredClone(ctx.baseLayout), items: ctx.build.items.map(it => ({ ...it })), catalogue,
      table: { x: TABLE.x, z: TABLE.z, w: TABLE.w, d: TABLE.d },
      door: DOOR ? { wall: DOOR.wall, at: DOOR.at } : null, window: WIN ? { wall: WIN.wall, at: WIN.at, w: WIN.w } : null,
      time: ctx.timeChoice, original: { items: ctx.original.items.map(it => ({ ...it })), time: ctx.original.time },
      creatorLinks: creator.links.map(L => ({ ...L })), linktree: creator.linktree ?? null,
      seats: ctx.build.seats.map(s => ({ id: s.id, kind: s.kind, x: s.pos.x, y: s.pos.y, z: s.pos.z, yaw: s.yaw })),
    });
  });
});
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
  if (reel.kind !== 'fan') openPlayer(reel); // a fan piece is just projected
}
function eject() {
  closePlayer();
  const c = ctx.loaded; ctx.loaded = null; dropOnTop(c); settle(); startAnim(c, 'drop');
  screen.material = screenIdle;
  ctx.mode = 'sit'; setHint('sit'); goTo(SIT_CAM); syncUI();
}
on($('stand'), 'click', () => (ctx.perch ? unperch() : stand()));
on($('eject'), 'click', eject);
// official YouTube embed, flat and unobstructed; if this host forbids embeds, fall back to the link out
ctx.embedBlocked = false;
const player = $('player'), frameBox = $('player-frame'), note = $('player-note');
// One official player at a time: the projector's and the music dock's share these two helpers, and opening either closes the other.
const embedSrc = ({ video, list }) => `https://www.youtube-nocookie.com/embed/${video ?? 'videoseries'}?${new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', ...(list ? { list } : {}) })}`;
function makeFrame(src, title) {
  const f = document.createElement('iframe');
  f.src = src; f.title = title;
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  return f;
}
function openPlayer(reel) {
  closeMusic(); // the projector takes over: only one YouTube player plays at a time
  $('player-title').textContent = reel.title || '';
  frameBox.innerHTML = '';
  note.hidden = !ctx.embedBlocked;
  if (!ctx.embedBlocked) {
    const avail = Math.max(220, root.clientHeight - 230);
    let w, h;
    if (reel.wide) { w = Math.min(root.clientWidth - 32, 720, avail * 16 / 9); h = w * 9 / 16; }
    else { h = Math.min(avail, 640); w = h * 9 / 16; }
    w = Math.max(200, Math.round(w)); h = Math.max(200, Math.round(h));
    frameBox.style.width = w + 'px'; frameBox.style.height = h + 'px';
    frameBox.appendChild(makeFrame(embedSrc({ video: reel.id, list: null }), reel.title || 'YouTube video'));
  } else { frameBox.style.width = frameBox.style.height = '0px'; }
  player.hidden = false;
}
function closePlayer() { frameBox.innerHTML = ''; player.hidden = true; }
on($('player-close'), 'click', closePlayer);
// music: the docked player at the room's top right, opposite the room name (item.fn kind "music" on a radio, speaker or TV).
// A visible official embed of 200 px or more with nothing laid over it: heap-room.css keeps the overlays and the 꾸미기 panel out of its corner (--music-w).
// It starts only from the visitor's click on the carrier, which is the gesture the browser wants before it lets a video play with sound.
const dock = $('music'), dockFrame = $('music-frame'), dockNote = $('music-note'), dockLink = $('music-link');
ctx.musicUrl = null; ctx.musicParsed = null;
// The dock sits at the canvas's top right: 16 px from its edge, 8 px of padding, then the video. The canvas is what the 꾸미기 panel leaves of the room,
// so the width the video may take is measured from it (not from the room): 16 + 8 + 8 + 16 px of room around it, and the room's name (top left) keeps its own width.
const musicFit = () => Math.min(380, Math.floor(canvas.clientWidth - 48 - $('cname').getBoundingClientRect().width - 16));
function openMusic(fn) {
  const p = opts.parseMusic(fn.url); // checked again here: the layout in the database is not trusted
  if (!p || !player.hidden || (ctx.musicUrl === fn.url && !dock.hidden)) return;
  closeMusic(); ctx.musicUrl = fn.url; ctx.musicParsed = p;
  dock.hidden = false;
  if (!ctx.embedBlocked && musicFit() >= 200) dockFrame.appendChild(makeFrame(embedSrc(p), '음악 플레이어')); // only a click gets here, and only a video 200 px wide or more is embedded
  layoutMusic();
}
// Sizes the dock to the room as it is now (also after a resize or the panel opening): a video that no longer fits 200 x 200 gives way to a link out,
// and --music-w tells the CSS how much of the corner the overlays and the room-name line must leave free.
function layoutMusic() {
  if (dock.hidden || !ctx.musicParsed) return;
  const fit = musicFit();
  if (dockFrame.firstChild && fit >= 200) {
    dockFrame.style.width = fit + 'px'; dockFrame.style.height = Math.max(200, Math.round(fit * 9 / 16)) + 'px';
    dockNote.hidden = dockLink.hidden = true;
    root.style.setProperty('--music-w', fit + 'px');
  } else {
    dockFrame.replaceChildren(); dockFrame.style.width = dockFrame.style.height = '0px';
    dockNote.hidden = dockLink.hidden = false; dockLink.href = ctx.musicUrl;
    const w = Math.max(120, Math.min(300, fit));
    dockNote.style.maxWidth = w + 'px'; root.style.setProperty('--music-w', w + 'px');
  }
}
function closeMusic() { dockFrame.replaceChildren(); dock.hidden = true; ctx.musicUrl = null; ctx.musicParsed = null; root.style.removeProperty('--music-w'); }
on($('music-close'), 'click', closeMusic);
on(document, 'securitypolicyviolation', e => {
  if (!/youtube/.test(e.blockedURI || '')) return;
  ctx.embedBlocked = true;
  if (!player.hidden) { frameBox.innerHTML = ''; frameBox.style.width = frameBox.style.height = '0px'; note.hidden = false; }
  if (!dock.hidden) { dockFrame.replaceChildren(); layoutMusic(); }
});
const safeHref = u => (opts.isSafeLink(u) ? u : null); // the server checks layout links before saving; this is the same check on what the DOM gets
// one link as a bubble: a titled link, or (L.email) the address with a copy button. The phone's fallback list and the PC panel share it.
function linkBubble(L) {
  const b = el('div', 'bubble');
  if (L.email) {
    b.appendChild(el('small', null, L.title));
    const em = el('span', 'email', L.email); b.appendChild(em);
    const cp = el('button', 'copy', '주소 복사'); cp.type = 'button';
    cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(L.email); cp.textContent = '복사했어요'; }
      catch { const s = getSelection(), rg = document.createRange(); rg.selectNodeContents(em); s.removeAllRanges(); s.addRange(rg); cp.textContent = '주소를 선택했어요'; }
    });
    b.appendChild(cp);
  } else if (safeHref(L.url)) {
    b.appendChild(link(`${L.title} ↗`, L.url));
    b.appendChild(el('small', null, shortUrl(L.url)));
  } else b.appendChild(el('span', null, L.title));
  return b;
}
// the creator.json links, as they were on the phone: the note, each link, the linktree's full list
function legacyLinks(into) {
  if (creator.linksNote) into.appendChild(el('span', 'chip', creator.linksNote));
  for (const L of creator.links) into.appendChild(linkBubble(L));
  if (creator.linktree) { const lt = el('div', 'bubble'); lt.appendChild(link(`${creator.linktree.replace(/^https:\/\//, '')} 전체 보기 ↗`, creator.linktree)); into.appendChild(lt); }
}
const hasPc = () => ctx.build.items.some(it => it.fn?.kind === 'pc');
ctx.phonePic = null; // { card, im }: the card whose picture the phone shows, so a sharper tier that lands later reaches it
function showPhonePic() {
  const pic = ctx.phonePic.card.userData.img; // a canvas (fan drawing, cropped tier) or the close tier's own Image
  if (pic) ctx.phonePic.im.src = pic.toDataURL ? pic.toDataURL('image/jpeg', 0.8) : pic.src;
}
ctx.showPhonePic = showPhonePic;
function openPhone() {
  const feedEl = $('phone-feed'); feedEl.replaceChildren();
  const bb = el('div', 'bubble');
  bb.appendChild(el('small', null, '크리에이터와 1:1 대화'));
  const open = el('a', null, '버블 열기 →'); open.href = opts.bubbleHref;
  open.addEventListener('click', e => { if (e.button || e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); opts.navigate(opts.bubbleHref); });
  bb.appendChild(open);
  feedEl.appendChild(bb);
  const curCard = ctx.held || ctx.loaded, cur = curCard?.userData.reel;
  ctx.phonePic = null;
  if (cur) {
    const b = el('div', 'bubble');
    b.appendChild(el('small', null, cur.kind === 'fan' ? `지금 보고 있는 팬 작품 · ${cur.by}` : '지금 보고 있는 사진'));
    const im = el('img'); im.crossOrigin = 'anonymous'; im.alt = ''; b.appendChild(im);
    ctx.phonePic = { card: curCard, im }; showPhonePic();
    b.appendChild(el('span', null, cur.title));
    if (cur.kind !== 'fan') b.appendChild(link('원본 보기 ↗', ytUrl(cur)));
    feedEl.appendChild(b);
  }
  if (!hasPc()) legacyLinks(feedEl);
  $('phone').hidden = false;
}
on($('phone-close'), 'click', () => { $('phone').hidden = true; });
on($('phone'), 'click', e => { if (e.target.id === 'phone') $('phone').hidden = true; });
// PC (a desk, monitor or laptop with fn.kind "pc"): the creator's links. fn.links is the owner's own list; without one the creator.json links stand in.
function openPc(fn) {
  const list = $('pc-list'); list.replaceChildren();
  if (Array.isArray(fn.links)) for (const L of fn.links) list.appendChild(linkBubble(L)); else legacyLinks(list);
  if (!list.children.length) list.appendChild(el('p', 'note', '아직 링크가 없어요.'));
  $('pc').hidden = false;
}
on($('pc-close'), 'click', () => { $('pc').hidden = true; });
on($('pc'), 'click', e => { if (e.target.id === 'pc') $('pc').hidden = true; });
// keepsake (a wall frame or a shelf-top standee): name, date, caption, and the link to the original
function openKeepsake(fn) {
  $('ks-title').textContent = fn.name;
  const body = $('ks-body'); body.replaceChildren();
  const look = keepsakeLook(fn);
  if (look.id) {
    const im = el('img', look.tall ? 'ks-pic tall' : 'ks-pic'); im.alt = '';
    const files = look.tall ? ['oardefault', 'hqdefault'] : ['hq720', 'mqdefault'];
    let n = 0;
    const next = () => { im.src = thumbUrl({ id: look.id }, files[n]); };
    im.addEventListener('load', () => { if (im.naturalWidth <= 120 && ++n < files.length) next(); }); // a missing thumbnail is a 120px placeholder
    im.addEventListener('error', () => { if (++n < files.length) next(); else im.remove(); });
    next(); body.appendChild(im);
  }
  if (fn.date) body.appendChild(el('div', 'ks-meta', ksDay(fn.date)));
  if (fn.caption) body.appendChild(el('p', 'ks-caption', fn.caption));
  if (fn.link && opts.isWebLink(fn.link)) {
    if (!look.id && look.host) body.appendChild(el('div', 'ks-meta', look.host));
    const a = link('원본 보기', fn.link); a.className = 'btn'; body.appendChild(a);
  }
  $('keepsake').hidden = false;
}
on($('ks-close'), 'click', () => { $('keepsake').hidden = true; });
on($('keepsake'), 'click', e => { if (e.target.id === 'keepsake') $('keepsake').hidden = true; });
// calendar (the desk calendar): the dates from today on, soonest first, each with how far off it is. Past dates are left out.
function openCalendar(fn) {
  const body = $('cal-body'); body.replaceChildren();
  const today = seoulDay.format(new Date()), asDay = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const up = (fn.entries ?? []).filter(e => typeof e?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && typeof e.label === 'string' && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  for (const e of up) {
    const n = Math.round((asDay(e.date) - asDay(today)) / 864e5), row = el('div', 'cal-row');
    row.appendChild(el('b', null, ksDay(e.date)));
    row.appendChild(el('span', null, e.label));
    row.appendChild(el('small', null, n === 0 ? '오늘' : n === 1 ? '내일' : `${n}일 뒤`));
    body.appendChild(row);
  }
  if (!up.length) body.appendChild(el('p', 'note', '예정된 날짜가 없어요.'));
  $('calendar').hidden = false;
}
on($('cal-close'), 'click', () => { $('calendar').hidden = true; });
on($('calendar'), 'click', e => { if (e.target.id === 'calendar') $('calendar').hidden = true; });
// TV (fn "latest"): sit down at the table, pick up the newest reel and feed it to the projector, the same steps as doing it by hand.
function watchLatest() {
  if (ctx.mode !== 'room') return;
  const reel = newestReel(), card = reel && cards.find(c => c.userData.reel === reel);
  if (!card) { toast('아직 올라온 영상이 없어요'); return; }
  sit(); pickUp(card); feed();
}
const openSlot = slot => {
  const k = slot.fn.kind;
  if (k === 'pc') openPc(slot.fn); else if (k === 'keepsake') openKeepsake(slot.fn);
  else if (k === 'music') openMusic(slot.fn); else if (k === 'latest') watchLatest(); else if (k === 'calendar') openCalendar(slot.fn);
};
// fan pieces: one that lands while the visitor is in the room drops onto the top of the heap from above the table
function landPiece(p) {
  const c = makeCard(p);
  c.position.set(TABLE.x, TABLE.top + 0.9, TABLE.z);
  c.quaternion.setFromAxisAngle(Xv, -Math.PI / 2);
  c.userData.place = clampPlace({ x: TABLE.x + gauss() * 0.15, z: TABLE.z + gauss() * 0.1, yaw: gauss() * 0.5, faceUp: true });
  settle();
  startAnim(c, 'drop'); Object.assign(c.userData.anim, { dur: 1.1, arc: 0.35 });
  toast(`${p.by}님의 팬 작품이 더미 위에 올라왔어요`);
}
// guestbook: names and dates only. Rows are database rows { id, name, createdAt (ISO) }, newest first, merged by id from the page, the poll and the visitor's own submit.
const gbRows = new Map((DATA.guestbook || []).map(e => [e.id, { id: e.id, name: e.name, createdAt: e.createdAt }]));
const gbSorted = () => [...gbRows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? 1 : -1));
function renderGuestbook() {
  const list = $('gb-list'); list.innerHTML = '';
  if (creatorVisit()) { // 다녀감: the creator's own row comes first
    const row = el('div', 'gb-row owner');
    row.appendChild(el('span', null, creator.name));
    row.appendChild(el('small', null, `주인 · ${creatorVisit()}`));
    list.appendChild(row);
  }
  for (const e of gbSorted()) {
    const row = el('div', 'gb-row');
    row.appendChild(el('span', null, e.name));
    row.appendChild(el('small', null, fmtDay(e.createdAt)));
    list.appendChild(row);
  }
}
function openGuestbook() {
  renderGuestbook();
  $('gb-msg').textContent = '';
  $('guestbook').hidden = false;
  setTimeout(() => $('gb-name')?.focus(), 50);
}
let gbBusy = false;
const gbForm = root.querySelector('#gb-form'); // absent for a signed-out viewer: heap-room.tsx shows a sign-in line instead
if (gbForm) on(gbForm, 'submit', async e => {
  e.preventDefault();
  if (gbBusy) return;
  const name = $('gb-name').value.trim();
  if (!name) { $('gb-name').focus(); return; }
  gbBusy = true; $('gb-submit').disabled = true; $('gb-msg').textContent = '';
  try {
    const res = await opts.addGuestbook(name);
    if (ctx.disposed) return;
    if (res.ok) {
      gbRows.set(res.entry.id, res.entry);
      $('gb-name').value = '';
      renderGuestbook(); toast(`${res.entry.name}님, 다녀가셨어요`);
    } else $('gb-msg').textContent = res.message;
  } catch {
    if (!ctx.disposed) $('gb-msg').textContent = '지금은 남기지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
  } finally { gbBusy = false; if (!ctx.disposed) $('gb-submit').disabled = false; }
});
on($('gb-close'), 'click', () => { $('guestbook').hidden = true; });
// polling: what others changed (guestbook rows, visit counts, 다녀감, landed pieces) every opts.pollMs while the tab is visible.
// The first cursor is the snapshot's serverTime; each reply carries the next. Overlapping rows are merged by id.
let cursor = DATA.serverTime, polling = false;
async function poll() {
  if (ctx.disposed || polling) return;
  polling = true;
  try {
    const res = await fetch(`/api/heap/rooms/${encodeURIComponent(opts.roomUuid)}/changes?since=${encodeURIComponent(cursor)}`, { cache: 'no-store', signal: ac.signal });
    if (!res.ok || ctx.disposed) return;
    const d = await res.json();
    if (ctx.disposed) return;
    if (typeof d.cursor === 'string') cursor = d.cursor;
    if (d.visits && Number.isFinite(d.visits.today) && Number.isFinite(d.visits.total)) { ctx.visits = { today: d.visits.today, total: d.visits.total }; renderMeta(); }
    if (typeof d.creatorVisitedAt === 'string') { const day = fmtDay(d.creatorVisitedAt); if (day && day !== ctx.creatorDay) { ctx.creatorDay = day; renderCreatorVisit(); } }
    for (const e of d.guestbook || []) gbRows.set(e.id, { id: e.id, name: e.name, createdAt: e.createdAt });
    if (!$('guestbook').hidden) renderGuestbook();
    // pieces: a newly landed one drops onto the heap. A card already on the heap stays when its piece is taken off (until fan pieces get their own screens)
    for (const p of d.pieces || []) {
      if (p.status !== 'landed' || fanReels.some(f => f.id === p.id)) continue;
      const fan = fanReelOf({ id: p.id, by: p.submitterName ?? '알 수 없음', date: fmtDay(p.landedAt ?? p.createdAt), caption: p.title || p.note || '팬 작품' }, fanReels.length);
      fanReels.push(fan);
      landPiece(fan);
    }
  } catch (e) {
    if (!ctx.disposed && e?.name !== 'AbortError') console.warn('[heap-room] poll', e);
  } finally { polling = false; }
}
function schedulePoll() {
  clearTimeout(ctx.pollTimer);
  if (ctx.disposed || document.hidden) return;
  ctx.pollTimer = setTimeout(async () => { await poll(); schedulePoll(); }, opts.pollMs);
}
on(document, 'visibilitychange', () => { if (document.hidden) clearTimeout(ctx.pollTimer); else { poll().then(schedulePoll); } });
cleanups.push(() => clearTimeout(ctx.pollTimer));
// rooms: the door lists the other rooms; jumping fades out and hands the chosen id to opts.onNavigate
function openRooms() {
  const list = $('roomlist'); list.innerHTML = '';
  let anyChanged = false;
  for (const r of ROOMS) {
    const b = el('button'); b.type = 'button'; b.disabled = r.id === roomId;
    const left = el('span'); left.appendChild(el('b', null, r.name));
    if (r.changed === true && r.id !== roomId) { // changed since the viewer's last visit there (heap/repo.ts listChangedRoomSlugs); the page sends it for signed-in viewers only
      const dot = el('span', 'dot'); dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', '다녀간 뒤 바뀐 방'); left.appendChild(dot); anyChanged = true;
    }
    left.appendChild(el('br')); left.appendChild(el('small', null, r.blurb || ''));
    b.appendChild(left); b.appendChild(el('small', null, r.id === roomId ? '지금 있는 방' : '들어가기 →'));
    b.addEventListener('click', () => jump(r.id));
    list.appendChild(b);
  }
  $('rooms-legend').hidden = !anyChanged;
  $('rooms').hidden = false;
}
function jump(id) {
  $('rooms').hidden = true; $('fade').classList.add('on');
  setTimeout(() => { if (!ctx.disposed) opts.onNavigate(id); }, 380);
}
on($('rooms-close'), 'click', () => { $('rooms').hidden = true; });
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
  const p = hit.point, onTableFoot = p.x > TBOX.x0 && p.x < TBOX.x1 && p.z > TBOX.z0 && p.z < TBOX.z1;
  if (doorParts.includes(hit.object)) walkRoute(ctx.doorSpot.clone(), 'door');
  else if (bookParts.includes(hit.object)) walkRoute(ctx.bookSpot.clone(), 'book');
  else if (shelfParts.includes(hit.object)) walkRoute(ctx.shelfSpot.clone(), 'sort');
  else if (hit.object === floor && !onTableFoot) walkRoute(p.clone().setY(0), null);
  else walkRoute(SEAT.clone(), 'sit');
});
// ---------- walking ----------
const TBOX = { x0: TABLE.x - TABLE.w / 2 - 0.45, x1: TABLE.x + TABLE.w / 2 + 0.45, z0: TABLE.z - TABLE.d / 2 - 0.45, z1: TABLE.z + TABLE.d / 2 + 0.45 };
function crossesTable(a, b) {
  for (let i = 1; i < 20; i++) {
    const x = a.x + (b.x - a.x) * i / 20, z = a.z + (b.z - a.z) * i / 20;
    if (x > TBOX.x0 + 0.1 && x < TBOX.x1 - 0.1 && z > TBOX.z0 + 0.1 && z < TBOX.z1 - 0.1) return true;
  }
  return false;
}
// ---------- sitting on furniture (room mode) ----------
// A seat is entered from one of its stand points, reached by a walk planned around every walk obstacle, and the visitor sits only on arriving there.
// A seat whose centre lies inside the photo table, the guestbook stand or another item's own footprint is refused, so nobody ends up inside furniture.
// perchOn / unperch: the seat's pose is held every frame by stepCharacter; any walking key, a click on the floor or Esc stands the visitor up at the stand point they came from.
const walkBoxes = () => [OBST[0], ...ctx.build.obst, ...OBST.slice(1)];
const walkFree = (x, z, margin = 0.05) => x > -RX + 0.35 && x < RX - 0.3 && z > -RZ + 0.35 && z < RZ - 0.3 && !walkBoxes().some(o => Math.abs(x - o.x) < o.hw + margin && Math.abs(z - o.z) < o.hd + margin);
const seatUsable = s => s.pos.x > -RX + 0.2 && s.pos.x < RX - 0.2 && s.pos.z > -RZ + 0.2 && s.pos.z < RZ - 0.2 &&
  !walkBoxes().some(o => o.owner !== s.item && Math.abs(s.pos.x - o.x) < (o.rhw ?? o.hw) + 0.1 && Math.abs(s.pos.z - o.z) < (o.rhd ?? o.hd) + 0.1);
// A* over a 0.25 grid of the floor (cells inside an obstacle's walk box plus 0.15 are closed), then the path is pulled straight wherever a line stays clear.
// Returns the points to walk through, the last being `to` itself, or null when `to` cannot be reached.
function planPath(from, to) {
  const S = 0.25, M = 0.15, x0 = -RX + 0.35, z0 = -RZ + 0.35, nx = Math.floor((2 * RX - 0.65) / S) + 1, nz = Math.floor((2 * RZ - 0.65) / S) + 1;
  const open = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) open[j * nx + i] = walkFree(x0 + i * S, z0 + j * S, M) ? 1 : 0;
  const cellOf = (x, z) => [THREE.MathUtils.clamp(Math.round((x - x0) / S), 0, nx - 1), THREE.MathUtils.clamp(Math.round((z - z0) / S), 0, nz - 1)];
  let [si, sj] = cellOf(from.x, from.z);
  if (!open[sj * nx + si]) { // the start may stand in an obstacle's margin: begin from the nearest open cell
    let best = null;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (open[j * nx + i]) { const d = Math.hypot(i - si, j - sj); if (d <= 8 && (!best || d < best[0])) best = [d, i, j]; }
    if (!best) return null;
    [, si, sj] = best;
  }
  const [gi, gj] = cellOf(to.x, to.z);
  if (!open[gj * nx + gi]) return null;
  const g = new Float32Array(nx * nz).fill(Infinity), came = new Int32Array(nx * nz).fill(-1), done = new Uint8Array(nx * nz), heap = [[0, sj * nx + si]];
  g[sj * nx + si] = 0;
  const h = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  let reached = false;
  while (heap.length) {
    let k = 0; for (let n = 1; n < heap.length; n++) if (heap[n][0] < heap[k][0]) k = n;
    const [, cur] = heap.splice(k, 1)[0];
    if (done[cur]) continue;
    done[cur] = 1;
    const ci = cur % nx, cj = (cur - ci) / nx;
    if (ci === gi && cj === gj) { reached = true; break; }
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz || !open[nj * nx + ni]) continue;
      if (di && dj && !(open[cj * nx + ni] && open[nj * nx + ci])) continue; // no cutting a corner
      const n = nj * nx + ni, cost = g[cur] + (di && dj ? 1.414 : 1);
      if (cost < g[n]) { g[n] = cost; came[n] = cur; heap.push([cost + h(ni, nj), n]); }
    }
  }
  if (!reached) return null;
  const cells = [];
  for (let c = gj * nx + gi; c !== -1; c = came[c]) { const ci = c % nx; cells.unshift({ x: x0 + ci * S, z: z0 + (c - ci) / nx * S }); }
  cells[cells.length - 1] = { x: to.x, z: to.z };
  const clear = (a, b) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1); for (let t = 1; t <= n; t++) if (!walkFree(a.x + (b.x - a.x) * t / n, a.z + (b.z - a.z) * t / n, 0.1)) return false; return true; };
  const out = []; let cur = { x: from.x, z: from.z }, k = 0;
  while (k < cells.length) {
    let m = k; for (let n = cells.length - 1; n > k; n--) if (clear(cur, cells[n])) { m = n; break; }
    out.push(new THREE.Vector3(cells[m].x, 0, cells[m].z)); cur = cells[m]; k = m + 1;
  }
  return out;
}
function sitOn(seats, point) { // the seat of this item nearest to where the click landed
  const s = seats.reduce((a, b) => (Math.hypot(a.pos.x - point.x, a.pos.z - point.z) <= Math.hypot(b.pos.x - point.x, b.pos.z - point.z) ? a : b));
  if (!seatUsable(s)) { toast('여기에는 앉을 수 없어요'); return; }
  if (ctx.perch) unperch();
  const from = me.position.clone().setY(0);
  let best = null;
  for (const st of s.stands) {
    if (!walkFree(st.x, st.z)) continue;
    const path = planPath(from, st);
    if (!path) continue;
    let len = 0, prev = from; for (const p of path) { len += prev.distanceTo(p); prev = p; }
    if (!best || len < best.len) best = { st, path, len };
  }
  if (!best) { toast('거기까지 갈 길이 없어요'); return; }
  ctx.waypoints = best.path.slice(); ctx.walkTo = ctx.waypoints.shift(); ctx.arrive = 'seat'; ctx.seatTarget = s; ctx.seatFrom = best.st;
}
function perchOn(s) {
  if (!s || !ctx.seatFrom || Math.hypot(me.position.x - ctx.seatFrom.x, me.position.z - ctx.seatFrom.z) > 0.3) return; // only from the stand point the walk was planned to
  ctx.perch = s; ctx.perchFrom = ctx.seatFrom; ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = [];
  setHint('perch'); syncUI();
}
function unperch() {
  if (!ctx.perch) return;
  ctx.perch = null;
  me.position.copy(ctx.perchFrom).setY(0); collide(me.position); // back onto the floor where the seat was entered from
  setHint('room'); syncUI();
}
function walkRoute(to, action) {
  if (ctx.perch) unperch();
  const from = me.position.clone().setY(0);
  ctx.waypoints = [to]; ctx.arrive = action;
  if (crossesTable(from, to)) {
    const corners = [[TBOX.x0, TBOX.z0], [TBOX.x1, TBOX.z0], [TBOX.x0, TBOX.z1], [TBOX.x1, TBOX.z1]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const ok = corners.filter(c => !crossesTable(from, c) && !crossesTable(c, to));
    if (ok.length) ctx.waypoints = [ok.sort((p, q) => (from.distanceTo(p) + p.distanceTo(to)) - (from.distanceTo(q) + q.distanceTo(to)))[0], to];
    else {
      const near = corners.filter(c => !crossesTable(from, c)).sort((p, q) => from.distanceTo(p) - from.distanceTo(q))[0];
      const second = near && corners.filter(c => c !== near && !crossesTable(near, c) && !crossesTable(c, to)).sort((p, q) => p.distanceTo(to) - q.distanceTo(to))[0];
      ctx.waypoints = second ? [near, second, to] : [to];
    }
  }
  ctx.walkTo = ctx.waypoints.shift();
}
function collide(p) {
  p.x = THREE.MathUtils.clamp(p.x, -RX + 0.35, RX - 0.3);
  p.z = THREE.MathUtils.clamp(p.z, -RZ + 0.35, RZ - 0.3);
  // the table, the items, then the guestbook stand: the order they were checked in when all of them shared OBST
  for (const o of [OBST[0], ...ctx.build.obst, ...OBST.slice(1)]) {
    const dx = p.x - o.x, dz = p.z - o.z;
    if (Math.abs(dx) < o.hw && Math.abs(dz) < o.hd) {
      const px = o.hw - Math.abs(dx), pz = o.hd - Math.abs(dz);
      if (px < pz) p.x = o.x + Math.sign(dx || 1) * o.hw; else p.z = o.z + Math.sign(dz || 1) * o.hd;
    }
  }
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
  if (a === 'sit') sit(); else if (a === 'sort') enterSort(); else if (a === 'door') openRooms(); else if (a === 'book') openGuestbook(); else if (a === 'seat') perchOn(ctx.seatTarget);
}
const WALK_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
function stepCharacter(dt) {
  if (ctx.perch) {
    if (anyOverlay() || !WALK_KEYS.some(k => keys.has(k))) { // sitting: the pose stays until a walking key is pressed
      me.position.set(ctx.perch.pos.x, ctx.perch.pos.y - 0.28, ctx.perch.pos.z); me.rotation.y = ctx.perch.yaw; legL.rotation.x = legR.rotation.x = -1.2;
      return;
    }
    unperch();
  }
  mv.set(0, 0, 0);
  if (!anyOverlay()) {
    if (keys.has('w') || keys.has('arrowup')) mv.add(UP);
    if (keys.has('s') || keys.has('arrowdown')) mv.sub(UP);
    if (keys.has('d') || keys.has('arrowright')) mv.add(RIGHT);
    if (keys.has('a') || keys.has('arrowleft')) mv.sub(RIGHT);
  }
  if (mv.lengthSq()) { ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = []; mv.normalize(); }
  else if (ctx.walkTo) {
    mv.subVectors(ctx.walkTo, me.position).setY(0);
    const gap = mv.length();
    // a seat is entered only from its stand point, so the last step onto it never overshoots: within one step the visitor lands on it
    if (ctx.arrive === 'seat' && !ctx.waypoints.length && gap <= 2.4 * dt) { me.position.x = ctx.walkTo.x; me.position.z = ctx.walkTo.z; mv.set(0, 0, 0); return arrived(); }
    if (gap < (ctx.waypoints.length ? 0.2 : 0.08)) { mv.set(0, 0, 0); return arrived(); }
    mv.normalize();
  }
  const moving = mv.lengthSq() > 0;
  if (moving) {
    const before = me.position.clone();
    me.position.addScaledVector(mv, 2.4 * dt); collide(me.position);
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
// ====================================================================================
// 8. Loop
// ====================================================================================
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = new THREE.Clock(), dir = new THREE.Vector3(), camUp = new THREE.Vector3(), want = new THREE.Vector3(), wantQ = new THREE.Quaternion();
const roomGoal = new THREE.Vector3(), flyQ = new THREE.Quaternion(), FLIP = new THREE.Quaternion().setFromAxisAngle(Yv, Math.PI);
// The canvas is sized by CSS: the whole room area, or what the 꾸미기 panel leaves of it. The observer catches both that and a window resize.
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
  layoutMusic();
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (ctx.raf) renderer.render(scene, camera); // setSize clears the canvas; draw again so no blank frame shows
}
on(window, 'resize', resize);
const sizeWatch = new ResizeObserver(resize); sizeWatch.observe(canvas);
cleanups.push(() => sizeWatch.disconnect());
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
  // cards
  const tn = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  camera.getWorldDirection(dir); camUp.setFromMatrixColumn(camera.matrixWorld, 1);
  const animDt = reduced ? 1 : Math.min(rawDt, 0.1);
  for (const c of cards) {
    const d = c.userData.d;
    if (c.userData.fly) {
      want.copy(c.userData.fly); flyQ.setFromAxisAngle(Yv, ctx.shelf.group.rotation.y);
      if (c.position.distanceTo(want) < 0.08) { c.userData.fly = null; c.position.copy(c.userData.home.pos); c.quaternion.copy(c.userData.home.quat); continue; }
      c.position.lerp(want, Math.min(1, a * 1.6)); c.quaternion.slerp(flyQ, a);
      continue;
    }
    if (c === ctx.held) {
      const dist = Math.max(d.h / (1.5 * tn), d.w / (1.7 * tn * camera.aspect));
      want.copy(camera.position).addScaledVector(dir, dist); wantQ.copy(camera.quaternion);
      if (ctx.heldFlipped) wantQ.multiply(FLIP);
    } else if (c === ctx.presenting) {
      const dist = Math.max(d.h / (0.9 * tn), d.w / (1.0 * tn * camera.aspect));
      want.copy(camera.position).addScaledVector(dir, dist).addScaledVector(camUp, -0.16 * dist * tn); wantQ.copy(camera.quaternion);
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
async function fontsReady() {
  const wait = Promise.all([document.fonts.load('40px "Nanum Pen Script"', '가나 abc'), document.fonts.load('600 20px "IBM Plex Sans KR"', '만 1234')]);
  await Promise.race([wait, new Promise(r => setTimeout(r, 3000))]);
}
await fontsReady(); // the room does not wait for thumbnails: buildHeap() queues them and each card fills in as its picture lands
if (ctx.disposed) return;
buildHeap();
updateAlbums();
startSlots(); // keepsakes paint with their fonts and fetch their thumbnails from here on
resize();
camera.position.copy(ROOM_CAM.pos); controls.target.copy(ROOM_CAM.target); camera.lookAt(ROOM_CAM.target);
setHint('room'); syncUI();
$('status').hidden = true;
frame();
root.dispatchEvent(new CustomEvent('heap:ready'));
// a signed-in visitor is recorded once per mount (the server keeps one row per person per day); anonymous viewers record nothing
if (opts.signedIn) opts.recordVisit().then(r => { if (!ctx.disposed && r?.ok && r.recorded) poll(); }).catch(() => {});
schedulePoll();
}

run().catch(e => { if (!ctx.disposed) console.error('[heap-room]', e); });

return function dispose() {
  if (ctx.disposed) return;
  ctx.disposed = true;
  // every step runs even when another one throws: a half-finished dispose would leave the poll timer, the frame loop or the listeners of a dead engine running
  const safe = (step, what) => { try { step(); } catch (e) { console.error('[heap-room] dispose:', what, e); } };
  safe(() => clearTimeout(ctx.pollTimer), 'poll timer');
  safe(() => cancelAnimationFrame(ctx.raf), 'frame loop');
  safe(() => ac.abort(), 'listeners and requests');
  while (cleanups.length) safe(cleanups.pop(), 'cleanup');
  // put the React-rendered nodes back to their first-render state so a later mount starts clean
  for (const id of LISTS) safe(() => { $(id).innerHTML = ''; }, id);
  for (const id of HIDDEN) safe(() => { $(id).hidden = true; }, id);
  safe(() => { $('status').hidden = false; $('fade').classList.remove('on'); }, 'status');
  safe(() => { $('toast').textContent = ''; $('gb-msg').textContent = ''; $('visit').textContent = ''; $('hint').textContent = ''; delete $('hint').dataset.k; }, 'texts');
  safe(() => { root.style.removeProperty('--clay'); root.style.removeProperty('--music-w'); }, 'root style');
  safe(() => { if (ctx.roomTitle && document.title === ctx.roomTitle) document.title = prevTitle; }, 'title');
};
}
