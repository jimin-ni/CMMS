// Heap miniroom engine, ported from .claude/session-artifacts/heap-poc/miniroom/room.html (its <script type="module"> body).
// The body of run() keeps the source's order and indentation so the two can be diffed.
// Browser only: load it with a dynamic import from a client component.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const thumbUrl = (reel, name) => `https://i.ytimg.com/vi/${reel.id}/${name}.jpg`;

// keep: a Set of geometries and materials that outlive this object (the model cache)
function disposeScene(scene, keep) {
  scene.traverse(o => {
    if (!keep?.has(o.geometry)) o.geometry?.dispose();
    for (const m of [].concat(o.material ?? [])) {
      if (keep?.has(m)) continue;
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
  });
}

// ids of the nodes heap-room.tsx renders and the engine fills or shows
const LISTS = ['albumrow', 'player-frame', 'phone-feed', 'pc-list', 'ks-body', 'grid-list', 'gb-list', 'roomlist'];
const HIDDEN = ['visit', 'albumrow', 'stand', 'flip', 'srclink', 'eject', 'ytlink', 'sortexit', 'player', 'player-note', 'phone', 'pc', 'keepsake', 'grid', 'guestbook', 'rooms'];

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
 * @param {{ roomId: string, roomUuid: string, dataBase: string, modelBase?: string, data: any, viewerName: string | null, signedIn: boolean, pollMs: number, bubbleHref: string, navigate: (href: string) => void, parseLink: (url: string) => ({ platform: string, externalId: string, wide: boolean | null } | null), isSafeLink: (v: unknown) => boolean, isWebLink: (v: unknown) => boolean, isEmail: (v: unknown) => boolean, recordVisit: () => Promise<any>, addGuestbook: (name: string) => Promise<any>, onNavigate: (roomId: string) => void }} opts
 * @returns {() => void}
 */
export function mountRoom(root, opts) {
let disposed = false, raf = 0, roomTitle = null;
const ac = new AbortController(), cleanups = [], prevTitle = document.title;
const dataBase = opts.dataBase.replace(/\/?$/, '/');
const $ = id => root.querySelector('#' + id);
const on = (target, type, fn) => target.addEventListener(type, fn, { signal: ac.signal });

async function run() {
// ====================================================================================
// 1. Room data: the database part arrives in opts.data (rooms, layout, reels, pieces, guestbook, visits, creatorVisit).
//    <dataBase><id>/creator.json (links, albums, linktree, phoneTitle) is still a static file.
// ====================================================================================
const getJSON = async p => { const r = await fetch(p, { signal: ac.signal }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
const DATA = opts.data;
const ROOMS = DATA.rooms;
const roomId = opts.roomId;
const BASE = `${dataBase}${roomId}/`;
// creator.json holds links and albums. A room without one (404) falls back to no links, no albums; the title is always the room's own name (heap_rooms.name).
let creatorJson = {};
{
  const r = await fetch(BASE + 'creator.json', { signal: ac.signal });
  if (r.ok) creatorJson = await r.json(); else if (r.status !== 404) throw new Error(`${BASE}creator.json: ${r.status}`);
}
const creator = { links: [], albums: [], linktree: null, ...creatorJson, name: DATA.name, phoneTitle: creatorJson.phoneTitle || DATA.name };
// creator.json is a static file. Only links that pass the server's checks reach the page: an absolute http(s) address with a host, or a mailto to one recipient, or an email address. The rest are dropped.
creator.links = (Array.isArray(creator.links) ? creator.links : []).flatMap(L => {
  if (!L || typeof L.title !== 'string') return [];
  if (L.email != null) return L.url == null && opts.isEmail(L.email) ? [{ title: L.title, email: L.email }] : [];
  return opts.isSafeLink(L.url) ? [{ title: L.title, url: L.url }] : [];
});
creator.linktree = opts.isWebLink(creator.linktree) ? creator.linktree : null;
const layout = structuredClone(DATA.layout);
if (disposed) return;

const DEFAULT_PALETTE = {
  olive: '#565344', accent: '#A6613C', paper: '#F3EADB', ink: '#2f2c24',
  wall: '#EADCC4', trim: '#565344', floor: ['#9a6a43', '#8b5d3a', '#a7774d'], woodB: '#8b5d3a', woodDark: '#6e4a30',
  leaf: '#6f7d4f', leaf2: '#87925f', leafDark: '#556240',
};
const C = { ...DEFAULT_PALETTE, ...(layout.palette || {}) };
root.style.setProperty('--clay', C.accent);
document.title = roomTitle = `${creator.name} Miniroom`;
$('cname').textContent = creator.name;
$('avatar').textContent = Array.from(creator.name)[0] ?? '';
$('phone-title').textContent = creator.phoneTitle || creator.name;
$('phone-sub').textContent = '버블';

const ALBUMS = creator.albums.map(a => ({ ...a, re: a.match ? new RegExp(a.match, 'i') : null }));
const albumName = k => ALBUMS.find(a => a.key === k)?.name ?? k;
function goldOf(r) { // album is certain from the channel or exactly one title rule; anything else is open for votes
  const byChannel = ALBUMS.find(a => a.channel && a.channel === r.channel);
  if (byChannel) return byChannel.key;
  const m = ALBUMS.filter(a => a.re && a.re.test(r.title || ''));
  return m.length === 1 ? m[0].key : null;
}

// ---------- helpers ----------
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = mulberry32(20261112);
const gauss = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const flat =(color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.88, ...extra });

// 꾸미기 (room-editor.tsx, through the hooks in section 6): ORIGINAL is the layout as last saved in the database (the page's, or the one the editor just saved via heap:saved).
// It is the editor's 처음으로 target. BASE_LAYOUT is the whole stored layout; the editor merges its items, time and room into it when it saves.
let BASE_LAYOUT = structuredClone(DATA.layout);
let ORIGINAL = { items: (layout.items || []).map(it => ({ ...it })), time: layout.time ?? 'auto' };

// ---------- reels ----------
// A reel carries its linked channel's title (heap_creator_channels); the card back shows it and album rules with `channel` match it.
// Reels with no linked channel fall back to the creator's name, so a `channel` album rule finds nothing for them (title rules still work).
const raw = DATA.reels;
const reels = raw.map(r => ({ ...r, channel: r.channel || creator.name }));
reels.forEach((r, i) => { r.age = reels.length > 1 ? 1 - i / (reels.length - 1) : 0; r.seed = Math.floor(rand() * 1e9); r.gold = goldOf(r); });
const nShorts = raw.filter(r => !r.wide).length, nWide = raw.length - nShorts;

// Fan pieces (landed ones, from the database) lie on the heap from the start; one that lands while the visitor is here drops onto it (poll below). There is no reception box any more.
// TODAY/TOTAL, 다녀감 and the guestbook list are database values too, refreshed by the poll below.
const seoulDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtDay = iso => { const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; const p = Object.fromEntries(seoulDay.formatToParts(d).map(x => [x.type, x.value])); return `${p.year}.${p.month}.${p.day}`; };
let visits = { today: DATA.visits.today, total: DATA.visits.total };
const metaBase = nWide ? `쇼츠 ${nShorts} · 영상 ${nWide}` : `쇼츠 ${nShorts}`;
function renderMeta() { $('meta').textContent = `${metaBase} · TODAY ${visits.today} · TOTAL ${visits.total.toLocaleString('ko-KR')}` + (opts.viewerName ? ` · ${opts.viewerName}` : ''); }
renderMeta();
// 다녀감: the day the creator last came by, "2026.11.12" (Asia/Seoul), or null. From heap_rooms.creator_visited_at.
let creatorDay = typeof DATA.creatorVisit === 'string' && /^\d{4}\.\d{1,2}\.\d{1,2}$/.test(DATA.creatorVisit) ? DATA.creatorVisit : null;
function creatorVisit() { return creatorDay; }
function renderCreatorVisit() { if (creatorDay) { $('visit').textContent = `주인 다녀감 ${creatorDay.split('.').slice(1).join('.')}`; $('visit').hidden = false; } }
renderCreatorVisit();
const fanReelOf = (p, i) => ({ ...p, kind: 'fan', wide: false, title: p.caption, channel: p.by, views: '', age: 0.05, seed: 7000 + i * 131 });
const fanReels = (DATA.pieces || []).map(fanReelOf);
const ytUrl = r => r.wide ? `https://www.youtube.com/watch?v=${r.id}` : `https://www.youtube.com/shorts/${r.id}`;
const ytShort = r => r.wide ? `youtube.com/watch?v=${r.id}` : `youtube.com/shorts/${r.id}`;

const filed = new Map(); // reel id → { album }: only cards whose album is certain from the title or channel
for (const r of reels) if (r.gold) filed.set(r.id, { album: r.gold });

// ====================================================================================
// 2. Card textures
// ====================================================================================
const PX = 340, PXB = 220, S = 0.26;
const DIMS = {
  tall: { CW: 1, B: 0.06, PW: 0.88, PH: 0.88 * 16 / 9, STRIP: 0.30 },
  wide: { CW: 1.5, B: 0.05, PW: 1.4, PH: 1.4 * 9 / 16, STRIP: 0.27 },
};
for (const d of Object.values(DIMS)) { d.CH = d.B + d.PH + d.STRIP; d.w = d.CW * S; d.h = d.CH * S; d.geo = new THREE.PlaneGeometry(d.w, d.h); }

function drawFit(g, img, x, y, w, h, cover) {
  const ia = img.width / img.height, da = w / h;
  if (cover) {
    let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if (ia > da) { sw = img.height * da; sx = (img.width - sw) / 2; } else { sh = img.width / da; sy = (img.height - sh) / 2; }
    g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  } else {
    const dw = ia > da ? w : h * ia, dh = ia > da ? w / ia : h;
    g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
}
function wrap(g, text, maxW) {
  const lines = []; let line = '';
  for (const word of text.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width <= maxW || !line) line = test; else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}
function paper(g, W, H, r, age) {
  g.fillStyle = `hsl(40, ${30 + age * 22}%, ${93 - age * 8}%)`; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(90,70,40,${r() * 0.05})`; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
}
const NO_PHOTO = '#2b2530'; // the photo area of a card or poster whose picture has not arrived, or never will
// Passing a card's own canvas repaints it in place: the seed makes the frame and caption come out the same, only the photo changes.
function drawCard(reel, img, c = document.createElement('canvas')) {
  const d = reel.wide ? DIMS.wide : DIMS.tall, r = mulberry32(reel.seed), age = reel.age;
  const W = Math.round(d.CW * PX), H = Math.round(d.CH * PX);
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  paper(g, W, H, r, age);
  const x0 = d.B * PX, y0 = d.B * PX, w = d.PW * PX, h = d.PH * PX;
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  if (img) drawFit(g, img, x0, y0, w, h, true); else { g.fillStyle = NO_PHOTO; g.fillRect(x0, y0, w, h); }
  g.fillStyle = `rgba(214, 170, 120, ${0.04 + age * 0.12})`; g.fillRect(x0, y0, w, h);
  const sh = g.createLinearGradient(0, y0 + h * 0.78, 0, y0 + h);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = sh; g.fillRect(x0, y0 + h * 0.78, w, h * 0.22);
  const fs = Math.round(Math.min(w, h * 0.6) * 0.075), tx = x0 + fs * 0.8, ty = y0 + h - fs * 0.8;
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.moveTo(tx, ty - fs * 0.8); g.lineTo(tx + fs * 0.62, ty - fs * 0.42); g.lineTo(tx, ty - fs * 0.04); g.closePath(); g.fill();
  g.font = `600 ${fs}px "IBM Plex Sans KR", system-ui, sans-serif`; g.textBaseline = 'alphabetic';
  g.fillText(reel.views || '', tx + fs * 0.9, ty);
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
  const sy = (d.B + d.PH) * PX, maxW = W * 0.84, room = d.STRIP * PX * 0.8;
  g.save(); g.translate(W * 0.08, sy + d.STRIP * PX * 0.12); g.rotate((r() - 0.5) * 0.04);
  g.fillStyle = `rgba(86, 83, 68, ${0.95 - age * 0.25})`; g.textBaseline = 'top';
  let size = Math.round(PX * 0.09), lines;
  for (;;) {
    g.font = `${size}px "Nanum Pen Script", cursive`;
    lines = wrap(g, reel.title || '', maxW);
    if (lines.length * size * 1.05 <= room || size < 16) break;
    size -= 2;
  }
  lines.slice(0, Math.floor(room / (size * 1.05)) || 1).forEach((l, i) => g.fillText(l, 0, i * size * 1.05));
  g.restore();
  return c;
}
function drawBack(reel) {
  const d = reel.wide ? DIMS.wide : DIMS.tall, r = mulberry32(reel.seed + 7);
  const W = Math.round(d.CW * PXB), H = Math.round(d.CH * PXB);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  paper(g, W, H, r, reel.age * 0.6);
  const pad = W * 0.09, maxW = W - pad * 2;
  g.textBaseline = 'top';
  g.fillStyle = C.accent; g.font = `${Math.round(PXB * 0.1)}px "Nanum Pen Script", cursive`;
  g.fillText(reel.channel, pad, pad);
  g.fillStyle = 'rgba(86, 83, 68, 0.95)';
  let size = Math.round(PXB * 0.095), y = pad + PXB * 0.15, lines;
  const room = H * (reel.wide ? 0.42 : 0.5);
  for (;;) { g.font = `${size}px "Nanum Pen Script", cursive`; lines = wrap(g, reel.title || '', maxW); if (lines.length * size * 1.05 <= room || size < 12) break; size -= 1; }
  lines.forEach((l, i) => g.fillText(l, pad, y + i * size * 1.05));
  y += lines.length * size * 1.05 + PXB * 0.04;
  g.font = `${Math.round(PXB * 0.08)}px "Nanum Pen Script", cursive`;
  g.fillText(`조회수 ${reel.views || '-'}${reel.published ? ' · ' + reel.published : ''}`, pad, y);
  g.strokeStyle = 'rgba(86, 83, 68, 0.35)'; g.beginPath(); g.moveTo(pad, H - pad * 2.4); g.lineTo(W - pad, H - pad * 2.4); g.stroke();
  g.fillStyle = 'rgba(86, 83, 68, 0.85)'; g.font = `600 ${Math.max(9, Math.round(PXB * 0.042))}px "IBM Plex Sans KR", sans-serif`;
  ['원본 · ' + ytShort(reel).split('/')[0] + '/', ytShort(reel).split('/').slice(1).join('/')].forEach((l, i) => g.fillText(l, pad, H - pad * 2.1 + i * PXB * 0.05));
  g.save(); g.translate(W - pad - PXB * 0.09, H - pad * 1.6); g.rotate(-0.25);
  g.strokeStyle = C.accent; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, PXB * 0.075, 0, Math.PI * 2); g.stroke();
  g.fillStyle = C.accent; g.font = `600 ${Math.round(PXB * 0.045)}px "IBM Plex Sans KR", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('출처', 0, 0); g.restore();
  return c;
}

// fan pieces: placeholder art, a crayon drawing on paper (the motif is always the default until the fan piece screens are designed)
function crayon(g, pts, color, width, r, closed = false) {
  for (let pass = 0; pass < 3; pass++) {
    g.strokeStyle = color; g.globalAlpha = 0.55 + r() * 0.3; g.lineWidth = width * (0.7 + r() * 0.5); g.lineCap = g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => { const jx = x + (r() - 0.5) * width * 0.8, jy = y + (r() - 0.5) * width * 0.8; if (i) g.lineTo(jx, jy); else g.moveTo(jx, jy); });
    if (closed) g.closePath();
    g.stroke();
  }
  g.globalAlpha = 1;
}
const ring = (cx, cy, rx, ry, n = 24, f = () => 1) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [cx + Math.cos(a) * rx * f(a), cy + Math.sin(a) * ry * f(a)]; });
function drawFanFront(p) {
  const d = DIMS.tall, r = mulberry32(p.seed);
  const W = Math.round(d.CW * PX), H = Math.round(d.CH * PX);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  paper(g, W, H, r, 0);
  const x0 = d.B * PX, y0 = d.B * PX, w = d.PW * PX, h = d.PH * PX, cx = x0 + w / 2, cy = y0 + h * 0.42, s = w * 0.36;
  g.fillStyle = '#fbf5e8'; g.fillRect(x0, y0, w, h);
  for (let i = 0; i < 18; i++) crayon(g, [[x0 + r() * w, y0 + h * 0.85 + r() * h * 0.12], [x0 + r() * w, y0 + h * 0.85 + r() * h * 0.12]], '#9fbf7a', 6, r);
  const M = p.motif;
  if (M === 'heart') {
    const pts = Array.from({ length: 30 }, (_, i) => { const t = i / 30 * Math.PI * 2; return [cx + s * 0.06 * 16 * Math.sin(t) ** 3, cy - s * 0.06 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]; });
    crayon(g, pts, '#d9534f', 9, r, true);
    for (let i = 0; i < 40; i++) { const [a, b] = pts[Math.floor(r() * pts.length)]; crayon(g, [[a, b], [cx + (a - cx) * 0.2, cy + (b - cy) * 0.2]], '#e8837f', 7, r); }
  } else if (M === 'magnet') {
    crayon(g, [[cx - s, cy - s * 0.6], [cx + s, cy - s * 0.6], [cx + s, cy + s * 0.6], [cx - s, cy + s * 0.6]], C.accent, 10, r, true);
    g.fillStyle = C.accent; g.font = `${Math.round(s * 0.42)}px "Nanum Pen Script", cursive`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(creator.name, cx, cy);
    crayon(g, [[cx - s * 0.9, cy - s * 0.85], [cx + s * 0.9, cy - s * 0.85]], '#888', 5, r);
  } else if (M === 'face') {
    crayon(g, ring(cx, cy, s * 0.75, s * 0.85), '#e0a37a', 8, r, true);
    crayon(g, ring(cx, cy - s * 0.35, s * 0.85, s * 0.55, 16, a => (Math.sin(a) < 0 ? 1 : 0.2)), '#4a3328', 12, r);
    crayon(g, [[cx - s * 0.3, cy], [cx - s * 0.22, cy]], '#333', 8, r); crayon(g, [[cx + s * 0.22, cy], [cx + s * 0.3, cy]], '#333', 8, r);
    crayon(g, [[cx - s * 0.25, cy + s * 0.3], [cx, cy + s * 0.42], [cx + s * 0.25, cy + s * 0.3]], '#c0392b', 6, r);
  } else if (M === 'block' || M === 'creeper') {
    const col = M === 'creeper' ? '#5aa64a' : '#c79a4a';
    crayon(g, [[cx - s * 0.8, cy - s * 0.8], [cx + s * 0.8, cy - s * 0.8], [cx + s * 0.8, cy + s * 0.8], [cx - s * 0.8, cy + s * 0.8]], col, 10, r, true);
    for (let i = 0; i < 30; i++) { const y = cy - s * 0.75 + i * s * 0.05; crayon(g, [[cx - s * 0.75, y], [cx + s * 0.75, y]], col, 6, r); }
    if (M === 'creeper') for (const [a, b, ww, hh] of [[-0.5, -0.4, 0.3, 0.3], [0.2, -0.4, 0.3, 0.3], [-0.15, 0, 0.3, 0.45], [-0.35, 0.2, 0.2, 0.4], [0.15, 0.2, 0.2, 0.4]]) { g.fillStyle = '#222'; g.fillRect(cx + a * s, cy + b * s, ww * s, hh * s); }
    else { g.fillStyle = '#fff'; g.font = `${Math.round(s * 0.9)}px "Nanum Pen Script", cursive`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', cx, cy); }
  } else {
    crayon(g, [[cx, cy - s], [cx + s * 0.8, cy - s * 0.2], [cx, cy + s], [cx - s * 0.8, cy - s * 0.2]], '#4fb3c9', 10, r, true);
    crayon(g, [[cx - s * 0.8, cy - s * 0.2], [cx + s * 0.8, cy - s * 0.2]], '#4fb3c9', 6, r);
  }
  g.fillStyle = 'rgba(86,83,68,0.85)'; g.font = `${Math.round(PX * 0.07)}px "Nanum Pen Script", cursive`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText(`${creator.name} ♥`, cx, y0 + h * 0.82);
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
  const sy = (d.B + d.PH) * PX;
  g.fillStyle = 'rgba(86, 83, 68, 0.95)'; g.textAlign = 'left'; g.textBaseline = 'top';
  g.font = `${Math.round(PX * 0.085)}px "Nanum Pen Script", cursive`;
  wrap(g, p.caption, W * 0.84).slice(0, 2).forEach((l, i) => g.fillText(l, W * 0.08, sy + d.STRIP * PX * 0.12 + i * PX * 0.09));
  return c;
}
function drawFanBack(p) {
  const d = DIMS.tall, r = mulberry32(p.seed + 7);
  const W = Math.round(d.CW * PXB), H = Math.round(d.CH * PXB);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  paper(g, W, H, r, 0);
  const pad = W * 0.09; g.textBaseline = 'top';
  g.fillStyle = C.accent; g.font = `${Math.round(PXB * 0.1)}px "Nanum Pen Script", cursive`; g.fillText('팬 작품', pad, pad);
  g.fillStyle = 'rgba(86, 83, 68, 0.95)'; g.font = `${Math.round(PXB * 0.095)}px "Nanum Pen Script", cursive`;
  let y = pad + PXB * 0.16;
  for (const l of [`보낸 사람 · ${p.by}`, p.date, ...wrap(g, p.caption, W - pad * 2)]) { g.fillText(l, pad, y); y += PXB * 0.1; }
  return c;
}

// ====================================================================================
// 3. Renderer, lights, walls (built from layout)
// ====================================================================================
const canvas = document.createElement('canvas'); canvas.id = 'scene';
canvas.setAttribute('aria-label', '크리에이터의 미니룸. 탁자 위에 지난 영상들이 사진처럼 쌓여 있고, 영사기와 휴대폰, 앨범 책장, 다른 방으로 가는 문이 있다');
$('scene-host').appendChild(canvas);
cleanups.push(() => canvas.remove());
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.olive);
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
const controls = new OrbitControls(camera, canvas);
cleanups.push(() => { controls.dispose(); disposeScene(scene); renderer.dispose(); renderer.forceContextLoss(); });
controls.enabled = false; controls.enableDamping = true; controls.enablePan = false;
controls.minDistance = 0.6; controls.maxDistance = 4; controls.maxPolarAngle = 1.25;
const hemi = new THREE.HemisphereLight(0xffe6c4, 0x5a4a38, 0.7); scene.add(hemi);
const fill = new THREE.DirectionalLight(0xffe2bd, 0.35); fill.position.set(8, 6, 8); scene.add(fill);

// floor plan: layout.room = { w, d } in units, each clamped to 6..12. A missing field is the original 8 x 8.
// RX, RZ are the half-extents: the floor runs -RX..RX along x and -RZ..RZ along z.
const roomDim = v => THREE.MathUtils.clamp(Number(v) || 8, 6, 12);
const RX = roomDim(layout.room?.w) / 2, RZ = roomDim(layout.room?.d) / 2;
const WALL_H = 4, Yv = new THREE.Vector3(0, 1, 0), Xv = new THREE.Vector3(1, 0, 0);
function box(w, h, d, mat, x, y, z, { cast = true, receive = true, parent = scene } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
}
// walls: "back" runs along x at z = -RZ (faces +z); "left" runs along z at x = -RX (faces +x)
// half: the wall's half-length. A position along a wall ("at", u) is measured from the wall's centre.
const WALLS = {
  back: { point: (u, y, off = 0) => new THREE.Vector3(u, y, -RZ + off), half: RX, rotY: 0, n: new THREE.Vector3(0, 0, 1), axis: new THREE.Vector3(1, 0, 0) },
  left: { point: (u, y, off = 0) => new THREE.Vector3(-RX + off, y, u), half: RZ, rotY: Math.PI / 2, n: new THREE.Vector3(1, 0, 0), axis: new THREE.Vector3(0, 0, 1) },
};
const onWall = (wall, u, y, off, obj) => { obj.position.copy(WALLS[wall].point(u, y, off)); obj.rotation.y = WALLS[wall].rotY; scene.add(obj); return obj; };

// floor boards, 1 unit wide along x; the last one is narrower when w is not a whole number
for (let i = 0; i < 2 * RX; i++) { const bw = Math.min(1, 2 * RX - i); box(bw, 0.1, 2 * RZ, flat(C.floor[i % C.floor.length]), -RX + i + bw / 2, -0.05, 0, { cast: false }); }
const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * RX, 2 * RZ), new THREE.MeshBasicMaterial({ visible: false }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);

const WIN = layout.window && { ...layout.window, u0: layout.window.at - layout.window.w / 2, u1: layout.window.at + layout.window.w / 2, y0: layout.window.y - layout.window.h / 2, y1: layout.window.y + layout.window.h / 2 };
const DOOR = layout.door && { ...layout.door, u0: layout.door.at - 0.5, u1: layout.door.at + 0.5, y0: 0, y1: 2.15 };
const wallMat = flat(C.wall), trimMat = flat(C.trim);
function buildWall(wall) {
  const openings = [WIN, DOOR].filter(o => o && o.wall === wall).sort((a, b) => a.u0 - b.u0);
  const slab = (u0, u1, y0, y1) => {
    if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return;
    const p = WALLS[wall].point((u0 + u1) / 2, (y0 + y1) / 2, -0.1);
    if (wall === 'back') box(u1 - u0, y1 - y0, 0.2, wallMat, p.x, p.y, p.z);
    else box(0.2, y1 - y0, u1 - u0, wallMat, p.x, p.y, p.z);
  };
  const trim = (u0, u1) => {
    if (u1 - u0 < 0.01) return;
    const p = WALLS[wall].point((u0 + u1) / 2, 0.45, 0.03);
    if (wall === 'back') box(u1 - u0, 0.9, 0.06, trimMat, p.x, p.y, p.z, { cast: false });
    else box(0.06, 0.9, u1 - u0, trimMat, p.x, p.y, p.z, { cast: false });
  };
  const H = WALLS[wall].half;
  let cur = -H - 0.2, tcur = wall === 'back' ? -H + 0.06 : -H;
  for (const o of openings) {
    slab(cur, o.u0, 0, WALL_H); slab(o.u0, o.u1, 0, o.y0); slab(o.u0, o.u1, o.y1, WALL_H);
    cur = o.u1;
    if (o.y0 < 0.9) { trim(tcur, o.u0); tcur = o.u1; }
  }
  slab(cur, H, 0, WALL_H); trim(tcur, H);
}
buildWall('back'); buildWall('left');

// window: frame, glass, a dusk backdrop and a tree outside; the sun comes through it
const frameMat = flat(C.paper);
let SUN_DIR = new THREE.Vector3(1.6, -2.55, 3.5).normalize(), shaftCorners = null;
let SUN_H = new THREE.Vector3(1.6, 0, 3.5), skyTex = null; // SUN_H: the sun's horizontal heading (tied to the window); applyTime sets its drop
if (WIN) {
  const W = WALLS[WIN.wall], ww = WIN.w, wh = WIN.h;
  const g = new THREE.Group();
  box(ww + 0.16, 0.08, 0.3, frameMat, 0, -wh / 2 - 0.02, 0.08, { parent: g });
  box(ww + 0.16, 0.08, 0.22, frameMat, 0, wh / 2 + 0.02, 0.02, { parent: g });
  for (const sx of [-ww / 2 - 0.04, 0, ww / 2 + 0.04]) box(0.07, wh, 0.12, frameMat, sx, 0, -0.1, { parent: g });
  box(ww, 0.05, 0.1, frameMat, 0, 0, -0.1, { parent: g });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshStandardMaterial({ color: '#ffd9a8', transparent: true, opacity: 0.12, roughness: 0.1 }));
  glass.position.z = -0.1; g.add(glass);
  onWall(WIN.wall, WIN.at, WIN.y, 0, g);
  const skyC = document.createElement('canvas'); skyC.width = 4; skyC.height = 128;
  { const sg = skyC.getContext('2d'), gr = sg.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#f2c48f'); gr.addColorStop(0.55, '#e9a46b'); gr.addColorStop(1, '#8a7a55'); sg.fillStyle = gr; sg.fillRect(0, 0, 4, 128); }
  skyTex = new THREE.CanvasTexture(skyC); skyTex.colorSpace = THREE.SRGBColorSpace;
  onWall(WIN.wall, WIN.at, 0.9, -3.5, new THREE.Mesh(new THREE.PlaneGeometry(2 * W.half, 3.6), new THREE.MeshBasicMaterial({ map: skyTex })));
  const out = new THREE.Mesh(new THREE.PlaneGeometry(2 * W.half, 3.4), flat('#6b6a4a')); out.rotation.x = -Math.PI / 2;
  const og = new THREE.Group(); og.add(out); out.position.set(0, -0.12, 0); onWall(WIN.wall, WIN.at, 0, -1.9, og);
  const tree = new THREE.Group();
  box(0.18, 1.6, 0.18, flat(C.woodDark), 0, 0.7, 0, { parent: tree });
  for (const [x, y, z, s] of [[0, 1.9, 0, 0.75], [-0.5, 1.6, 0.2, 0.55], [0.5, 1.7, -0.1, 0.6]]) {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), flat(C.leaf)); c.position.set(x, y, z); c.castShadow = true; tree.add(c);
  }
  onWall(WIN.wall, WIN.at + 0.5, 0, -2.2, tree);
  const toCentre = Math.sign(-WIN.at) || 1;
  SUN_H = W.n.clone().multiplyScalar(3.5).addScaledVector(W.axis, 1.6 * toCentre);
  SUN_DIR = SUN_H.clone().add(new THREE.Vector3(0, -2.55, 0)).normalize();
  shaftCorners = [[WIN.u0, WIN.y0], [WIN.u1, WIN.y0], [WIN.u1, WIN.y1], [WIN.u0, WIN.y1]].map(([u, y]) => W.point(u, y, 0));
}
const sun = new THREE.DirectionalLight(0xffb066, 3.0);
if (WIN) sun.target.position.copy(WALLS[WIN.wall].point(WIN.at, WIN.y, 0)).addScaledVector(SUN_DIR, WIN.y / -SUN_DIR.y);
sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, -11);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const SHADOW = Math.max(8, 2 * RX, 2 * RZ); // half-size of the sun's shadow frustum: 8 for the original room, wider for a longer one
Object.assign(sun.shadow.camera, { left: -SHADOW, right: SHADOW, top: SHADOW, bottom: -SHADOW, near: 1, far: 30 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.012;
scene.add(sun, sun.target);
let moteGeo = null, shaftGeo = null, shaftMat = null, moteMat = null; const moteSeeds = [];
if (shaftCorners) {
  const shaftFloor = shaftCorners.map(p => p.clone().addScaledVector(SUN_DIR, p.y / -SUN_DIR.y));
  const v = [...shaftCorners, ...shaftFloor].flatMap(p => [p.x, p.y, p.z]);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  sg.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  shaftGeo = sg; shaftMat = new THREE.MeshBasicMaterial({ color: '#ffc98a', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(sg, shaftMat));
  moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(90 * 3), 3));
  for (let i = 0; i < 90; i++) moteSeeds.push([rand(), rand(), rand(), rand() * 6.28]);
  moteMat = new THREE.PointsMaterial({ color: '#ffe0b0', size: 0.03, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  scene.add(new THREE.Points(moteGeo, moteMat));
}
const tA = new THREE.Vector3(), tB = new THREE.Vector3();
function stepMotes(t) {
  if (!moteGeo) return;
  const pos = moteGeo.attributes.position;
  moteSeeds.forEach(([u, v, w, ph], i) => {
    tA.lerpVectors(shaftCorners[0], shaftCorners[1], u).lerp(tB.lerpVectors(shaftCorners[3], shaftCorners[2], u), v);
    tA.addScaledVector(SUN_DIR, (tA.y / -SUN_DIR.y) * ((w + t * 0.01) % 1) * 0.9);
    pos.setXYZ(i, tA.x + Math.sin(t * 0.3 + ph) * 0.05, tA.y + Math.sin(t * 0.21 + ph * 2) * 0.05, tA.z);
  });
  pos.needsUpdate = true;
}

// door to other rooms
const doorParts = [];
let DOOR_SPOT = null;
if (DOOR) {
  const g = new THREE.Group();
  const panel = box(0.92, 2.1, 0.06, flat(C.accent), 0, 1.05, -0.1, { parent: g });
  for (const sx of [-0.52, 0.52]) box(0.08, 2.2, 0.24, frameMat, sx, 1.1, -0.06, { parent: g });
  box(1.12, 0.1, 0.24, frameMat, 0, 2.2, -0.06, { parent: g });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), flat('#d8b27a', { metalness: 0.4, roughness: 0.4 })); knob.position.set(0.34, 1.0, -0.04); g.add(knob);
  const sign = document.createElement('canvas'); sign.width = 256; sign.height = 96;
  { const sgc = sign.getContext('2d'); sgc.fillStyle = C.paper; sgc.fillRect(0, 0, 256, 96); sgc.fillStyle = C.ink; sgc.font = '44px "Nanum Pen Script", cursive'; sgc.textAlign = 'center'; sgc.textBaseline = 'middle'; sgc.fillText('다른 방', 128, 50); }
  const st = new THREE.CanvasTexture(sign); st.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshStandardMaterial({ map: st })); plate.position.set(0, 1.62, -0.065); g.add(plate);
  onWall(DOOR.wall, DOOR.at, 0, 0, g);
  doorParts.push(panel, knob, plate);
  DOOR_SPOT = WALLS[DOOR.wall].point(DOOR.at, 0, 0.85);
}

