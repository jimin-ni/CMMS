// 방의 껍데기: 벽, 창, 햇빛, 먼지, 문.
import * as THREE from 'three';
import { flat, makeCanvas, canvasTexture } from './draw.js';
import { tone } from './palette.js';
import { DEBUG_ON, SHADOW_TEST } from './debug-flags.js';

export function setupShell(ctx) {
  const { layout, C, WALLS, box, WALL_H, onWall, RX, RZ, scene, rand } = ctx;

  // 창: layout.items 의 창 가구(type "window", fixtures.js). 벽은 rot 로 안다 (90 이면 왼쪽 벽, 아니면 뒷벽). at 은 벽 위의 자리.
  // 창 윗선은 벽 윗선에서 0.12 아래까지만 간다. 벽이 4 이던 때 저장한 창(y 2.55)이 2.5 벽을 뚫지 않게 내려 단다.
  // 해의 방향은 첫 창이 정한다 (WIN). 창이 없으면 해는 기본 방향에서 비춘다
  const WINS = (layout.items || []).filter(it => it?.type === 'window').map(it => {
    const wall = it.rot === 90 ? 'left' : 'back', at = wall === 'left' ? it.z : it.x, w = it.w ?? 1.3, h = it.h ?? 1.2;
    const y = Math.min(it.y ?? 1.71, WALL_H - 0.12 - h / 2);
    return { wall, at, w, h, y, u0: at - w / 2, u1: at + w / 2, y0: y - h / 2, y1: y + h / 2 };
  });
  const WIN = WINS[0] ?? null;
  // 깊이 층: 벽 안쪽 면 0, 걸레받이 앞면 TRIM_D, 문틀 앞면 FRAME_D. 두 면이 한 평면에 겹치면 깜빡이므로(z-fighting) 층마다 다르다.
  // 벽 두께는 WALL_T 이고 벽은 방 밖(off -WALL_T..0)에 선다. 뚫린 곳(창, 문)의 벽 두께는 문틀이나 문턱, 창 상자로 덮는다.
  // 걸레받이(아래 벽)는 얇은 칠 한 겹이다. 가구는 벽 안쪽 면에 등을 붙이므로 0.06 이던 때는 소파와 장의 등이 그 속에 묻혔다
  const WALL_T = 0.2, TRIM_D = 0.012, FRAME_D = 0.08, DOOR_FRAME = 0.06;
  // 문: 구멍은 at ± 0.5. 걸레받이는 문틀 바깥 끝(± 0.5 + DOOR_FRAME)에서 멈춘다 (tu0, tu1)
  const DOOR = layout.door && { ...layout.door, u0: layout.door.at - 0.5, u1: layout.door.at + 0.5, tu0: layout.door.at - 0.5 - DOOR_FRAME, tu1: layout.door.at + 0.5 + DOOR_FRAME, y0: 0, y1: 2.15 };
  const wallMat = tone(C, 'wall'), trimMat = tone(C, 'trim');
  function buildWall(wall) {
    const openings = [...WINS, DOOR].filter(o => o && o.wall === wall).sort((a, b) => a.u0 - b.u0);
    const slab = (u0, u1, y0, y1) => {
      if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return;
      const p = WALLS[wall].point((u0 + u1) / 2, (y0 + y1) / 2, -WALL_T / 2);
      if (wall === 'back') box(u1 - u0, y1 - y0, WALL_T, wallMat, p.x, p.y, p.z);
      else box(WALL_T, y1 - y0, u1 - u0, wallMat, p.x, p.y, p.z);
    };
    const trim = (u0, u1) => {
      if (u1 - u0 < 0.01) return;
      const p = WALLS[wall].point((u0 + u1) / 2, 0.45, TRIM_D / 2);
      if (wall === 'back') box(u1 - u0, 0.9, TRIM_D, trimMat, p.x, p.y, p.z, { cast: false });
      else box(TRIM_D, 0.9, u1 - u0, trimMat, p.x, p.y, p.z, { cast: false });
    };
    const H = WALLS[wall].half;
    // 모서리 기둥(벽 두께 x 벽 두께)은 뒷벽이 갖는다. 왼벽까지 덮으면 두 벽이 같은 자리에 겹쳐 윗면이 깜빡인다
    let cur = wall === 'back' ? -H - WALL_T : -H, tcur = wall === 'back' ? -H + TRIM_D : -H;
    // 벽은 땅(ctx.groundY, scene.js)까지 내려온다. 땅이 없으면 0 이다. 문 밑(구멍이 바닥부터)은 문턱이 막으므로 비운다
    const B = ctx.groundY ?? 0;
    for (const o of openings) {
      slab(cur, o.u0, B, WALL_H); slab(o.u0, o.u1, o.y0 > 0 ? B : 0, o.y0); slab(o.u0, o.u1, o.y1, WALL_H);
      cur = o.u1;
      if (o.y0 < 0.9) { trim(tcur, o.tu0 ?? o.u0); tcur = o.tu1 ?? o.u1; }
    }
    slab(cur, H, B, WALL_H); trim(tcur, H);
  }
  buildWall('back'); buildWall('left');

  // 창: 틀, 유리, 창밖 하늘 상자. 햇빛이 창으로 들어온다
  const frameMat = tone(C, 'paper');
  ctx.sunDir = new THREE.Vector3(1.6, -2.55, 3.5).normalize(); ctx.shaftCorners = null;
  ctx.sunHeading = new THREE.Vector3(1.6, 0, 3.5); ctx.skyTex = null; // sunHeading: 해의 수평 방향(창에 묶인다). 높이는 applyTime 이 정한다
  const skyC = makeCanvas(4, 128);
  { const sg = skyC.getContext('2d'), gr = sg.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#f2c48f'); gr.addColorStop(0.55, '#e9a46b'); gr.addColorStop(1, '#8a7a55'); sg.fillStyle = gr; sg.fillRect(0, 0, 4, 128); }
  if (WIN) ctx.skyTex = canvasTexture(skyC); // 모든 창이 같은 하늘을 쓴다
  for (const WN of WINS) {
    const W = WALLS[WN.wall], ww = WN.w, wh = WN.h;
    const g = new THREE.Group();
    box(ww + 0.16, 0.08, 0.3, frameMat, 0, -wh / 2 - 0.02, 0.08, { parent: g });
    box(ww + 0.16, 0.08, 0.22, frameMat, 0, wh / 2 + 0.02, 0.02, { parent: g });
    // 옆 기둥은 구멍 안쪽 가장자리에 붙는다 (전에는 ± (ww/2 + 0.04) 라 벽 속에 묻혀 보이지 않았다)
    for (const sx of [-ww / 2 + 0.035, 0, ww / 2 - 0.035]) box(0.07, wh, 0.12, frameMat, sx, 0, -0.1, { parent: g });
    box(ww - 0.14, 0.05, 0.1, frameMat, 0, 0, -0.1, { parent: g }); // 가로살은 두 옆 기둥 사이에만 (끝면이 기둥 바깥 면과 겹치지 않게)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshStandardMaterial({ color: '#ffd9a8', transparent: true, opacity: 0.12, roughness: 0.1 }));
    glass.position.z = -0.1; g.add(glass);
    onWall(WN.wall, WN.at, WN.y, 0, g);
    // 창밖: 창 구멍 바로 뒤에 붙은 닫힌 상자. 안쪽 다섯 면에 하늘을 칠한다 (time.js 가 skyTex 를 시간에 맞춰 다시 칠한다).
    // 상자는 벽 길이와 벽 높이 안에 잘라 두어서, 방 밖에서 비추는 카메라(온보딩)에도 벽 뒤로 삐져나오지 않는다.
    // 그림자를 드리우지 않는다: 해는 이 상자를 지나 창으로 들어온다.
    {
      // D: 상자 깊이. 상자는 벽 뒷면 너머에 있으므로, 위에서 내려다보는 방 카메라에 윗면이 벽 너머로 보이지 않게
      // 상자 윗면을 벽 윗선에서 D 이상 내린다 (45 도까지 가린다). 벽이 2.5 로 낮아지며 전의 깊이 0.35 는 벽 위로 드러났다
      const M = 0.1, D = 0.12;
      const bu0 = Math.max(WN.u0 - M, -W.half), bu1 = Math.min(WN.u1 + M, W.half);
      const by0 = Math.max(WN.y0 - M, 0), by1 = Math.max(WN.y1, Math.min(WN.y1 + M, WALL_H - D));
      const bw = bu1 - bu0, bh = by1 - by0;
      const skyMat = new THREE.MeshBasicMaterial({ map: ctx.skyTex, side: THREE.DoubleSide });
      const vb = new THREE.Group();
      const face = (w, h, x, y, z, rx, ry, v) => {
        const geo = new THREE.PlaneGeometry(w, h);
        if (v != null) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, v); } // 위아래 면은 하늘의 한 줄 색만
        const m = new THREE.Mesh(geo, skyMat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); vb.add(m);
      };
      face(bw, bh, 0, 0, -D, 0, 0);
      face(D, bh, -bw / 2, 0, -D / 2, 0, Math.PI / 2);
      face(D, bh, bw / 2, 0, -D / 2, 0, -Math.PI / 2);
      face(bw, D, 0, bh / 2, -D / 2, Math.PI / 2, 0, 0.98);
      face(bw, D, 0, -bh / 2, -D / 2, -Math.PI / 2, 0, 0.02);
      onWall(WN.wall, (bu0 + bu1) / 2, (by0 + by1) / 2, -WALL_T, vb); // 상자는 제 가운데에 대해 대칭이라 벽의 방향과 상관없다
    }
    if (WN !== WIN) continue; // 해와 빛줄기는 첫 창으로만
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
  // 임시 디버그 그림자 보기 (debug-flags.js, ?debug=1 일 때만). 그림자는 해 하나의 그림자 지도와 땅(scene.js)에 그려 넣은 접지 그림자뿐이다.
  //   all: 방 밖까지 · room(기본, scene.js 의 땅 그대로): 방 밖의 땅은 해 그림자를 받지 않고 접지 그림자도 지운다 (방 안의 바닥, 벽, 가구는 그대로) · none: 해가 그림자를 드리우지 않는다
  // receiveShadow 와 castShadow 를 바꾸면 three 가 다음 그리기에서 셰이더를 알아서 다시 고른다.
  ctx.applyShadowMode = mode => {
    sun.castShadow = mode !== 'none';
    if (ctx.ground) { ctx.ground.receiveShadow = mode === 'all'; ctx.paintGround(mode === 'all'); }
  };
  if (DEBUG_ON) {
    if (SHADOW_TEST.mode !== 'room') ctx.applyShadowMode(SHADOW_TEST.mode);
    ctx.on(ctx.root, 'heap:shadow', () => ctx.applyShadowMode(SHADOW_TEST.mode));
  }
  ctx.moteGeo = null; ctx.shaftGeo = null; ctx.shaftMat = null; ctx.moteMat = null; const moteSeeds = [];
  if (ctx.shaftCorners) {
    const shaftFloor = ctx.shaftCorners.map(p => p.clone().addScaledVector(ctx.sunDir, p.y / -ctx.sunDir.y));
    const v = [...ctx.shaftCorners, ...shaftFloor].flatMap(p => [p.x, p.y, p.z]);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    // 빛줄기는 창에서 가장 밝고 바닥 쪽 끝에서 사라진다 (더하기 섞기라 검정은 아무것도 더하지 않는다).
    // 끝까지 같은 밝기이던 때는 빛줄기 안의 가구 위에 상자 모서리가 그대로 그려졌다
    sg.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    sg.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
    ctx.shaftGeo = sg; ctx.shaftMat = new THREE.MeshBasicMaterial({ color: '#ffc98a', vertexColors: true, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
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
    // 문틀(기둥, 머리)은 벽 두께의 거의 끝(-0.18)부터 FRAME_D 까지 나와서 걸레받이(TRIM_D)보다 앞에 선다.
    // 기둥은 구멍 안으로 0.02 들어오고(안쪽 면 ± 0.48), 머리는 구멍 위 끝(2.15)보다 0.01 내려온다: 벽의 잘린 면과 겹치는 평면이 없다.
    const fz0 = -WALL_T + 0.02, fd = FRAME_D - fz0, fz = (fz0 + FRAME_D) / 2, fw = 0.02 + DOOR_FRAME, headY0 = DOOR.y1 - 0.01;
    for (const s of [-1, 1]) box(fw, headY0, fd, frameMat, s * (0.48 + fw / 2), headY0 / 2, fz, { parent: g }); // 기둥 윗면은 머리 밑면에 닿는다 (겹치지 않는다)
    box(0.96 + 2 * fw, 0.1, fd, frameMat, 0, headY0 + 0.05, fz, { parent: g });
    // 문짝은 문턱에서 머리 밑까지 막는다. 문턱은 벽 두께를 가로질러 바닥 높이(윗면 y 0)에 깔린다: 문 밑으로 벽 너머가 보이지 않는다
    const panel = box(0.96, headY0, 0.06, tone(C, 'accent'), 0, headY0 / 2, -WALL_T / 2, { parent: g });
    // 문턱은 구멍 폭(1.0) 전체를 덮는다. 0.96 이던 때는 양옆에 0.02 틈이 남아 땅이 없는 방에서 문 밑으로 배경이 보였다
    // 문턱은 문 앞 바닥 널과 같은 색이다 (scene.js 의 널은 x 방향으로 1 씩 놓인 floor:i). 왼쪽 벽의 문은 첫 널 앞에 있다
    const plank = DOOR.wall === 'left' ? 0 : Math.min(Math.max(Math.floor(DOOR.at + RX), 0), Math.ceil(2 * RX) - 1);
    box(1.0, 0.1, WALL_T, tone(C, `floor:${plank}`), 0, -0.05, -WALL_T / 2, { parent: g, cast: false });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), flat('#d8b27a', { metalness: 0.4, roughness: 0.4 })); knob.position.set(0.34, 1.0, -0.04); g.add(knob);
    const sign = makeCanvas(256, 96);
    const st = canvasTexture(sign);
    // 문패: 종이 색 바탕에 잉크 색 글씨. 팔레트가 바뀌면 recolour.js 가 다시 그린다
    const paintSign = () => {
      const sgc = sign.getContext('2d'); sgc.fillStyle = C.paper; sgc.fillRect(0, 0, 256, 96); sgc.fillStyle = C.ink; sgc.font = '44px "Nanum Pen Script", cursive'; sgc.textAlign = 'center'; sgc.textBaseline = 'middle'; sgc.fillText('다른 방', 128, 50);
      st.needsUpdate = true;
    };
    paintSign();
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshStandardMaterial({ map: st })); plate.position.set(0, 1.62, -0.065); g.add(plate);
    plate.material.userData.repaint = paintSign;
    onWall(DOOR.wall, DOOR.at, 0, 0, g);
    doorParts.push(panel, knob, plate);
    ctx.doorSpot = WALLS[DOOR.wall].point(DOOR.at, 0, 0.85);
  }

  Object.assign(ctx, { sun, WIN, WINS, DOOR, doorParts, stepMotes });
}
