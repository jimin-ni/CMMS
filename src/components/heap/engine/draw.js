// 캔버스와 three 재질을 다루는 순수 함수. 상태를 갖지 않는다.
import * as THREE from 'three';

export const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.88, ...extra });

// 크기를 정한 빈 캔버스
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// 캔버스를 그대로 텍스처로 쓴다. 색 공간은 sRGB 로 맞추고, 이방성 필터링은 값을 줄 때만 올린다.
export function canvasTexture(canvas, anisotropy) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (anisotropy) tex.anisotropy = anisotropy;
  return tex;
}

// 그림을 (x, y, w, h) 칸에 맞춘다. cover 면 칸을 가득 채우고 넘치는 쪽을 가운데 기준으로 자른다.
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

// 글을 maxW 안에서 줄바꿈한다 (공백 기준)
export function wrap(g, text, maxW) {
  const lines = []; let line = '';
  for (const word of text.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width <= maxW || !line) line = test; else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

// 낡은 종이 바탕. age 가 클수록 누렇고 어둡다. r 은 점을 흩뿌리는 난수 함수다.
export function paper(g, W, H, r, age) {
  g.fillStyle = `hsl(40, ${30 + age * 22}%, ${93 - age * 8}%)`; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(90,70,40,${r() * 0.05})`; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
}
export const NO_PHOTO = '#2b2530'; // 그림이 아직 오지 않았거나 끝내 오지 않을 카드와 포스터의 사진 자리

// 팬 작품의 자리 표시 그림: 종이 위 크레용 선 (팬 작품 화면이 설계되기 전까지 모티프는 늘 기본값이다)
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

// 유튜브는 작은 썸네일에 여백을 둔다. 쇼츠의 그림은 흐린 양옆 사이 16:9 나 4:3 틀 한가운데에 앉고,
// 가로 영상의 hqdefault 는 위아래에 검은 띠가 있다. 그림은 가운데에서 그 영상의 모양대로 잘라 낸 부분이다.
export function cropToShape(im, reel) {
  const a = reel.wide ? 16 / 9 : 9 / 16, iw = im.naturalWidth, ih = im.naturalHeight;
  if (Math.abs(iw / ih / a - 1) < 0.03) return im;
  const sw = Math.min(iw, ih * a), sh = Math.min(ih, iw / a);
  const c = makeCanvas(Math.round(sw), Math.round(sh));
  c.getContext('2d').drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  return c;
}
