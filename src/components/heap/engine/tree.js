// 쪽지 트리 모드. 방의 크리스마스 트리(fn.kind "tree")를 눌러 들어가, 트리 앞에 선 고정 시점에서 쪽지를 읽는다.
//
// 결정 (.claude/session-artifacts/heap-poc/DECISIONS.md L, docs/planning/09-heap-room.md §3)
//   - 시점은 트리 앞의 1인칭 하나다. 확대는 없다. 좌우로 끌면 트리가 줄기를 축으로 돈다. 카메라는 움직이지 않는다. 쪽지가 나와 있는 동안은 돌지 않는다.
//   - 쪽지는 장식(tree-ornament.js) 안에 있다. 누르면 화면 가운데로 날아오고, 장식이 열리고, 쪽지가 올라와 네 박자로 펼쳐진다 (tree-note.js). 닫으면 제자리로 돌아간다.
//   - L2 ‹ ›: 지금 쪽지가 접혀 돌아가는 동안 다음 쪽지가 날아온다. 순서는 만든 순서(오래된 것부터)다.
//   - L1 걷는 모드: 트리 위에 "쪽지 N" 이 떠 있고, 가까이 서면 안내가 바뀌고 E 로 들어간다. Esc: 열린 쪽지 접기, 한 번 더: 트리 모드에서 나가기.
//   - L11 자리: 쪽지의 자리는 트리 자신의 틀에서 { y, angle } (밑동 위 미터, 줄기 둘레 라디안 -π..π). 트리를 돌려도 바뀌지 않는다.
//
// 틀: 아이템 그룹(g, 레이아웃의 위치와 회전)은 건드리지 않는다. g 안에 pivot 을 두고 트리 모델(hold), 장식, 불빛, 별, 쪽지를 모두 pivot 에 건다.
// 돌리는 것은 pivot.rotation.y 뿐이다. 자리 계산은 pivot 의 지역 좌표에서 하고, 레이는 pivot 의 월드 행렬로 옮겨 쏘므로 돌린 각도와 상관없다.
//
// 이 파일의 앞 절반은 DOM 없이 도는 순수 함수다 (자리 계산: makeSurface, planSpot, fillSpots, localToSpot, spotIsFree). 뒤 절반이 setupTree(ctx)다.
//
// 더미: opts.treeNotes 가 undefined 면 tree-demo.js 의 DEMO_NOTES 를 쓴다. DB 를 잇는 단계에서 DEMO_NOTES 가 나오는 줄(아래 두 곳)과 tree-demo.js 를 지운다.
// 실제 목록은 opts.treeNotes 로 오고, 나중 갱신은 ctx.setTreeNotes(list) 가 받는다 (id 로 합친다).
//
// ctx 에 올리는 것: openTree(it, group, slot)  enterTree()  exitTree()  treeEscape()  nearTree()  setTreeNotes(list)  treeStep(t, dt)  treeSpot { toLocal, fromLocal, fromWorld, isFree, hung }
import * as THREE from 'three';
import { mulberry32, disposeScene } from './util.js';
import {
  buildPacket, applyNote, noteTimes, writeText, eraseText, createBackCache, disposeBackCache, SHEET, N_FLY, C as NOTE_C,
} from './tree-note.js';
import { buildOrnament, KINDS, ORN, MAIN_SWATCHES, ACCENTS } from './tree-ornament.js';
import { trimTree, buildTopStar, buildFairyLights } from './tree-dress.js';
import { DEMO_NOTES } from './tree-demo.js'; // 더미: DB 를 이으면 지운다

// ---------- 순수 함수: 자리 ----------

// 트리 모드의 시점 (트리 밑동 기준 미터). 목업의 EYE, LOOK_Y, CAM_DIST 다. 방의 카메라는 fov 30 이라 이 모드에서만 fov 를 50 으로 둔다.
export const TREE_VIEW = { eye: 1.6, look: 0.92, dist: 2.05, fov: 50 };
export const SPOT_ARC = THREE.MathUtils.degToRad(60); // 더미 자리는 정면 ±60도 (더 돌아가면 장식이 실루엣에 걸려 떠 보인다)
const TREE_BASE_R = 0.475, TREE_H = 1.83; // policy.ts 의 noteTreeBaseRadius, noteTreeHeight: 서버가 자리 간격을 셀 때 쓰는 원뿔 근사
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const FLAT_RND = () => 0.5;

export const hashId = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; };
/** 각도를 -π..π 로 */
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
/** 트리 틀의 점 -> 저장하는 자리. angle 0 은 트리 앞(+z)이고 x 쪽이 양수다. */
export const localToSpot = p => ({ y: p.y, angle: Math.atan2(p.x, p.z) });
export const coneRadius = y => Math.max(0, TREE_BASE_R * (1 - y / TREE_H));
/** 자리 -> 트리 틀의 점 (반지름 r 을 알면 넘기고, 모르면 원뿔 근사) */
export const spotPoint = (spot, r = coneRadius(spot.y)) => new THREE.Vector3(r * Math.sin(spot.angle), spot.y, r * Math.cos(spot.angle));
/**
 * others 의 어떤 자리와도 ORN(장식 크기) 이상 떨어져 있으면 true. 두 장식의 중심이 ORN 보다 가까우면 닿는다 (목업과 policy.noteSpacing 의 기준).
 * radiusAt(y): 그 높이의 반지름. 기본은 원뿔 근사라 서버와 같은 값이 나온다.
 */
