// 개발 전용 훅. index.js 가 NODE_ENV 가 production 이 아닐 때만 불러온다 (배포 번들에는 들어가지 않는다).
//   root.dispatchEvent(new CustomEvent('heap:dev', { detail: { cmd, cb } }))
//   cmd 'audit'  → cb(list): 같은 평면에 같은 쪽을 보고 겹친 면의 쌍 (깜빡이는 면, z-fighting). 축에 맞춘 Box, Plane 만 본다.
//   cmd 'export' → cb(ArrayBuffer): 지금 장면 전체를 glTF 바이너리(.glb)로. Blender 에서 열어 보는 용도다 (blender/heap/).
//   cmd 'exportItems' → cb([{ name, buf }]): 가구를 하나씩 .glb 로 (아래 설명).
import * as THREE from 'three';

const EPS = 1e-4;

// 메시의 면들을 월드 좌표로: { axis 0|1|2, sign ±1, at, r: [a0, a1, b0, b1] } (r 은 나머지 두 축의 범위)
function facesOf(mesh) {
  const p = mesh.geometry?.parameters;
  if (!p) return [];
  const isBox = mesh.geometry.type === 'BoxGeometry', isPlane = mesh.geometry.type === 'PlaneGeometry';
  if (!isBox && !isPlane) return [];
  mesh.updateWorldMatrix(true, false);
  const m = mesh.matrixWorld, e = m.elements;
  // 축에 맞춘 회전(90도 단위)만 다룬다
  const cols = [0, 1, 2].map(i => new THREE.Vector3(e[i * 4], e[i * 4 + 1], e[i * 4 + 2]));
  for (const c of cols) { const a = [Math.abs(c.x), Math.abs(c.y), Math.abs(c.z)].sort((x, y) => y - x); if (a[1] > EPS) return []; }
  const hx = (p.width ?? 1) / 2, hy = (p.height ?? 1) / 2, hz = isBox ? (p.depth ?? 1) / 2 : 0;
  const corners = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of (isBox ? [-1, 1] : [0])) corners.push(new THREE.Vector3(sx * hx, sy * hy, sz * hz).applyMatrix4(m));
  const min = corners.reduce((a, c) => a.min(c), corners[0].clone()), max = corners.reduce((a, c) => a.max(c), corners[0].clone());
  const lo = [min.x, min.y, min.z], hi = [max.x, max.y, max.z];
  const out = [];
  for (let axis = 0; axis < 3; axis++) {
    const [b, c] = [0, 1, 2].filter(i => i !== axis);
    const r = [lo[b], hi[b], lo[c], hi[c]];
    if (hi[axis] - lo[axis] < EPS) { // 평면: 양면으로 본다
      if (r[1] - r[0] > EPS && r[3] - r[2] > EPS) for (const sign of [-1, 1]) out.push({ axis, sign, at: lo[axis], r });
    } else if (isBox) {
      out.push({ axis, sign: -1, at: lo[axis], r }, { axis, sign: 1, at: hi[axis], r });
    }
  }
  return out;
}

function audit(scene, { RX, RZ } = {}) {
  const meshes = [];
  scene.traverseVisible(o => { if (o.isMesh && o.material?.visible !== false) meshes.push(o); }); // 보이지 않는 재질(바닥 클릭 판)은 그려지지 않는다
  const faces = meshes.flatMap(mesh => facesOf(mesh).map(f => ({ ...f, mesh })));
  const hits = [];
  const label = mesh => {
    const p = new THREE.Vector3(); mesh.getWorldPosition(p);
    const col = mesh.material?.color ? '#' + mesh.material.color.getHexString() : '?';
    const g = mesh.geometry.parameters;
    return `${mesh.geometry.type}(${[g.width, g.height, g.depth].filter(v => v != null).map(v => +v.toFixed(3)).join('x')}) ${col} @ ${[p.x, p.y, p.z].map(v => +v.toFixed(3)).join(',')}`;
  };
  for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
    const a = faces[i], b = faces[j];
    if (a.mesh === b.mesh || a.axis !== b.axis || a.sign !== b.sign || Math.abs(a.at - b.at) > EPS) continue;
    if (a.axis === 1 && a.sign === -1 && Math.abs(a.at) < EPS) continue; // 바닥(y 0)에 놓인 밑면은 아래에서 보이지 않는다
    // 벽 안쪽 면(x -RX, z -RZ)에 붙어 벽을 보는 면은 벽에 가려 보이지 않는다 (걸레받이 뒷면과 벽에 붙인 가구 뒷면)
    if (a.sign === -1 && ((a.axis === 0 && Math.abs(a.at + RX) < EPS) || (a.axis === 2 && Math.abs(a.at + RZ) < EPS))) continue;
    const w = Math.min(a.r[1], b.r[1]) - Math.max(a.r[0], b.r[0]), h = Math.min(a.r[3], b.r[3]) - Math.max(a.r[2], b.r[2]);
    // sameMat: 같은 재질끼리는 깜빡여도 같은 색이라 거의 보이지 않는다. 다른 재질의 쌍이 먼저 고칠 것이다
    if (w > EPS && h > EPS) hits.push({ sameMat: a.mesh.material === b.mesh.material, axis: 'xyz'[a.axis], sign: a.sign, at: +a.at.toFixed(4), area: +(w * h).toFixed(4), a: label(a.mesh), b: label(b.mesh) });
  }
  return hits;
}

