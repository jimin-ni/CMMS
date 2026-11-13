// Canvas와 three 재질을 다루는 순수 함수.
import * as THREE from 'three';

// ---------- helpers ----------



export const flat =(color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.88, ...extra });

export function drawFit(g, img, x, y, w, h, cover) {
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
export function wrap(g, text, maxW) {
  const lines = []; let line = '';
  for (const word of text.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width <= maxW || !line) line = test; else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}
export function paper(g, W, H, r, age) {
  g.fillStyle = `hsl(40, ${30 + age * 22}%, ${93 - age * 8}%)`; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(90,70,40,${r() * 0.05})`; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
}
export const NO_PHOTO = '#2b2530'; // the photo area of a card or poster whose picture has not arrived, or never will

// fan pieces: placeholder art, a crayon drawing on paper (the motif is always the default until the fan piece screens are designed)
export function crayon(g, pts, color, width, r, closed = false) {
  for (let pass = 0; pass < 3; pass++) {
    g.strokeStyle = color; g.globalAlpha = 0.55 + r() * 0.3; g.lineWidth = width * (0.7 + r() * 0.5); g.lineCap = g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => { const jx = x + (r() - 0.5) * width * 0.8, jy = y + (r() - 0.5) * width * 0.8; if (i) g.lineTo(jx, jy); else g.moveTo(jx, jy); });
    if (closed) g.closePath();
    g.stroke();
  }
  g.globalAlpha = 1;
}
export const ring = (cx, cy, rx, ry, n = 24, f = () => 1) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [cx + Math.cos(a) * rx * f(a), cy + Math.sin(a) * ry * f(a)]; });

// YouTube pads its small thumbnails: a Short's picture sits in the centre of a 16:9 or 4:3 frame between blurred sides,
// and a wide video's hqdefault has black bars above and below. The picture is the centred part with the reel's own shape.
export function cropToShape(im, reel) {
  const a = reel.wide ? 16 / 9 : 9 / 16, iw = im.naturalWidth, ih = im.naturalHeight;
  if (Math.abs(iw / ih / a - 1) < 0.03) return im;
  const sw = Math.min(iw, ih * a), sh = Math.min(ih, iw / a);
  const c = document.createElement('canvas'); c.width = Math.round(sw); c.height = Math.round(sh);
  c.getContext('2d').drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  return c;
}
