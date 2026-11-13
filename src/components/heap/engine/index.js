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
import { setupWalk } from './walk.js';
import { setupHeap } from './heap.js';
import { setupThumbs } from './thumbs.js';
import { setupModes } from './modes.js';
import { setupInput } from './input.js';
import { setupPath } from './path.js';
import { el, link, shortUrl } from './dom.js';
import { ytUrl, ksDay, seoulDay, fmtDay } from './format.js';
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
const { layout, creator, DATA, fanReels, fanReelOf, ROOMS, roomId } = ctx;
if (ctx.disposed) return;
setupHud(ctx);
const { toast, creatorVisit, renderMeta, renderCreatorVisit, setHint, syncUI } = ctx;
setupCardArt(ctx);
setupScene(ctx);
const { Yv, camera, WALL_H, RX, RZ, WALLS, canvas, Xv, renderer, scene, controls } = ctx;
setupShell(ctx);
const { tA, DOOR, WIN, stepMotes } = ctx;
setupFurniture(ctx);
const { buildItems } = ctx;
setupSlots(ctx);
const { startSlots, keepsakeLook, newestReel } = ctx;
setupModels(ctx);
const { getCatalogue } = ctx;
buildItems(layout.items || [], true);
setupShelf(ctx);
const { linkShelf, updateAlbums, enterSort, exitSort } = ctx;
setupTime(ctx);
const { tickClock } = ctx;
setupProps(ctx);
const { TABLE, SEAT, SCREEN_C, SCR, beamMat, projLight, screenOn, reelA, reelB, phoneDot, SLOT } = ctx;
setupWalk(ctx);
const { unperch, stepCharacter, me, legL, legR } = ctx;
setupHeap(ctx);
const { cards, makeCard, clampPlace, settle, startAnim, inPile, supportAt, restPose, stepAnim, buildHeap } = ctx;
setupThumbs(ctx);
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
ctx.SIT_CAM = SIT_CAM;
const WATCH_CAM = { pos: SEAT.clone().add(new THREE.Vector3(0.7, 1.75, 2.1)), target: SCREEN_C.clone().addScaledVector(WALLS[SCR.wall].n, 1).add(new THREE.Vector3(0, -0.75, 0)) };
ctx.WATCH_CAM = WATCH_CAM;
setupModes(ctx);
const { sit, pickUp, feed } = ctx;
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
// official YouTube embed, flat and unobstructed; if this host forbids embeds, fall back to the link out
ctx.embedBlocked = false;
const player = $('player'), frameBox = $('player-frame'), note = $('player-note');
ctx.player = player;
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
ctx.openPlayer = openPlayer;
function closePlayer() { frameBox.innerHTML = ''; player.hidden = true; }
ctx.closePlayer = closePlayer;
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
ctx.openPhone = openPhone;
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
ctx.openSlot = openSlot;
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
ctx.openGuestbook = openGuestbook;
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
ctx.openRooms = openRooms;
function jump(id) {
  $('rooms').hidden = true; $('fade').classList.add('on');
  setTimeout(() => { if (!ctx.disposed) opts.onNavigate(id); }, 380);
}
on($('rooms-close'), 'click', () => { $('rooms').hidden = true; });
setupInput(ctx);
setupPath(ctx);
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
