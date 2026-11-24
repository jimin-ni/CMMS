// 사람 모양과 걸음 움직임. 내 캐릭터(walk.js)와 함께 있는 다른 사람(presence.js)이 같이 쓴다.
// 모양은 미니미 모델 시트(단발, 2026-11-24 승인)의 치수를 따른다. 1 단위 = 1 m, 키 0.98, 얼굴은 +z.
//   시트: .claude/session-artifacts/minimi/sheet/, 블록아웃: .claude/session-artifacts/minimi/blockout/
// 천과 머리카락은 조각 안에서는 매끈하게, 단(밑단, 소매, 머리 끝)에서만 모서리를 세운다.
import * as THREE from 'three';
import { tone } from './palette.js';

export const WALK_SPEED = 2.4; // 미터/초
export const SIT_DROP = 0.134; // 바지 엉덩이 밑면 높이. 앉을 때 자리 높이에서 이만큼 내린다
export const SIT_LEGS = -1.2; // 앉은 다리 각도
const CUSHION_TOP = 0.1; // 더미 앞 방석 윗면 (예전 몸의 밑면 0.28 과 앉은 높이 -0.18 에서 잰 값)
export const HEAP_SIT_Y = CUSHION_TOP - SIT_DROP; // 방석에 앉았을 때 몸의 높이

// 생김새 기본값. 피부는 7 단계 사이의 0..1, 머리카락은 hex, 백반증은 덮는 정도와 무늬 번호.
export const SKIN = ['#f7e0cf', '#efcdb2', '#e0b08e', '#c68c64', '#a26a45', '#7a4a30', '#55321f'];
export const DEFAULT_LOOK = { skin: 0.17, hair: '#3D2C22', bald: false, vitiligo: 0, vitSeed: 3.7 };
const TROUSERS = '#565344', SHOE = '#4a3426', SOLE = '#e9dcc6', EYE = '#2a2230';

const D = Math.PI / 180;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const soft = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...extra });

// ---------- 머리: 폭 532, 높이 518, 깊이 500(뒤통수 쪽이 조금 더 깊다), 중심 0.697. 볼이 조금 차 있다 ----------
const HY = 0.697, HA = 0.266, HB = 0.259, HC = 0.25;
function headPoint(th, ph) { // th: 정수리에서 잰 각, ph: 정면(+z)에서 +x 쪽으로 잰 각
  const st = Math.sin(th), p = new THREE.Vector3(HA * st * Math.sin(ph), HB * Math.cos(th), HC * st * Math.cos(ph));
  const k = Math.max(0, -p.y / HB), bulge = Math.sin(Math.PI * Math.min(1, k * 1.35));
  p.x *= 1 + 0.03 * bulge; p.z *= 1 + 0.03 * bulge;
  if (p.z < 0) p.z *= 1.05;
  return p;
}
function headNormal(th, ph) {
  const e = 1e-3, p = headPoint(th, ph), a = headPoint(th + e, ph).sub(p), b = headPoint(th, ph + e).sub(p);
  const n = new THREE.Vector3().crossVectors(b, a).normalize();
  return n.dot(p) < 0 ? n.negate() : n;
}
// 머리 겉면에서 정면 x, y (또는 위에서 본 x, z) 에 해당하는 각
function frontAt(x, y) {
  let best = null, bd = Infinity;
  for (let th = 10; th <= 170; th += 1) for (let ph = -89; ph <= 89; ph += 1) {
    const p = headPoint(th * D, ph * D), d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = [th * D, ph * D]; }
  }
  return best;
}
function topAt(x, z) {
  let best = null, bd = Infinity;
  for (let th = 0; th <= 90; th += 1) for (let ph = -180; ph <= 180; ph += 2) {
    const p = headPoint(th * D, ph * D), d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) { bd = d; best = [th * D, ph * D]; }
  }
  return best;
}