// ====================================================================================
// 4. Furniture from layout.items (each builder works in local space: front = +z)
//   Everything built from the items sits in one group. buildItems(items) disposes that group and builds a new one,
//   so the furniture can change without a remount. Walls, floor, table and heap are not part of it.
// ====================================================================================
// OBST: the fixed walk obstacles (the table first, then the guestbook stand). Each item's own obstacle is in ITEMS.obst.
const OBST = [], shelfParts = [];
let SHELF = null;
// shadeNow: a lamp shade's glow at the current hour (section 4b sets it) · irand: where the builders draw their random numbers
let shadeNow = 0.9, irand = rand;
// Lamps: the hand-built lamp and any model whose catalogue category is "lamp". Each adds { light, shades } to its build's lamps:
// a PointLight inside the shade (or null) and the shade's materials. Section 4b sets every shade's glow and frame() every light's
// intensity, so all the lamps in a room follow the hour together.
// Only MAX_LAMP_LIGHTS lamps get a light: the hand-built ones first, then the lamp models, each in list order. A lamp past that glows and lights nothing.
const MAX_LAMP_LIGHTS = 3, LAMP_GLOW = '#ffb767';
let CATALOGUE = null; // catalogue.json once it has been read (getCatalogue below)
const isLampModel = it => it.type === 'model' && CATALOGUE?.models?.find(m => m.id === it.model)?.category === 'lamp';
function lampLight(build, it) {
  const hand = build.items.filter(o => o.type === 'lamp');
  const rank = it.type === 'lamp' ? hand.indexOf(it) : hand.length + build.items.filter(isLampModel).indexOf(it);
  return rank < MAX_LAMP_LIGHTS ? new THREE.PointLight(0xffb86b, 3.2, 9, 1.2) : null;
}
const bookCols = [C.accent, C.olive, '#c9a46a', '#7d8a5a', '#d8c7a8', '#8a4f33'];
function pottedPlant(parent, x, z, y, s) {
  box(0.36 * s, 0.34 * s, 0.36 * s, flat(C.accent), x, y + 0.17 * s, z, { parent });
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 * s, 0), flat([C.leaf, C.leaf2, C.leafDark][i % 3]));
    const a = i * 1.26;
    leaf.position.set(x + Math.cos(a) * 0.14 * s, y + (0.45 + irand() * 0.25) * s, z + Math.sin(a) * 0.14 * s);
    leaf.scale.set(1, 1.5, 0.6); leaf.rotation.set(irand(), a, irand() * 0.5); leaf.castShadow = true; parent.add(leaf);
  }
}
const BUILD = {
  bed(g) {
    box(2.8, 0.3, 1.4, flat(C.woodB), 0, 0.15, 0, { parent: g });
    box(2.7, 0.18, 1.3, flat(C.paper), 0, 0.39, 0, { parent: g });
    box(1.6, 0.06, 1.36, flat(C.accent), 0.45, 0.5, 0, { parent: g });
    box(0.6, 0.16, 0.45, flat('#f7f1e6'), -1.0, 0.56, 0, { parent: g });
    return { hw: 1.6, hd: 0.95 };
  },
  shelf(g, it, build) {
    const wood = flat(C.woodDark), add = m => { shelfParts.push(m); return m; };
    add(box(1.6, 2.2, 0.12, wood, 0, 1.1, -0.22, { parent: g }));
    for (const sx of [-0.77, 0.77]) add(box(0.06, 2.2, 0.5, wood, sx, 1.1, 0, { parent: g }));
    for (let s = 0; s < 3; s++) {
      add(box(1.6, 0.05, 0.5, wood, 0, 0.27 + s * 0.7, 0, { parent: g }));
      if (s === 1) continue;
      for (let b = 0; b < 6; b++) { const h = 0.35 + irand() * 0.15; add(box(0.16, h, 0.3, flat(bookCols[(s * 6 + b) % bookCols.length]), 0.6 - b * 0.22, 0.3 + s * 0.7 + h / 2, 0.02, { parent: g })); }
    }
    add(box(1.6, 0.05, 0.5, wood, 0, 2.2, 0, { parent: g }));
    pottedPlant(g, 0, 0, 2.22, 0.7);
    if (it.fn?.kind === 'keepsake') keepsakeObject(g, it, build, 'standee', 0.52, 2.225, 0.06); // the shelf top's keepsake
    SHELF = { group: g, albums: [] };
    ALBUMS.forEach((a, i) => {
      const lx = -0.57 + i * 0.38;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.52, 0.36), flat(a.color));
      m.position.set(lx, 0.995 + 0.26, 0); m.castShadow = m.receiveShadow = true; m.userData.album = a.key;
      const lc = document.createElement('canvas'); lc.width = 96; lc.height = 360;
      const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.41), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.9 }));
      label.position.set(lx, 0.995 + 0.26, 0.181); label.userData.album = a.key;
      g.add(m, label); add(m); add(label);
      SHELF.albums.push({ ...a, mesh: m, label, lc, lt, lx });
    });
    return { hw: 0.85, hd: 0.55 };
  },
  plant(g, it) { const s = it.size || 1; pottedPlant(g, 0, 0, 0, s); return { hw: 0.44 * s, hd: 0.44 * s }; },
  snake(g) {
    box(0.34, 0.4, 0.34, flat(C.olive), 0, 0.2, 0, { parent: g });
    for (let i = 0; i < 6; i++) { const b = box(0.07, 0.8 + irand() * 0.5, 0.03, flat([C.leaf, C.leafDark][i % 2]), (irand() - 0.5) * 0.2, 0.75, (irand() - 0.5) * 0.2, { parent: g }); b.rotation.set((irand() - 0.5) * 0.3, irand() * 3, (irand() - 0.5) * 0.3); }
    return { hw: 0.4, hd: 0.4 };
  },
  lamp(g, it, build) {
    box(0.3, 0.04, 0.3, flat(C.olive), 0, 0.02, 0, { parent: g });
    box(0.04, 1.7, 0.04, flat(C.olive), 0, 0.87, 0, { parent: g });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.3, 8, 1, true), new THREE.MeshStandardMaterial({ color: '#f6dcb2', emissive: LAMP_GLOW, emissiveIntensity: shadeNow, side: THREE.DoubleSide, flatShading: true }));
    shade.position.y = 1.8; g.add(shade);
    const light = lampLight(build, it);
    if (light) { light.position.y = 1.72; g.add(light); }
    build.lamps.push({ light, shades: [shade.material] });
    return { hw: 0.35, hd: 0.35 };
  },
  books(g) {
    for (let i = 0; i < 4; i++) { const b = box(0.42, 0.08, 0.3, flat(bookCols[(i + 2) % bookCols.length]), 0, 0.04 + i * 0.08, 0, { parent: g }); b.rotation.y = (irand() - 0.5) * 0.5; }
    return { hw: 0.45, hd: 0.4 };
  },
};

