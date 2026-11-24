// 접힌 쪽지. public/tree-mock/index.html 의 쪽지 구간을 옮겼다. 트리, 씬, 카메라, 렌더러를 모른다.
//
// 교실에서 접는 매듭(refs/jjokji-steps.png). 접는 순서는 아래와 같고 펼치기는 거꾸로 돈다.
//   0  세로 종이를 길이로 반, 다시 반 -> 긴 띠 (4겹)
//   1  띠를 가로로 눕힌다
//   2  왼쪽 끝이 45도 접선에서 아래로 접힌다: 짧은 끝이 걸린다
//   3  긴 부분이 다른 대각선에서 아래로 접힌다: 꼬리 둘과 지붕
//   4  긴 끝이 45도로 왼쪽으로 접혀 짧은 끝 앞으로 온다
// 종이는 접선을 따라 띠 조각으로 자르고, 조각마다 길이 방향 4칸으로 나눈다.
// 접선마다 경첩이 있다. 지붕 삼각형이 뿌리라 움직이지 않고, 글 쓴 면이 늘 보는 쪽을 향한다.
//
// buildPacket(data, opts) 은 { name, date, msg, reply?, tint?, font? } 로 쪽지 하나를 만든다.
// 반환한 p.root 를 씬에 붙이고 applyPose(p, t) 로 자세를 준다.
import * as THREE from 'three';
import { disposeScene } from './util.js';
import { ANIM_TEST } from './debug-flags.js';

export const C = { olive: 0x565344, clay: 0xA6613C, paper: 0xf3e9d6 };
export const TREE_H = 1.8;

const KW = 0.036;                             // 띠 너비 = 종이 너비 / 4
const STRIP_L = 6.5 * KW;                     // 띠 길이 = 종이 높이
export const SHEET = { W: 4 * KW, H: STRIP_L };      // 0.144 x 0.234 m
const LD = 0.00008;                           // 종이 한 겹의 간격
export const INSIDE_SCALE = 0.35;             // 장식 안에 든 닫힌 쪽지
// 답장 종이: 펼치면 팬의 종이 옆에 나란히 선다 (글이 200자라 팬 종이와 같은 글 밀도가 되게 키웠다). 접으면 쪽지 안에 REPLY_TUCK_S 배로 든다 (접은 크기 0.0315 x 0.05 m, 띠 너비 0.036 안).
const REPLY = { W: 0.126, H: 0.2, COLS: 2, ROWS: [0.5, 0.5], DZ: 0.00003 };
export const REPLY_DIM = { W: REPLY.W, H: REPLY.H }; // 답장 종이를 펼친 크기 (m)
const REPLY_TUCK_S = 0.5;
export const REPLY_GAP = 0.012;                      // 팬 종이와 답장 종이 사이 (m)
export const PAIR_W = SHEET.W + REPLY_GAP + REPLY.W; // 나란히 선 두 종이의 너비 (m). 높이는 팬 종이(SHEET.H)다
const PAIR_SHIFT = (REPLY_GAP + REPLY.W) / 2;        // 답장이 나오면 두 종이를 화면 가운데에 두려고 왼쪽으로 옮기는 거리
const FAN_FONTS = ['Nanum Pen Script', 'Gaegu', 'Hi Melody', 'Gamja Flower', 'Cute Font', 'Single Day', 'Yeon Sung'];
export const REPLY_FONT = 'East Sea Dokdo';
// 어떤 글씨체는 같은 px에서 작게 그려진다. 모든 손글씨가 비슷한 크기로 읽히게 맞춘다.
const FONT_SCALE = { 'Nanum Pen Script': 1.3, 'Gaegu': 1.0, 'Hi Melody': 1.15, 'Gamja Flower': 1.0, 'Cute Font': 1.3, 'Single Day': 0.95, 'Yeon Sung': 1.0, 'East Sea Dokdo': 1.3 };
export const NOTE_FONTS = { fan: FAN_FONTS, reply: REPLY_FONT, scale: FONT_SCALE };
const NOTE_TINTS = ['#fbf7ee', '#f6efdf', '#f9f4ea', '#f2eadb', '#fdf9f2'];
const REPLY_TINT = '#f1c9ad'; // 크리에이터의 답장 종이는 늘 이 색이다: 브랜드 점토색(#A6613C)을 옅게 푼 색. 팬 종이 다섯 색(노랑, 회색 기가 도는 흰색)과 겹치지 않는다
const REPLY_MAX_PX = 200;     // 답장 글자의 자동 맞춤 상한 (글씨체 배율 전)
const FRONT_PX = [1200, 1950], REPLY_PX = [1050, 1667], BACK_PX = [400, 650]; // 답장 종이는 팬 종이와 같은 픽셀 밀도(약 8333 px/m)