// ---------- 단발: 앞머리 끝은 시트의 머리 끝 네 개와 오목한 곳 세 개를 지난다 ----------
const sheetPt = (sx, sy) => [(sx - 300) / 1000, (1000 - sy) / 1000 - HY]; // 시트 mm → 머리 중심 기준 m
const SIDE_TH = 138 * D, NAPE_TH = 134 * D;
let FRINGE = null; // 처음 만들 때 한 번 잰다
function hem(ph) {
  const a = Math.abs(ph), L = FRINGE[0][1], R = FRINGE[FRINGE.length - 1][1];
  let fr;
  if (ph <= L) fr = FRINGE[0][0];
  else if (ph >= R) fr = FRINGE[FRINGE.length - 1][0];
  else for (let i = 0; i < FRINGE.length - 1; i++) {
    const [t0, p0] = FRINGE[i], [t1, p1] = FRINGE[i + 1];
    if (ph >= p0 && ph <= p1) { const u = (ph - p0) / (p1 - p0); fr = t0 + (t1 - t0) * (1 - Math.cos(u * Math.PI)) / 2; break; }
  }
  const edge = ph < 0 ? -L : R; // 앞머리가 옆머리와 만나는 곳
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(fr, SIDE_TH, ss(edge, edge + 6 * D, a)), NAPE_TH, ss(120 * D, 175 * D, a));
}
function thick(th, ph, thH) {
  const crown = 0.02; // 정수리 위로 고르게: 머리카락 꼭대기 980, 머리 꼭대기 956
  const sides = 0.006 * ss(0.3, 1.2, th) + 0.004 * ss(100 * D, 170 * D, Math.abs(ph)) * ss(0.4, 1.3, th); // 옆과 뒤가 조금 더 두껍다
  const fringe = 0.004 * (1 - ss(40 * D, 60 * D, Math.abs(ph)));
  const hemRound = 1 - 0.6 * ss(thH - 0.14, thH, th); // 끝으로 갈수록 얇아져서 아래 모서리가 둥글다
  return (crown + sides + fringe) * hemRound;
}
function hairShellGeometry() {
  const NU = 120, NV = 22, lift = 0.004, outer = [], inner = [];
  for (let i = 0; i <= NU; i++) {
    const ph = -Math.PI + (i / NU) * Math.PI * 2, thH = hem(ph), eq = headPoint(Math.PI / 2, ph), eqR = Math.hypot(eq.x, eq.z);
    const co = [], ci = [];
    for (let j = 0; j <= NV; j++) {
      const th = Math.max(1e-3, thH * (1 - Math.pow(1 - j / NV, 1.15))), p = headPoint(th, ph), n = headNormal(th, ph), t = thick(th, ph, thH);
      const o = p.clone().addScaledVector(n, lift + t), q = p.clone().addScaledVector(n, lift);
      if (th > Math.PI / 2) { // 단발은 곧게 내려오다가 끝에서 안으로 말린다
        const f = ss(Math.PI / 2, thH, th), want = (eqR + lift + t) * (1 - 0.12 * ss(0.5, 1, f));
        const ho = Math.hypot(o.x, o.z), hq = Math.hypot(q.x, q.z), wi = want - 0.016;
        o.x *= want / ho; o.z *= want / ho;
        if (hq < wi) { q.x *= wi / hq; q.z *= wi / hq; }
      }
      co.push(o); ci.push(q);
    }
    outer.push(co); inner.push(ci);
  }
  const P = [], idx = [];
  const quad = (a, b, c, d) => { const s = P.length / 3; for (const v of [a, b, c, d]) P.push(v.x, v.y, v.z); idx.push(s, s + 1, s + 2, s, s + 2, s + 3); };
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    quad(outer[i][j], outer[i][j + 1], outer[i + 1][j + 1], outer[i + 1][j]);
    quad(inner[i][j], inner[i + 1][j], inner[i + 1][j + 1], inner[i][j + 1]);
  }
  for (let i = 0; i < NU; i++) quad(outer[i][NV], inner[i][NV], inner[i + 1][NV], outer[i + 1][NV]); // 머리 끝의 두께
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// 머리카락 겉면 위를 지나는 선 (가르마, 정수리 가마)
function hairLineGeometry(pts, r) {
  const v = pts.map(([th, ph]) => headPoint(th, ph).addScaledVector(headNormal(th, ph), 0.004 + thick(th, ph, hem(ph)) + 0.0015));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v), 40, r, 5);
}
function headGeometry() {
  const g = new THREE.SphereGeometry(1, 28, 20), pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const p = headPoint(Math.acos(THREE.MathUtils.clamp(v.y, -1, 1)), Math.atan2(v.x, v.z)); pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}

