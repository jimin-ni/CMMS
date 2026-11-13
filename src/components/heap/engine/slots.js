// item.fn 기능이 달린 가구의 3D 쪽: 기념품, TV 화면, 달력.
import * as THREE from 'three';
import { mulberry32, thumbUrl } from './util.js';
import { paper, wrap, drawFit, NO_PHOTO, flat, cropToShape } from './draw.js';
import { ksDay, seoulDay } from './format.js';

export function setupSlots(ctx) {
  const { opts, C, box, BUILD, reels } = ctx;

  // ---------- slots: item.fn (one function, many skins) ----------
  // An item that carries a function in the layout (item.fn, checked by the server: src/lib/heap/slots.ts) can be clicked in room mode.
  //   pc        opens the links panel: fn.links, or the room's creator.json links when the item has none of its own
  //   keepsake  a picture with a name, date, caption and link. On a wall frame (type "frame"), or as a standee on the top of a shelf-like item.
  //   music     a YouTube video or playlist. Opens the docked player at the top right (radio, speaker or TV).
  //   latest    a TV whose screen shows the newest reel's thumbnail. Clicking it sends that reel into the projector.
  //   calendar  a desk calendar (type "calendar", built by hand): the creator's dates for fans, listed in a panel.
  // ITEMS.slots lists them ({ it, fn, start? }) and ITEMS.slotMeshes holds the meshes a click can hit (each has userData.slot).
  ctx.slotsLive = false; // true once the fonts are ready: the keepsake textures paint with their own fonts and load their pictures from then on
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
      if (slot.started || build !== ctx.build) return;
      slot.started = true; paintKeepsake(canvas, fn, look, null); tex.needsUpdate = true;
      if (look.id) ksLoad(build, look, look.tall ? ['hqdefault'] : ['mqdefault'], img => { if (build === ctx.build) { paintKeepsake(canvas, fn, look, img); tex.needsUpdate = true; } });
    } };
    for (const m of [frame, pic]) { m.userData.slot = slot; build.slotMeshes.push(m); }
    build.slots.push(slot);
    if (ctx.slotsLive) slot.start();
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
      im.onload = im.onerror = null; ctx.inFlight.delete(im); build.loads.delete(im);
      if (ctx.disposed) return;
      if (!ok && files.length > 1) return ksLoad(build, look, files.slice(1), done);
      try { if (ok) { const pic = cropToShape(im, { wide: !look.tall }); ksPics.set(key, pic); done(pic); } } catch (e) { console.error('[heap-room]', e); }
    };
    im.onload = () => end(im.naturalWidth > 120); // a missing thumbnail answers 404 with a 120px placeholder that still fires load
    im.onerror = () => end(false);
    ctx.inFlight.add(im); build.loads.add(im); im.src = thumbUrl({ id: look.id }, files[0]);
  }
  BUILD.frame = (g, it, build) => { keepsakeObject(g, it, build, 'frame', 0, it.y ?? 1.9, 0); return {}; };

  // The newest reel: the latest publish day, and the list's own order (newest first from the server) when two share a day or none has a date.
  const newestReel = () => { let best = null; for (const r of reels) if (r.published && (!best || r.published > best.published)) best = r; return best ?? reels[0] ?? null; };

  // A TV's screen (a catalogue model with `screen`, in file units): a plane just in front of the model's own screen, painted by the slot.
  //   latest  the newest reel's thumbnail, a Short pillar-boxed        music  the video's thumbnail, or a note for a playlist link
  function tvContent(fn) {
    if (fn.kind === 'latest') { const r = newestReel(); return { id: r ? r.id : null, tall: !!r && !r.wide, label: '최신 영상', note: '▶' }; }
    const p = opts.parseMusic(fn.url);
    return { id: p?.video ?? null, tall: false, label: '음악', note: '♪' };
  }
  function paintTv(canvas, pic, what) {
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    g.fillStyle = '#16130f'; g.fillRect(0, 0, W, H);
    if (pic) drawFit(g, pic, 0, 0, W, H, false);
    else { g.fillStyle = 'rgba(243, 234, 219, 0.35)'; g.font = `${Math.round(H * 0.4)}px "IBM Plex Sans KR", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(what.note, W / 2, H / 2); }
    g.fillStyle = 'rgba(0, 0, 0, 0.1)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    const sh = g.createLinearGradient(0, H * 0.72, 0, H); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = sh; g.fillRect(0, H * 0.72, W, H * 0.28);
    g.fillStyle = 'rgba(243, 234, 219, 0.95)'; g.font = `${Math.round(H * 0.15)}px "Nanum Pen Script", cursive`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(what.label, W * 0.04, H * 0.95);
  }
  function tvScreen(inst, build, slot, s) {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    plane.position.set(s.x, s.y, s.z); plane.userData.slot = slot; inst.add(plane); build.slotMeshes.push(plane);
    const what = tvContent(slot.fn);
    paintTv(canvas, null, what);
    slot.started = false;
    slot.start = () => { // once the fonts are ready (or at once after that)
      if (slot.started || build !== ctx.build) return;
      slot.started = true; paintTv(canvas, null, what); tex.needsUpdate = true;
      if (what.id) ksLoad(build, { id: what.id, tall: what.tall }, what.tall ? ['hqdefault'] : ['mqdefault'], pic => { if (build === ctx.build) { paintTv(canvas, pic, what); tex.needsUpdate = true; } });
    };
    if (ctx.slotsLive) slot.start();
  }

  // Desk calendar (type "calendar", fn.kind "calendar"): a small stand with one paper page. The page shows the month of the next upcoming date
  // (this month when there is none) with a ring on the days that carry an entry. Hand-built: the kit has no calendar.
  function paintCalendar(canvas, fn) {
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    const entries = (fn.entries ?? []).filter(e => typeof e?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date));
    const today = seoulDay.format(new Date()), next = entries.filter(e => e.date >= today).map(e => e.date).sort()[0];
    const [y, m] = (next ?? today).split('-').map(Number);
    paper(g, W, H, mulberry32(5), 0.2);
    g.fillStyle = C.accent; g.fillRect(0, 0, W, 40);
    g.fillStyle = C.paper; g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = `32px "Nanum Pen Script", cursive`; g.fillText(`${m}월`, 14, 21);
    g.textAlign = 'right'; g.font = `600 14px "IBM Plex Sans KR", system-ui, sans-serif`; g.fillText(String(y), W - 14, 21);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), days = new Date(Date.UTC(y, m, 0)).getUTCDate(), cw = (W - 16) / 7;
    g.textAlign = 'center'; g.font = `600 11px "IBM Plex Sans KR", system-ui, sans-serif`; g.fillStyle = 'rgba(86, 83, 68, 0.6)';
    [...'일월화수목금토'].forEach((c, i) => g.fillText(c, 8 + cw * (i + 0.5), 54));
    const marked = new Set(entries.filter(e => e.date.startsWith(`${y}-${String(m).padStart(2, '0')}-`)).map(e => Number(e.date.slice(8))));
    g.font = `13px "IBM Plex Sans KR", system-ui, sans-serif`;
    for (let d = 1; d <= days; d++) {
      const cell = first + d - 1, cx = 8 + cw * (cell % 7 + 0.5), cy = 72 + Math.floor(cell / 7) * 22;
      if (marked.has(d)) { g.strokeStyle = C.accent; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = marked.has(d) ? C.accent : 'rgba(47, 44, 36, 0.85)'; g.fillText(String(d), cx, cy + 1);
    }
  }
  BUILD.calendar = (g, it, build) => {
    const fn = it.fn?.kind === 'calendar' ? it.fn : { kind: 'calendar', entries: [] }; // a calendar with no function yet is an empty one
    const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 192;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const wood = flat(C.woodDark), grp = new THREE.Group(), W = 0.4, H = 0.4;
    box(W + 0.06, 0.03, 0.16, wood, 0, 0.015, 0, { parent: grp });
    const lean = new THREE.Group(); lean.position.set(0, 0.03, -0.03); lean.rotation.x = -0.3; grp.add(lean);
    const back = box(W + 0.04, H + 0.04, 0.02, wood, 0, H / 2, 0, { parent: lean });
    const page = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })); page.position.set(0, H / 2, 0.012); page.castShadow = true; lean.add(page);
    grp.position.y = it.y || 0; g.add(grp);
    paintCalendar(canvas, fn);
    if (it.fn?.kind !== 'calendar') return {};
    const slot = { it, fn, started: false, start() { if (slot.started || build !== ctx.build) return; slot.started = true; paintCalendar(canvas, fn); tex.needsUpdate = true; } };
    for (const m of [back, page]) { m.userData.slot = slot; build.slotMeshes.push(m); }
    build.slots.push(slot);
    if (ctx.slotsLive) slot.start();
    return {};
  };
  function startSlots() { ctx.slotsLive = true; for (const s of ctx.build.slots) s.start?.(); }

  Object.assign(ctx, { keepsakeObject, tvScreen, startSlots, keepsakeLook, newestReel });
}