const hashStr = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; };
// data.font / data.tint 가 있으면 그것을 쓰고, 없으면 지금처럼 이름과 글에서 정한다 (목은 읽지 않던 선택 필드)
export const replyFontFor = data => data.replyFont ?? REPLY_FONT;
export const fontFor = data => data.font ?? FAN_FONTS[hashStr(data.name ?? ('익명:' + data.msg)) % FAN_FONTS.length];
// 숨긴 쪽지(data.hidden: 작성자와 방 주인에게만 보인다)는 종이가 어둡다
const dimTint = hex => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.78).toString(16).padStart(2, '0')).join('');
export const tintFor = data => { const t = data.tint ?? NOTE_TINTS[hashStr(data.msg) % NOTE_TINTS.length]; return data.hidden && /^#[0-9a-f]{6}$/i.test(t) ? dimTint(t) : t; };

// 글씨체를 그릴 글자만큼 미리 불러온다. 한글 웹폰트는 unicode-range 조각으로 온다.
// names: [{ font, text }] 또는 data 목록은 noteFontLoads(list)로 만든다.
export function noteFontLoads(list) {
  const out = [];
  for (const d of list) {
    out.push({ font: fontFor(d), text: d.msg + (d.name ?? '익명') + '- ' });
    if (d.reply) out.push({ font: replyFontFor(d), text: d.reply });
  }
  return out;
}
export function loadNoteFonts(names) {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve([]);
  return Promise.allSettled(names.map(({ font, text }) => document.fonts.load(`40px "${font}"`, text)));
}

// --- 접선 배치 ---
// "띠 좌표"(X는 띠를 따라, 기준 그림처럼 가로로 눕힘, Y는 너비 0..w)로 설계한 뒤
// 0번 칸 기준 종이 좌표(x 오른쪽 0..W, y 위 0..H)로 90도 돌린다: (X, Y) -> (w - Y, X).
const w = KW, TIP = 1.8 * w, L = STRIP_L;
const toSheet = ([X, Y]) => [w - Y, X];
const dirToSheet = ([dX, dY]) => [-dY, dX];
const SEGS_STRIP = {
  ROOF: [[TIP, 0], [TIP + w, w], [TIP + 2 * w, 0]],                    // 뿌리: 지붕 삼각형, 움직이지 않는다
  TIP:  [[0, 0], [TIP, 0], [TIP + w, w], [0, w]],                      // 짧은 끝, 아래로 걸린다 (2단계)
  TAIL: [[TIP + w, w], [TIP + 3 * w, w], [TIP + 2 * w, 0]],            // 짧은 끝 옆으로 접힌다 (3단계)
  BAND: [[TIP + 2 * w, 0], [TIP + 3 * w, w], [L, w], [L, 0]],          // 긴 끝, 앞에서 왼쪽으로 돈다 (4단계)
};
const SEGS = Object.fromEntries(Object.entries(SEGS_STRIP).map(([k, pts]) => [k, pts.map(toSheet)]));
// [자식, 부모, 접선 위의 점, 접선 방향, 자식 안의 한 점, 경첩 높이] (띠 좌표)
// 경첩 높이가 겹마다 한 층씩 준다: 짧은 끝은 지붕 뒤, 꼬리는 앞, 긴 끝은 모두 앞
const CREASES_STRIP = [
  ['TIP', 'ROOF', [TIP, 0], [1, 1], [TIP * 0.5, 0.5 * w], -0.5 * LD],
  ['TAIL', 'ROOF', [TIP + w, w], [1, -1], [TIP + 2 * w, 0.7 * w], 11 * LD],
  ['BAND', 'TAIL', [TIP + 2 * w, 0], [1, 1], [TIP + 4 * w, 0.5 * w], -1 * LD],
];
const CREASES = CREASES_STRIP.map(([c, p, pt, d, ins, h]) => [c, p, toSheet(pt), dirToSheet(d), toSheet(ins), h]);
// 길이 방향 접기: 칸 경첩 x = w, 2w, 3w. 반으로 접고 다시 반: 가운데 먼저, 나머지 둘이 뒤따른다.
// 띠 겹은 0, 2, 4, 10 LD (칸 0, 3, 2, 1)에 앉는다. 맨 위 겹 아래 틈에 접은 답장이 든다.
const COL_HEIGHT = [0, 5 * LD, 3 * LD, -1 * LD];
const COL_MAP = [x => x, x => 2 * w - x, x => 2 * w + x, x => 4 * w - x];

// --- 경첩: 접선 위의 그룹. 안쪽 내용은 부모 좌표로 되돌아가 있다 ---
function makeHinge(parent, px, py, height, dir, inside) {
  const axis = new THREE.Vector3(dir[0], dir[1], 0).normalize();
  const P = new THREE.Vector3(px, py, height);
  const rel = new THREE.Vector3(inside[0] - px, inside[1] - py, 0);
  const side = rel.sub(axis.clone().multiplyScalar(rel.dot(axis))).normalize();
  // 조각이 내려앉는 쪽으로 돈다 (경첩 높이의 부호)
  const sgn = Math.sign(height || 1) * Math.sign(new THREE.Vector3().crossVectors(axis, side).z || 1);
  const group = new THREE.Group(); group.position.copy(P); parent.add(group);
  const content = new THREE.Group(); content.position.copy(P).negate(); group.add(content);
  return { group, content, axis, fold: sgn * Math.PI };
}
export const setHinge = (h, f) => h.group.quaternion.setFromAxisAngle(h.axis, f * h.fold);

function polyGeometry(pts) {
  const geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / SHEET.W, pos.getY(i) / SHEET.H);
  return geo;
}