// 천은 완벽한 회전체가 아니다: 밑단으로 갈수록 느리고 고르지 않게 물결친다. 셔츠와 밑단 띠가 같은 물결을 쓴다
function latheGeometry(prof, seg, drape = false) {
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  if (drape) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(x, z), low = ss(0.32, 0.18, y);
      const k = 1 + low * (0.022 * Math.sin(3 * a + 1.1) + 0.012 * Math.sin(5 * a + 0.4)) + 0.008 * ss(0.36, 0.43, y) * Math.cos(2 * a);
      pos.setXYZ(i, x * k, y + low * 0.004 * Math.sin(2 * a + 0.7), z * k);
    }
    geo.computeVertexNormals();
  }
  return geo;
}

// 무거운 셈(머리 겉면 찾기, 머리카락 껍데기)은 처음 한 번만 하고, 사람마다 복제본을 준다 (disposeScene 이 형상을 지운다)
let BASE = null;
function base() {
  if (BASE) return BASE;
  FRINGE = [[98, 250], [150, 270], [196, 246], [238, 292], [284, 250], [330, 286], [376, 244], [418, 272], [502, 244]].map(([sx, sy]) => frontAt(...sheetPt(sx, sy)));
  const top = (tx, ty) => topAt((tx - 300) / 1000, (ty - 290) / 1000); // 시트의 위에서 본 그림: x 오른쪽, y 얼굴 쪽, 중심 (300, 290)
  const notch = FRINGE[6];
  const [wt, wp] = top(352, 228), spiral = [];
  for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI * 1.7, r = 0.004 + i * 0.0016; spiral.push([wt + r * 3.2 * Math.cos(a), wp + r * 6.5 * Math.sin(a)]); }
  BASE = {
    head: headGeometry(),
    hair: hairShellGeometry(),
    part: hairLineGeometry([top(346, 250), top(356, 330), top(366, 410), top(374, 480), [notch[0] - 6 * D, notch[1]]], 0.0025),
    whorl: hairLineGeometry(spiral, 0.003),
    eyes: [-1, 1].map(s => ({ eye: frontAt(0.092 * s, -0.061), glint: frontAt(0.092 * s + 0.007, -0.05), blush: frontAt(0.144 * s, -0.127) })),
    pants: latheGeometry([[0, 0.134], [0.1, 0.134], [0.118, 0.145], [0.12, 0.17], [0.118, 0.205], [0, 0.205]], 24),
    shirt: latheGeometry([[0, 0.19], [0.135, 0.19], [0.148, 0.205], [0.151, 0.24], [0.15, 0.3], [0.143, 0.35], [0.13, 0.4], [0.105, 0.43], [0.06, 0.452], [0, 0.455]], 32, true),
    hem: latheGeometry([[0, 0.175], [0.13, 0.175], [0.137, 0.18], [0.137, 0.192], [0, 0.192]], 32, true),
  };
  return BASE;
}

// 피부 재질: 백반증 무늬는 그 조각 자신의 좌표(+ 몸 안에서의 자리)에 붙은 잡음이라, 움직여도 흐르지 않는다
function skinMaterial(U, offset) {
  const m = soft(SKIN[1]);
  const off = { value: offset.clone() };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { vitOff: off });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSkinPos; uniform vec3 vitOff;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinPos = position + vitOff;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vSkinPos; uniform float vitAmt; uniform float vitSeed; uniform vec3 vitCol;
