// 방의 껍데기: 벽, 창, 햇빛, 먼지, 문.
import * as THREE from 'three';
import { flat, makeCanvas, canvasTexture } from './draw.js';

export function setupShell(ctx) {
  const { layout, C, WALLS, box, WALL_H, onWall, RX, RZ, scene, rand } = ctx;

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

  // 창: 틀, 유리, 해 질 녘 배경, 바깥의 나무. 햇빛이 창으로 들어온다
  const frameMat = flat(C.paper);
  ctx.sunDir = new THREE.Vector3(1.6, -2.55, 3.5).normalize(); ctx.shaftCorners = null;
  ctx.sunHeading = new THREE.Vector3(1.6, 0, 3.5); ctx.skyTex = null; // sunHeading: 해의 수평 방향(창에 묶인다). 높이는 applyTime 이 정한다
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
    const skyC = makeCanvas(4, 128);
    { const sg = skyC.getContext('2d'), gr = sg.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, '#f2c48f'); gr.addColorStop(0.55, '#e9a46b'); gr.addColorStop(1, '#8a7a55'); sg.fillStyle = gr; sg.fillRect(0, 0, 4, 128); }
    ctx.skyTex = canvasTexture(skyC);
    onWall(WIN.wall, WIN.at, 0.9, -3.5, new THREE.Mesh(new THREE.PlaneGeometry(2 * W.half, 3.6), new THREE.MeshBasicMaterial({ map: ctx.skyTex })));
    const out = new THREE.Mesh(new THREE.PlaneGeometry(2 * W.half, 3.4), flat('#6b6a4a')); out.rotation.x = -Math.PI / 2;
    const og = new THREE.Group(); og.add(out); out.position.set(0, -0.12, 0); onWall(WIN.wall, WIN.at, 0, -1.9, og);
    const tree = new THREE.Group();
    box(0.18, 1.6, 0.18, flat(C.woodDark), 0, 0.7, 0, { parent: tree });
    for (const [x, y, z, s] of [[0, 1.9, 0, 0.75], [-0.5, 1.6, 0.2, 0.55], [0.5, 1.7, -0.1, 0.6]]) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), flat(C.leaf)); c.position.set(x, y, z); c.castShadow = true; tree.add(c);
    }
    onWall(WIN.wall, WIN.at + 0.5, 0, -2.2, tree);
    const toCentre = Math.sign(-WIN.at) || 1;
    ctx.sunHeading = W.n.clone().multiplyScalar(3.5).addScaledVector(W.axis, 1.6 * toCentre);
    ctx.sunDir = ctx.sunHeading.clone().add(new THREE.Vector3(0, -2.55, 0)).normalize();
    ctx.shaftCorners = [[WIN.u0, WIN.y0], [WIN.u1, WIN.y0], [WIN.u1, WIN.y1], [WIN.u0, WIN.y1]].map(([u, y]) => W.point(u, y, 0));
  }
  const sun = new THREE.DirectionalLight(0xffb066, 3.0);
  if (WIN) sun.target.position.copy(WALLS[WIN.wall].point(WIN.at, WIN.y, 0)).addScaledVector(ctx.sunDir, WIN.y / -ctx.sunDir.y);
  sun.position.copy(sun.target.position).addScaledVector(ctx.sunDir, -11);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const SHADOW = Math.max(8, 2 * RX, 2 * RZ); // 해 그림자 절두체의 반폭: 원래 방은 8, 더 긴 방은 더 넓게
  Object.assign(sun.shadow.camera, { left: -SHADOW, right: SHADOW, top: SHADOW, bottom: -SHADOW, near: 1, far: 30 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.012;
  scene.add(sun, sun.target);
  ctx.moteGeo = null; ctx.shaftGeo = null; ctx.shaftMat = null; ctx.moteMat = null; const moteSeeds = [];
  if (ctx.shaftCorners) {
    const shaftFloor = ctx.shaftCorners.map(p => p.clone().addScaledVector(ctx.sunDir, p.y / -ctx.sunDir.y));
    const v = [...ctx.shaftCorners, ...shaftFloor].flatMap(p => [p.x, p.y, p.z]);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    sg.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
    ctx.shaftGeo = sg; ctx.shaftMat = new THREE.MeshBasicMaterial({ color: '#ffc98a', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(sg, ctx.shaftMat));
    ctx.moteGeo = new THREE.BufferGeometry(); ctx.moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(90 * 3), 3));
    for (let i = 0; i < 90; i++) moteSeeds.push([rand(), rand(), rand(), rand() * 6.28]);
    ctx.moteMat = new THREE.PointsMaterial({ color: '#ffe0b0', size: 0.03, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    scene.add(new THREE.Points(ctx.moteGeo, ctx.moteMat));
  }
  const tA = new THREE.Vector3(), tB = new THREE.Vector3();
  function stepMotes(t) {
    if (!ctx.moteGeo) return;
    const pos = ctx.moteGeo.attributes.position;
    moteSeeds.forEach(([u, v, w, ph], i) => {
      tA.lerpVectors(ctx.shaftCorners[0], ctx.shaftCorners[1], u).lerp(tB.lerpVectors(ctx.shaftCorners[3], ctx.shaftCorners[2], u), v);
      tA.addScaledVector(ctx.sunDir, (tA.y / -ctx.sunDir.y) * ((w + t * 0.01) % 1) * 0.9);
      pos.setXYZ(i, tA.x + Math.sin(t * 0.3 + ph) * 0.05, tA.y + Math.sin(t * 0.21 + ph * 2) * 0.05, tA.z);
    });
    pos.needsUpdate = true;
  }

  // 다른 방으로 가는 문
  const doorParts = [];
  ctx.doorSpot = null;
  if (DOOR) {
    const g = new THREE.Group();
    const panel = box(0.92, 2.1, 0.06, flat(C.accent), 0, 1.05, -0.1, { parent: g });
    for (const sx of [-0.52, 0.52]) box(0.08, 2.2, 0.24, frameMat, sx, 1.1, -0.06, { parent: g });
    box(1.12, 0.1, 0.24, frameMat, 0, 2.2, -0.06, { parent: g });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), flat('#d8b27a', { metalness: 0.4, roughness: 0.4 })); knob.position.set(0.34, 1.0, -0.04); g.add(knob);
    const sign = makeCanvas(256, 96);
    { const sgc = sign.getContext('2d'); sgc.fillStyle = C.paper; sgc.fillRect(0, 0, 256, 96); sgc.fillStyle = C.ink; sgc.font = '44px "Nanum Pen Script", cursive'; sgc.textAlign = 'center'; sgc.textBaseline = 'middle'; sgc.fillText('다른 방', 128, 50); }
    const st = canvasTexture(sign);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshStandardMaterial({ map: st })); plate.position.set(0, 1.62, -0.065); g.add(plate);
    onWall(DOOR.wall, DOOR.at, 0, 0, g);
    doorParts.push(panel, knob, plate);
    ctx.doorSpot = WALLS[DOOR.wall].point(DOOR.at, 0, 0.85);
  }

  Object.assign(ctx, { sun, WIN, DOOR, doorParts, stepMotes });
}