// ---------- slots: item.fn (one function, many skins) ----------
// An item that carries a function in the layout (item.fn, checked by the server: src/lib/heap/slots.ts) can be clicked in room mode.
//   pc        opens the links panel: fn.links, or the room's creator.json links when the item has none of its own
//   keepsake  a picture with a name, date, caption and link. On a wall frame (type "frame"), or as a standee on the top of a shelf-like item.
// ITEMS.slots lists them ({ it, fn, start? }) and ITEMS.slotMeshes holds the meshes a click can hit (each has userData.slot).
let slotsLive = false; // true once the fonts are ready: the keepsake textures paint with their own fonts and load their pictures from then on
const KS = { tall: { cw: 180, ch: 320, strip: 44 }, wide: { cw: 320, ch: 180, strip: 40 } }; // canvas pixels: the picture and the name strip under it
// What the link says about the picture: id is the YouTube video (its own thumbnail), tall is a Short, host is a plain card's source.
function keepsakeLook(fn) {
  let host = '', hit = null;
  if (fn.link && opts.isWebLink(fn.link)) {
    try { host = new URL(fn.link).hostname.replace(/^www\./, ''); } catch {}
    hit = opts.parseLink?.(fn.link) ?? null;
  }
  const yt = hit && hit.platform === 'youtube' ? hit : null;
  return { id: yt ? yt.externalId : null, tall: !!yt && yt.wide === false, host };
}
const ksDay = d => (typeof d === 'string' ? d.replace(/-/g, '.') : '');
function paintKeepsake(canvas, fn, look, img) {
  const k = look.tall ? KS.tall : KS.wide, W = k.cw, H = k.ch + k.strip, g = canvas.getContext('2d'), B = 8;
  g.clearRect(0, 0, W, H);
  paper(g, W, H, mulberry32(11), 0.3);
  const x0 = B, y0 = B, w = W - 2 * B, h = k.ch - B;
  const plain = !look.id; // a post that is not YouTube, or no link at all: a titled card
  if (plain) {
    g.fillStyle = '#e6d8bf'; g.fillRect(x0, y0, w, h);
    g.fillStyle = 'rgba(86, 83, 68, 0.95)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = Math.round(h * 0.3), lines;
    for (;;) { g.font = `${size}px "Nanum Pen Script", cursive`; lines = wrap(g, fn.name || '', w * 0.86); if (lines.length * size * 1.05 <= h * 0.8 || size < 14) break; size -= 2; }
    lines.forEach((l, i) => g.fillText(l, W / 2, y0 + h / 2 + (i - (lines.length - 1) / 2) * size * 1.05));
  } else {
    g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    if (img) drawFit(g, img, x0, y0, w, h, true); else { g.fillStyle = NO_PHOTO; g.fillRect(x0, y0, w, h); }
    g.fillStyle = 'rgba(214, 170, 120, 0.1)'; g.fillRect(x0, y0, w, h);
    g.restore();
  }
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
  // the strip: the name under a picture, or (plain card) the date or the source
  const sub = plain ? (ksDay(fn.date) || look.host) : fn.name;
  if (sub) {
    g.fillStyle = 'rgba(86, 83, 68, 0.95)'; g.textAlign = 'left'; g.textBaseline = 'middle';
    let size = Math.round(k.strip * 0.62);
    for (; size > 10; size -= 1) { g.font = `${size}px "Nanum Pen Script", cursive`; if (g.measureText(sub).width <= W * 0.86) break; }
    g.fillText(sub, W * 0.07, k.ch + k.strip * 0.52);
  }
}
// shape 'frame': flat on a wall, centred on (x, y, z) in the item's local space · 'standee': leaning back a little on a small base, bottom at y
function keepsakeObject(g, it, build, shape, x, y, z) {
  const fn = it.fn?.kind === 'keepsake' ? it.fn : { kind: 'keepsake', name: '' }; // a frame with no keepsake yet is an empty frame
  const look = keepsakeLook(fn), k = look.tall ? KS.tall : KS.wide, W = k.cw, H = k.ch + k.strip;
  const pw = shape === 'frame' ? (look.tall ? 0.55 : 0.95) : (look.tall ? 0.2 : 0.32), ph = pw * H / W, rim = shape === 'frame' ? 0.045 : 0.03;
  const grp = new THREE.Group(), wood = flat(C.woodDark);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const frame = box(pw + 2 * rim, ph + 2 * rim, 0.04, wood, 0, 0, 0.02, { cast: shape !== 'frame', parent: grp });
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })); pic.position.z = 0.042; grp.add(pic);
  if (shape === 'frame') grp.position.set(x, y, z);
  else {
    box(pw + 0.08, 0.02, 0.1, wood, x, y + 0.01, z, { parent: g });
    grp.position.set(x, y + 0.02 + (ph + 2 * rim) / 2, z - 0.01); grp.rotation.x = -0.12;
  }
  g.add(grp);
  paintKeepsake(canvas, fn, look, null);
  if (!it.fn) return;
  const slot = { it, fn, started: false, start() { // called once the fonts are ready (or at once after that)
    if (slot.started || build !== ITEMS) return;
    slot.started = true; paintKeepsake(canvas, fn, look, null); tex.needsUpdate = true;
    if (look.id) ksLoad(build, look, look.tall ? ['hqdefault'] : ['mqdefault'], img => { if (build === ITEMS) { paintKeepsake(canvas, fn, look, img); tex.needsUpdate = true; } });
  } };
  for (const m of [frame, pic]) { m.userData.slot = slot; build.slotMeshes.push(m); }
  build.slots.push(slot);
  if (slotsLive) slot.start();
}
// a keepsake's own picture: the video's thumbnail, cropped to its shape. A thumbnail that is missing leaves the placeholder.
// ksPics keeps the finished pictures (by video and shape) for the life of the room, so a rebuild asks the network for nothing it already has.
// An Image still downloading belongs to its build (build.loads): the next build cancels it instead of letting requests pile up.
const ksPics = new Map();
function ksLoad(build, look, files, done) {
  const key = `${look.id}:${look.tall ? 't' : 'w'}`;
  if (ksPics.has(key)) return done(ksPics.get(key));
  const im = new Image(); im.crossOrigin = 'anonymous';
  const end = ok => {
    im.onload = im.onerror = null; inFlight.delete(im); build.loads.delete(im);
    if (disposed) return;
    if (!ok && files.length > 1) return ksLoad(build, look, files.slice(1), done);
    try { if (ok) { const pic = cropToShape(im, { wide: !look.tall }); ksPics.set(key, pic); done(pic); } } catch (e) { console.error('[heap-room]', e); }
  };
  im.onload = () => end(im.naturalWidth > 120); // a missing thumbnail answers 404 with a 120px placeholder that still fires load
  im.onerror = () => end(false);
  inFlight.add(im); build.loads.add(im); im.src = thumbUrl({ id: look.id }, files[0]);
}
BUILD.frame = (g, it, build) => { keepsakeObject(g, it, build, 'frame', 0, it.y ?? 1.9, 0); return {}; };
function startSlots() { slotsLive = true; for (const s of ITEMS.slots) s.start?.(); }