float vh(vec3 p){ p = fract(p * 0.3183099 + vitSeed * 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(vh(i), vh(i+vec3(1,0,0)), f.x), mix(vh(i+vec3(0,1,0)), vh(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(vh(i+vec3(0,0,1)), vh(i+vec3(1,0,1)), f.x), mix(vh(i+vec3(0,1,1)), vh(i+vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (vitAmt > 0.0) { vec3 q = vSkinPos * 9.0 + vitSeed;
  float n = 0.62 * vn(q) + 0.28 * vn(q * 2.3) + 0.1 * vn(q * 5.1), edge = 1.0 - vitAmt * 0.62;
  diffuseColor.rgb = mix(diffuseColor.rgb, vitCol, smoothstep(edge - 0.015, edge + 0.015, n)); }`);
  };
  m.customProgramCacheKey = () => 'minimi-skin';
  return m;
}

// 셔츠 색: 없으면 방 팔레트의 accent. look: DEFAULT_LOOK 의 일부를 바꿔 준다 (나중에 setLook 으로도 바꾼다)
export function makeFigure(C, bodyMat, look) {
  const B = base(), group = new THREE.Group();
  const shirt = bodyMat ?? tone(C, 'accent');
  shirt.flatShading = false; shirt.needsUpdate = true;
  const U = { vitAmt: { value: 0 }, vitSeed: { value: 3.7 }, vitCol: { value: new THREE.Color() } };
  const M = {
    shirt, hem: soft('#' + shirt.color.clone().multiplyScalar(0.88).getHexString()),
    trousers: soft(TROUSERS), cuff: soft('#' + new THREE.Color(TROUSERS).multiplyScalar(0.86).getHexString()),
    shoe: soft(SHOE, { roughness: 0.7 }), sole: soft(SOLE),
    hair: soft('#3D2C22', { roughness: 0.75, side: THREE.DoubleSide }), hairLine: soft('#2f221a'),
    eye: new THREE.MeshStandardMaterial({ color: EYE, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 }),
    glint: new THREE.MeshBasicMaterial({ color: '#fff6e8', polygonOffset: true, polygonOffsetFactor: -4 }),
    blush: new THREE.MeshStandardMaterial({ color: '#e09a86', roughness: 0.9, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  const skins = [];
  const skinFor = (offset) => { const m = skinMaterial(U, offset); skins.push(m); return m; };
  const add = (geo, mat, x, y, z, parent = group, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; parent.add(m); return m; };

  // 바지 엉덩이(시트 796..866), 엉덩이 높이 0.175 에서 흔드는 다리, 접어 올린 단, 신발
  add(B.pants.clone(), M.trousers, 0, 0, 0).scale.z = 0.92;
  const legs = [-1, 1].map(s => {
    const hip = new THREE.Group(); hip.position.set(0.071 * s, 0.175, 0); group.add(hip);
    add(new THREE.CylinderGeometry(0.049, 0.047, 0.13, 14), M.trousers, 0, -0.065, 0, hip);
    add(new THREE.CylinderGeometry(0.051, 0.051, 0.036, 14), M.cuff, 0, -0.109, 0, hip);
    add(new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), M.shoe, 0.004 * s, -0.162, 0.02, hip).scale.set(0.052, 0.042, 0.08);
    add(new THREE.CylinderGeometry(1, 1, 0.013, 14), M.sole, 0.004 * s, -0.1685, 0.02, hip).scale.set(0.052, 1, 0.08); // 바닥에 꼭 닿는 평평한 밑창
    return hip;
  });
  // 셔츠: 폭 300, 깊이 260, 밑단 0.175, 어깨 0.4. 밑단과 소매 끝은 조금 어두운 띠
  add(B.shirt.clone(), M.shirt, 0, 0, 0).scale.z = 0.84;
  add(B.hem.clone(), M.hem, 0, 0, 0).scale.z = 0.85;
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.12 * s, 0.386, 0); sh.rotation.z = 0.27 * s; group.add(sh);
    add(new THREE.SphereGeometry(0.04, 12, 8), M.shirt, 0, -0.004, 0, sh);
    add(new THREE.CylinderGeometry(0.042, 0.045, 0.075, 10), M.shirt, 0, -0.04, 0, sh);
    add(new THREE.CylinderGeometry(0.046, 0.046, 0.014, 10), M.hem, 0, -0.08, 0, sh);
    const elbow = new THREE.Group(); elbow.position.set(0, -0.085, 0); elbow.rotation.z = -0.2 * s; sh.add(elbow); // 아래팔은 거의 곧게 내려온다
    add(new THREE.CapsuleGeometry(0.026, 0.065, 3, 9), skinFor(new THREE.Vector3(0.15 * s, 0.26, 0)), 0, -0.04, 0, elbow);
    add(new THREE.SphereGeometry(0.029, 10, 8), skinFor(new THREE.Vector3(0.16 * s, 0.2, 0.01)), 0, -0.103, 0.004, elbow).scale.set(1, 1.1, 0.85);
  }
  // 머리: 얼굴은 겉면에 그린다 (입 없음, 볼은 피부색에서 셈한다)
  const head = new THREE.Group(); head.position.y = HY; group.add(head);
  add(B.head.clone(), skinFor(new THREE.Vector3(0, HY, 0)), 0, 0, 0, head);
  const decal = ([th, ph], w, h, mat, lift = 0.0015) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), mat), p = headPoint(th, ph), n = headNormal(th, ph);
    m.position.copy(p).addScaledVector(n, lift); m.lookAt(p.clone().addScaledVector(n, 1)); m.scale.set(w, h, 1); head.add(m); return m;
  };
  for (const e of B.eyes) { decal(e.eye, 0.021, 0.029, M.eye); decal(e.glint, 0.0065, 0.0065, M.glint, 0.003); decal(e.blush, 0.042, 0.02, M.blush); }
  const hair = new THREE.Group(); head.add(hair);
  add(B.hair.clone(), M.hair, 0, 0, 0, hair);
  add(B.part.clone(), M.hairLine, 0, 0, 0, hair, false);
  add(B.whorl.clone(), M.hairLine, 0, 0, 0, hair, false);

  const fig = { group, legL: legs[0], legR: legs[1], phase: 0, look: { ...DEFAULT_LOOK } };
  fig.setLook = (next = {}) => {
    const L = Object.assign(fig.look, next);
    const x = THREE.MathUtils.clamp(L.skin, 0, 1) * (SKIN.length - 1), i = Math.min(SKIN.length - 2, Math.floor(x));
    const c = new THREE.Color(SKIN[i]).lerp(new THREE.Color(SKIN[i + 1]), x - i);
    for (const m of skins) m.color.copy(c);
    M.blush.color.copy(c).lerp(new THREE.Color('#d2463a'), 0.32); // 볼: 피부를 따뜻한 빨강 쪽으로 조금. 짙은 피부에서는 거의 안 보인다
    U.vitCol.value.copy(c).lerp(new THREE.Color('#f6e3d8'), 0.88); // 백반증: 색소가 빠진 피부
    U.vitAmt.value = THREE.MathUtils.clamp(L.vitiligo, 0, 1); U.vitSeed.value = L.vitSeed;
    M.hair.color.set(L.hair); M.hairLine.color.set(L.hair).multiplyScalar(0.78);
    hair.visible = !L.bald;
  };
  fig.setLook(look);
  return fig;
}

// 움직이는 방향(dir, 길이 무관)으로 몸을 부드럽게 돌린다.
export function turnToward(fig, dx, dz, dt) {
  const want = Math.atan2(dx, dz);
  let dr = want - fig.group.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
  fig.group.rotation.y = wrapAngle(fig.group.rotation.y + dr * Math.min(1, dt * 12));
}

// 각도를 -π..π 로. 같은 방향으로 계속 돌아도 값이 커지지 않는다 (presence 서버는 큰 각도를 버린다)
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

// 걸음: 다리 흔들기와 위아래 출렁임. 멈추면 바로 선다.
export function stepGait(fig, moving, dt) {
  if (moving) fig.phase += dt * 11; else fig.phase = 0;
  const swing = Math.sin(fig.phase) * 0.6;
  fig.legL.rotation.x = swing; fig.legR.rotation.x = -swing;
  fig.group.position.y = moving ? Math.abs(Math.sin(fig.phase)) * 0.04 : 0;
}

export function seatLegs(fig) { fig.legL.rotation.x = fig.legR.rotation.x = SIT_LEGS; }

// 앉기와 일어서기: 바닥의 점(stand)과 앉은 몸의 자리(seat) 사이를 한 번에 건너뛰지 않고 SETTLE_TIME 동안 옮긴다.
// t 0 = 서 있음, 1 = 앉음. 살짝 뛰어오르며 자리 쪽으로 돌고, 다리는 뒤쪽 절반에서 앞으로 뻗는다.
export const SETTLE_TIME = 0.4;
export function poseSettle(fig, stand, seat, yawStand, yawSeat, t) {
  const e = t * t * (3 - 2 * t), g = fig.group;
  g.position.lerpVectors(stand, seat, e);
  g.position.y += Math.sin(Math.PI * t) * 0.06;
  const dy = Math.atan2(Math.sin(yawSeat - yawStand), Math.cos(yawSeat - yawStand));
  g.rotation.y = wrapAngle(yawStand + dy * Math.min(1, e * 1.4));
  fig.legL.rotation.x = fig.legR.rotation.x = SIT_LEGS * ss(0.35, 1, t);
}
