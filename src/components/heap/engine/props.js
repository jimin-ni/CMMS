// 고정 소품: 탁자, 러그, 머그, 휴대폰, 방명록 받침대, 스크린과 영사기.
import * as THREE from 'three';
import { flat, drawFit, makeCanvas, canvasTexture } from './draw.js';

export function setupProps(ctx) {
  const { layout, C, scene, box, OBST, DOOR, onWall, WALLS } = ctx;

  // 탁자, 러그, 방석, 머그, 휴대폰 (위치는 layout.table 기준)
  const TABLE = { x: layout.table.x, z: layout.table.z, w: 2.6, d: 1.8, top: 0.56 };
  const rugC = makeCanvas(256, 192);
  { const g = rugC.getContext('2d'); g.fillStyle = C.paper; g.fillRect(0, 0, 256, 192);
    [[C.accent, 14, 16], [C.olive, 40, 6], [C.accent, 150, 10], [C.olive, 168, 4]].forEach(([c, y, h]) => { g.fillStyle = c; g.fillRect(0, y, 256, h); });
    for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(80,60,40,${Math.random() * 0.06})`; g.fillRect(Math.random() * 256, Math.random() * 192, 2, 1); } }
  const rugTex = canvasTexture(rugC);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.9), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(TABLE.x, 0.006, TABLE.z + 0.15); rug.receiveShadow = true; scene.add(rug);
  const tableTop = box(TABLE.w, 0.08, TABLE.d, flat(C.woodB), TABLE.x, TABLE.top - 0.04, TABLE.z);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.12, TABLE.top - 0.08, 0.12, flat(C.woodDark), TABLE.x + sx * (TABLE.w / 2 - 0.15), (TABLE.top - 0.08) / 2, TABLE.z + sz * (TABLE.d / 2 - 0.15));
  OBST.unshift({ x: TABLE.x, z: TABLE.z, hw: TABLE.w / 2 + 0.25, hd: TABLE.d / 2 + 0.25, rhw: TABLE.w / 2, rhd: TABLE.d / 2 });
  const SEAT = new THREE.Vector3(TABLE.x, 0, TABLE.z + TABLE.d / 2 + 0.5);
  box(0.75, 0.1, 0.75, flat(C.accent), SEAT.x, 0.05, SEAT.z, { cast: false });
  const MUG = { x: TABLE.x + 1.05, z: TABLE.z + 0.6 };
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.12, 8), flat(C.paper)); mug.position.set(MUG.x, TABLE.top + 0.06, MUG.z); mug.castShadow = true; scene.add(mug);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.052, 8), flat('#4a2f1e')); coffee.rotation.x = -Math.PI / 2; coffee.position.set(MUG.x, TABLE.top + 0.115, MUG.z); scene.add(coffee);
  const PHONE = { x: TABLE.x + 0.68, z: TABLE.z + 0.62 };
  const phoneBody = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.018, 0.32), flat(C.ink, { roughness: 0.5 }));
  phoneBody.position.set(PHONE.x, TABLE.top + 0.009, PHONE.z); phoneBody.rotation.y = 0.35; phoneBody.castShadow = true;
  const phoneGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.145, 0.29), new THREE.MeshStandardMaterial({ color: '#efe6d6', emissive: '#f3d9b0', emissiveIntensity: 0.6 }));
  phoneGlow.rotation.set(-Math.PI / 2, 0, 0.35); phoneGlow.position.set(PHONE.x, TABLE.top + 0.0185, PHONE.z);
  const phoneDot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 10), new THREE.MeshBasicMaterial({ color: C.accent }));
  phoneDot.rotation.set(-Math.PI / 2, 0, 0.35); phoneDot.position.set(PHONE.x + 0.03, TABLE.top + 0.019, PHONE.z - 0.08);
  scene.add(phoneBody, phoneGlow, phoneDot);
  const phoneParts = [phoneBody, phoneGlow, phoneDot];

  // guestbook stand (방명록) beside the door
  const bookParts = [];
  ctx.bookSpot = null;
  const GB = layout.guestbook ?? (DOOR ? { wall: DOOR.wall, at: DOOR.at - 0.95 } : null);
  if (GB) {
    const g = new THREE.Group();
    bookParts.push(box(0.5, 0.78, 0.36, flat(C.woodB), 0, 0.39, 0, { parent: g }));
    const pageL = box(0.22, 0.02, 0.3, flat(C.paper), -0.11, 0.8, 0.02, { parent: g }), pageR = box(0.22, 0.02, 0.3, flat(C.paper), 0.11, 0.8, 0.02, { parent: g });
    pageL.rotation.z = 0.12; pageR.rotation.z = -0.12;
    const pen = box(0.015, 0.015, 0.16, flat(C.accent), 0.14, 0.83, 0.02, { parent: g }); pen.rotation.y = 0.5;
    bookParts.push(pageL, pageR, pen);
    onWall(GB.wall, GB.at, 0, 0.32, g);
    const p = WALLS[GB.wall].point(GB.at, 0, 0.32);
    OBST.push({ x: p.x, z: p.z, hw: 0.32, hd: 0.32, rhw: 0.25, rhd: 0.25 });
    ctx.bookSpot = WALLS[GB.wall].point(GB.at, 0, 0.95);
  }

  // 영사기와 스크린
  const SCR = { wall: layout.screen.wall, at: layout.screen.at, y: 2.4, w: 1.6, h: 0.9 };
  const projC = makeCanvas(640, 360);
  const projTex = canvasTexture(projC);
  const screenIdle = flat(C.paper), screenOn = new THREE.MeshBasicMaterial({ map: projTex });
  const screenG = new THREE.Group();
  box(SCR.w + 0.14, SCR.h + 0.14, 0.05, flat(C.olive), 0, 0, 0.025, { cast: false, parent: screenG });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCR.w, SCR.h), screenIdle); screen.position.z = 0.06; screen.receiveShadow = true; screenG.add(screen);
  onWall(SCR.wall, SCR.at, SCR.y, 0, screenG); screenG.updateMatrixWorld(true);
  const SCREEN_C = screen.getWorldPosition(new THREE.Vector3());
  const side = layout.table.projector === 'right' ? 1 : -1;
  const PROJ = new THREE.Vector3(TABLE.x + side * 0.85, TABLE.top, TABLE.z - 0.5);
  const proj = new THREE.Group(); proj.position.copy(PROJ);
  proj.rotation.y = Math.atan2(-(SCREEN_C.x - PROJ.x), -(SCREEN_C.z - PROJ.z));
  const metal = flat('#3f3d32', { roughness: 0.55, metalness: 0.3 });
  const pBody = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.36), flat(C.olive)); pBody.position.y = 0.12;
  const pLens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 10), metal); pLens.rotation.x = Math.PI / 2; pLens.position.set(0, 0.13, -0.23);
  const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), new THREE.MeshBasicMaterial({ color: '#5b5a4a' })); lensGlass.position.set(0, 0.13, -0.291); lensGlass.rotation.y = Math.PI;
  const pFoot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.3), metal); pFoot.position.y = 0.015;
  const reelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.025, 12);
  const reelA = new THREE.Mesh(reelGeo, flat(C.accent)), reelB = new THREE.Mesh(reelGeo, flat(C.accent));
  reelA.rotation.z = reelB.rotation.z = Math.PI / 2; reelA.position.set(0, 0.33, -0.1); reelB.position.set(0, 0.33, 0.1);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.3), metal); arm.position.set(0, 0.26, 0);
  const projParts = [pBody, pLens, lensGlass, pFoot, reelA, reelB, arm];
  for (const m of projParts) { m.castShadow = true; proj.add(m); }
  scene.add(proj); proj.updateMatrixWorld(true);
  const LENS = lensGlass.getWorldPosition(new THREE.Vector3());
  const SLOT = { pos: proj.localToWorld(new THREE.Vector3(0, 0, 0.3)), quat: proj.quaternion.clone() };
  const beamGeo = new THREE.BufferGeometry();
  {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => screen.localToWorld(new THREE.Vector3(sx * SCR.w / 2, sy * SCR.h / 2, 0.01)));
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute([LENS, ...corners].flatMap(p => [p.x, p.y, p.z]), 3));
    beamGeo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);
  }
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff1d6', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(beamGeo, beamMat));
  const projLight = new THREE.SpotLight(0xfff0d6, 0, 0, 0.22, 0.5, 0);
  projLight.position.copy(LENS); projLight.target.position.copy(SCREEN_C); scene.add(projLight, projLight.target);
  function drawProjection(reel, img) {
    const g = projC.getContext('2d'), W = projC.width, H = projC.height;
    g.fillStyle = '#1b1812'; g.fillRect(0, 0, W, H);
    if (img) drawFit(g, img, 0, 0, W, H, !!reel.wide);
    g.fillStyle = 'rgba(255, 214, 160, 0.08)'; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    projTex.needsUpdate = true;
  }

  Object.assign(ctx, {
    PROJ, MUG, PHONE, TABLE, drawProjection, SEAT, SCREEN_C, SCR, screen, screenOn, screenIdle,
    projParts, phoneParts, tableTop, bookParts, beamMat, projLight, reelA, reelB, phoneDot, SLOT,
  });
}