export function spotIsFree(spot, others, radiusAt = coneRadius, gap = ORN) {
  const p = spotPoint(spot, radiusAt(spot.y));
  return others.every(o => spotPoint(o, radiusAt(o.y)).distanceTo(p) >= gap);
}

/**
 * frame 의 지역 좌표로 treeRoot(트리 메시와 구슬 줄)의 표면을 묻는다. 목업의 surfaceHit 이다.
 * frame: 자리의 틀 (pivot). 월드 행렬에 배율이 없다고 본다. 레이는 frame 의 월드 행렬로 옮겨 쏘므로 frame 을 돌려도 결과는 같다.
 * 묻기 전에 sync() 를 부른다 (frame 과 트리의 월드 행렬을 맞춘다). 한 번에 여러 번 물을 때는 앞에서 한 번이면 된다.
 */
export function makeSurface(frame, treeRoot) {
  const ray = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3(), inv = new THREE.Matrix4();
  const sync = () => { frame.updateWorldMatrix(true, false); treeRoot.updateMatrixWorld(true); };
  /** frame 좌표의 origin 에서 dir 로 쏜 첫 교차 (distance 는 frame 의 길이) */
  function cast(origin, dir, far) {
    o.copy(origin).applyMatrix4(frame.matrixWorld); d.copy(dir).transformDirection(frame.matrixWorld);
    ray.set(o, d); ray.near = 0; ray.far = far;
    return ray.intersectObject(treeRoot, true)[0] ?? null;
  }
  /** angle, y 에서 줄기를 향해 쏜 표면: { point, n, r, out } (모두 frame 좌표). 잎에 닿지 않으면 null */
  function hit(angle, y) {
    const R = 1.5, out = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const h = cast(new THREE.Vector3(out.x * R, y, out.z * R), out.clone().negate(), R);
    if (!h) return null;
    const point = frame.worldToLocal(h.point.clone());
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).transformDirection(inv.copy(frame.matrixWorld).invert());
    if (n.dot(out) < 0) n.negate();
    return { point, n, r: Math.hypot(point.x, point.z), out };
  }
  return { sync, cast, hit };
}

/**
 * 장식 하나의 자리 계획. 목업의 planSpot 이다. 장식은 짧은 끈으로 바로 위 가지에 걸리고 그 자리 잎의 경사에 기댄다:
 * 경사만큼(1.5배) 뒤로 젖히고, 등은 바늘잎에 묻히지 않는다. 틀: pivot 은 걸이점에 있고 z 가 트리 바깥, y 가 위다.
 * spot: { a, h, point, n, r, out } (surface.hit(a, h) 에 a, h 를 더한 것). rnd 는 gap, drift, yaw 를 이 순서로 한 번씩 뽑는다.
 */
export function planSpot(surface, spot, rnd) {
  const plan = { spot, gap: 0.004 + rnd() * 0.006, drift: (rnd() - 0.5) * 0.01, yaw: (rnd() - 0.5) * 0.6, pivotPos: new THREE.Vector3(), pivotQuat: new THREE.Quaternion() };
  plan.pivotQuat.setFromAxisAngle(Y_AXIS, spot.a);
  plan.pivotPos.copy(spot.point).addScaledVector(spot.out, -0.004);
  // 걸이점에서 y 만큼 위 또는 아래로 갔을 때 잎이 얼마나 더 바깥으로 나오는가
  const reach = y => { const s = surface.hit(spot.a, spot.h + y); return s ? s.r - spot.r : 0; };
  plan.reach = reach;
  const hc = surface.hit(spot.a, spot.h - plan.gap - ORN / 2);
  const nl = hc ? hc.n.clone().applyQuaternion(plan.pivotQuat.clone().invert()) : new THREE.Vector3(0, 0, 1);
  // 경사보다 훨씬 더 젖힌다: 가지에 얹힌 것으로 읽힌다
  plan.tilt = THREE.MathUtils.clamp(Math.atan2(nl.y, nl.z) * 1.5, 0.25, 1.15);
  const up = new THREE.Vector3(0, Math.cos(plan.tilt), -Math.sin(plan.tilt));
  const fwd = new THREE.Vector3(0, Math.sin(plan.tilt), Math.cos(plan.tilt));
  // 중심: 고리(비탈 위로 장식 반 개)가 걸이점 아래 gap 에 걸린다. 등이 높이 내내 잎에서 떨어지는 만큼만 바깥으로 민다
  const c = new THREE.Vector3(plan.drift, -plan.gap - up.y * ORN / 2, 0), back = ORN * 0.45;
  c.z = -Infinity;
  for (let s = -0.5; s <= 0.5; s += 0.125) {
    const by = c.y + up.y * s * ORN - fwd.y * back;
    c.z = Math.max(c.z, reach(by) + 0.003 - up.z * s * ORN + fwd.z * back);
  }
  Object.assign(plan, { centreLocal: c, up, fwd });
  const toFrame = v => v.clone().applyQuaternion(plan.pivotQuat).add(plan.pivotPos);
  plan.centre = toFrame(c);
  plan.face = toFrame(c.clone().addScaledVector(fwd, back));
  return plan;
}
/** 저장된 자리 { y, angle } 의 계획. 그 높이에 잎이 없으면 null. rnd 를 쪽지 id 로 시드하면 모든 방문자가 같은 기울기를 본다. */
export function planFromSpot(surface, spot, rnd) {
  const s = surface.hit(spot.angle, spot.y);
  if (!s || s.r < 0.08) return null;
  return planSpot(surface, { a: spot.angle, h: spot.y, ...s }, rnd);
}
/**
 * 쪽지 count 개의 자리를 정한다. 목업 placeNotes 의 채우기 순서다: 정면 ±60도, 맨 아래 층 위(0.42..1.42 m)의 무작위 자리를 잡되
 * 넓은 곳일수록 많이 뽑고, 3000번마다 최소 간격을 6% 줄이고, visible(점)이 거짓이면 거른다. 모자라면 한 바퀴 전체에서 ORN 간격으로 채운다.
 * taken: 이미 걸린 장식의 중심 목록 (Vector3). 돌려주는 것: [{ spot: { y, angle }, centre }] (count 보다 적을 수 있다)
 */