export function buildKnot(front, back) {
  const root = new THREE.Group(), segs = {}, cols = [[], [], [], []], fronts = [];
  function segment(name, content) {
    let parent = content; const cells = [];
    for (let c = 0; c < 4; c++) {
      let cell = content;
      if (c > 0) { const h = makeHinge(parent, c * w, 0, COL_HEIGHT[c], [0, 1], [c * w + 0.01, 0]); cols[c].push(h); cell = h.content; }
      const geo = polyGeometry(SEGS[name].map(([x, y]) => [COL_MAP[c](x), y]));
      const fm = new THREE.Mesh(geo, front), bm = new THREE.Mesh(geo, back);
      fm.castShadow = bm.castShadow = true; cell.add(fm, bm); fronts.push(fm);
      cells.push(cell); parent = cell;
    }
    segs[name] = { content, cells };
  }
  segment('ROOF', root);
  const hinges = {};
  for (const [child, parent, [px, py], dir, inside, height] of CREASES) {
    const h = makeHinge(segs[parent].content, px, py, height, dir, inside);
    hinges[child] = h; segment(child, h.content);
  }
  return { root, hinges, cols, fronts, segs };
}

// --- 답장: 2 x 3 으로 접은 작은 종이, 아코디언 ---
export function buildAccordion(spec, front, back) {
  const { W, H, COLS, ROWS, DZ } = spec;
  const cw = W / COLS, rh = ROWS.map(f => f * H);
  const offC = DZ, offR = 2 * DZ * (COLS - 1) + 3 * DZ;
  const root = new THREE.Group(), rowHinges = [], colHinges = [];
  let parentRow = root, yTop = 0;
  for (let r = 0; r < ROWS.length; r++) {
    let rowContent = new THREE.Group();
    if (r === 0) root.add(rowContent);
    else {
      const s = r % 2 ? 1 : -1, g = new THREE.Group();
      g.position.set(0, -rh[r - 1], s * offR); rowContent.position.z = -s * offR;
      g.add(rowContent); parentRow.add(g);
      rowHinges.push({ group: g, axis: new THREE.Vector3(1, 0, 0), fold: -s * Math.PI });
    }
    let parentCell = rowContent;
    for (let c = 0; c < COLS; c++) {
      let cell = new THREE.Group();
      if (c === 0) rowContent.add(cell);
      else {
        const t = c % 2 ? 1 : -1, g = new THREE.Group();
        g.position.set(cw, 0, t * offC); cell.position.z = -t * offC;
        g.add(cell); parentCell.add(g);
        (colHinges[c - 1] ||= []).push({ group: g, axis: new THREE.Vector3(0, 1, 0), fold: -t * Math.PI });
      }
      const geo = new THREE.PlaneGeometry(cw, rh[r]); geo.translate(cw / 2, -rh[r] / 2, 0);
      const uv = geo.attributes.uv, u0 = c / COLS, u1 = (c + 1) / COLS, vT = 1 - yTop / H, vB = 1 - (yTop + rh[r]) / H;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), vB + uv.getY(i) * (vT - vB));
      const fm = new THREE.Mesh(geo, front), bm = new THREE.Mesh(geo, back);
      fm.castShadow = bm.castShadow = true; cell.add(fm, bm);
      parentCell = cell;
    }
    parentRow = rowContent; yTop += rh[r];
  }
  return { root, rowHinges, colHinges, cw, rh };
}

// --- 글: 자소와 단어 단위 줄바꿈 (Intl.Segmenter는 처음 쓸 때 만든다) ---
let _segWord = null, _segGraph = null;
const segWord = () => (_segWord ||= new Intl.Segmenter('ko', { granularity: 'word' }));
const segGraph = () => (_segGraph ||= new Intl.Segmenter('ko', { granularity: 'grapheme' }));
const graphemes = s => Array.from(segGraph().segment(s), x => x.segment);
const CLOSERS = new Set(['.', ',', '!', '?', ')', '」', '』', '…', '~', ':', ';', ']', '}', '’', '”', '%', '·', '。', '、']);

