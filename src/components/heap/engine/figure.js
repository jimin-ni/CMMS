// 사람 모양과 걸음 움직임. 내 캐릭터(walk.js)와 함께 있는 다른 사람(presence.js)이 같이 쓴다.
// 모양은 파일이다: public/heap/models/minimi/minimi.glb. 원본은 blender/heap/characters/minimi-lowpoly.blend
// (2026-11-25 Yoon 손질: 머리카락 삼각형 줄임, 정수리 가마·바짓단·밑창 뺌. 왼쪽 관자놀이는 오른쪽을 거울로 다시 지음, 신발 바닥 막음).
// 첫 판을 만든 build_minimi_lowpoly.mjs 는 지난 모양이다.
// 방에서 캐릭터는 70~100 px 라 삼각형 900 개 아래로, 보이지 않는 면 없이 만든다 (가구는 60~200 개). 지금 728 개, 12 번 그린다.
// 엔진이 기대는 이름:
//   노드  leg_L / leg_R (엉덩이 0.175 에서 흔든다. 점은 쓰지 않는다: three.js 가 읽을 때 이름에서 점을 지운다)
//   재질  skin · hair · eye · eye_light · blush · shirt · shirt_band · trousers · shoe
//   엔진은 재질을 이름으로 자기 재질로 바꾼다. 그래서 피부, 머리카락, 셔츠 색과 백반증이 파일을 고쳐도 그대로 된다.
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

const MODEL_URL = '/heap/models/minimi/minimi.glb';
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 모델 파일은 한 번 읽어 두고, 사람마다 형상을 복제해 준다 (disposeScene 이 사람을 지울 때 형상도 지운다).
// index.js 가 walk.js 와 presence.js 보다 먼저 기다린다.
let TEMPLATE = null, loading = null;
export function loadFigure() {
  loading ??= import('three/addons/loaders/GLTFLoader.js')
    .then(m => new m.GLTFLoader().loadAsync(MODEL_URL))
    .then(gltf => { TEMPLATE = gltf.scene; });
  return loading;
}

// 피부 재질: 백반증 무늬는 몸 안의 좌표에 붙은 잡음이라 움직여도 흐르지 않고, 머리와 손 사이에 이음매가 없다.
// toFig: 이 메시의 좌표 → 캐릭터 좌표
function skinMaterial(U, toFig, flatShading) {
  const m = new THREE.MeshStandardMaterial({ color: SKIN[1], roughness: 0.88, flatShading });
  const T = { value: toFig.clone() };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { vitM: T });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSkinPos; uniform mat4 vitM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinPos = (vitM * vec4(position, 1.0)).xyz;');
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
  m.customProgramCacheKey = () => 'minimi-skin' + (flatShading ? '-flat' : '');
  return m;
}

// 셔츠 색: 없으면 방 팔레트의 accent. look: DEFAULT_LOOK 의 일부를 바꿔 준다 (나중에 setLook 으로도 바꾼다)
export function makeFigure(C, bodyMat, look) {
  if (!TEMPLATE) throw new Error('makeFigure: loadFigure() 를 먼저 기다려야 한다');
  const group = TEMPLATE.clone(true);
  group.position.set(0, 0, 0); group.rotation.set(0, 0, 0); group.scale.set(1, 1, 1);
  group.updateMatrixWorld(true);
  const toFig = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const U = { vitAmt: { value: 0 }, vitSeed: { value: 3.7 }, vitCol: { value: new THREE.Color() } };
  const shirt = bodyMat ?? tone(C, 'accent');
  const darker = (c, k) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(k), roughness: 0.88, flatShading: true });
  const byName = {}, skins = [], hairMeshes = [];
  group.traverse(o => {
    if (!o.isMesh) return;
    o.geometry = o.geometry.clone();
    const src = o.material, name = src.name;
    let m;
    if (name === 'skin') { m = skinMaterial(U, new THREE.Matrix4().multiplyMatrices(toFig, o.matrixWorld), !!src.flatShading); skins.push(m); }
    else if (name === 'shirt') m = shirt;
    else if (name === 'shirt_band') m = byName.shirt_band ??= darker(shirt.color, 0.88);
    else if (name === 'eye_light') m = byName.eye_light ??= new THREE.MeshBasicMaterial({ color: src.color, polygonOffset: true, polygonOffsetFactor: -4 });
    else if (name === 'eye') m = byName.eye ??= new THREE.MeshStandardMaterial({ color: src.color, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
    else if (name === 'blush') m = byName.blush ??= new THREE.MeshStandardMaterial({ color: src.color, roughness: 0.9, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    else m = byName[name] ??= src.clone(); // hair, hair_whorl, trousers, trouser_cuff, shoe, sole: 파일의 색 그대로
    o.material = m;
    const decal = name === 'eye' || name === 'eye_light' || name === 'blush';
    o.castShadow = !decal;
    if (name === 'hair' || name === 'hair_whorl') hairMeshes.push(o);
  });
  const legL = group.getObjectByName('leg_L'), legR = group.getObjectByName('leg_R');
  if (!legL || !legR) throw new Error('minimi.glb: leg_L / leg_R 노드가 없다');

  const fig = { group, legL, legR, phase: 0, look: { ...DEFAULT_LOOK } };
  fig.setLook = (next = {}) => {
    const L = Object.assign(fig.look, next);
    const x = THREE.MathUtils.clamp(L.skin, 0, 1) * (SKIN.length - 1), i = Math.min(SKIN.length - 2, Math.floor(x));
    const c = new THREE.Color(SKIN[i]).lerp(new THREE.Color(SKIN[i + 1]), x - i);
    for (const m of skins) m.color.copy(c);
    byName.blush?.color.copy(c).lerp(new THREE.Color('#d2463a'), 0.32); // 볼: 피부를 따뜻한 빨강 쪽으로 조금. 짙은 피부에서는 거의 안 보인다
    U.vitCol.value.copy(c).lerp(new THREE.Color('#f6e3d8'), 0.88); // 백반증: 색소가 빠진 피부
    U.vitAmt.value = THREE.MathUtils.clamp(L.vitiligo, 0, 1); U.vitSeed.value = L.vitSeed;
    byName.hair?.color.set(L.hair); byName.hair_whorl?.color.set(L.hair).multiplyScalar(0.78);
    for (const h of hairMeshes) h.visible = !L.bald;
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