export function fillSpots(surface, count, rnd, { taken = [], visible = null } = {}) {
  const out = [], centres = taken.slice();
  const pass = (arc, needSee, minD, tryMax) => {
    for (let tries = 1; out.length < count && tries < tryMax; tries++) {
      if (tries % 3000 === 0) minD *= 0.94;
      const a = (rnd() * 2 - 1) * arc, h = 0.42 + rnd() * 1.0;
      const hit = surface.hit(a, h);
      if (!hit || hit.r < 0.12) continue;
      if (rnd() > hit.r / 0.5) continue; // 넓은 곳이 쪽지를 더 받는다
      const plan = planSpot(surface, { a, h, ...hit }, FLAT_RND);
      if (centres.some(c => c.distanceTo(plan.centre) < minD)) continue;
      if (needSee && visible && !visible(plan.face)) continue; // 시점이 고정이다: 걸린 쪽지는 모두 닿아야 한다
      centres.push(plan.centre); out.push({ spot: { y: h, angle: a }, centre: plan.centre });
    }
  };
  pass(SPOT_ARC, true, 0.2, 30000);
  if (out.length < count) pass(Math.PI, false, ORN * 1.05, 6000);
  return out;
}

// ---------- 트리 모드 ----------

const TURN_PER_PX = 0.008; // 옆으로 1px 끌 때 트리가 도는 각 (rad)
const BUILD_PER_FRAME = 8; // 한 프레임에 짓는 쪽지 수: 많은 쪽지를 한 프레임에 지으면 방이 멈칫한다
const NOTE_FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Gaegu&family=Hi+Melody&family=Gamja+Flower&family=Cute+Font&family=Single+Day&family=Yeon+Sung&family=East+Sea+Dokdo&display=swap';

const validSpot = d => Number.isFinite(d.y) && Number.isFinite(d.angle) && d.y > 0;
const sigOf = d => JSON.stringify([d.name, d.date, d.msg, d.reply ?? null, d.tint ?? null, d.font ?? null, d.kind ?? null, d.main ?? null, d.accent ?? null, d.y ?? null, d.angle ?? null]);
// 쪽지 하나의 장식 모양: 데이터가 정하지 않은 것은 id 에서 정한다 (모든 방문자가 같은 것을 본다)
function lookOf(d) {
  const h = hashId(d.id), accents = Object.keys(ACCENTS);
  return {
    kind: KINDS.includes(d.kind) ? d.kind : KINDS[h % KINDS.length],
    main: typeof d.main === 'string' ? d.main : MAIN_SWATCHES[(h >>> 3) % MAIN_SWATCHES.length][1],
    accent: d.accent in ACCENTS ? d.accent : accents[(h >>> 6) % accents.length],
  };
}
// 받은 목록을 다듬는다: id 와 글이 없는 것과 같은 id 의 뒤엣것을 버리고, 만든 순서(createdAt, 없으면 date)로 안정 정렬한다 (오래된 것이 먼저)
function normalise(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(), out = [];
  for (const d of raw) {
    if (!d || typeof d.id !== 'string' || typeof d.msg !== 'string' || seen.has(d.id)) continue;
    seen.add(d.id);
    out.push({ ...d, name: typeof d.name === 'string' ? d.name : null, date: typeof d.date === 'string' ? d.date : '' });
  }
  const key = d => String(d.createdAt ?? d.date ?? '');
  return out.map((d, i) => [d, i]).sort((a, b) => (key(a[0]) < key(b[0]) ? -1 : key(a[0]) > key(b[0]) ? 1 : a[1] - b[1])).map(x => x[0]);
}