// 줄은 닫는 문장부호로 시작하지 않는다: 앞 줄에 매달린다
export function wrap(g, text, maxW) {
  const out = [];
  const fits = s => g.measureText(s).width <= maxW;
  for (const para of text.split('\n')) {
    let line = '';
    const flush = () => { out.push(line.trimEnd()); line = ''; };
    for (const { segment } of segWord().segment(para)) {
      if (fits((line + segment).trimEnd())) { line += segment; continue; }
      if (!segment.trim()) { if (line.trim()) flush(); continue; }         // 공백에서 끊고 공백은 버린다
      const gs = graphemes(segment);
      if (line.trim() && !CLOSERS.has(gs[0]) && fits(segment)) { flush(); line = segment; continue; }
      for (const gp of gs) {
        if (line.trim() && !fits(line + gp) && !CLOSERS.has(gp)) flush();
        line += gp;
      }
    }
    out.push(line.trimEnd());
  }
  return out.map(l => l.trimStart());
}
function ellipsize(g, s, maxW) {
  let gs = graphemes(s);
  while (gs.length && g.measureText(gs.join('') + '…').width > maxW) gs.pop();
  return gs.join('') + '…';
}
// 줄바꿈한 글이 상자에 드는 가장 큰 크기. 짧은 쪽지는 크게, 긴 쪽지는 작게, minPx 아래로는 가지 않는다
export function fitText(g, text, font, boxW, boxH, maxPx, minPx, wantPx = null) {
  const auto = fitAuto(g, text, font, boxW, boxH, maxPx, minPx);
  if (!Number.isFinite(wantPx)) return auto;
  // 고른 크기는 상자에 드는 가장 큰 크기보다 크지 않고 하한보다 작지 않다
  const px = Math.round(Math.min(auto.px, Math.max(minPx, wantPx)));
  return px >= auto.px ? auto : fitAuto(g, text, font, boxW, boxH, px, minPx);
}
// 쪽지 앞면 글자 크기의 범위: 하한(읽을 수 있는 가장 작은 크기)과 지금 글이 상자에 드는 가장 큰 크기 (캔버스 픽셀, 글씨체 배율 포함)
export function sizeRangeFor(g, text, font) {
  const s = FONT_SCALE[font] ?? 1, { boxW, boxH } = frontTextBox();
  const min = Math.round(62 * s), auto = fitAuto(g, text, font, boxW, boxH, Math.round(290 * s), min);
  return { min, max: Math.max(min, auto.px) };
}
function fitAuto(g, text, font, boxW, boxH, maxPx, minPx) {
  let fit;
  // 가득 찬 줄에 매달린 닫는 부호가 boxW를 넘을 수 있어 너비도 본다
  const widthOk = lines => lines.every(l => g.measureText(l).width <= boxW);
  for (let px = maxPx; px >= minPx; px -= 4) {
    g.font = `${px}px "${font}"`; const lines = wrap(g, text, boxW), lh = px * 1.22;
    fit = { px, lines, lh };
    if (lines.length * lh <= boxH && widthOk(lines)) return fit;
  }
  // 가장 작은 크기: 매달린 부호가 상자 안에 머물게 더 좁게 줄바꿈
  if (!widthOk(fit.lines)) fit.lines = wrap(g, text, boxW - g.measureText('……').width);
  const keep = Math.max(1, Math.floor(boxH / fit.lh));
  if (fit.lines.length > keep) { fit.lines = fit.lines.slice(0, keep); fit.lines[keep - 1] = ellipsize(g, fit.lines[keep - 1], boxW); }
  return fit;
}
// 한 줄: 줄여서 맞추고, 안 되면 말줄임표로 자른다
export function fitLine(g, text, family, maxPx, minPx, maxW, weight = '') {
  let px = maxPx;
  for (; px > minPx; px -= 2) { g.font = `${weight}${px}px ${family}`; if (g.measureText(text).width <= maxW) return { px, text }; }
  g.font = `${weight}${minPx}px ${family}`;
  return { px: minPx, text: g.measureText(text).width <= maxW ? text : ellipsize(g, text, maxW) };
}
export function drawBlock(g, fit, font, x, y, boxW, boxH, color, center) {
  g.font = `${fit.px}px "${font}"`; g.fillStyle = color; g.textBaseline = 'alphabetic';
  const total = fit.lines.length * fit.lh, y0 = y + Math.max(0, (boxH - total) * 0.4);
  fit.lines.forEach((ln, i) => {
    const lx = center ? x + (boxW - g.measureText(ln).width) / 2 : x;
    g.fillText(ln, lx, y0 + fit.lh * (i + 0.8));
  });
}