// ---------- models: { type: 'model', model: <catalogue id>, x, z, rot, y, tint } ----------
// <modelBase>catalogue.json lists the GLB files (Kenney Furniture Kit, CC0). A model is fetched and parsed once per mount,
// shifted so that the item's x, z is the centre of its footprint and its base rests on the floor, then cloned for each item that uses it.
// It shows up when it has loaded; the room does not wait for it.
//   y     (default 0) lifts a piece, to stand it on other furniture
//   tint  (default true) recolours it to the room palette by material name; false keeps the file's own colours
const MODEL_BASE = opts.modelBase ?? dataBase.replace(/[^/]+\/$/, 'models/');
const MODEL_SCALE = 2.0; // the kit is built at about 1 unit per floor tile, half this room's scale
const darkAccent = '#' + new THREE.Color(C.accent).multiplyScalar(0.55).getHexString();
// material name → colour. A name that is missing here (glass) is left alone. This is the base look of every model.
// Wood takes the hand-built table's two browns (top and legs), so a wooden frame reads apart from its fabric, which stays on the accent.
// Kept as one plain object so a per-creator theme can replace it later.
const TINT = {
  wood: C.woodB, woodDark: C.woodDark, carpet: C.accent, carpetDarker: darkAccent, carpetBlue: C.olive, carpetWhite: C.paper, _defaultMat: C.paper,
  plant: C.leaf, lamp: '#f6dcb2', fur: C.woodB, metal: '#a39d90', metalLight: '#c9c3b6', metalMedium: '#8f8a7e', metalDark: '#4a463e',
};
// MODELS: catalogue id → Promise of { root, entry, size } or null · KEPT: geometries and materials the cache owns · modelRoots: the parsed scenes
const MODELS = new Map(), KEPT = new Set(), modelRoots = [];
let catalogueP = null, gltfP = null;
cleanups.push(() => { for (const r of modelRoots) disposeScene(r); });
const getCatalogue = () => catalogueP ??= getJSON(MODEL_BASE + 'catalogue.json').then(c => CATALOGUE = c).catch(e => { if (!disposed) console.error('[heap-room]', e); return null; });
function loadModel(id) {
  if (!MODELS.has(id)) MODELS.set(id, (async () => {
    const entry = (await getCatalogue())?.models?.find(m => m.id === id);
    if (!entry) throw new Error(`model "${id}" is not in the catalogue`);
    gltfP ??= import('three/addons/loaders/GLTFLoader.js').then(m => new m.GLTFLoader());
    const [loader, res] = await Promise.all([gltfP, fetch(MODEL_BASE + entry.file, { signal: ac.signal })]);
    if (!res.ok) throw new Error(`${entry.file}: ${res.status}`);
    const root = (await loader.parseAsync(await res.arrayBuffer(), '')).scene;
    if (disposed) { disposeScene(root); return null; } // dispose() ran while this was loading
    modelRoots.push(root);
    root.traverse(o => { if (o.isMesh) { KEPT.add(o.geometry); for (const m of [].concat(o.material)) KEPT.add(m); } });
    const bb = new THREE.Box3().setFromObject(root, true), mid = bb.getCenter(new THREE.Vector3());
    root.position.set(-mid.x, -bb.min.y, -mid.z); // the file's own node transforms stay as they are; the whole model shifts
    return { root, entry, size: bb.getSize(new THREE.Vector3()).multiplyScalar(MODEL_SCALE) };
  })().catch(e => { if (!disposed) console.error('[heap-room]', e); return null; }));
  return MODELS.get(id);
}
BUILD.model = (g, it, build) => {
  loadModel(it.model).then(m => {
    if (!m || disposed || build !== ITEMS) return; // a failed load, or the items were replaced while it loaded
    const inst = m.root.clone(), rug = m.entry.category === 'rug', lamp = m.entry.category === 'lamp', own = new Map(), shades = [];
    inst.traverse(o => {
      if (!o.isMesh) return;
      const col = it.tint !== false && TINT[o.material.name], glow = lamp && o.material.name === 'lamp';
      if (col || glow) { // a copy of the material for this instance, tinted and (a lamp's shade) glowing; the cached original stays as the file has it
        if (!own.has(o.material)) {
          const c = o.material.clone();
          if (col) c.color.set(col);
          if (glow) { c.emissive.set(LAMP_GLOW); c.emissiveIntensity = shadeNow; }
          own.set(o.material, c);
        }
        o.material = own.get(o.material);
        if (glow) shades.push(o);
      }
      o.castShadow = !rug && !o.material.transparent; o.receiveShadow = true;
    });
    const hold = new THREE.Group();
    hold.scale.setScalar(MODEL_SCALE); hold.position.y = (it.y || 0) + (rug ? 0.012 : 0); // a rug lies just above the floor so the two do not flicker
    hold.add(inst); g.add(hold);
    if (it.fn?.kind === 'keepsake') keepsakeObject(g, it, build, 'standee', 0, (it.y || 0) + m.size.y, 0); // on top of the shelf-like piece
    else if (it.fn?.kind === 'pc') { const slot = { it, fn: it.fn }; inst.traverse(o => { if (o.isMesh) { o.userData.slot = slot; build.slotMeshes.push(o); } }); build.slots.push(slot); }
    if (shades.length) { // the light sits at the centre of the shade: the box around the vertices the shade's own triangles use
      const light = lampLight(build, it), bb = new THREE.Box3(), v = new THREE.Vector3(); // (a model's meshes share one vertex buffer)
      if (light) {
        g.updateMatrixWorld(true);
        for (const o of shades) {
          const pos = o.geometry.getAttribute('position'), idx = o.geometry.index;
          for (let i = 0, n = idx ? idx.count : pos.count; i < n; i++) bb.expandByPoint(v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(o.matrixWorld));
        }
        g.add(light); g.worldToLocal(bb.getCenter(light.position));
      }
      build.lamps.push({ light, shades: [...new Set(shades.map(o => o.material))] });
    }
    if (rug || it.y) return; // a rug is walked over; a piece standing on other furniture adds no obstacle of its own
    const swap = Math.round((it.rot || 0) / 90) % 2 !== 0, hw = m.size.x / 2 + 0.2, hd = m.size.z / 2 + 0.2;
    build.obst.push({ x: it.x, z: it.z, hw: swap ? hd : hw, hd: swap ? hw : hd });
  });
  return {};
};

// ITEMS: what the last buildItems() made. group: every object built from the items · obst: their walk obstacles · items: the list itself
//   lamps: its lamps, { light, shades } each (see MAX_LAMP_LIGHTS above)
//   slots: its functions, { it, fn, start? } each · slotMeshes: the meshes a click can hit, each with userData.slot (see the slots section above)
//   loads: the keepsake thumbnails this build still waits for (cancelled when the next build replaces it)
let ITEMS = { group: null, obst: [], items: [], lamps: [], slots: [], slotMeshes: [], loads: new Set() };
function buildItems(items, first = false) {
  if (ITEMS.group) { for (const l of ITEMS.lamps) l.light?.dispose(); scene.remove(ITEMS.group); disposeScene(ITEMS.group, KEPT); }
  shelfParts.length = 0; SHELF = null;
  for (const im of ITEMS.loads) { im.onload = im.onerror = null; im.src = ''; inFlight.delete(im); } // the replaced build's thumbnails stop here
  ITEMS.loads.clear();
  const build = ITEMS = { group: new THREE.Group(), obst: [], items, lamps: [], slots: [], slotMeshes: [], loads: new Set() };
  scene.add(build.group);
  items.forEach((it, i) => {
    // The first build draws from the room's shared sequence, as the room always has. A rebuild seeds each item by its place in the list,
    // so it leaves that sequence alone and an item keeps its look from one rebuild to the next.
    irand = first ? rand : mulberry32(7919 * (i + 1));
    const g = new THREE.Group(), rot = THREE.MathUtils.degToRad(it.rot || 0);
    const fp = BUILD[it.type]?.(g, it, build); if (!fp) return;
    g.position.set(it.x, 0, it.z); g.rotation.y = rot; build.group.add(g); g.updateMatrixWorld(true);
    if (!fp.hw) return; // a model adds its obstacle when it has loaded
    const swap = Math.round((it.rot || 0) / 90) % 2 !== 0;
    build.obst.push({ x: it.x, z: it.z, hw: swap ? fp.hd : fp.hw, hd: swap ? fp.hw : fp.hd });
  });
}
buildItems(layout.items || [], true);
const shelfLocal = v => SHELF.group.localToWorld(v.clone());