export function setupTree(ctx) {
  const { scene, camera, renderer, canvas, controls, $, on, onDispose, setHint, syncUI, toast, C } = ctx;

  const baseFov = camera.fov;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let list = normalise(ctx.opts.treeNotes === undefined ? DEMO_NOTES : ctx.opts.treeNotes); // DEMO_NOTES: DB 를 이으면 이 줄은 normalise(ctx.opts.treeNotes ?? []) 가 된다

  let rig = null, failedBuild = null; // rig: 지금 build 의 트리에 올린 것들 (아래 makeRig)
  let opened = null, pending = null, hovered = null, press = null; // opened: 나와 있는(나오는) 쪽지 · pending: 지금 쪽지가 돌아간 뒤 날아올 쪽지
  const leaving = new Set(), anims = new Map(); // leaving: 접혀 돌아가는 쪽지 · anims: 쪽지 -> { dir, speed } (쪽지 시각 n.t 를 움직인다)
  const busy = () => !!opened || !!pending || leaving.size > 0;

  // ----- 트리 찾기와 짓기 -----
  const treeSlot = () => ctx.build.slots.find(s => s.fn.kind === 'tree') ?? null;
  const slotReady = s => !!s.group && ctx.build.slotMeshes.some(m => m.isMesh && m.userData.slot === s); // 모델은 읽힌 뒤에 메시를 더한다

  let fontsLink = null;
  function ensureFonts() { // 쪽지 글씨체: 이 방에 트리가 있을 때만 CSS 를 받는다. 글자 파일은 쪽지를 열 때 쓰는 글자만큼 온다
    if (fontsLink || document.head.querySelector('link[data-heap-tree-fonts]')) return;
    fontsLink = document.createElement('link'); fontsLink.rel = 'stylesheet'; fontsLink.href = NOTE_FONTS_HREF; fontsLink.dataset.heapTreeFonts = '1';
    document.head.append(fontsLink);
  }

  function makeRig(slot) {
    const g = slot.group, mesh0 = ctx.build.slotMeshes.find(m => m.isMesh && m.userData.slot === slot);
    let hold = mesh0; while (hold.parent && hold.parent !== g) hold = hold.parent;
    if (hold.parent !== g) return null;
    g.updateMatrixWorld(true);
    // 모델(hold)을 pivot 아래로 옮긴다. pivot 이 hold 의 자리(밑동)에 서고 hold 는 그 안의 원점에 놓인다: 보이는 위치는 그대로다
    const pivot = new THREE.Group(); pivot.name = 'tree-pivot';
    pivot.position.copy(hold.position); hold.position.set(0, 0, 0);
    g.add(pivot); pivot.add(hold);
    const surface = makeSurface(pivot, hold);
    const mesh = trimTree(hold, mulberry32(0x7ee5));
    surface.sync();
    const tip = pivot.worldToLocal(mesh.localToWorld(mesh.userData.tip.clone()));
    const deco = new THREE.Group(); deco.name = 'tree-deco'; pivot.add(deco);
    const star = buildTopStar(tip.y), lights = buildFairyLights(surface, mulberry32(0x11f7));
    deco.add(star.group, lights.group);
    const r = {
      slot, g, pivot, hold, surface, deco, star, lights, tipY: tip.y, build: ctx.build,
      notes: new Map(), queue: [], spots: new Map(), centres: new Map(), fillRnd: mulberry32(11), cache: createBackCache(),
      aniso: Math.min(4, renderer.capabilities.getMaxAnisotropy()), stringMat: new THREE.MeshStandardMaterial({ color: NOTE_C.clay, roughness: 0.9 }),
      turn: 0, settled: false, view: null, seen: { aspect: 0, fov: 0 }, countN: -1, dirty: false,
    };
    r.visible = makeVisible(surface);
    // "쪽지 N": 트리 위에 떠 있는 작은 표지. 방 어디서든 보이고, 누르면 트리 모드로 들어간다. 번지는 빛은 없다.
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 100;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    sp.scale.set(1.2, 0.375, 1); sp.position.set(0, tip.y + 0.42, 0); sp.renderOrder = 20; sp.userData.slot = slot;
    pivot.add(sp); ctx.build.slotMeshes.push(sp);
    r.count = { sp, cv, tex };
    ensureFonts();
    return r;
  }
  // 고정 시점에서 이 점이 보이는가: 가려지지 않고 화면 안(±0.9)에 든다. 시점은 트리 틀의 (0, eye, dist) 이고 화면 비율은 16:10 으로 고정한다 (더미 배치가 창 크기에 흔들리지 않게)
  function makeVisible(surface) {
    const cam = new THREE.PerspectiveCamera(TREE_VIEW.fov, 1.6, 0.02, 30);
    cam.position.set(0, TREE_VIEW.eye, TREE_VIEW.dist); cam.lookAt(0, TREE_VIEW.look, 0); cam.updateMatrixWorld(true);
    return pt => {
      const dir = pt.clone().sub(cam.position), dist = dir.length();
      const h = surface.cast(cam.position, dir.normalize(), dist + 0.05);
      if (h && h.distance < dist - 0.02) return false;
      const v = pt.clone().project(cam);
      return Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9;
    };
  }
  function paintCount(r) {
    const n = list.length;
    if (r.countN === n) return;
    r.countN = n;
    const g = r.count.cv.getContext('2d'), W = r.count.cv.width, H = r.count.cv.height, k = 8;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(243, 234, 219, 0.94)';
    g.beginPath(); g.moveTo(k + 44, k); g.arcTo(W - k, k, W - k, H - k, 44); g.arcTo(W - k, H - k, k, H - k, 44); g.arcTo(k, H - k, k, k, 44); g.arcTo(k, k, W - k, k, 44); g.closePath(); g.fill();
    g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 46px "IBM Plex Sans KR", system-ui, sans-serif';
    g.fillText(`쪽지 ${n}`, W / 2, H / 2 + 3);
    r.count.tex.needsUpdate = true;
  }

  // ----- 쪽지 하나 -----
  const setGlow = (n, k) => { n.orn.mats.main.emissiveIntensity = n.orn.mats.accent.emissiveIntensity = k; };
  function buildNote(r, d) {
    const look = lookOf(d), root = new THREE.Group(), pk = buildPacket(d, { backCache: r.cache, anisotropy: r.aniso, lazyFonts: true });
    root.add(pk.root);
    const n = { id: d.id, data: d, sig: sigOf(d), kind: look.kind, colors: { main: look.main, accent: look.accent }, root, pk, orn: null, pivot: new THREE.Group(), string: null, plan: null, home: null, spot: null, flight: null, t: 0, lift: 0, shellDrop: 0.1 };
    const times = noteTimes(pk); n.offset = times.offset; n.total = times.total;
    n.orn = buildOrnament(n.kind, n.colors); root.add(n.orn.group);
    root.traverse(o => { o.userData.note = n; });
    n.pivot.add(root);
    applyNote(n, 0);
    return n;
  }
  // 장식은 짧은 점토색 끈으로 걸이점에서 고리까지 걸린다. 잎을 뚫지 않는다.
  function seatOnPlan(r, n) {
    const plan = n.plan, { centreLocal: c, up, fwd } = plan;
    n.home = { p: c.clone(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-plan.tilt, plan.yaw, 0)) };
    const loop = c.clone().addScaledVector(up, n.orn.top - 0.002);
    // 고리 바로 위 가지에 건다: 끈이 짧다
    let anchor = new THREE.Vector3(), best = loop.length();
    for (let y = loop.y + 0.008; y <= loop.y + 0.06; y += 0.004) {
      const a = new THREE.Vector3(loop.x * 0.5, y, plan.reach(y) - 0.002), d = a.distanceTo(loop);
      if (d < best) { best = d; anchor = a; }
    }
    const mid = anchor.clone().lerp(loop, 0.5).addScaledVector(fwd, 0.002);
    const pts = new THREE.CatmullRomCurve3([anchor, mid, loop]).getPoints(12);
    for (const p of pts) if (p.y < -0.003) p.z = Math.max(p.z, plan.reach(p.y) + 0.002);
    if (n.string) { n.pivot.remove(n.string); n.string.geometry.dispose(); }
    n.string = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0009, 4), r.stringMat);
    n.string.castShadow = true; n.string.visible = n !== opened; n.pivot.add(n.string);
    if (n !== opened) { n.root.position.copy(n.home.p); n.root.quaternion.copy(n.home.q); }
  }
  function hang(r, n, plan) {
    n.pivot.position.copy(plan.pivotPos); n.pivot.quaternion.copy(plan.pivotQuat);
    r.deco.add(n.pivot); n.plan = plan;
    seatOnPlan(r, n);
  }
  function disposeNote(n) {
    n.root.removeFromParent(); n.pivot.removeFromParent();
    n.pk.dispose(); n.orn.dispose(); n.string?.geometry.dispose();
  }
  function removeNote(r, n) {
    anims.delete(n); leaving.delete(n);
    if (opened === n) opened = null;
    if (pending === n) pending = null;
    if (hovered === n) hovered = null;
    r.notes.delete(n.id); r.centres.delete(n.id);
    disposeNote(n);
  }

  // ----- 목록과 트리의 맞춤 -----
  // 목록(list)에 없는 쪽지는 치우고, 바뀐 쪽지는 다시 짓고, 새 쪽지는 대기열에 넣는다 (프레임마다 BUILD_PER_FRAME 개씩 짓는다).
  // 쪽지가 나와 있는 동안에는 미뤘다가 다 돌아간 뒤에 맞춘다.
  function syncNotes() {
    const r = rig; if (!r) return;
    if (busy()) { r.dirty = true; return; }
    r.dirty = false;
    const ids = new Set(list.map(d => d.id));
    for (const n of [...r.notes.values()]) if (!ids.has(n.id)) removeNote(r, n);
    for (const id of [...r.spots.keys()]) if (!ids.has(id)) r.spots.delete(id);
    r.queue = [];
    for (const d of list) {
      const n = r.notes.get(d.id);
      if (n && n.sig === sigOf(d)) continue;
      if (n) removeNote(r, n); // 글이나 모양이 바뀌었다: 같은 자리에 다시 짓는다 (자동 자리는 r.spots 에 남아 있다)
      r.queue.push(d);
    }
    paintCount(r);
  }
  function assignSpots(r, ds) { // 자리가 없는 쪽지에 목업의 채우기로 자리를 준다
    const lacking = ds.filter(d => !validSpot(d) && !r.spots.has(d.id));
    if (!lacking.length) return;
    const got = fillSpots(r.surface, lacking.length, r.fillRnd, { taken: [...r.centres.values()], visible: r.visible });
    got.forEach((s, i) => { r.spots.set(lacking[i].id, s.spot); r.centres.set(lacking[i].id, s.centre); });
  }
  function buildOne(r, d) {
    let spot = validSpot(d) ? { y: d.y, angle: wrapAngle(d.angle) } : r.spots.get(d.id);
    let plan = spot && planFromSpot(r.surface, spot, mulberry32(hashId(d.id)));
    if (!plan) { // 받은 자리가 잎 밖이다: 자리를 새로 정한다
      r.spots.delete(d.id); r.centres.delete(d.id);
      assignSpots(r, [{ id: d.id }]);
      spot = r.spots.get(d.id);
      plan = spot && planFromSpot(r.surface, spot, mulberry32(hashId(d.id)));
    }
    if (!plan) { console.warn('[heap-room] 쪽지를 걸 자리가 없어요:', d.id); return; }
    const n = buildNote(r, d);
    n.spot = spot; hang(r, n, plan);
    r.notes.set(d.id, n); r.centres.set(d.id, plan.centre);
  }
  function processQueue(r) {
    r.surface.sync();
    const batch = r.queue.splice(0, BUILD_PER_FRAME);
    assignSpots(r, batch);
    for (const d of batch) buildOne(r, d);
  }

  // ----- 열기, 닫기, 넘기기 -----
  const sequence = () => (rig ? list.map(d => rig.notes.get(d.id)).filter(Boolean) : []); // 만든 순서, 걸린 것만
  function syncNav() {
    const show = ctx.mode === 'tree' && !!opened && !pending && sequence().length > 1;
    $('tree-prev').hidden = $('tree-next').hidden = !show;
  }
  function openDist() {
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return Math.max((SHEET.H + 0.012) / (0.88 * 2 * tanH), (SHEET.W + 0.012) / (0.9 * 2 * tanH * camera.aspect));
  }
  const dirV = new THREE.Vector3();
  function openTarget() { // 쪽지는 자기 가운데가 카메라 축에 오도록 짜여 있다: 축 위에 둔다
    camera.getWorldDirection(dirV);
    return { p: camera.position.clone().addScaledVector(dirV, openDist()), q: camera.quaternion.clone() };
  }
  const shellDrop = () => openDist() * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.8;
  function openNote(n) {
    const r = rig;
    if (!r || opened || n === opened) return false;
    setHover(null);
    n.lift = 0; n.root.scale.setScalar(1); setGlow(n, 0);
    n.root.position.copy(n.home.p); n.root.quaternion.copy(n.home.q);
    scene.attach(n.root);
    n.flight = { from: { p: n.root.position.clone(), q: n.root.quaternion.clone() }, to: openTarget() };
    n.shellDrop = shellDrop();
    r.seen.aspect = camera.aspect; r.seen.fov = camera.fov;
    if (n.string) n.string.visible = false;
    n.pk.loadFonts(); writeText(n.pk); // 글은 지금 그리고, 글씨체가 오면 pk 가 다시 그린다
    const seq = sequence(), i = seq.indexOf(n);
    if (seq.length > 1) { seq[(i + 1) % seq.length].pk.loadFonts(); seq[(i + seq.length - 1) % seq.length].pk.loadFonts(); } // 넘기기 전에 이웃의 글씨체를 부른다
    opened = n; anims.set(n, { dir: 1, speed: 1 });
    setHint('treeNote'); syncNav();
    return true;
  }
  // 어느 순간에서도 된다: 있는 자리에서 거꾸로 돈다
  function closeNote(speed = 1.6) {
    const n = opened; if (!n) return;
    opened = null; leaving.add(n); anims.set(n, { dir: -1, speed });
    syncNav();
  }
  function finishClose(n) {
    leaving.delete(n); anims.delete(n);
    n.pivot.attach(n.root);
    n.root.position.copy(n.home.p); n.root.quaternion.copy(n.home.q); n.root.scale.setScalar(1); n.lift = 0;
    if (n.string) n.string.visible = true;
    eraseText(n.pk); n.flight = null; applyNote(n, 0, null);
    if (!busy()) {
      if (ctx.mode === 'tree') setHint('tree');
      if (rig?.dirty) syncNotes();
      syncNav();
    }
  }
  function step(dir) { // ‹ ›: 지금 쪽지가 접혀 돌아가는 동안 다음 쪽지가 날아온다
    if (ctx.mode !== 'tree' || !rig?.settled || !opened || pending) return;
    const seq = sequence(); if (seq.length < 2) return;
    const next = seq[(seq.indexOf(opened) + dir + seq.length) % seq.length];
    closeNote(2.6); pending = next;
    syncNav();
  }
  function snapAll() { // 나가거나 트리가 바뀔 때: 움직이던 쪽지는 애니메이션 없이 제자리로 간다
    pending = null;
    const out = new Set([...anims.keys(), ...leaving]); if (opened) out.add(opened);
    opened = null;
    for (const n of out) finishClose(n);
  }

  // ----- 포인터와 키 (트리 모드에서만) -----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    if (!rig) return null;
    const b = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); ray.far = 20;
    const hit = ray.intersectObjects([rig.hold, ...[...rig.notes.values()].map(n => n.root)], true)[0];
    return hit ? { note: hit.object.userData.note ?? null, packet: !!hit.object.userData.packet } : null;
  }
  const setCursor = () => { canvas.style.cursor = ctx.mode !== 'tree' ? '' : press?.turning ? 'grabbing' : hovered ? 'pointer' : 'grab'; };
  function setHover(n) { if (n === hovered) return; hovered = n; setCursor(); }
  on(canvas, 'pointerdown', e => {
    if (ctx.mode !== 'tree' || !rig?.settled || e.button > 0) return;
    press = { x: e.clientX, y: e.clientY, id: e.pointerId, turn: rig.turn, turning: false };
    canvas.setPointerCapture?.(e.pointerId);
  });
  on(canvas, 'pointermove', e => {
    if (ctx.mode !== 'tree' || !rig?.settled) return;
    if (press && press.id === e.pointerId && !busy()) {
      const dx = e.clientX - press.x;
      if (!press.turning && Math.hypot(dx, e.clientY - press.y) > 6) { press.turning = true; setHover(null); }
      if (press.turning) { rig.turn = press.turn + dx * TURN_PER_PX; rig.pivot.rotation.y = rig.turn; setCursor(); return; }
    }
    if (!press && e.pointerType === 'mouse' && !busy()) setHover(pick(e)?.note ?? null);
  });
  on(canvas, 'pointerup', e => {
    const p = press; press = null;
    if (ctx.mode !== 'tree') return;
    setCursor();
    if (!p || p.id !== e.pointerId || p.turning || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6 || !rig?.settled) return;
    const hit = pick(e);
    // 쪽지가 나와 있는 동안 종이 밖을 누르면 접어 넣는다
    if (opened) { if (!(hit?.packet && hit.note === opened)) closeNote(); return; }
    if (busy()) return;
    if (hit?.note) openNote(hit.note);
  });
  on(canvas, 'pointercancel', () => { press = null; setCursor(); });
  on(window, 'keydown', e => {
    if (ctx.mode !== 'tree' || e.target.closest?.('input, textarea')) return;
    if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1);
  });
  on($('tree-prev'), 'click', () => step(-1));
  on($('tree-next'), 'click', () => step(1));
  on($('treeexit'), 'click', () => treeEscape());

  // ----- 들어가고 나가기 -----
  // 시점은 트리에서 방 가운데 쪽으로 둔다. 트리가 벽을 보고 서 있어도 카메라가 벽 밖으로 나가지 않게 하고, 방 안에 가둔다.
  // 그 방향을 향하도록 pivot 을 돌려 둔다. 쪽지 자리는 pivot 틀에 있으므로 돌려도 바뀌지 않는다.
  function viewOf(r) {
    r.g.updateWorldMatrix(true, false);
    const b = r.pivot.position;
    const base = r.g.localToWorld(new THREE.Vector3(b.x, b.y, b.z));
    let dx = -base.x, dz = -base.z, len = Math.hypot(dx, dz);
    if (len < 0.05) { // 방 한가운데: 가구가 바라보는 쪽
      const f = new THREE.Vector3(0, 0, 1).transformDirection(r.g.matrixWorld);
      dx = f.x; dz = f.z; len = Math.hypot(dx, dz) || 1;
    }
    dx /= len; dz /= len;
    const m = 0.15;
    const pos = new THREE.Vector3(
      THREE.MathUtils.clamp(base.x + dx * TREE_VIEW.dist, -ctx.RX + m, ctx.RX - m),
      base.y + TREE_VIEW.eye,
      THREE.MathUtils.clamp(base.z + dz * TREE_VIEW.dist, -ctx.RZ + m, ctx.RZ - m),
    );
    const gq = new THREE.Quaternion(); r.g.getWorldQuaternion(gq);
    const gYaw = new THREE.Euler().setFromQuaternion(gq, 'YXZ').y;
    const yaw = wrapAngle(Math.atan2(dx, dz) - gYaw);
    return { pos, target: new THREE.Vector3(base.x, base.y + TREE_VIEW.look, base.z), yaw };
  }
  function enterTree() {
    if (ctx.mode !== 'room') return;
    syncRig();
    if (!rig) { toast(treeSlot() ? '트리를 불러오는 중이에요' : '이 방에는 트리가 없어요'); return; }
    if (ctx.perch) ctx.unperch();
    ctx.mode = 'tree'; ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = []; ctx.hovered = null;
    ctx.me.visible = false; // 1인칭이다: 걷는 사람이 시야를 가리지 않는다
    rig.settled = false; rig.view = viewOf(rig);
    rig.turn = rig.view.yaw; rig.pivot.rotation.y = rig.turn;
    setHint('tree'); ctx.goTo({ pos: rig.view.pos.clone(), target: rig.view.target.clone() }); syncUI(); syncNav();
  }
  function exitTree() {
    if (ctx.mode !== 'tree') return;
    snapAll();
    press = null; hovered = null;
    ctx.mode = 'room'; ctx.camGoal = null; ctx.me.visible = true;
    setCursor(); setHint('room'); syncUI(); syncNav();
  }
  // Esc 와 물러나기 단추: 나온 쪽지가 있으면 접고, 없으면 트리 모드에서 나간다
  function treeEscape() {
    if (opened) closeNote(); else if (pending) { pending = null; syncNav(); } else exitTree();
  }
  const nearTree = () => {
    const s = treeSlot(), me = ctx.me;
    return !!s?.group && !!me && Math.hypot(me.position.x - s.group.position.x, me.position.z - s.group.position.z) < 1.7;
  };

  // ----- 프레임 -----
  function dropRig() {
    const r = rig; rig = null;
    opened = pending = hovered = press = null; leaving.clear(); anims.clear();
    if (!r) return;
    for (const n of r.notes.values()) disposeNote(n);
    r.stringMat.dispose(); disposeBackCache(r.cache);
    disposeScene(r.deco); disposeScene(r.count.sp);
    r.count.sp.removeFromParent();
    const i = ctx.build.slotMeshes.indexOf(r.count.sp); if (i >= 0) ctx.build.slotMeshes.splice(i, 1);
  }
  function syncRig() {
    if (rig && rig.build !== ctx.build) { // 꾸미기가 가구를 다시 지었다: 쓰던 것은 이미 치워졌다
      const wasTree = ctx.mode === 'tree';
      dropRig();
      if (wasTree) { ctx.mode = 'room'; ctx.camGoal = null; ctx.me.visible = true; setCursor(); setHint('room'); syncUI(); syncNav(); }
    }
    if (!rig && failedBuild !== ctx.build) {
      const s = treeSlot();
      if (s && slotReady(s)) {
        try { rig = makeRig(s); if (rig) syncNotes(); }
        catch (e) { console.error('[heap-room] tree', e); failedBuild = ctx.build; rig = null; }
        if (!rig) failedBuild = ctx.build;
      }
    }
    return rig;
  }
  function treeStep(t, rawDt) {
    const dt = Math.min(rawDt, 0.05);
    // 트리 모드에서만 fov 50 이다 (방 카메라는 30)
    const goal = ctx.mode === 'tree' ? TREE_VIEW.fov : baseFov;
    if (camera.fov !== goal) {
      camera.fov += (goal - camera.fov) * (reduced ? 1 : 1 - Math.exp(-Math.min(rawDt, 0.1) * 7));
      if (Math.abs(camera.fov - goal) < 0.05) camera.fov = goal;
      camera.updateProjectionMatrix();
    }
    const r = syncRig();
    if (!r) return;
    if (r.queue.length) processQueue(r);
    paintCount(r);
    r.lights.update(t); r.star.update(t);
    r.count.sp.visible = ctx.mode !== 'tree' && ctx.mode !== 'edit';
    // 다 도착했으면 카메라를 정확한 자리에 놓는다 (글라이드는 0.02 m 앞에서 멈춘다)
    if (ctx.mode === 'tree' && !ctx.camGoal && !r.settled) {
      camera.position.copy(r.view.pos); controls.target.copy(r.view.target); camera.lookAt(r.view.target);
      r.settled = true;
    }
    // 마우스를 얹은 쪽지가 살짝 떠오른다
    for (const n of r.notes.values()) {
      if (anims.has(n) || n === opened) continue;
      const target = n === hovered && ctx.mode === 'tree' ? 1 : 0;
      if (n.lift === 0 && target === 0) continue;
      n.lift += (target - n.lift) * Math.min(1, dt * 12);
      if (target === 0 && n.lift < 0.002) n.lift = 0;
      n.root.position.copy(n.home.p); n.root.position.z += 0.015 * n.lift;
      n.root.scale.setScalar(1 + 0.08 * n.lift); setGlow(n, 0.3 * n.lift);
    }
    // 창 크기나 fov 가 바뀌면 나오는 중이거나 나와 있는 쪽지의 도착점을 다시 잡는다 (돌아가는 중에는 건드리지 않는다)
    if (opened && opened.flight && (camera.aspect !== r.seen.aspect || camera.fov !== r.seen.fov)) {
      r.seen.aspect = camera.aspect; r.seen.fov = camera.fov;
      opened.flight.to = openTarget(); opened.shellDrop = shellDrop(); applyNote(opened, opened.t);
    }
    for (const [n, an] of anims) {
      const tt = THREE.MathUtils.clamp(n.t + an.dir * an.speed * dt, 0, n.total);
      applyNote(n, tt);
      if (an.dir > 0 && tt >= n.total) anims.delete(n);
      else if (an.dir < 0 && tt <= 0) finishClose(n);
    }
    // 넘기기: 지금 쪽지가 제자리로 돌아가기 시작하면 다음 쪽지가 날아온다
    if (pending && [...leaving].every(n => n.t <= N_FLY)) { const p = pending; pending = null; openNote(p); }
  }

  // ----- 공개 -----
  function setTreeNotes(next) { list = normalise(next); if (rig) syncNotes(); }
  function surfaceReady() { if (!rig) return false; rig.surface.sync(); return true; }
  const treeSpot = {
    /** 자리 -> 트리 틀(pivot 지역)의 표면 점. 그 높이에 잎이 없거나 트리가 아직 없으면 null */
    toLocal: (y, angle) => (surfaceReady() ? rig.surface.hit(angle, y)?.point ?? null : null),
    /** 트리 틀의 점 -> { y, angle } */
    fromLocal: localToSpot,
    /** 월드 점 (예: 끌기 레이가 트리에 닿은 곳) -> { y, angle }. 트리가 아직 없으면 null */
    fromWorld: p => (rig ? (rig.pivot.updateWorldMatrix(true, false), localToSpot(rig.pivot.worldToLocal(p.clone()))) : null),
    /** 지금 걸린 쪽지의 자리 { id, y, angle } */
    hung: () => (rig ? [...rig.notes.values()].filter(n => n.spot).map(n => ({ id: n.id, ...n.spot })) : []),
    /** spot 이 다른 쪽지와 ORN 이상 떨어져 있는가. others 를 주지 않으면 지금 걸린 쪽지들 (ignoreId 의 것은 뺀다) */
    isFree: (spot, others, ignoreId) => spotIsFree(spot, others ?? treeSpot.hung().filter(o => o.id !== ignoreId)),
  };

  onDispose(() => { dropRig(); fontsLink?.remove(); fontsLink = null; });
  Object.assign(ctx, {
    openTree: () => enterTree(), enterTree, exitTree, treeEscape, nearTree, setTreeNotes, treeStep, treeSpot,
  });
}