// --- 종이 텍스처 (캔버스 y는 아래로, 종이 y는 위로) ---
function drawPaper(g, cw, ch, tint, { ruled, knot }) {
  g.fillStyle = tint; g.fillRect(0, 0, cw, ch);
  const k = cw / 1200, X = x => x / SHEET.W * cw, Y = y => ch - y / SHEET.H * ch;
  if (ruled) {
    g.strokeStyle = 'rgba(105,140,180,.30)'; g.lineWidth = Math.max(1, 3 * k);
    for (let y = ch * 0.1; y < ch - 20 * k; y += 84 * k) { g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke(); }
    g.strokeStyle = 'rgba(205,110,100,.35)'; g.beginPath(); g.moveTo(cw * 0.11, 0); g.lineTo(cw * 0.11, ch); g.stroke();
  }
  const crease = (x0, y0, x1, y1) => {
    g.lineWidth = Math.max(1, 4 * k);
    g.strokeStyle = 'rgba(90,70,45,.15)'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.32)'; g.beginPath(); g.moveTo(x0 + 3 * k, y0 + 3 * k); g.lineTo(x1 + 3 * k, y1 + 3 * k); g.stroke();
  };
  if (knot) {
    for (let c = 1; c < 4; c++) crease(X(c * w), 0, X(c * w), ch);
    const lines = [[[TIP, 0], [TIP + w, w]], [[TIP + w, w], [TIP + 2 * w, 0]], [[TIP + 2 * w, 0], [TIP + 3 * w, w]]];
    for (let c = 0; c < 4; c++) for (const [a, b] of lines) {
      const [ax, ay] = toSheet(a), [bx, by] = toSheet(b), m = COL_MAP[c];
      crease(X(m(ax)), Y(ay), X(m(bx)), Y(by));
    }
  } else {
    crease(cw / 2, 0, cw / 2, ch); crease(0, ch / 2, cw, ch / 2);
  }
}
// anisotropy: 호출자가 renderer.capabilities.getMaxAnisotropy() 를 넘긴다 (기본 1)
function texFrom(cv, anisotropy = 1) {
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy; return t;
}
// 뒷면 텍스처 캐시. 쪽지 여럿이 나눠 쓸 수 있게 호출자가 만들어 넘긴다.
// 공유한 캐시는 호출자가 disposeBackCache 로 치운다. 넘기지 않으면 쪽지마다 하나를 만들고 p.dispose() 가 치운다.
export const createBackCache = () => new Map();
export function disposeBackCache(cache) { for (const t of cache.values()) t.dispose(); cache.clear(); }
function backTexture(cache, anisotropy, tint, knot) {
  const key = tint + knot;
  if (!cache.has(key)) {
    const cv = document.createElement('canvas'); [cv.width, cv.height] = knot ? BACK_PX : [280, 360];
    drawPaper(cv.getContext('2d'), cv.width, cv.height, tint, { ruled: knot, knot }); cache.set(key, texFrom(cv, anisotropy));
  }
  return cache.get(key);
}
// 글 쓴 면에서 팬의 글이 앉는 상자 (텍스처 픽셀). tree-write.js 의 글상자가 같은 상자를 종이 위에 겹친다.
// 답장은 종이 옆에 따로 서므로 답장이 있어도 같은 상자다.
export function frontTextBox() {
  const [cw, ch] = FRONT_PX, x = cw * 0.11 + 50, top = 130;
  return { cw, ch, x, top, boxW: cw - x - 70, boxH: ch * 0.78 - top };
}
function frontTexture(data, anisotropy) {
  const [cw, ch] = FRONT_PX, cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d'); drawPaper(g, cw, ch, tintFor(data), { ruled: true, knot: true });
  const font = fontFor(data), s = FONT_SCALE[font] ?? 1;
  const { x, boxW, top, boxH } = frontTextBox();
  const fit = fitText(g, data.msg, font, boxW, boxH, Math.round(290 * s), Math.round(62 * s), data.fontSize);
  drawBlock(g, fit, font, x, top, boxW, boxH, '#2e2a24', fit.lines.length === 1);
  // 이름과 날짜는 왼쪽 아래
  const nm = fitLine(g, '- ' + (data.name ?? '익명'), `"${font}"`, Math.round(84 * s), Math.round(40 * s), boxW);
  g.font = `${nm.px}px "${font}"`; g.fillStyle = '#4a4034'; g.fillText(nm.text, x, ch * 0.875);
  const dt = fitLine(g, String(data.date ?? ''), 'system-ui, sans-serif', 40, 24, boxW);
  g.font = `${dt.px}px system-ui, sans-serif`; g.fillStyle = 'rgba(80,70,55,.7)'; g.fillText(dt.text, x, ch * 0.875 + 62);
  // 오른쪽 위의 작은 딱지: 방 주인이 숨김, 또는 판정에 걸려 작성자에게만 보이는 쪽지 (0013)
  const tag = data.hidden ? '숨겨짐' : data.screen === 'blocked' ? '게시 안 됨' : data.screen === 'held' ? '검토 중' : null;
  if (tag) {
    g.font = '600 44px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    const tw = g.measureText(tag).width, px = 22, rx = cw - 70 - tw - px * 2, ry = 52, rh = 64;
    g.strokeStyle = 'rgba(90,80,64,.7)'; g.lineWidth = 3; g.beginPath(); g.roundRect(rx, ry, tw + px * 2, rh, rh / 2); g.stroke();
    g.fillStyle = 'rgba(90,80,64,.85)'; g.fillText(tag, cw - 70 - px, ry + rh / 2 + 2);
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  }
  return texFrom(cv, anisotropy);
}
// 답장 종이에서 글이 앉는 상자 (텍스처 픽셀). tree-owner.js 의 글상자가 같은 상자를 답장 종이 위에 겹친다.
export function replyTextBox() {
  const [cw, ch] = REPLY_PX;
  return { cw, ch, x: 80, top: 170, boxW: cw - 160, boxH: ch - 170 - 100 };
}
// 답장 글이 상자에 드는 크기와 줄바꿈 (종이에 그릴 때와 글상자가 같은 값을 쓴다). wantPx: 고른 글자 크기 (없으면 자동 맞춤, 쪽지와 같은 맞춤 규칙)
export function fitReply(g, text, font = REPLY_FONT, wantPx = null) {
  const s = FONT_SCALE[font] ?? 1, { boxW, boxH } = replyTextBox();
  return fitText(g, text, font, boxW, boxH, Math.round(REPLY_MAX_PX * s), Math.round(62 * s), wantPx);
}
// 답장 글자 크기의 범위: 하한(쪽지와 같다)과 지금 글이 상자에 드는 가장 큰 크기
export function replySizeRange(g, text, font = REPLY_FONT) {
  const s = FONT_SCALE[font] ?? 1, { boxW, boxH } = replyTextBox();
  const min = Math.round(62 * s), auto = fitAuto(g, text, font, boxW, boxH, Math.round(REPLY_MAX_PX * s), min);
  return { min, max: Math.max(min, auto.px) };
}
function replyTexture(data, anisotropy) {
  const [cw, ch] = REPLY_PX, cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d'); drawPaper(g, cw, ch, REPLY_TINT, { ruled: false, knot: false });
  const hd = fitLine(g, '크리에이터의 답장', 'system-ui, sans-serif', 54, 32, cw - 160, '600 ');
  g.font = `600 ${hd.px}px system-ui, sans-serif`; g.fillStyle = '#a6613c'; g.textBaseline = 'alphabetic';
  g.fillText(hd.text, 80, 120);
  const font = replyFontFor(data), { x, top, boxW, boxH } = replyTextBox();
  const fit = fitReply(g, data.reply, font, data.replySize);
  drawBlock(g, fit, font, x, top, boxW, boxH, '#6e3418', false);
  return texFrom(cv, anisotropy);
}

