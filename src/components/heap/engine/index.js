// Heap miniroom engine, ported from .claude/session-artifacts/heap-poc/miniroom/room.html (its <script type="module"> body).
// The body of run() keeps the source's order and indentation so the two can be diffed.
// Browser only: load it with a dynamic import from a client component.
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
import { setupLoop } from './loop.js';
import { setupModes } from './modes.js';
import { setupEditorBridge } from './editor-bridge.js';
import { setupPlayers } from './players.js';
import { setupPanels } from './panels.js';
import { setupLive } from './live.js';
import { setupInput } from './input.js';
import { setupPath } from './path.js';

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
const { layout } = ctx;
if (ctx.disposed) return;
setupHud(ctx);
const { setHint, syncUI } = ctx;
setupCardArt(ctx);
setupScene(ctx);
const { camera, controls } = ctx;
setupShell(ctx);
setupFurniture(ctx);
const { buildItems } = ctx;
setupSlots(ctx);
const { startSlots } = ctx;
setupModels(ctx);
buildItems(layout.items || [], true);
setupShelf(ctx);
const { updateAlbums } = ctx;
setupTime(ctx);
setupProps(ctx);
setupWalk(ctx);
setupHeap(ctx);
const { buildHeap } = ctx;
setupThumbs(ctx);
setupLoop(ctx);
const { resize, ROOM_CAM, frame } = ctx;
setupModes(ctx);
setupEditorBridge(ctx);
setupPlayers(ctx);
setupPanels(ctx);
setupLive(ctx);
const { poll, schedulePoll } = ctx;
setupInput(ctx);
setupPath(ctx);
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