// ====================================================================================
// 4b. Time of day: the room's light follows the hour.
//   ?time=       on the page URL wins (demos, testing): a decimal hour 0-24 (?time=6.5), a name, or auto.
//   layout.time  in layout.json: "auto", a name, or a number (decimal hour). A missing field means "auto".
//   Names: night | dawn | morning | noon | golden | dusk.
//   auto = the current hour in Asia/Seoul wherever the viewer is, re-read about once a minute from frame().
//   The golden row holds the room's original fixed look: applyTime(17.5) sets exactly the values the scene is built with.
// ====================================================================================
const NIGHT = { sun: '#aebfe0', sunI: 0.35, drop: 3.2, sky: ['#2e3350', '#4a4358', '#2e2b24'], hemiSky: '#d6c0aa', hemiGround: '#453a30', hemiI: 0.52, fillI: 0.2, lampI: 4.4, shadeI: 1.3, shaft: '#b9c8e6', shaftO: 0.012, mote: '#d5def0', moteO: 0.06, exposure: 1.26, bg: 0.4 };
// h: hour · sun, sunI, drop: sun colour, intensity, and how steeply it falls (higher = higher sun) · sky: backdrop gradient top, middle, bottom
// hemi*, fillI: ambient · lampI, shadeI: lamp light and its shade's glow · shaft*, mote*: light shaft and dust · bg: scale on the backdrop colour
const TIMES = [
  { h: 4.5, ...NIGHT },
  { h: 6, sun: '#ffb38a', sunI: 1.4, drop: 1.9, sky: ['#e9c3b4', '#f4c9a0', '#7d7458'], hemiSky: '#f3d6c2', hemiGround: '#54463a', hemiI: 0.55, fillI: 0.26, lampI: 1.2, shadeI: 0.5, shaft: '#ffc9a8', shaftO: 0.05, mote: '#ffe0c8', moteO: 0.4, exposure: 1.14, bg: 0.75 },
  { h: 9, sun: '#ffe2b8', sunI: 2.6, drop: 3.4, sky: ['#cfe0dc', '#f3e3c4', '#8c8558'], hemiSky: '#fff0d8', hemiGround: '#62523e', hemiI: 0.9, fillI: 0.45, lampI: 0, shadeI: 0.12, shaft: '#ffe6bf', shaftO: 0.045, mote: '#fff0d4', moteO: 0.45, exposure: 1.08, bg: 1 },
  { h: 13, sun: '#fff1d6', sunI: 2.6, drop: 6, sky: ['#bcd6dc', '#e6e6d2', '#8f8c62'], hemiSky: '#fff3e0', hemiGround: '#6a5a46', hemiI: 1.0, fillI: 0.5, lampI: 0, shadeI: 0.12, shaft: '#fff0d0', shaftO: 0.025, mote: '#fff4dc', moteO: 0.25, exposure: 1.05, bg: 1 },
  { h: 17.5, sun: '#ffb066', sunI: 3.0, drop: 2.55, sky: ['#f2c48f', '#e9a46b', '#8a7a55'], hemiSky: '#ffe6c4', hemiGround: '#5a4a38', hemiI: 0.7, fillI: 0.35, lampI: 3.2, shadeI: 0.9, shaft: '#ffc98a', shaftO: 0.07, mote: '#ffe0b0', moteO: 0.7, exposure: 1.12, bg: 1 },
  { h: 19.5, sun: '#e8875a', sunI: 0.9, drop: 1.7, sky: ['#a98a9a', '#e08f62', '#5f5744'], hemiSky: '#e8c4a8', hemiGround: '#4e4034', hemiI: 0.48, fillI: 0.22, lampI: 4.0, shadeI: 1.15, shaft: '#f0a57c', shaftO: 0.035, mote: '#f6c9a4', moteO: 0.3, exposure: 1.15, bg: 0.75 },
  { h: 21.5, ...NIGHT },
].map(k => Object.fromEntries(Object.entries(k).map(([key, v]) => [key, toRGB(v)])));
const TIME_NAMES = { night: 1, dawn: 6, morning: 9, noon: 13, golden: 17.5, dusk: 19.5 };
function toRGB(v) { return typeof v === 'string' ? [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16)) : Array.isArray(v) ? v.map(toRGB) : v; }
const mix = (a, b, t) => Array.isArray(a) ? a.map((x, i) => mix(x, b[i], t)) : a + (b - a) * t;
function timeAt(hour) { // the two neighbouring rows, eased; on a row's own hour the result is that row exactly
  let i = TIMES.length - 1;
  TIMES.forEach((k, n) => { if (k.h <= hour) i = n; });
  const a = TIMES[i], b = TIMES[(i + 1) % TIMES.length];
  const t = ((hour - a.h + 24) % 24) / ((b.h - a.h + 24) % 24 || 24), s = t * t * (3 - 2 * t);
  return Object.fromEntries(Object.keys(a).map(key => [key, mix(a[key], b[key], s)]));
}
function parseTime(v) { // → an hour in [0, 24), 'auto', or null when it says nothing usable
  const s = typeof v === 'string' ? v.trim().toLowerCase() : v;
  if (s === 'auto') return 'auto';
  if (typeof s === 'string' && s in TIME_NAMES) return TIME_NAMES[s];
  const n = typeof s === 'number' ? s : typeof s === 'string' && s ? Number(s) : NaN;
  return Number.isFinite(n) ? ((n % 24) + 24) % 24 : null;
}
let timeSpec = parseTime(new URLSearchParams(location.search).get('time')) ?? parseTime(layout.time) ?? 'auto';
let timeChoice = parseTime(layout.time) == null ? 'auto' : layout.time; // the room's own choice, as it was given; ?time= does not change it. heap:get reports it.
const seoulFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function seoulHour() {
  const part = Object.fromEntries(seoulFmt.formatToParts(new Date()).map(p => [p.type, Number(p.value)]));
  return (part.hour % 24) + part.minute / 60;
}
const bgBase = scene.background.clone();
const setCol = (c, [r, g, b]) => c.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
const css = c => `rgb(${c.map(Math.round).join(',')})`;
let lampBase = 3.2, nextClock = 0, readGlow = 0;
function applyTime(hour) {
  const k = timeAt(hour);
  renderer.toneMappingExposure = k.exposure;
  scene.background.copy(bgBase).multiplyScalar(k.bg);
  setCol(hemi.color, k.hemiSky); setCol(hemi.groundColor, k.hemiGround); hemi.intensity = k.hemiI;
  fill.intensity = k.fillI;
  readGlow = Math.min(0.4, Math.max(0, (1.6 - k.sunI) * 0.3)); // a card in hand lights itself when the room is dim; 0 from morning to golden hour
  setCol(sun.color, k.sun); sun.intensity = k.sunI;
  SUN_DIR.copy(SUN_H).setY(-k.drop).normalize();
  if (WIN) sun.target.position.copy(WALLS[WIN.wall].point(WIN.at, WIN.y, 0)).addScaledVector(SUN_DIR, WIN.y / -SUN_DIR.y);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, -11);
  if (shaftGeo) { // the shaft's floor end and the motes follow the sun's new drop
    const pos = shaftGeo.attributes.position;
    shaftCorners.forEach((p, i) => { tA.copy(p).addScaledVector(SUN_DIR, p.y / -SUN_DIR.y); pos.setXYZ(4 + i, tA.x, tA.y, tA.z); });
    pos.needsUpdate = true; shaftGeo.computeBoundingSphere(); moteGeo.boundingSphere = null;
    setCol(shaftMat.color, k.shaft); shaftMat.opacity = k.shaftO;
    setCol(moteMat.color, k.mote); moteMat.opacity = k.moteO;
  }
  if (skyTex) {
    const sg = skyTex.image.getContext('2d'), gr = sg.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, css(k.sky[0])); gr.addColorStop(0.55, css(k.sky[1])); gr.addColorStop(1, css(k.sky[2])); sg.fillStyle = gr; sg.fillRect(0, 0, 4, 128);
    skyTex.needsUpdate = true;
  }
  lampBase = k.lampI; // frame() gives it to every lamp's light
  shadeNow = k.shadeI;
  for (const l of ITEMS.lamps) for (const s of l.shades) s.emissiveIntensity = shadeNow;
}
function tickClock() { // auto only: called from frame(), so it stops with the rAF loop on dispose (no timer of its own)
  if (timeSpec !== 'auto' || Date.now() < nextClock) return;
  nextClock = Date.now() + 60000;
  applyTime(seoulHour());
}
if (timeSpec === 'auto') tickClock(); else applyTime(timeSpec);
// Live change without a reload: root.dispatchEvent(new CustomEvent('heap:time', { detail: 'dusk' | 6.5 | 'auto' }))
on(root, 'heap:time', e => {
  const spec = parseTime(e.detail);
  if (spec == null) return;
  timeSpec = spec; timeChoice = e.detail; nextClock = 0;
  if (timeSpec === 'auto') tickClock(); else applyTime(timeSpec);
});