// --- 쪽지 ---
// opts.anisotropy: 텍스처 이방성 (기본 1). opts.backCache: createBackCache() 로 만든 공유 캐시 (선택).
export function buildPacket(data, opts = {}) {
  const anisotropy = opts.anisotropy ?? 1;
  const ownCache = !opts.backCache, cache = opts.backCache ?? createBackCache();
  const tint = tintFor(data);
  const paperMat = (map, side) => new THREE.MeshStandardMaterial({ map, side, roughness: 0.95, emissive: 0xffc070, emissiveIntensity: 0 });
  // 글 쓴 면은 매듭 안쪽이다. 펼쳐져 있는 동안에만 글 텍스처를 받는다.
  const fanBack = backTexture(cache, anisotropy, tint, true);
  const fanFront = paperMat(fanBack, THREE.FrontSide), fanBackMat = paperMat(fanBack, THREE.BackSide);
  const knot = buildKnot(fanFront, fanBackMat);
  // root -> centerer (보이는 종이를 가운데에) -> spin -> 종이
  // spin 은 쪽지를 자기 평면에서 한 바퀴의 4분의 1 돌린다: 트리 위에서는 띠가 기준 그림처럼 눕고,
  // 펼치면 종이가 선다. 날아가는 동안 돌며 앞면이 늘 보는 쪽을 향한다.
  const root = new THREE.Group(), centerer = new THREE.Group(), spin = new THREE.Group();
  root.add(centerer); centerer.add(spin); spin.add(knot.root);
  // pair: 0..1 답장이 나오며 두 종이가 가운데로 옮겨간 정도. pairW: 이 쪽지를 화면에 맞출 때 필요한 너비
  const p = { data, root, centerer, spin, knot, mats: [fanFront, fanBackMat], fanFront, t: 0, reply: null, pair: 0, pairW: data.reply ? PAIR_W : SHEET.W, textOn: false, anisotropy, cache, ownCache };

  if (data.reply) {
    const rBack = backTexture(cache, anisotropy, REPLY_TINT, false);
    const rFront = paperMat(rBack, THREE.FrontSide), rBackMat = paperMat(rBack, THREE.BackSide);
    const sheet = buildAccordion(REPLY, rFront, rBackMat);
    // 끼워 둠: 띠의 맨 위 두 겹 사이, 긴 끝 안에 작게 접혀 있다. 접힘이 가려서 종이가 한 장 너비로 열릴 때 나타난다
    knot.segs.BAND.cells[1].add(sheet.root);
    const fw = sheet.cw * REPLY_TUCK_S, fh = sheet.rh[0] * REPLY_TUCK_S, bandMid = (TIP + 3 * w + L) / 2;
    const tuck = { p: new THREE.Vector3(1.5 * w - fw / 2, bandMid + fh / 2, 0.00004), rz: 0 };
    // 보임: 펼친 종이의 오른쪽 옆에 위아래 가운데로 선다 (p 는 답장 종이의 왼쪽 위 모서리)
    const show = { p: new THREE.Vector3(SHEET.W + REPLY_GAP, (SHEET.H + REPLY.H) / 2, 0.004), rz: 0 };
    sheet.root.position.copy(tuck.p); sheet.root.scale.setScalar(REPLY_TUCK_S);
    // writing: 방 주인이 답장을 쓰는 중이다 (tree-owner.js). 접힌 채 나오는 대신 화면 아래에서 펼친 채 올라온다 (setReplyRise). rise 0..1, startY: rise 0 일 때 왼쪽 위 모서리의 y
    p.reply = { sheet, front: rFront, tuck, show, writing: !!data.replyWriting, rise: 0, startY: -0.4 };
    p.mats.push(rFront, rBackMat);
  }

  // 펼침 타임라인 = 접는 단계의 거꾸로. 한 박자가 접선 하나의 회전이고 박자 사이에 짧은 쉼이 있다
  const H = knot.hinges, REST = 0.12;
  const segs = [
    { k: 'rise', d: 0.45 },                                            // 0 장식에서 올라온다
    { k: 'h', d: 0.5, hs: [H.BAND] },                                  // 1 긴 끝이 나온다: 꼬리가 나란히
    { k: 'h', d: 0.55, hs: [H.TAIL] },                                 // 2 대각선이 펴진다: ㄱ자로 돌아간다
    { k: 'h', d: 0.5, hs: [H.TIP] },                                   // 3 45도 끝이 펴진다: 곧은 띠
    { k: 'h', d: 0.5, hs: [...knot.cols[1], ...knot.cols[3]] },        // 4 띠 -> 반 너비
    { k: 'h', d: 0.5, hs: knot.cols[2] },                              //   반 -> 온 종이
  ];
  if (p.reply && !p.reply.writing) {
    segs.push({ k: 'lift', d: 0.55 });
    segs.push({ k: 'h', d: 0.45, hs: [...p.reply.sheet.rowHinges, ...p.reply.sheet.colHinges.flat()] });
  }
  let s0 = 0; for (const s of segs) { s.s = s0; s0 += s.d + REST; }
  s0 -= REST;
  p.segs = segs; p.total = s0;
  applyPose(p, 0);
  root.traverse(o => { o.userData.packet = p; });

  // 글씨체가 실제로 불러와지면 열려 있는 쪽지를 다시 그린다
  const loads = [{ font: fontFor(data), text: data.msg + (data.name ?? '익명') + '- ' }];
  if (data.reply) loads.push({ font: replyFontFor(data), text: data.reply });
  // opts.lazyFonts: 지을 때는 글씨체를 부르지 않는다. 트리처럼 쪽지가 많을 때 열려는 쪽지만 p.loadFonts() 로 부른다.
  p.loadFonts = () => (p.fontsReady = loadNoteFonts(loads).then(() => { if (p.textOn) writeText(p); }));
  p.fontsReady = opts.lazyFonts ? Promise.resolve() : p.loadFonts();

  // 지오메트리, 재질, 글 텍스처, 자기 캐시를 모두 치운다. 공유 캐시는 건드리지 않는다.
  p.dispose = () => {
    for (const m of p.mats) if (m.userData.own) { m.map?.dispose(); m.map = null; m.userData.own = false; }
    disposeScene(p.root); // 캐시 텍스처는 여기서 한 번 더 dispose 되어도 해가 없다
    if (p.ownCache) disposeBackCache(p.cache);
  };
  return p;
}

