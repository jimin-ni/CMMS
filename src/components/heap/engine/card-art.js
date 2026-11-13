// 카드 그림: 앞면, 뒷면, 팬 작품.
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { paper, drawFit, NO_PHOTO, wrap, crayon, ring } from './draw.js';
import { ytShort } from './format.js';

export function setupCardArt(ctx) {
  const { C, creator } = ctx;

  // ====================================================================================
  // 2. Card textures
  // ====================================================================================
  const PX = 340, PXB = 220, S = 0.26;
  const DIMS = {
    tall: { CW: 1, B: 0.06, PW: 0.88, PH: 0.88 * 16 / 9, STRIP: 0.30 },
    wide: { CW: 1.5, B: 0.05, PW: 1.4, PH: 1.4 * 9 / 16, STRIP: 0.27 },
  };
  for (const d of Object.values(DIMS)) { d.CH = d.B + d.PH + d.STRIP; d.w = d.CW * S; d.h = d.CH * S; d.geo = new THREE.PlaneGeometry(d.w, d.h); }

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

  Object.assign(ctx, { DIMS, drawFanFront, drawCard, drawFanBack, drawBack });
}