export function setupDev(ctx) {
  // 방이 뜰 때마다 깜빡일 면을 스스로 찾아 알린다: 재질이 다른 두 면이 한 평면에 겹치면 콘솔 경고. 가구를 다시 지으면(꾸미기 저장) 다시 본다.
  // 같은 재질끼리는 같은 색이라 거의 보이지 않으므로 세지 않는다. 불러오는 모델(glTF)은 축 상자가 아니라 보지 않는다.
  let auditTimer = 0;
  const autoAudit = () => {
    clearTimeout(auditTimer);
    auditTimer = setTimeout(() => {
      if (ctx.disposed) return;
      const hits = audit(ctx.scene, ctx).filter(h => !h.sameMat);
      if (hits.length) console.warn(`[heap:dev] 깜빡일 면 ${hits.length}쌍 (같은 평면, 다른 재질)`, hits);
    }, 1500);
  };
  ctx.on(ctx.root, 'heap:ready', autoAudit);
  ctx.on(ctx.root, 'heap:saved', autoAudit);
  ctx.onDispose(() => clearTimeout(auditTimer));
  ctx.on(ctx.root, 'heap:dev', async e => {
    const { cmd, cb } = e.detail || {};
    if (typeof cb !== 'function') return;
    if (cmd === 'audit') cb(audit(ctx.scene, ctx));
    else if (cmd === 'fxprobe') { // 방 효과 측정 (fx-probe.js). ?debug=1 로 연 방에서만 (fx.js 가 있어야 한다)
      if (!ctx.fxApply) { cb({ error: 'fx 없음: ?debug=1 로 여세요' }); return; }
      const { makeProbe } = await import('./fx-probe.js');
      try { cb(await makeProbe(ctx)(e.detail.configs ?? [], { time: e.detail.time !== false, hour: e.detail.hour ?? 15 })); } catch (err) { cb({ error: String(err?.stack ?? err) }); }
    }
    else if (cmd === 'focus') { // detail.at = [x, y, z] 또는 'door', detail.dist: 방 카메라가 그 점으로 다가간다 (온보딩의 책장 줌과 같은 길). at 이 없으면 풀린다
      const at = e.detail.at === 'door' ? ctx.doorSpot?.clone().setY(0.4) : e.detail.at && new THREE.Vector3(...e.detail.at);
      Object.assign(ctx.introView, at ? { focus: 1, focusPoint: at, focusDist: e.detail.dist ?? 2 } : { focus: 0, focusPoint: null });
      cb(at ? at.toArray() : null);
    }
    else if (cmd === 'oob') { // 방 바닥(-RX..RX, -RZ..RZ)이나 벽 위(WALL_H)를 넘는 가구: [{ i, name, over: { x0, x1, z0, z1, y1 } }] (넘은 만큼, 미터)
      const { RX, RZ, WALL_H } = ctx, out = [], bb = new THREE.Box3();
      ctx.build.groups.forEach((g, i) => {
        const it = ctx.build.items[i]; if (!g || !it) return;
        bb.setFromObject(g);
        const over = { x0: -RX - bb.min.x, x1: bb.max.x - RX, z0: -RZ - bb.min.z, z1: bb.max.z - RZ, y1: bb.max.y - WALL_H };
        const bad = Object.fromEntries(Object.entries(over).filter(([, v]) => v > 0.01).map(([k, v]) => [k, +v.toFixed(3)]));
        if (Object.keys(bad).length) out.push({ i, name: it.type === 'model' ? it.model : it.type, x: it.x, z: it.z, over: bad });
      });
      cb(out);
    }
    else if (cmd === 'project') { // detail.at = [x, y, z] (월드) → 화면 좌표(px). 클릭 시험이 물건을 정확히 누르도록
      const v = new THREE.Vector3(...e.detail.at).project(ctx.camera), r = ctx.canvas.getBoundingClientRect();
      cb({ x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height });
    } else if (cmd === 'walk') { ctx.walkRoute(new THREE.Vector3(e.detail.at[0], 0, e.detail.at[1]), null); cb({ walking: !!ctx.walkTo, camGoal: !!ctx.camGoal }); } // 바닥 클릭과 같은 길로 걷기 (detail.at = [x, z])
    else if (cmd === 'sit') { ctx.sit(); cb({ mode: ctx.mode, goal: ctx.camGoal ? ctx.camGoal.target.toArray().map(v => +v.toFixed(2)) : null }); } // 더미 앞에 앉기 (방 모드에서). 카메라가 갈 곳을 돌려준다
    else if (cmd === 'programs') cb((ctx.renderer.info.programs ?? []).map(p => `${p.name} ${p.cacheKey}`)); // 지어진 셰이더 프로그램 (옮긴 뒤 새로 지어지는 것 찾기)
    else if (cmd === 'pointLights') { // 장면의 점광원: 부모 사슬과 자리. 셰이더는 그 수가 바뀔 때마다 모두 다시 지어진다
      const out = [];
      ctx.scene.traverse(o => { if (!o.isPointLight) return; const chain = []; for (let p = o.parent; p && p !== ctx.scene; p = p.parent) chain.push(p.name || p.type + (p.userData.itemIndex != null ? '#' + p.userData.itemIndex : '')); const w = o.getWorldPosition(new THREE.Vector3()); out.push({ visible: o.visible, chain: chain.join('<'), at: w.toArray().map(v => +v.toFixed(2)) }); });
      cb(out);
    }
    else if (cmd === 'heapInfo') { // 사진 더미 옮기기 시험: 더미 자리, 보는 자리, 카드 수와 보이는 카드, 카드 가운데의 평균 (더미 자리 근처여야 한다)
      const cs = ctx.cards ?? [], vis = cs.filter(c => c.visible), m = new THREE.Vector3();
      vis.forEach(c => m.add(c.position)); if (vis.length) m.divideScalar(vis.length);
      cb({ host: ctx.HOST && { x: ctx.HOST.x, z: ctx.HOST.z, top: ctx.HOST.top, w: ctx.HOST.w, d: ctx.HOST.d }, seat: ctx.SEAT?.toArray(), sitCam: ctx.SIT_CAM?.target.toArray() ?? null,
        cards: cs.length, visible: vis.length, pickables: ctx.pickables?.length ?? 0, mean: m.toArray().map(v => +v.toFixed(2)) });
    }
    else if (cmd === 'pileStats') { // 더미 모양 시험: 받침 위 가장 높은 카드, 카드 기울기, settle 한 번의 시간 (detail.settle 이면 settle(true) 를 재며 돌린다)
      const cs = (ctx.cards ?? []).filter(c => ctx.inPile(c)), top = ctx.HOST?.top ?? 0, up = new THREE.Vector3();
      let ms = null;
      // detail.from (0~1): 그 차례부터 위의 카드를 다시 셈하게 한다 (0 이면 모두, 0.5 면 가운데 카드를 집은 것과 같다)
      if (e.detail.from != null) cs.slice(Math.floor(e.detail.from * cs.length)).forEach(c => { c.userData.rest = null; });
      if (e.detail.settle) { const t0 = performance.now(); ctx.settle(true); ms = +(performance.now() - t0).toFixed(1); }
      const slopes = cs.map(c => THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.abs(up.set(0, 0, 1).applyQuaternion(c.userData.home.quat).y)))));
      cb({ cards: cs.length, box: !!ctx.HOST?.box, peakCm: +((Math.max(...cs.map(c => c.userData.home.pos.y)) - top) * 100).toFixed(1),
        meanSlopeDeg: +(slopes.reduce((s, v) => s + v, 0) / (slopes.length || 1)).toFixed(1), maxSlopeDeg: +Math.max(0, ...slopes).toFixed(1), settleMs: ms,
        // 상자 밖(탁자 위)의 카드: 받침 위 가운데 높이(cm)와 상자 가운데에서의 거리
        outside: ctx.HOST?.box ? cs.filter(c => Math.abs(c.userData.place.x - ctx.HOST.x) > ctx.HOST.boxW / 2 || Math.abs(c.userData.place.z - ctx.HOST.z) > ctx.HOST.boxD / 2)
          .map(c => ({ dx: +(c.userData.place.x - ctx.HOST.x).toFixed(3), dz: +(c.userData.place.z - ctx.HOST.z).toFixed(3), yCm: +((c.userData.home.pos.y - top) * 100).toFixed(2) })) : undefined });
    }
    else if (cmd === 'heldInfo') { // 집어 든 카드: 받은 그림의 단계(0 far, 1 near, 2 close), 앞면 텍스처 폭, 선명하게 그린 배율
      const c = ctx.held, u = c?.userData;
      cb(u ? { tier: u.tier, frontW: u.front.image.width, sharp: u.sharp, imgW: u.img?.width ?? null } : null);
    }
    else if (cmd === 'peek3d') { // 방의 빛 시험: detail.on 이면 HTML 카드를 숨기고 같은 자리의 3D 카드를 보인다. 끄면 되돌린다
      const c = ctx.held, host = ctx.$('cardview'), pl = ctx.player;
      if (c) { c.visible = !!e.detail.on; host.style.visibility = e.detail.on ? 'hidden' : ''; if (pl) pl.style.visibility = e.detail.on ? 'hidden' : ''; }
      cb(!!c);
    }
    else if (cmd === 'me') cb({ x: ctx.me.position.x, y: ctx.me.position.y, z: ctx.me.position.z, ry: ctx.me.rotation.y, legL: ctx.legL.rotation.x, mode: ctx.mode, perch: !!ctx.perch, walking: !!ctx.walkTo }); // 내 캐릭터 자리와 자세 (걷기 시험)
    else if (cmd === 'state') cb({ ground: (g => g ? { visible: g.visible, y: g.position.y, img: g.material.map?.image?.width } : null)(ctx.scene.getObjectByName('ground')), layoutGround: ctx.layout.ground ?? null, mode: ctx.mode, slots: ctx.build.slots.map(s => s.fn?.kind), slotMeshes: ctx.build.slotMeshes.length, slotMeshKinds: [...new Set(ctx.build.slotMeshes.map(m => m.userData.slot?.fn?.kind))], seatMeshes: ctx.build.seatMeshes.length });
    else if (cmd === 'lights') cb({ // 그림자와 불빛 시험: 해 그림자, 땅이 그림자를 받는지, 램프마다 불빛 세기와 작은 빛 구슬이 보이는지
      sunShadow: !!ctx.sun?.castShadow, groundShadow: ctx.ground ? ctx.ground.receiveShadow : null,
      lamps: ctx.build.lamps.map(l => ({ light: l.light ? +l.light.intensity.toFixed(2) : null, fixed: l.fixed ?? null, mark: l.mark ? l.mark.visible : null })),
    });
    else if (cmd === 'export') {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      // Blender 의 목록에서 알아보도록 가구 묶음에 이름을 붙인다 (엔진은 이름을 쓰지 않는다)
      ctx.build.groups.forEach((g, i) => { const it = ctx.build.items[i]; if (g && it) g.name = `item${i}-${it.type === 'model' ? it.model : it.type}`; });
      if (ctx.build.group) ctx.build.group.name = 'furniture';
      new GLTFExporter().parse(ctx.scene, buf => cb(buf), err => cb({ error: String(err?.message || err) }), { binary: true, onlyVisible: true });
    } else if (cmd === 'exportItems') {
      // 가구 하나씩: 엔진이 지은 그대로(크기, 재질)를 원점에 놓고 .glb 로. 같은 종류(type, model, size)는 한 번만.
      // cb([{ name, buf }]). name 은 model 이면 그 id, 손으로 짓는 가구면 type (size 가 있으면 -s<size>)
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const ex = new GLTFExporter(), seen = new Set(), out = [];
      const { items, groups } = ctx.build;
      for (let i = 0; i < items.length; i++) {
        const it = items[i], g = groups[i];
        if (!it || !g) continue;
        const name = (it.type === 'model' ? it.model : it.type) + (it.size != null && it.size !== 1 ? `-s${it.size}` : '');
        if (seen.has(name)) continue;
        seen.add(name);
        const c = g.clone(true); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.name = name;
        const buf = await new Promise(res => ex.parse(c, res, err => res({ error: String(err?.message || err) }), { binary: true }));
        out.push({ name, buf });
      }
      cb(out);
    }
  });
}