export const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// 펼침 타임라인의 시각 t의 자세 (0 = 트리에 매듭, total = 완전히 펼침)
export function applyPose(p, t) {
  p.t = t;
  for (const s of p.segs) {
    const f = ease(THREE.MathUtils.clamp((t - s.s) / s.d, 0, 1));
    if (s.k === 'h') s.hs.forEach(h => setHinge(h, 1 - f));
    else if (s.k === 'rise') {
      // 오르기 전에는 장식 안에 숨어 있다. 나오며 커지고 똑바로 선다
      p.root.visible = t > s.s;
      p.spin.rotation.z = -Math.PI / 2 * (1 - f);
      p.root.scale.setScalar(THREE.MathUtils.lerp(INSIDE_SCALE, 1, f));
      p.root.position.set(0, Math.sin(Math.PI * f) * 0.03, 0.012 * f);
    } else if (s.k === 'lift') liftReply(p, f);
  }
  if (p.reply?.writing) placeWritingReply(p);
  recentre(p);
}
// 안에 든 접힌 답장이 호를 그리며 나와 오른쪽 옆에 앉는다. 커지며 (접힌 종이가 펼친 크기로), 두 종이는 화면 가운데로 옮겨간다.
function liftReply(p, f) {
  const { tuck, show, sheet } = p.reply;
  sheet.root.position.lerpVectors(tuck.p, show.p, f);
  sheet.root.position.z += Math.sin(Math.PI * f) * 0.03;
  sheet.root.rotation.z = THREE.MathUtils.lerp(tuck.rz, show.rz, f);
  sheet.root.scale.setScalar(THREE.MathUtils.lerp(REPLY_TUCK_S, 1, f));
  p.pair = f;
}
// 답장을 쓰는 중: 펼친 종이가 화면 아래에서 옆자리로 올라온다
function placeWritingReply(p) {
  const r = p.reply, f = ease(THREE.MathUtils.clamp(r.rise, 0, 1));
  r.sheet.root.position.set(r.show.p.x, THREE.MathUtils.lerp(r.startY, r.show.p.y, f), r.show.p.z);
  r.sheet.root.rotation.z = 0; r.sheet.root.scale.setScalar(1);
  p.pair = f;
}
/** 답장 쓰기 종이가 올라온 정도 (0 화면 아래 .. 1 옆자리). startY: rise 0 일 때 종이 왼쪽 위 모서리의 y (쪽지 종이 좌표, 화면 아래 끝보다 낮게) */
export function setReplyRise(p, rise, startY) {
  const r = p.reply; if (!r?.writing) return;
  r.rise = rise;
  if (Number.isFinite(startY)) r.startY = startY;
  applyPose(p, p.t);
}
// 보이는 종이의 바운딩 박스를 root (그래서 카메라 축) 가운데에 둔다
const _v = new THREE.Vector3(), _inv = new THREE.Matrix4(), _box = new THREE.Box3();
export function recentre(p) {
  p.centerer.position.set(0, 0, 0);
  p.root.updateMatrixWorld(true);
  _inv.copy(p.centerer.matrixWorld).invert(); _box.makeEmpty();
  for (const m of p.knot.fronts) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) _box.expandByPoint(_v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(_inv));
  }
  _box.getCenter(_v); p.centerer.position.copy(_v).negate();
  p.centerer.position.x -= p.pair * PAIR_SHIFT; // 답장이 옆에 서면 두 종이가 가운데에 오도록 (답장은 팬 종이에 걸려 있어 함께 움직인다)
  p.root.updateMatrixWorld(true);
}