// table, rug, cushion, mug, phone (positions relative to layout.table)
const TABLE = { x: layout.table.x, z: layout.table.z, w: 2.6, d: 1.8, top: 0.56 };
const rugC = document.createElement('canvas'); rugC.width = 256; rugC.height = 192;
{ const g = rugC.getContext('2d'); g.fillStyle = C.paper; g.fillRect(0, 0, 256, 192);
  [[C.accent, 14, 16], [C.olive, 40, 6], [C.accent, 150, 10], [C.olive, 168, 4]].forEach(([c, y, h]) => { g.fillStyle = c; g.fillRect(0, y, 256, h); });
  for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(80,60,40,${Math.random() * 0.06})`; g.fillRect(Math.random() * 256, Math.random() * 192, 2, 1); } }
const rugTex = new THREE.CanvasTexture(rugC); rugTex.colorSpace = THREE.SRGBColorSpace;
const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.9), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
rug.rotation.x = -Math.PI / 2; rug.position.set(TABLE.x, 0.006, TABLE.z + 0.15); rug.receiveShadow = true; scene.add(rug);
const tableTop = box(TABLE.w, 0.08, TABLE.d, flat(C.woodB), TABLE.x, TABLE.top - 0.04, TABLE.z);
for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.12, TABLE.top - 0.08, 0.12, flat(C.woodDark), TABLE.x + sx * (TABLE.w / 2 - 0.15), (TABLE.top - 0.08) / 2, TABLE.z + sz * (TABLE.d / 2 - 0.15));
OBST.unshift({ x: TABLE.x, z: TABLE.z, hw: TABLE.w / 2 + 0.25, hd: TABLE.d / 2 + 0.25 });
const SEAT = new THREE.Vector3(TABLE.x, 0, TABLE.z + TABLE.d / 2 + 0.5);
box(0.75, 0.1, 0.75, flat(C.accent), SEAT.x, 0.05, SEAT.z, { cast: false });
const MUG = { x: TABLE.x + 1.05, z: TABLE.z + 0.6 };
const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.12, 8), flat(C.paper)); mug.position.set(MUG.x, TABLE.top + 0.06, MUG.z); mug.castShadow = true; scene.add(mug);
const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.052, 8), flat('#4a2f1e')); coffee.rotation.x = -Math.PI / 2; coffee.position.set(MUG.x, TABLE.top + 0.115, MUG.z); scene.add(coffee);
const PHONE = { x: TABLE.x + 0.68, z: TABLE.z + 0.62 };
const phoneBody = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.018, 0.32), flat(C.ink, { roughness: 0.5 }));
phoneBody.position.set(PHONE.x, TABLE.top + 0.009, PHONE.z); phoneBody.rotation.y = 0.35; phoneBody.castShadow = true;
const phoneGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.145, 0.29), new THREE.MeshStandardMaterial({ color: '#efe6d6', emissive: '#f3d9b0', emissiveIntensity: 0.6 }));
phoneGlow.rotation.set(-Math.PI / 2, 0, 0.35); phoneGlow.position.set(PHONE.x, TABLE.top + 0.0185, PHONE.z);
const phoneDot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 10), new THREE.MeshBasicMaterial({ color: C.accent }));
phoneDot.rotation.set(-Math.PI / 2, 0, 0.35); phoneDot.position.set(PHONE.x + 0.03, TABLE.top + 0.019, PHONE.z - 0.08);
scene.add(phoneBody, phoneGlow, phoneDot);
const phoneParts = [phoneBody, phoneGlow, phoneDot];

// guestbook stand (방명록) beside the door
const bookParts = [];
let BOOK_SPOT = null;
const GB = layout.guestbook ?? (DOOR ? { wall: DOOR.wall, at: DOOR.at - 0.95 } : null);
if (GB) {
  const g = new THREE.Group();
  bookParts.push(box(0.5, 0.78, 0.36, flat(C.woodB), 0, 0.39, 0, { parent: g }));
  const pageL = box(0.22, 0.02, 0.3, flat(C.paper), -0.11, 0.8, 0.02, { parent: g }), pageR = box(0.22, 0.02, 0.3, flat(C.paper), 0.11, 0.8, 0.02, { parent: g });
  pageL.rotation.z = 0.12; pageR.rotation.z = -0.12;
  const pen = box(0.015, 0.015, 0.16, flat(C.accent), 0.14, 0.83, 0.02, { parent: g }); pen.rotation.y = 0.5;
  bookParts.push(pageL, pageR, pen);
  onWall(GB.wall, GB.at, 0, 0.32, g);
  const p = WALLS[GB.wall].point(GB.at, 0, 0.32);
  OBST.push({ x: p.x, z: p.z, hw: 0.32, hd: 0.32 });
  BOOK_SPOT = WALLS[GB.wall].point(GB.at, 0, 0.95);
}

// projector and screen
const SCR = { wall: layout.screen.wall, at: layout.screen.at, y: 2.4, w: 1.6, h: 0.9 };
const projC = document.createElement('canvas'); projC.width = 640; projC.height = 360;
const projTex = new THREE.CanvasTexture(projC); projTex.colorSpace = THREE.SRGBColorSpace;
const screenIdle = flat(C.paper), screenOn = new THREE.MeshBasicMaterial({ map: projTex });
const screenG = new THREE.Group();
box(SCR.w + 0.14, SCR.h + 0.14, 0.05, flat(C.olive), 0, 0, 0.025, { cast: false, parent: screenG });
const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCR.w, SCR.h), screenIdle); screen.position.z = 0.06; screen.receiveShadow = true; screenG.add(screen);
onWall(SCR.wall, SCR.at, SCR.y, 0, screenG); screenG.updateMatrixWorld(true);
const SCREEN_C = screen.getWorldPosition(new THREE.Vector3());
const side = layout.table.projector === 'right' ? 1 : -1;
const PROJ = new THREE.Vector3(TABLE.x + side * 0.85, TABLE.top, TABLE.z - 0.5);
const proj = new THREE.Group(); proj.position.copy(PROJ);
proj.rotation.y = Math.atan2(-(SCREEN_C.x - PROJ.x), -(SCREEN_C.z - PROJ.z));
const metal = flat('#3f3d32', { roughness: 0.55, metalness: 0.3 });
const pBody = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.36), flat(C.olive)); pBody.position.y = 0.12;
const pLens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 10), metal); pLens.rotation.x = Math.PI / 2; pLens.position.set(0, 0.13, -0.23);
const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), new THREE.MeshBasicMaterial({ color: '#5b5a4a' })); lensGlass.position.set(0, 0.13, -0.291); lensGlass.rotation.y = Math.PI;
const pFoot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.3), metal); pFoot.position.y = 0.015;
const reelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.025, 12);
const reelA = new THREE.Mesh(reelGeo, flat(C.accent)), reelB = new THREE.Mesh(reelGeo, flat(C.accent));
reelA.rotation.z = reelB.rotation.z = Math.PI / 2; reelA.position.set(0, 0.33, -0.1); reelB.position.set(0, 0.33, 0.1);
const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.3), metal); arm.position.set(0, 0.26, 0);
const projParts = [pBody, pLens, lensGlass, pFoot, reelA, reelB, arm];
for (const m of projParts) { m.castShadow = true; proj.add(m); }
scene.add(proj); proj.updateMatrixWorld(true);
const LENS = lensGlass.getWorldPosition(new THREE.Vector3());
const SLOT = { pos: proj.localToWorld(new THREE.Vector3(0, 0, 0.3)), quat: proj.quaternion.clone() };
const beamGeo = new THREE.BufferGeometry();
{
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => screen.localToWorld(new THREE.Vector3(sx * SCR.w / 2, sy * SCR.h / 2, 0.01)));
  beamGeo.setAttribute('position', new THREE.Float32BufferAttribute([LENS, ...corners].flatMap(p => [p.x, p.y, p.z]), 3));
  beamGeo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);
}
const beamMat = new THREE.MeshBasicMaterial({ color: '#fff1d6', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
scene.add(new THREE.Mesh(beamGeo, beamMat));
const projLight = new THREE.SpotLight(0xfff0d6, 0, 0, 0.22, 0.5, 0);
projLight.position.copy(LENS); projLight.target.position.copy(SCREEN_C); scene.add(projLight, projLight.target);
function drawProjection(reel, img) {
  const g = projC.getContext('2d'), W = projC.width, H = projC.height;
  g.fillStyle = '#1b1812'; g.fillRect(0, 0, W, H);
  if (img) drawFit(g, img, 0, 0, W, H, !!reel.wide);
  g.fillStyle = 'rgba(255, 214, 160, 0.08)'; g.fillRect(0, 0, W, H);
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  projTex.needsUpdate = true;
}
const viewsNum = v => { const n = parseFloat(v); return v?.includes('만') ? n * 1e4 : v?.includes('천') ? n * 1e3 : n || 0; };

// ---------- character ----------
const me = new THREE.Group();
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
if (DOOR_SPOT) { me.position.copy(DOOR_SPOT); me.rotation.y = Math.atan2(WALLS[DOOR.wall].n.x, WALLS[DOOR.wall].n.z); }
else me.position.set(2.2, 0, 2.4);
scene.add(me);

// ====================================================================================
// 5. The heap: shaped pile. Each card rests on whatever is under its corners and edges.
// ====================================================================================
const cards = []; // stack order, bottom → top
const pickables = [];
const EXCL = [{ x: PROJ.x, z: PROJ.z, r: 0.42 }, { x: MUG.x, z: MUG.z, r: 0.18 }, { x: PHONE.x, z: PHONE.z, r: 0.26 }];
const GAP = 0.0035, MAX_SLOPE = 0.32;
const _inv = new THREE.Quaternion(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
// height of a resting card's surface above (x, z), or -Infinity if (x, z) is outside it
function surfaceAt(c, x, z) {
  const { pos, quat } = c.userData.home, d = c.userData.d;
  _n.set(0, 0, 1).applyQuaternion(quat);
  if (Math.abs(_n.y) < 0.2) return -Infinity;
  const y = pos.y - (_n.x * (x - pos.x) + _n.z * (z - pos.z)) / _n.y;
  _v.set(x - pos.x, y - pos.y, z - pos.z).applyQuaternion(_inv.copy(quat).invert());
  return Math.abs(_v.x) <= d.w / 2 && Math.abs(_v.y) <= d.h / 2 ? y : -Infinity;
}
function supportAt(x, z, below) {
  let h = TABLE.top;
  for (const c of below) h = Math.max(h, surfaceAt(c, x, z) + GAP);
  return h;
}
const SAMPLES = [-1, 0, 1].flatMap(a => [-1, 0, 1].map(b => [a * 0.47, b * 0.47]));
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function restPose(card, below) {
  const { x, z, yaw, faceUp } = card.userData.place, d = card.userData.d;
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const pts = SAMPLES.map(([a, b]) => { const lx = a * d.w, lz = b * d.h; const dx = lx * cs + lz * sn, dz = -lx * sn + lz * cs; return { dx, dz, h: supportAt(x + dx, z + dz, below) }; });
  // least-squares slope of the support, then lift the plane until nothing pokes through
  const mean = pts.reduce((s, p) => s + p.h, 0) / pts.length;
  let sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
  for (const p of pts) { sxx += p.dx * p.dx; szz += p.dz * p.dz; sxz += p.dx * p.dz; sxh += p.dx * (p.h - mean); szh += p.dz * (p.h - mean); }
  const det = sxx * szz - sxz * sxz || 1;
  let a = (sxh * szz - szh * sxz) / det, b = (szh * sxx - sxh * sxz) / det;
  const m = Math.hypot(a, b); if (m > MAX_SLOPE) { a *= MAX_SLOPE / m; b *= MAX_SLOPE / m; }
  let c = -Infinity; for (const p of pts) c = Math.max(c, p.h - a * p.dx - b * p.dz);
  const up = new THREE.Vector3(-a, 1, -b).normalize();
  const quat = _q1.setFromUnitVectors(Yv, up).clone()
    .multiply(_q2.setFromAxisAngle(Yv, yaw))
    .multiply(new THREE.Quaternion().setFromAxisAngle(Xv, faceUp ? -Math.PI / 2 : Math.PI / 2));
  return { pos: new THREE.Vector3(x, c + 0.0015, z), quat };
}
function clampPlace(p) {
  p.x = THREE.MathUtils.clamp(p.x, TABLE.x - TABLE.w / 2 + 0.18, TABLE.x + TABLE.w / 2 - 0.18);
  p.z = THREE.MathUtils.clamp(p.z, TABLE.z - TABLE.d / 2 + 0.18, TABLE.z + TABLE.d / 2 - 0.18);
  for (const e of EXCL) {
    const dx = p.x - e.x, dz = p.z - e.z, dd = Math.hypot(dx, dz);
    if (dd < e.r) { p.x = e.x + (dd ? dx / dd : 1) * e.r; p.z = e.z + (dd ? dz / dd : 0) * e.r; }
  }
  return p;
}
const inPile = c => c !== held && c !== loaded && c !== presenting && c !== dragging && !c.userData.fly;
// recompute every resting pose bottom → top; cards whose support changed fall into place
function settle(instant = false) {
  const placed = [];
  for (const c of cards) {
    if (!inPile(c)) continue;
    const prev = c.userData.home;
    c.userData.home = restPose(c, placed);
    placed.push(c);
    if (instant || !prev) { c.position.copy(c.userData.home.pos); c.quaternion.copy(c.userData.home.quat); c.userData.anim = null; continue; }
    const moved = prev.pos.distanceTo(c.userData.home.pos) > 0.002 || prev.quat.angleTo(c.userData.home.quat) > 0.01;
    if (moved && !c.userData.anim) startAnim(c, 'settle');
  }
}
function toTop(c) { cards.splice(cards.indexOf(c), 1); cards.push(c); }
// motion: 'drop' arcs down with a flutter and a small bounce; 'settle' falls under gravity
function startAnim(c, kind) {
  c.userData.anim = { kind, t: 0, dur: kind === 'drop' ? 0.6 : 0.28, from: c.position.clone(), fromQ: c.quaternion.clone(), axis: new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize(), arc: kind === 'drop' ? 0.08 : 0 };
}
const _fq = new THREE.Quaternion();
function stepAnim(c, dt) {
  const A = c.userData.anim, H = c.userData.home;
  A.t = Math.min(1, A.t + dt / A.dur);
  const t = A.t;
  if (A.kind === 'drop') {
    const e = 1 - Math.pow(1 - t, 3);
    c.position.lerpVectors(A.from, H.pos, e);
    const fall = t < 0.8 ? (t / 0.8) ** 2 : 1;
    c.position.y = A.from.y + (H.pos.y - A.from.y) * fall + Math.sin(Math.PI * Math.min(1, t / 0.8)) * A.arc
      + (t > 0.8 ? Math.sin((t - 0.8) / 0.2 * Math.PI) * 0.006 : 0);
    c.quaternion.slerpQuaternions(A.fromQ, H.quat, e);
    c.quaternion.premultiply(_fq.setFromAxisAngle(A.axis, 0.28 * (1 - t) * Math.sin(t * 17)));
  } else {
    const fall = t * t;
    c.position.lerpVectors(A.from, H.pos, fall);
    c.quaternion.slerpQuaternions(A.fromQ, H.quat, fall);
  }
  if (t >= 1) { c.position.copy(H.pos); c.quaternion.copy(H.quat); c.userData.anim = null; }
}

function makeCard(reel) {
  const aniso = renderer.capabilities.getMaxAnisotropy(), d = reel.wide ? DIMS.wide : DIMS.tall, fan = reel.kind === 'fan';
  const frontC = fan ? drawFanFront(reel) : drawCard(reel, null);
  const tex = new THREE.CanvasTexture(frontC); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
  const btex = new THREE.CanvasTexture(fan ? drawFanBack(reel) : drawBack(reel)); btex.colorSpace = THREE.SRGBColorSpace; btex.anisotropy = aniso;
  const card = new THREE.Group();
  const front = new THREE.Mesh(d.geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  const back = new THREE.Mesh(d.geo, new THREE.MeshStandardMaterial({ map: btex, roughness: 0.9 }));
  back.rotation.y = Math.PI; back.position.z = -0.001;
  for (const m of [front, back]) { m.castShadow = m.receiveShadow = true; m.userData.card = card; pickables.push(m); }
  card.add(front, back);
  // img: the best picture the card has so far (a fan piece is its own drawing) · tier: that picture's tier, -1 before any lands · asked: tiers already requested
  Object.assign(card.userData, { reel, d, img: fan ? frontC : null, tier: -1, asked: [], front: tex, place: clampPlace({ x: TABLE.x + gauss() * 0.42, z: TABLE.z + gauss() * 0.28, yaw: rand() * Math.PI * 2, faceUp: rand() > 0.1 }) });
  cards.push(card); scene.add(card);
  return card;
}
function buildHeap() {
  const made = reels.map(reel => makeCard(reel));
  for (const p of fanReels) { const c = makeCard(p); c.userData.place.faceUp = true; }
  settle(true);
  requestPile(FAR);
  // posters: the three most-viewed shorts. Each paints from its card's picture, so it fills in and sharpens as that card's tiers land.
  const top3 = made.filter(c => !c.userData.reel.wide).sort((a, b) => viewsNum(b.userData.reel.views) - viewsNum(a.userData.reel.views)).slice(0, 3);
  (layout.posters?.at || []).forEach((u, k) => {
    const card = top3[k];
    if (!card) return;
    const pc = document.createElement('canvas'); pc.width = 202; pc.height = 360; // the size of the near tier's picture
    const t = card.userData.poster = new THREE.CanvasTexture(pc); t.colorSpace = THREE.SRGBColorSpace;
    paintPoster(card); request(card, NEAR);
    const g = new THREE.Group();
    box(0.74, 1.2, 0.05, flat(C.woodDark), 0, 0, 0.025, { cast: false, parent: g });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.07), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })); p.position.z = 0.055; g.add(p);
    onWall(layout.posters.wall, u, 2.5, 0, g);
  });
}
function paintPoster(card) {
  const { poster, img } = card.userData, W = poster.image.width, H = poster.image.height, g = poster.image.getContext('2d');
  if (img) drawFit(g, img, 0, 0, W, H, true); else { g.fillStyle = NO_PHOTO; g.fillRect(0, 0, W, H); }
  poster.needsUpdate = true;
}

// ====================================================================================
// 5b. Thumbnails: each card shows the video's chosen thumbnail in three tiers, loaded lazily and sharpened in place
//   far    mqdefault (320x180, ~7 KB): every card, top of the pile first, once the room is on screen
//   near   hqdefault (480x360, ~14 KB): the wall posters, and every card once the visitor sits at the table
//   close  oardefault (a Short's chosen vertical thumbnail, ~160 KB) or hq720 (a wide video): only a card that is picked up
// A card never drops back a tier. A tier that fails leaves the card as it was.
// ====================================================================================
const FAR = 0, NEAR = 1, CLOSE = 2, MAX_LOADS = 6;
const thumbFiles = (reel, tier) => tier === FAR ? ['mqdefault'] : tier === NEAR ? ['hqdefault'] : reel.wide ? ['hq720', 'hqdefault'] : ['oardefault'];
const loadQueue = [], inFlight = new Set(); // { card, tier } jobs waiting in load order · Images still downloading
let loading = 0;
cleanups.push(() => { loadQueue.length = 0; for (const im of inFlight) { im.onload = im.onerror = null; im.src = ''; } inFlight.clear(); });
// YouTube pads its small thumbnails: a Short's picture sits in the centre of a 16:9 or 4:3 frame between blurred sides,
// and a wide video's hqdefault has black bars above and below. The picture is the centred part with the reel's own shape.
function cropToShape(im, reel) {
  const a = reel.wide ? 16 / 9 : 9 / 16, iw = im.naturalWidth, ih = im.naturalHeight;
  if (Math.abs(iw / ih / a - 1) < 0.03) return im;
  const sw = Math.min(iw, ih * a), sh = Math.min(ih, iw / a);
  const c = document.createElement('canvas'); c.width = Math.round(sw); c.height = Math.round(sh);
  c.getContext('2d').drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  return c;
}
function landed(card, tier, im) {
  const u = card.userData;
  if (u.tier >= tier) return;
  u.tier = tier; u.img = cropToShape(im, u.reel);
  drawCard(u.reel, u.img, u.front.image); u.front.needsUpdate = true;
  if (u.poster) paintPoster(card);
  if (card === loaded) drawProjection(u.reel, u.img);
  if (card === phonePic?.card) showPhonePic();
}
function load(card, tier, files) {
  const im = new Image(); im.crossOrigin = 'anonymous';
  const end = ok => {
    im.onload = im.onerror = null; inFlight.delete(im);
    if (disposed) return;
    if (!ok && files.length > 1) return load(card, tier, files.slice(1)); // the tier's fallback file takes over the same slot
    try { if (ok) landed(card, tier, im); } catch (e) { console.error('[heap-room]', e); }
    loading--; pump();
  };
  im.onload = () => end(im.naturalWidth > 120); // a missing thumbnail answers 404 with a 120px placeholder that still fires load
  im.onerror = () => end(false);
  inFlight.add(im); im.src = thumbUrl(card.userData.reel, files[0]);
}
function pump() {
  while (loading < MAX_LOADS && loadQueue.length) {
    const { card, tier } = loadQueue.shift();
    if (card.userData.tier >= tier) continue; // a sharper picture is already on the card
    loading++; load(card, tier, thumbFiles(card.userData.reel, tier));
  }
}
// now = true skips the queue: the one card the visitor has just picked up
function request(card, tier, now = false) {
  const u = card.userData;
  if (disposed || u.reel.kind === 'fan' || u.asked[tier] || u.tier >= tier) return;
  u.asked[tier] = true;
  if (now) { loading++; load(card, tier, thumbFiles(u.reel, tier)); } else { loadQueue.push({ card, tier }); pump(); }
}
function requestPile(tier) { for (let i = cards.length - 1; i >= 0; i--) request(cards[i], tier); } // cards runs bottom → top, so this asks top first

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
let SORT_CAM = null, SHELF_SPOT = null, SHELF_STAND = null, shelfFacing = 0;
function linkShelf() { // the album shelf's camera and standing spots; runs again after every buildItems()
  SORT_CAM = SHELF_SPOT = SHELF_STAND = null;
  if (!SHELF) return;
  const albumsC = shelfLocal(new THREE.Vector3(0, 1.05, 0));
  SORT_CAM = { pos: shelfLocal(new THREE.Vector3(-1.6, 2.2, 2.5)), target: albumsC };
  SHELF_SPOT = shelfLocal(new THREE.Vector3(-0.75, 0, 0.9)); SHELF_SPOT.y = 0;
  SHELF_STAND = shelfLocal(new THREE.Vector3(1.0, 0, 0.95)); SHELF_STAND.y = 0;
  shelfFacing = SHELF.group.rotation.y + Math.PI;
}
linkShelf();
let mode = 'room', camGoal = null, held = null, heldFlipped = false, loaded = null, hovered = null, presenting = null, dragging = null;
let walkTo = null, arrive = null, waypoints = [];
const hint = $('hint');
const HINTS = {
  room: '방향키·WASD 또는 바닥을 눌러 걷기 · 탁자, 책장, 문을 눌러 보세요',
  near: 'E 또는 탁자를 눌러 앉기',
  nearShelf: 'E 또는 책장을 눌러 앨범 정리하기',
  nearDoor: 'E 또는 문을 눌러 다른 방으로',
  sit: '사진을 눌러 집기 · 끌어서 옮기기 · 휴대폰을 눌러 버블 열기',
  held: '사진을 눌러 뒤집기 · 영사기를 눌러 상영 · 바깥을 눌러 내려놓기',
  drag: '원하는 곳에 놓으세요',
  needcard: '사진을 먼저 집어 든 다음 영사기를 눌러 보세요',
  watch: '상영 중 · 스크린을 눌러 다시 재생 · Esc로 사진 꺼내기',
  shelf: '앨범을 눌러 안을 보기 · Esc로 물러나기',
  nearBook: 'E 또는 방명록을 눌러 이름 남기기',
};
const setHint = k => { if (hint.dataset.k !== k) { hint.dataset.k = k; hint.textContent = HINTS[k]; } };
const goTo = cam => { camGoal = cam; controls.enabled = false; };

// Live room contents, for a creator's editor. Dispatch on the element given to mountRoom once the room is up (#status hidden):
//   root.dispatchEvent(new CustomEvent('heap:items', { detail: itemsArray }))
//     replaces everything built from layout.items. Same item shapes as layout.json.
//   root.dispatchEvent(new CustomEvent('heap:get', { detail: cb }))
//     calls cb({ room: { w, d }, layout, items, catalogue, table, door, window, time, original }) once the model catalogue has been read
//     (catalogue is null if it could not be). items is a copy of the list now in the room; catalogue is catalogue.json as it is.
//     table { x, z, w, d }, door { wall, at } and window { wall, at, w } are the fixed parts a floor plan shows (door and window may be null).
//     creatorLinks is the links list of creator.json (the PC's fallback) and linktree its linktree address or null: the editor offers them when an owner sets up a PC.
//     time is the room's time choice as it was given ('auto', a name or an hour); original { items, time } is the layout as last saved in the database;
//     layout is the whole stored layout (a copy): the editor merges its items, time and room into it before saving.
//   root.dispatchEvent(new CustomEvent('heap:saved', { detail: layout }))
//     tells the engine the editor saved this whole layout: it becomes the new original / 처음으로 target.
// Walls, floor, table, heap, projector, phone and guestbook stay as they were built.
on(root, 'heap:items', e => {
  if (!Array.isArray(e.detail)) return;
  buildItems(e.detail.filter(it => it && typeof it === 'object').map(it => ({ ...it })));
  linkShelf(); updateAlbums(); startSlots();
  if (mode === 'sort') { if (SHELF) enterSort(); else exitSort(); }
});
on(root, 'heap:saved', e => {
  const l = e.detail;
  if (!l || typeof l !== 'object' || !Array.isArray(l.items)) return;
  BASE_LAYOUT = structuredClone(l);
  ORIGINAL = { items: l.items.map(it => ({ ...it })), time: l.time ?? 'auto' };
});
on(root, 'heap:get', e => {
  if (typeof e.detail !== 'function') return;
  getCatalogue().then(catalogue => {
    if (disposed) return;
    e.detail({
      room: { w: 2 * RX, d: 2 * RZ }, layout: structuredClone(BASE_LAYOUT), items: ITEMS.items.map(it => ({ ...it })), catalogue,
      table: { x: TABLE.x, z: TABLE.z, w: TABLE.w, d: TABLE.d },
      door: DOOR ? { wall: DOOR.wall, at: DOOR.at } : null, window: WIN ? { wall: WIN.wall, at: WIN.at, w: WIN.w } : null,
      time: timeChoice, original: { items: ORIGINAL.items.map(it => ({ ...it })), time: ORIGINAL.time },
      creatorLinks: creator.links.map(L => ({ ...L })), linktree: creator.linktree ?? null,
    });
  });
});

ALBUMS.forEach((a, i) => {
  const b = document.createElement('button'); b.className = 'btn paper'; b.type = 'button';
  b.innerHTML = `<span class="k">${i + 1}</span>`; b.append(a.name);
  b.addEventListener('click', () => albumAction(a.key));
  $('albumrow').appendChild(b);
});
function syncUI() {
  const seated = mode === 'sit' || mode === 'watch';
  $('stand').hidden = !seated;
  $('flip').hidden = !(mode === 'sit' && held);
  const isFan = c => c?.userData.reel.kind === 'fan';
  $('srclink').hidden = !(mode === 'sit' && held) || isFan(held);
  if (held && !isFan(held)) $('srclink').href = ytUrl(held.userData.reel);
  $('eject').hidden = mode !== 'watch';
  $('ytlink').hidden = mode !== 'watch' || isFan(loaded);
  $('sortexit').hidden = mode !== 'sort';
  $('albumrow').hidden = mode !== 'sort';
  root.dispatchEvent(new CustomEvent('heap:mode', { detail: mode })); // heap-room.tsx shows its 꾸미기 button in room mode only
}

function sit() {
  mode = 'sit'; walkTo = null; arrive = null; waypoints = [];
  me.position.copy(SEAT); me.rotation.y = Math.PI;
  setHint('sit'); goTo(SIT_CAM); syncUI();
  requestPile(NEAR);
}
function stand() {
  if (loaded) eject();
  if (held) putBack();
  mode = 'room'; hovered = null; controls.enabled = false; camGoal = null;
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
function pickUp(c) { held = c; heldFlipped = false; hovered = null; controls.enabled = false; settle(); setHint('held'); syncUI(); request(c, CLOSE, true); glowCard(c, readGlow); }
function dropOnTop(c) { // gently toward the middle of the pile, then fall into place
  const p = c.userData.place;
  c.userData.place = clampPlace({ x: TABLE.x + (p.x - TABLE.x) * 0.5 + gauss() * 0.15, z: TABLE.z + (p.z - TABLE.z) * 0.5 + gauss() * 0.1, yaw: p.yaw + gauss() * 0.6, faceUp: true });
  toTop(c);
}
function putBack() {
  const c = held; held = null; heldFlipped = false; glowCard(c, 0);
  dropOnTop(c); settle(); startAnim(c, 'drop');
  if (!camGoal && mode === 'sit') controls.enabled = true;
  setHint('sit'); syncUI();
}
function flip() { if (held) heldFlipped = !heldFlipped; }
on($('flip'), 'click', flip);

function feed() {
  loaded = held; held = null; heldFlipped = false; mode = 'watch'; glowCard(loaded, 0);
  const { reel, img } = loaded.userData;
  drawProjection(reel, img); screen.material = screenOn;
  if (reel.kind !== 'fan') $('ytlink').href = ytUrl(reel);
  setHint('watch'); goTo(WATCH_CAM); syncUI();
  if (reel.kind !== 'fan') openPlayer(reel); // a fan piece is just projected
}
function eject() {
  closePlayer();
  const c = loaded; loaded = null; dropOnTop(c); settle(); startAnim(c, 'drop');
  screen.material = screenIdle;
  mode = 'sit'; setHint('sit'); goTo(SIT_CAM); syncUI();
}
on($('stand'), 'click', stand);
on($('eject'), 'click', eject);

// official YouTube embed, flat and unobstructed; if this host forbids embeds, fall back to the link out
let embedBlocked = false;
const player = $('player'), frameBox = $('player-frame'), note = $('player-note');
function openPlayer(reel) {
  $('player-title').textContent = reel.title || '';
  frameBox.innerHTML = '';
  note.hidden = !embedBlocked;
  if (!embedBlocked) {
    const avail = Math.max(220, root.clientHeight - 230);
    let w, h;
    if (reel.wide) { w = Math.min(root.clientWidth - 32, 720, avail * 16 / 9); h = w * 9 / 16; }
    else { h = Math.min(avail, 640); w = h * 9 / 16; }
    w = Math.max(200, Math.round(w)); h = Math.max(200, Math.round(h));
    frameBox.style.width = w + 'px'; frameBox.style.height = h + 'px';
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${reel.id}?autoplay=1&playsinline=1&rel=0`;
    f.title = reel.title || 'YouTube video';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    frameBox.appendChild(f);
  } else { frameBox.style.width = frameBox.style.height = '0px'; }
  player.hidden = false;
}
function closePlayer() { frameBox.innerHTML = ''; player.hidden = true; }
on($('player-close'), 'click', closePlayer);
on(document, 'securitypolicyviolation', e => {
  if (!/youtube/.test(e.blockedURI || '')) return;
  embedBlocked = true;
  if (!player.hidden) { frameBox.innerHTML = ''; frameBox.style.width = frameBox.style.height = '0px'; note.hidden = false; }
});

