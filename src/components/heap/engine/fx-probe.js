// 방 효과 측정 (개발 전용, dev.js 의 'fxprobe' 명령). 스크린숏을 눈으로 보는 대신 같은 프레임을 효과마다 그려 숫자로 비교한다.
//   root.dispatchEvent(new CustomEvent('heap:dev', { detail: { cmd: 'fxprobe', configs, cb } }))
//   configs: [{ name, set: { ao: { on: true, radius: 0.5 }, ... } }]. 맨 앞은 기준(모두 끔)으로 자동으로 들어간다.
// 프레임 루프를 멈추고 그리므로 먼지, 반짝임, 캐릭터가 움직이지 않는다. 같은 설정을 두 번 그리면 차이가 0 이어야 한다 ('noise' 행).
//
// 잰 값 (모두 방 영역 안, 배경 하늘은 뺀다):
//   L* 분포(p1, p50, p99), 검정 뭉개짐(L*<5 비율), 흰색 날아감(L*>98 비율), 평균 채도 C*, 색상각 h°
//   기준 대비 ΔE76 (평균, p95, 2.3 넘는 비율: CIE 1976 에서 겨우 보이는 차이)
//   AO: 트인 바닥의 ΔL* (0 에 가까워야 한다), 벽과 바닥이 만나는 구석의 ΔL* (음수여야 한다)
//   선명도: 사진 더미 영역 L* 라플라시안 분산의 기준 대비 비율 (흐려지면 1 아래로)
//   블룸: 방 영역에서 L* 가 2 넘게 밝아진 화소 비율
//   그림자: 해 그림자를 켠 그림과 끈 그림의 차이(그림자 마스크)에서, 트인 바닥 위 가장자리의 10~90% 전이 폭(cm) 분포
//   시간: 한 장 그리는 데 걸린 ms (GPU 가 끝날 때까지 기다린다, 60 장의 중앙값)
import * as THREE from 'three';
import { FX, FX_GROUPS, fxDefaults } from './fx-flags.js';

// ─── 색 변환: sRGB 8bit → CIELAB (D65) ───
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const v = i / 255; LIN[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
const fLab = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
function toLab(data, n) {
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = LIN[data[j]], g = LIN[data[j + 1]], b = LIN[data[j + 2]];
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const fx = fLab(x), fy = fLab(y), fz = fLab(z);
    L[i] = 116 * fy - 16; A[i] = 500 * (fx - fy); B[i] = 200 * (fy - fz);
  }
  return { L, A, B };
}

// ─── 화면 위의 영역 (마스크) ───
function polyMask(W, H, pts, mask) {
  // 볼록 다각형 채우기 (화면 좌표 pts)
  const n = pts.length;
  let y0 = H, y1 = 0;
  for (const p of pts) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
    let xa = Infinity, xb = -Infinity;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) { const x = a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x); xa = Math.min(xa, x); xb = Math.max(xb, x); }
    }
    for (let x = Math.max(0, Math.ceil(xa)); x <= Math.min(W - 1, Math.floor(xb)); x++) mask[y * W + x] = 1;
  }
  return mask;
}
function discMask(W, H, c, r, mask) {
  for (let y = Math.max(0, Math.floor(c.y - r)); y <= Math.min(H - 1, Math.ceil(c.y + r)); y++)
    for (let x = Math.max(0, Math.floor(c.x - r)); x <= Math.min(W - 1, Math.ceil(c.x + r)); x++)
      if ((x - c.x) ** 2 + (y - c.y) ** 2 <= r * r) mask[y * W + x] = 1;
  return mask;
}