// 글 텍스처는 쪽지가 열려 있는 동안에만 있다
function setReading(mat, map) {
  if (mat.userData.own) mat.map.dispose();
  // 저녁 빛은 어둡고 주황이다: 펼친 종이가 자기 빛을 가져 종이로 읽힌다
  mat.map = map; mat.emissiveMap = map; mat.emissive.set(0xffffff); mat.emissiveIntensity = 0.6; mat.needsUpdate = true; mat.userData.own = true;
}
function setResting(mat, map) {
  if (mat.userData.own) mat.map.dispose();
  mat.map = map; mat.emissiveMap = null; mat.emissive.set(0xffc070); mat.emissiveIntensity = 0; mat.needsUpdate = true; mat.userData.own = false;
}
export function writeText(p) {
  setReading(p.fanFront, frontTexture(p.data, p.anisotropy));
  if (p.reply) setReading(p.reply.front, replyTexture(p.data, p.anisotropy));
  p.textOn = true;
}
export function eraseText(p) {
  setResting(p.fanFront, backTexture(p.cache, p.anisotropy, tintFor(p.data), true));
  if (p.reply) setResting(p.reply.front, backTexture(p.cache, p.anisotropy, REPLY_TINT, false));
  p.textOn = false;
}

// --- 쪽지 단계: 날아오고, 껍데기가 열리고, 쪽지 자신의 타임라인(오름, 펼침, 답장)이 이어진다 ---
export const N_FLY = 0.35, N_OPEN_AT = 0.45, N_OPEN = 0.4, N_GAP = 0.05;
// 껍데기가 열리고 난 뒤 쪽지 타임라인이 시작하는 시각과 전체 길이
export const noteTimes = pk => { const offset = N_OPEN_AT + N_OPEN + N_GAP; return { offset, total: offset + pk.total }; };
// 임시 시험 (debug-flags.js): 꺼 둔 구간 안으로 들어가는 t 는 움직이는 쪽의 끝으로 건너뛴다.
// 호출하는 쪽은 돌려준 값 대신 n.t 를 읽어야 끝에 닿은 것을 안다.
function skipTest(n, t) {
  const from = n.t ?? t;
  if (t === from) return t;
  // 두 구간은 n.offset 에서 맞닿는다: 둘 다 꺼져 있으면 한 구간으로 합친다
  const a = ANIM_TEST.bauble ? n.offset : N_FLY, b = ANIM_TEST.fold ? n.offset : n.total;
  if (a >= b) return t;
  if (t > from && t > a && t < b) return b;
  if (t < from && t < b && t > a) return a;
  return t;
}
// n: { pk, orn, offset, shellDrop, t }.
// flight: { from: { p, q }, to: { p, q } } 날아오는 구간의 출발과 도착 자세. 없으면 n.root 의 자세는 건드리지 않는다.
export function applyNote(n, t, flight = n.flight) {
  t = skipTest(n, t);
  n.t = t;
  const clamp01 = v => THREE.MathUtils.clamp(v, 0, 1);
  const fFly = ease(clamp01(t / N_FLY));
  if (flight) {
    n.root.position.lerpVectors(flight.from.p, flight.to.p, fFly);
    n.root.quaternion.slerpQuaternions(flight.from.q, flight.to.q, fFly);
  }
  n.orn.setOpen(ease(clamp01((t - N_OPEN_AT) / N_OPEN)));
  const tp = t - n.offset, rise = n.pk.segs[0], fR = ease(clamp01((tp - rise.s) / rise.d));
  // 쪽지가 올라오는 동안 껍데기는 어둡게 아래 가장자리로 내려앉는다
  n.orn.group.position.set(0, -n.shellDrop * fR, -0.03 * fR);
  n.orn.group.scale.setScalar(1 - 0.25 * fR);
  n.orn.setDim(1 - 0.45 * fR);
  applyPose(n.pk, Math.max(0, tp));
}