// phone: the way into 버블. A room with no PC still lists the creator's links here, so nothing disappears until the owner puts a PC in.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const link = (text, href) => { const a = el('a', null, text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; };
const safeHref = u => (opts.isSafeLink(u) ? u : null); // the server checks layout links before saving; this is the same check on what the DOM gets
const shortUrl = u => { const t = u.replace(/^(https?:\/\/(www\.)?|mailto:)/i, ''); try { return decodeURIComponent(t); } catch { return t; } };
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
const hasPc = () => ITEMS.items.some(it => it.fn?.kind === 'pc');
let phonePic = null; // { card, im }: the card whose picture the phone shows, so a sharper tier that lands later reaches it
function showPhonePic() {
  const pic = phonePic.card.userData.img; // a canvas (fan drawing, cropped tier) or the close tier's own Image
  if (pic) phonePic.im.src = pic.toDataURL ? pic.toDataURL('image/jpeg', 0.8) : pic.src;
}
function openPhone() {
  const feedEl = $('phone-feed'); feedEl.replaceChildren();
  const bb = el('div', 'bubble');
  bb.appendChild(el('small', null, '크리에이터와 1:1 대화'));
  const open = el('a', null, '버블 열기 →'); open.href = opts.bubbleHref;
  open.addEventListener('click', e => { if (e.button || e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); opts.navigate(opts.bubbleHref); });
  bb.appendChild(open);
  feedEl.appendChild(bb);
  const curCard = held || loaded, cur = curCard?.userData.reel;
  phonePic = null;
  if (cur) {
    const b = el('div', 'bubble');
    b.appendChild(el('small', null, cur.kind === 'fan' ? `지금 보고 있는 팬 작품 · ${cur.by}` : '지금 보고 있는 사진'));
    const im = el('img'); im.crossOrigin = 'anonymous'; im.alt = ''; b.appendChild(im);
    phonePic = { card: curCard, im }; showPhonePic();
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
const openSlot = slot => { if (slot.fn.kind === 'pc') openPc(slot.fn); else if (slot.fn.kind === 'keepsake') openKeepsake(slot.fn); };

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
const gbForm = $('gb-form'); // absent for a signed-out viewer: heap-room.tsx shows a sign-in line instead
if (gbForm) on(gbForm, 'submit', async e => {
  e.preventDefault();
  if (gbBusy) return;
  const name = $('gb-name').value.trim();
  if (!name) { $('gb-name').focus(); return; }
  gbBusy = true; $('gb-submit').disabled = true; $('gb-msg').textContent = '';
  try {
    const res = await opts.addGuestbook(name);
    if (disposed) return;
    if (res.ok) {
      gbRows.set(res.entry.id, res.entry);
      $('gb-name').value = '';
      renderGuestbook(); toast(`${res.entry.name}님, 다녀가셨어요`);
    } else $('gb-msg').textContent = res.message;
  } catch {
    if (!disposed) $('gb-msg').textContent = '지금은 남기지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
  } finally { gbBusy = false; if (!disposed) $('gb-submit').disabled = false; }
});
on($('gb-close'), 'click', () => { $('guestbook').hidden = true; });

// polling: what others changed (guestbook rows, visit counts, 다녀감, landed pieces) every opts.pollMs while the tab is visible.
// The first cursor is the snapshot's serverTime; each reply carries the next. Overlapping rows are merged by id.
let cursor = DATA.serverTime, polling = false, pollTimer = 0;
async function poll() {
  if (disposed || polling) return;
  polling = true;
  try {
    const res = await fetch(`/api/heap/rooms/${encodeURIComponent(opts.roomUuid)}/changes?since=${encodeURIComponent(cursor)}`, { cache: 'no-store', signal: ac.signal });
    if (!res.ok || disposed) return;
    const d = await res.json();
    if (disposed) return;
    if (typeof d.cursor === 'string') cursor = d.cursor;
    if (d.visits && Number.isFinite(d.visits.today) && Number.isFinite(d.visits.total)) { visits = { today: d.visits.today, total: d.visits.total }; renderMeta(); }
    if (typeof d.creatorVisitedAt === 'string') { const day = fmtDay(d.creatorVisitedAt); if (day && day !== creatorDay) { creatorDay = day; renderCreatorVisit(); } }
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
    if (!disposed && e?.name !== 'AbortError') console.warn('[heap-room] poll', e);
  } finally { polling = false; }
}
function schedulePoll() {
  clearTimeout(pollTimer);
  if (disposed || document.hidden) return;
  pollTimer = setTimeout(async () => { await poll(); schedulePoll(); }, opts.pollMs);
}
on(document, 'visibilitychange', () => { if (document.hidden) clearTimeout(pollTimer); else { poll().then(schedulePoll); } });
cleanups.push(() => clearTimeout(pollTimer));

// rooms: the door lists the other rooms; jumping fades out and hands the chosen id to opts.onNavigate
function openRooms() {
  const list = $('roomlist'); list.innerHTML = '';
  for (const r of ROOMS) {
    const b = el('button'); b.type = 'button'; b.disabled = r.id === roomId;
    const left = el('span'); left.appendChild(el('b', null, r.name)); left.appendChild(el('br')); left.appendChild(el('small', null, r.blurb || ''));
    b.appendChild(left); b.appendChild(el('small', null, r.id === roomId ? '지금 있는 방' : '들어가기 →'));
    b.addEventListener('click', () => jump(r.id));
    list.appendChild(b);
  }
  $('rooms').hidden = false;
}
function jump(id) {
  $('rooms').hidden = true; $('fade').classList.add('on');
  setTimeout(() => { if (!disposed) opts.onNavigate(id); }, 380);
}
on($('rooms-close'), 'click', () => { $('rooms').hidden = true; });

// album shelf: browse albums (the sorting round lives in archive/album-sort/)
function updateAlbums() {
  if (!SHELF) return;
  for (const a of SHELF.albums) {
    const n = [...filed.values()].filter(v => v.album === a.key).length;
    a.mesh.scale.x = Math.min(0.32, 0.13 + n * 0.008); a.count = n;
    const g = a.lc.getContext('2d');
    g.fillStyle = C.paper; g.fillRect(0, 0, 96, 360);
    g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    const chars = [...a.name.replace(/\s/g, '')], fs = Math.min(52, 270 / chars.length);
    g.font = `${fs}px "Nanum Pen Script", cursive`;
    chars.forEach((ch, i) => g.fillText(ch, 48, 30 + fs / 2 + i * fs));
    g.font = '600 26px "IBM Plex Sans KR", sans-serif'; g.fillStyle = C.accent;
    g.fillText(String(n), 48, 330);
    a.lt.needsUpdate = true;
  }
}
function enterSort() { // "sort" mode = standing at the album shelf, browsing albums
  if (!SHELF) return;
  mode = 'sort'; walkTo = null; arrive = null; waypoints = [];
  me.position.copy(SHELF_STAND); me.rotation.y = shelfFacing - 0.4;
  setHint('shelf'); goTo(SORT_CAM); syncUI();
}
function exitSort() { mode = 'room'; camGoal = null; setHint('room'); syncUI(); }
on($('sortexit'), 'click', exitSort);
const albumAction = key => { if (mode === 'sort') openAlbum(key); };
function openAlbum(key) {
  const list = $('grid-list'); list.innerHTML = '';
  const items = reels.filter(r => filed.get(r.id)?.album === key);
  $('grid-title').textContent = `${albumName(key)} · ${items.length}장`;
  for (const r of items) {
    const it = el('div', 'gitem' + (r.wide ? ' wide' : ''));
    // near tier; the grid's object-fit: cover crops YouTube's padded frame down to the picture
    const im = el('img'); im.crossOrigin = 'anonymous'; im.src = thumbUrl(r, 'hqdefault'); im.alt = ''; im.loading = 'lazy'; it.appendChild(im);
    it.appendChild(el('span', null, r.title)); it.appendChild(link('원본 ↗', ytUrl(r)));
    list.appendChild(it);
  }
  if (!items.length) list.appendChild(el('p', 'note', '아직 비어 있어요.'));
  $('grid').hidden = false;
}
on($('grid-close'), 'click', () => { $('grid').hidden = true; });
let toastTimer = 0;
function toast(t) { $('toast').textContent = t; toastTimer = 2.2; }


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
const OVERLAYS = ['phone', 'pc', 'keepsake', 'grid', 'rooms', 'guestbook'];
const anyOverlay = () => OVERLAYS.some(id => !$(id).hidden);
on(window, 'keydown', ev => {
  if (ev.target.closest?.('input, textarea')) { if (ev.key === 'Escape') $('guestbook').hidden = true; return; }
  if (ev.target.closest?.('.room-editor')) return; // a key pressed inside the 꾸미기 panel belongs to the panel (it closes itself on Esc)
  const k = ev.key.toLowerCase(); keys.add(k);
  if (mode === 'room' && !anyOverlay() && (k === 'e' || k === 'enter')) { if (nearTable()) sit(); else if (nearShelf()) enterSort(); else if (nearDoor()) openRooms(); else if (nearBook()) openGuestbook(); }
  if (mode === 'sit' && held && k === 'f') flip();
  if (k === 'escape') {
    for (const id of OVERLAYS) if (!$(id).hidden) { $(id).hidden = true; return; }
    if (mode === 'watch') eject();
    else if (mode === 'sort') exitSort();
    else if (held) putBack();
    else if (mode === 'sit') stand();
  }
});
on(window, 'keyup', ev => keys.delete(ev.key.toLowerCase()));
on(window, 'blur', () => keys.clear());

// dragging a card across the desk (sit mode). Capture phase so orbit controls stand aside.
const deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TABLE.top + 0.12)), _hit = new THREE.Vector3();
let down = null, dragOff = new THREE.Vector2();
canvas.addEventListener('pointerdown', ev => {
  down = { x: ev.clientX, y: ev.clientY, card: null };
  if (mode !== 'sit' || held || camGoal) return;
  rayFrom(ev);
  const hit = ray.intersectObjects(pickables, false)[0];
  if (hit) {
    down.card = hit.object.userData.card; controls.enabled = false;
    if (ray.ray.intersectPlane(deskPlane, _hit)) dragOff.set(down.card.userData.place.x - _hit.x, down.card.userData.place.z - _hit.z); // grab offset where it was pressed
  }
}, { capture: true });
canvas.addEventListener('pointermove', ev => {
  if (down?.card && !dragging && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) {
    dragging = down.card; hovered = null; canvas.setPointerCapture?.(ev.pointerId);
    settle(); setHint('drag');
  }
  if (dragging) {
    rayFrom(ev);
    if (ray.ray.intersectPlane(deskPlane, _hit)) Object.assign(dragging.userData.place, clampPlace({ x: _hit.x + dragOff.x, z: _hit.z + dragOff.y, yaw: dragging.userData.place.yaw, faceUp: dragging.userData.place.faceUp }));
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (ev.buttons) return;
  rayFrom(ev);
  if (mode === 'sort') { canvas.style.cursor = SHELF && ray.intersectObjects(SHELF.albums.flatMap(a => [a.mesh, a.label]), false).length ? 'pointer' : 'default'; return; }
  if (mode === 'room') { canvas.style.cursor = ray.intersectObjects(ITEMS.slotMeshes, false).length ? 'pointer' : ''; return; }
  if (mode !== 'sit' || camGoal) return;
  const hit = ray.intersectObjects([...pickables, ...projParts, ...phoneParts], false)[0];
  hovered = hit && !held && hit.object.userData.card ? hit.object.userData.card : null;
  canvas.style.cursor = hit ? 'pointer' : 'grab';
});
canvas.addEventListener('pointerup', ev => {
  const wasDrag = dragging;
  if (dragging) {
    const c = dragging; dragging = null; toTop(c); settle(); startAnim(c, 'drop'); c.userData.anim.arc = 0.02;
    setHint('sit');
  }
  if (mode === 'sit' && !held && !camGoal) controls.enabled = true;
  const d = down; down = null;
  if (wasDrag || !d || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6) return;
  rayFrom(ev);
  if (mode === 'watch') { if (player.hidden && ray.intersectObject(screen, false).length) openPlayer(loaded.userData.reel); return; }
  if (camGoal) return;
  if (mode === 'sort') { const h = SHELF && ray.intersectObjects(SHELF.albums.flatMap(a => [a.mesh, a.label]), false)[0]; if (h) albumAction(h.object.userData.album); return; }
  if (mode === 'sit') {
    const hits = ray.intersectObjects([...pickables, ...projParts, ...phoneParts], false);
    if (held && hits[0]?.object.userData.card === held) return flip();
    const hit = hits.find(h => h.object.userData.card !== held);
    if (hit && isProj(hit.object)) return held ? feed() : setHint('needcard');
    if (hit && isPhone(hit.object)) return openPhone();
    if (held) return putBack();
    if (hit) pickUp(hit.object.userData.card);
    return;
  }
  const hit = ray.intersectObjects([tableTop, ...pickables, ...projParts, ...phoneParts, ...ITEMS.slotMeshes, ...shelfParts, ...doorParts, ...bookParts, floor], false)[0];
  if (!hit) return;
  if (hit.object.userData.slot) return openSlot(hit.object.userData.slot); // a PC, a frame or a standee: its panel opens where the visitor stands
  const p = hit.point, onTableFoot = p.x > TBOX.x0 && p.x < TBOX.x1 && p.z > TBOX.z0 && p.z < TBOX.z1;
  if (doorParts.includes(hit.object)) walkRoute(DOOR_SPOT.clone(), 'door');
  else if (bookParts.includes(hit.object)) walkRoute(BOOK_SPOT.clone(), 'book');
  else if (shelfParts.includes(hit.object)) walkRoute(SHELF_SPOT.clone(), 'sort');
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
function walkRoute(to, action) {
  const from = me.position.clone().setY(0);
  waypoints = [to]; arrive = action;
  if (crossesTable(from, to)) {
    const corners = [[TBOX.x0, TBOX.z0], [TBOX.x1, TBOX.z0], [TBOX.x0, TBOX.z1], [TBOX.x1, TBOX.z1]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const ok = corners.filter(c => !crossesTable(from, c) && !crossesTable(c, to));
    if (ok.length) waypoints = [ok.sort((p, q) => (from.distanceTo(p) + p.distanceTo(to)) - (from.distanceTo(q) + q.distanceTo(to)))[0], to];
    else {
      const near = corners.filter(c => !crossesTable(from, c)).sort((p, q) => from.distanceTo(p) - from.distanceTo(q))[0];
      const second = near && corners.filter(c => c !== near && !crossesTable(near, c) && !crossesTable(c, to)).sort((p, q) => p.distanceTo(to) - q.distanceTo(to))[0];
      waypoints = second ? [near, second, to] : [to];
    }
  }
  walkTo = waypoints.shift();
}
function collide(p) {
  p.x = THREE.MathUtils.clamp(p.x, -RX + 0.35, RX - 0.3);
  p.z = THREE.MathUtils.clamp(p.z, -RZ + 0.35, RZ - 0.3);
  // the table, the items, then the guestbook stand: the order they were checked in when all of them shared OBST
  for (const o of [OBST[0], ...ITEMS.obst, ...OBST.slice(1)]) {
    const dx = p.x - o.x, dz = p.z - o.z;
    if (Math.abs(dx) < o.hw && Math.abs(dz) < o.hd) {
      const px = o.hw - Math.abs(dx), pz = o.hd - Math.abs(dz);
      if (px < pz) p.x = o.x + Math.sign(dx || 1) * o.hw; else p.z = o.z + Math.sign(dz || 1) * o.hd;
    }
  }
}
const nearTable = () => me.position.distanceTo(SEAT) < 1.1;
const nearShelf = () => !!SHELF_SPOT && me.position.distanceTo(SHELF_SPOT) < 1.1;
const nearDoor = () => !!DOOR_SPOT && me.position.distanceTo(DOOR_SPOT) < 0.7;
const nearBook = () => !!BOOK_SPOT && me.position.distanceTo(BOOK_SPOT) < 0.7;
const UP = new THREE.Vector3(-1, 0, -1).normalize(), RIGHT = new THREE.Vector3(1, 0, -1).normalize();
const mv = new THREE.Vector3();
let walkPhase = 0;
function arrived() {
  if (waypoints.length) { walkTo = waypoints.shift(); return; }
  const a = arrive; walkTo = null; arrive = null;
  if (a === 'sit') sit(); else if (a === 'sort') enterSort(); else if (a === 'door') openRooms(); else if (a === 'book') openGuestbook();
}
function stepCharacter(dt) {
  mv.set(0, 0, 0);
  if (!anyOverlay()) {
    if (keys.has('w') || keys.has('arrowup')) mv.add(UP);
    if (keys.has('s') || keys.has('arrowdown')) mv.sub(UP);
    if (keys.has('d') || keys.has('arrowright')) mv.add(RIGHT);
    if (keys.has('a') || keys.has('arrowleft')) mv.sub(RIGHT);
  }
  if (mv.lengthSq()) { walkTo = null; arrive = null; waypoints = []; mv.normalize(); }
  else if (walkTo) {
    mv.subVectors(walkTo, me.position).setY(0);
    if (mv.length() < (waypoints.length ? 0.2 : 0.08)) { mv.set(0, 0, 0); return arrived(); }
    mv.normalize();
  }
  const moving = mv.lengthSq() > 0;
  if (moving) {
    const before = me.position.clone();
    me.position.addScaledVector(mv, 2.4 * dt); collide(me.position);
    if (walkTo && me.position.distanceTo(before) < 0.2 * 2.4 * dt) {
      if (waypoints.length) return arrived();
      if ((arrive === 'sit' && nearTable()) || (arrive === 'sort' && nearShelf()) || (arrive === 'door' && nearDoor()) || (arrive === 'book' && nearBook())) return arrived();
      walkTo = null; arrive = null;
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
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (raf) renderer.render(scene, camera); // setSize clears the canvas; draw again so no blank frame shows
}
on(window, 'resize', resize);
const sizeWatch = new ResizeObserver(resize); sizeWatch.observe(canvas);
cleanups.push(() => sizeWatch.disconnect());

function frame() {
  if (disposed) return;
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.05), t = clock.elapsedTime, a = reduced ? 1 : 1 - Math.exp(-dt * 7);
  if (mode === 'room') {
    stepCharacter(Math.min(rawDt, 0.2));
    const fit = Math.max(1, 1.25 / camera.aspect) * roomFit(camera.aspect);
    roomGoal.copy(ROOM_CAM.target).addScaledVector(ROOM_CAM.pos.clone().sub(ROOM_CAM.target), fit);
    camera.position.lerp(roomGoal, a); controls.target.lerp(ROOM_CAM.target, a); camera.lookAt(controls.target);
  } else {
    const seated = mode === 'sit' || mode === 'watch';
    me.position.y = seated ? -0.18 : 0; legL.rotation.x = legR.rotation.x = seated ? -1.2 : 0;
    if (camGoal) {
      camera.position.lerp(camGoal.pos, a); controls.target.lerp(camGoal.target, a); camera.lookAt(controls.target);
      if (camera.position.distanceTo(camGoal.pos) < 0.02 || reduced) { camGoal = null; controls.enabled = mode === 'sit' && !held && !dragging; }
    } else if (mode === 'sit') controls.update();
  }
  if (toastTimer > 0 && (toastTimer -= rawDt) <= 0) $('toast').textContent = '';
  const on = mode === 'watch';
  const flick = 0.93 + 0.04 * Math.sin(t * 23) + 0.03 * Math.sin(t * 57);
  beamMat.opacity += ((on ? 0.07 * flick : 0) - beamMat.opacity) * a;
  projLight.intensity += ((on ? 2.2 * flick : 0) - projLight.intensity) * a;
  if (on) { screenOn.color.setScalar(flick); reelA.rotation.x = reelB.rotation.x = t * 3; }
  phoneDot.visible = Math.sin(t * 3) > -0.2;
  tickClock();
  const lampNow = Math.max(0, lampBase + Math.sin(t * 1.3) * 0.05);
  for (const l of ITEMS.lamps) if (l.light) l.light.intensity = lampNow;
  stepMotes(t);
  // cards
  const tn = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  camera.getWorldDirection(dir); camUp.setFromMatrixColumn(camera.matrixWorld, 1);
  const animDt = reduced ? 1 : Math.min(rawDt, 0.1);
  for (const c of cards) {
    const d = c.userData.d;
    if (c.userData.fly) {
      want.copy(c.userData.fly); flyQ.setFromAxisAngle(Yv, SHELF.group.rotation.y);
      if (c.position.distanceTo(want) < 0.08) { c.userData.fly = null; c.position.copy(c.userData.home.pos); c.quaternion.copy(c.userData.home.quat); continue; }
      c.position.lerp(want, Math.min(1, a * 1.6)); c.quaternion.slerp(flyQ, a);
      continue;
    }
    if (c === held) {
      const dist = Math.max(d.h / (1.5 * tn), d.w / (1.7 * tn * camera.aspect));
      want.copy(camera.position).addScaledVector(dir, dist); wantQ.copy(camera.quaternion);
      if (heldFlipped) wantQ.multiply(FLIP);
    } else if (c === presenting) {
      const dist = Math.max(d.h / (0.9 * tn), d.w / (1.0 * tn * camera.aspect));
      want.copy(camera.position).addScaledVector(dir, dist).addScaledVector(camUp, -0.16 * dist * tn); wantQ.copy(camera.quaternion);
    } else if (c === loaded) {
      want.copy(SLOT.pos); want.y += d.h / 2; wantQ.copy(SLOT.quat);
    } else if (c === dragging) {
      const p = c.userData.place, below = cards.filter(o => o !== c && inPile(o));
      want.set(p.x, supportAt(p.x, p.z, below) + 0.05, p.z);
      wantQ.copy(restPose(c, []).quat);
      c.position.lerp(want, Math.min(1, a * 2.2)); c.quaternion.slerp(wantQ, a);
      continue;
    } else {
      if (c.userData.anim) { stepAnim(c, animDt); continue; }
      want.copy(c.userData.home.pos); wantQ.copy(c.userData.home.quat);
      if (c === hovered) want.y += 0.012;
    }
    c.position.lerp(want, a); c.quaternion.slerp(wantQ, a);
  }
  renderer.render(scene, camera);
  raf = requestAnimationFrame(frame);
}

async function fontsReady() {
  const wait = Promise.all([document.fonts.load('40px "Nanum Pen Script"', '가나 abc'), document.fonts.load('600 20px "IBM Plex Sans KR"', '만 1234')]);
  await Promise.race([wait, new Promise(r => setTimeout(r, 3000))]);
}
await fontsReady(); // the room does not wait for thumbnails: buildHeap() queues them and each card fills in as its picture lands
if (disposed) return;
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
if (opts.signedIn) opts.recordVisit().then(r => { if (!disposed && r?.ok && r.recorded) poll(); }).catch(() => {});
schedulePoll();
}

run().catch(e => { if (!disposed) console.error('[heap-room]', e); });

return function dispose() {
  if (disposed) return;
  disposed = true;
  cancelAnimationFrame(raf);
  ac.abort();
  while (cleanups.length) cleanups.pop()();
  // put the React-rendered nodes back to their first-render state so a later mount starts clean
  for (const id of LISTS) $(id).innerHTML = '';
  for (const id of HIDDEN) $(id).hidden = true;
  $('status').hidden = false; $('fade').classList.remove('on');
  $('toast').textContent = ''; $('gb-msg').textContent = ''; $('visit').textContent = ''; $('hint').textContent = ''; delete $('hint').dataset.k;
  root.style.removeProperty('--clay');
  if (roomTitle && document.title === roomTitle) document.title = prevTitle;
};
}