export function makeProbe(ctx) {
  const { renderer, scene, camera, canvas, RX, RZ, WALL_H } = ctx;
  const ray = new THREE.Raycaster();
  ray.camera = camera; // 반짝임(Sprite)도 장면에 있다: Sprite 의 raycast 는 카메라가 있어야 한다
  const toPx = (v, W, H) => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, z: p.z }; };
  // 카메라에서 그 점이 보이는가 (앞을 가리는 것이 없는가)
  const visible = v => {
    const d = v.distanceTo(camera.position);
    ray.set(camera.position, v.clone().sub(camera.position).normalize());
    const hit = ray.intersectObjects(scene.children, true).find(h => h.object.isMesh && h.object.visible && ![].concat(h.object.material).every(m => m.transparent));
    return !hit || hit.distance > d - 0.03;
  };
  // 그 바닥 점 위에 아무것도 없는가 (위에서 내려 쏘아 처음 닿는 것이 바닥 널인가)
  const floorClear = (x, z) => {
    ray.set(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(scene.children, true).find(h => h.object.isMesh && h.object.visible && ![].concat(h.object.material).every(m => m.transparent));
    return !!hit && Math.abs(hit.point.y) < 0.02;
  };

  function regions(W, H) {
    const room = new Uint8Array(W * H);
    const P = (x, y, z) => toPx(new THREE.Vector3(x, y, z), W, H);
    polyMask(W, H, [P(-RX, 0, -RZ), P(RX, 0, -RZ), P(RX, 0, RZ), P(-RX, 0, RZ)], room);
    polyMask(W, H, [P(-RX, 0, -RZ), P(RX, 0, -RZ), P(RX, WALL_H, -RZ), P(-RX, WALL_H, -RZ)], room);
    polyMask(W, H, [P(-RX, 0, -RZ), P(-RX, 0, RZ), P(-RX, WALL_H, RZ), P(-RX, WALL_H, -RZ)], room);
    const pxPerM = at => { const a = P(at.x, at.y, at.z), b = P(at.x + 0.1, at.y, at.z); return Math.hypot(b.x - a.x, b.y - a.y) * 10; };
    // 트인 바닥: 0.8 m 고리 안이 모두 바닥이고 카메라에서 보이는 점들 (가장 트인 3곳)
    const open = [];
    for (let x = -RX + 1; x <= RX - 1; x += 0.5) for (let z = -RZ + 1; z <= RZ - 1; z += 0.5) {
      let ok = floorClear(x, z);
      for (let k = 0; ok && k < 8; k++) ok = floorClear(x + 0.8 * Math.cos(k * Math.PI / 4), z + 0.8 * Math.sin(k * Math.PI / 4));
      if (ok && visible(new THREE.Vector3(x, 0.001, z))) open.push(new THREE.Vector3(x, 0, z));
    }
    open.sort((a, b) => b.x + b.z - (a.x + a.z)); // 카메라 쪽(앞)부터
    const floorOpen = new Uint8Array(W * H);
    for (const v of open.slice(0, 3)) discMask(W, H, P(v.x, 0, v.z), 0.25 * pxPerM(v), floorOpen);
    // 구석: 뒷벽·왼벽이 바닥과 만나는 줄, 가구가 없고 보이는 곳
    const crease = new Uint8Array(W * H);
    let creaseN = 0;
    for (let u = -RX + 0.3; u <= RX - 0.3; u += 0.25) {
      const v = new THREE.Vector3(u, 0.03, -RZ + 0.03);
      if (floorClear(u, -RZ + 0.25) && visible(v)) { discMask(W, H, P(v.x, v.y, v.z), Math.max(2, 0.05 * pxPerM(v)), crease); creaseN++; }
    }
    for (let w = -RZ + 0.3; w <= RZ - 0.3; w += 0.25) {
      const v = new THREE.Vector3(-RX + 0.03, 0.03, w);
      if (floorClear(-RX + 0.25, w) && visible(v)) { discMask(W, H, P(v.x, v.y, v.z), Math.max(2, 0.05 * pxPerM(v)), crease); creaseN++; }
    }
    const pile = new Uint8Array(W * H);
    const HOST = ctx.HOST;
    if (HOST) polyMask(W, H, [P(HOST.x - HOST.w / 2, HOST.top, HOST.z - HOST.d / 2), P(HOST.x + HOST.w / 2, HOST.top, HOST.z - HOST.d / 2), P(HOST.x + HOST.w / 2, HOST.top, HOST.z + HOST.d / 2), P(HOST.x - HOST.w / 2, HOST.top, HOST.z + HOST.d / 2)], pile);
    return { room, floorOpen, crease, pile, openN: Math.min(3, open.length), creaseN, P, pxPerM };
  }

  // 한 장 그려 화소를 읽는다 (그린 바로 그 틱에 옮겨야 지워지기 전이다)
  const cv2 = document.createElement('canvas');
  function grab() {
    ctx.draw();
    const W = canvas.width, H = canvas.height;
    cv2.width = W; cv2.height = H;
    const g = cv2.getContext('2d', { willReadFrequently: true });
    g.drawImage(canvas, 0, 0);
    return { W, H, data: g.getImageData(0, 0, W, H).data };
  }
  const gl = renderer.getContext(), px = new Uint8Array(4);
  function timeDraws(n) {
    const t = [];
    for (let i = 0; i < n; i++) {
      const a = performance.now();
      ctx.draw();
      renderer.setRenderTarget(null);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // GPU 가 끝날 때까지 기다린다
      t.push(performance.now() - a);
    }
    t.sort((x, y) => x - y);
    return t[Math.floor(n / 2)];
  }

  const pct = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))];
  function stats(lab, mask) {
    const Ls = [], n = mask.length;
    let sC = 0, sA = 0, sB = 0, k = 0, crush = 0, clip = 0, sL = 0, sL2 = 0;
    for (let i = 0; i < n; i++) if (mask[i]) {
      const L = lab.L[i]; Ls.push(L); sL += L; sL2 += L * L; k++;
      if (L < 5) crush++; if (L > 98) clip++;
      sC += Math.hypot(lab.A[i], lab.B[i]); sA += lab.A[i]; sB += lab.B[i];
    }
    Ls.sort((a, b) => a - b);
    const mean = sL / k;
    return {
      n: k, meanL: mean, sdL: Math.sqrt(sL2 / k - mean * mean), p1: pct(Ls, 0.01), p50: pct(Ls, 0.5), p99: pct(Ls, 0.99),
      crushPct: 100 * crush / k, clipPct: 100 * clip / k, meanC: sC / k, hue: (Math.atan2(sB, sA) * 180 / Math.PI + 360) % 360,
    };
  }
  function delta(a, b, mask) {
    const d = [];
    let sL = 0, k = 0, jnd = 0, bright = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) {
      const dL = b.L[i] - a.L[i], e = Math.hypot(dL, b.A[i] - a.A[i], b.B[i] - a.B[i]);
      d.push(e); sL += dL; k++; if (e > 2.3) jnd++; if (dL > 2) bright++;
    }
    d.sort((x, y) => x - y);
    return { meanE: d.reduce((s, v) => s + v, 0) / (k || 1), p95E: pct(d, 0.95) ?? 0, jndPct: 100 * jnd / (k || 1), meanDL: sL / (k || 1), brighterPct: 100 * bright / (k || 1) };
  }
  function lapVar(lab, mask, W, H) {
    let s = 0, s2 = 0, k = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      const v = 4 * lab.L[i] - lab.L[i - 1] - lab.L[i + 1] - lab.L[i - W] - lab.L[i + W];
      s += v; s2 += v * v; k++;
    }
    return k ? s2 / k - (s / k) ** 2 : 0;
  }
  // 그림자 가장자리 폭: 해 그림자를 켠 그림과 끈 그림의 L* 차이(그림자 마스크)에서, 트인 바닥 위의 가장자리를 골라
  // 마스크 기울기 방향으로 10~90% 전이 폭을 잰다. 화소 폭은 바닥 평면(y=0)에 되쏘아 cm 로 바꾼다.
  // 기준(PCF)과 PCSS 가 같은 자리를 재도록 가장자리 화소는 기준 마스크에서 한 번 고른다 (edgeSet).
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2(), hitP = new THREE.Vector3();
  function floorAt(x, y, W, H) {
    ndc.set(x / W * 2 - 1, 1 - y / H * 2);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hitP)) return null;
    return hitP.clone();
  }
  function shadowMask() {
    const sun = ctx.sun, was = sun.castShadow;
    const lit = grabOpaque();
    sun.castShadow = false;
    let off;
    try { ctx.draw(); off = grabOpaque(); } finally { sun.castShadow = was; ctx.draw(); }
    const a = toLab(lit.data, lit.W * lit.H), b = toLab(off.data, off.W * off.H);
    const m = new Float32Array(lit.W * lit.H);
    for (let i = 0; i < m.length; i++) m[i] = b.L[i] - a.L[i]; // 그림자가 진 만큼 양수
    return { m, W: lit.W, H: lit.H };
  }
  function pickEdges(S) {
    const { m, W, H } = S, out = [];
    for (let y = 24; y < H - 24; y += 3) for (let x = 24; x < W - 24; x += 3) {
      const i = y * W + x, gx = m[i + 1] - m[i - 1], gy = m[i + W] - m[i - W], g = Math.hypot(gx, gy);
      if (g < 3) continue;
      const p = floorAt(x, y, W, H);
      if (!p || Math.abs(p.x) > RX - 0.05 || Math.abs(p.z) > RZ - 0.05) continue;
      if (!floorClear(p.x, p.z) || !visible(p.clone().setY(0.001))) continue;
      out.push({ x, y, dx: gx / g, dy: gy / g });
      if (out.length >= 300) return out;
    }
    return out;
  }
  function edgeWidths(S, edges) {
    const { m, W, H } = S, cms = [];
    const at = (x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi < 0 || yi < 0 || xi >= W || yi >= H ? NaN : m[yi * W + xi]; };
    for (const e of edges) {
      const prof = [];
      for (let s = -20; s <= 20; s += 0.5) prof.push(at(e.x + e.dx * s, e.y + e.dy * s));
      if (prof.some(Number.isNaN)) continue;
      const lo = Math.min(...prof.slice(0, 6)), hi = Math.max(...prof.slice(-6));
      if (hi - lo < 10) continue;
      const cross = f => { const t = lo + f * (hi - lo); for (let k = 1; k < prof.length; k++) if (prof[k] >= t && prof[k - 1] < t) return (k - 1 + (t - prof[k - 1]) / (prof[k] - prof[k - 1])) * 0.5; return NaN; };
      const px = cross(0.9) - cross(0.1);
      const a = floorAt(e.x, e.y, W, H), b = floorAt(e.x + e.dx * 10, e.y + e.dy * 10, W, H);
      if (!a || !b || !Number.isFinite(px) || px <= 0) continue;
      cms.push(px * a.distanceTo(b) / 10 * 100);
    }
    cms.sort((p, q) => p - q);
    return cms.length ? { n: cms.length, p10: pct(cms, 0.1), p50: pct(cms, 0.5), p90: pct(cms, 0.9) } : { n: 0 };
  }
  // ΔE76 열지도 (PNG data URL): 밝을수록 차이가 크다. 10 이면 흰색
  function heat(a, b, W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), im = g.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const e = Math.min(255, Math.hypot(b.L[i] - a.L[i], b.A[i] - a.A[i], b.B[i] - a.B[i]) * 25.5);
      im.data[i * 4] = e; im.data[i * 4 + 1] = e; im.data[i * 4 + 2] = e; im.data[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return c.toDataURL('image/png');
  }

  // 설정 하나를 FX 에 넣는다: 기본값에서 모두 끈 뒤 set 을 덮는다
  function load(set) {
    const d = fxDefaults();
    for (const g of FX_GROUPS) { FX[g.key] = { ...d[g.key], on: false, ...(set?.[g.key] ?? {}) }; }
    ctx.fxApply();
  }

  // 투명한 것(빛줄기, 창유리, 먼지)을 감추고 한 장: 햇빛 자국의 가장자리를 그림자 지도만으로 잰다 (빛줄기 메시의 끝선이 섞이지 않게)
  function grabOpaque() {
    const hid = [];
    scene.traverse(o => { if (o.visible && (o.isPoints || o.isSprite || (o.isMesh && [].concat(o.material).every(m => m?.transparent)))) { o.visible = false; hid.push(o); } });
    try { return grab(); } finally { for (const o of hid) o.visible = true; }
  }

  // hour: 측정하는 동안 방의 시각을 고정한다 (해의 방향과 세기가 바뀌지 않게). 끝나면 원래 선택으로 돌린다
  return async function probe(configs, { time = true, hour = 15 } = {}) {
    const saved = structuredClone(FX);
    cancelAnimationFrame(ctx.raf);
    // 보는 사람의 시간대(heap:viewtime)가 방의 시간대보다 앞서므로 그쪽으로 고정한다. 끝나면 null 로 풀어 방의 시간대로 돌아간다
    // (설정 화면에서 고른 시간대는 새로고침하면 다시 들어온다)
    ctx.root.dispatchEvent(new CustomEvent('heap:viewtime', { detail: hour }));
    // 램프 불빛 세기는 프레임 루프(loop.js)가 넣는다. 루프를 멈췄으므로 여기서 한 번 넣는다
    for (const l of ctx.build?.lamps ?? []) if (l.light) l.light.intensity = l.fixed ?? ctx.lampBase;
    const rows = [];
    try {
      const all = [{ name: 'base (모두 끔)', set: {} }, { name: 'noise (같은 설정 다시)', set: {} }, { name: 'pipeline (체인만, 효과 없음)', set: {}, force: true }, ...configs];
      let base = null, pipe = null, R = null, baseLap = 0, pipeLap = 0, edgeSet = null;
      for (const cfg of all) {
        load(cfg.set);
        ctx.fxForce = !!cfg.force;
        ctx.fxShaftK = cfg.shaftK; // 빛줄기 불투명도 배율 시험 (fx.js 의 SHAFT_K). 없으면 기본값
        ctx.draw(); ctx.draw(); // 셰이더를 다시 만든 뒤 한 장은 버린다
        const img = grab();
        if (cfg.png) img.png = cv2.toDataURL('image/png');
        const lab = toLab(img.data, img.W * img.H);
        if (!R) R = regions(img.W, img.H);
        const row = { name: cfg.name, room: stats(lab, R.room), light: { exposure: renderer.toneMappingExposure, hemi: ctx.hemi?.intensity, sun: ctx.sun?.intensity } };
        const lap = lapVar(lab, R.pile, img.W, img.H);
        if (!base) { base = lab; baseLap = lap; row.regions = { openSpots: R.openN, creaseSpots: R.creaseN, W: img.W, H: img.H }; }
        else {
          row.vsBase = delta(base, lab, R.room);
          row.openFloorDL = delta(base, lab, R.floorOpen).meanDL;
          row.creaseDL = delta(base, lab, R.crease).meanDL;
          row.pileSharp = baseLap ? lap / baseLap : null;
        }
        if (cfg.force) { pipe = lab; pipeLap = lap; }
        else if (pipe && base !== lab) {
          // 체인을 쓰는 효과는 체인만 그린 그림과도 비교한다: 효과 자체의 몫
          row.vsPipe = delta(pipe, lab, R.room);
          row.openFloorDLvsPipe = delta(pipe, lab, R.floorOpen).meanDL;
          row.creaseDLvsPipe = delta(pipe, lab, R.crease).meanDL;
          row.pileSharpVsPipe = pipeLap ? lap / pipeLap : null;
        }
        if (cfg.shadowEdges !== false && (cfg.set?.shadow || !edgeSet)) {
          const S = shadowMask();
          if (!edgeSet) edgeSet = pickEdges(S);
          row.shadowEdgeCm = edgeWidths(S, edgeSet);
        }
        if (cfg.png) row.png = img.png;
        if (cfg.heat) row.heat = heat(cfg.heat === 'pipe' && pipe ? pipe : base, lab, img.W, img.H);
        if (time) row.ms = timeDraws(60);
        rows.push(row);
      }
    } finally {
      ctx.fxForce = false; ctx.fxShaftK = undefined;
      for (const k of Object.keys(saved)) FX[k] = saved[k];
      ctx.fxApply();
      ctx.root.dispatchEvent(new CustomEvent('heap:viewtime', { detail: null }));
      ctx.frame();
    }
    return rows;
  };
}
