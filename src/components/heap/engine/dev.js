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

function audit(scene) {
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
    const w = Math.min(a.r[1], b.r[1]) - Math.max(a.r[0], b.r[0]), h = Math.min(a.r[3], b.r[3]) - Math.max(a.r[2], b.r[2]);
    // sameMat: 같은 재질끼리는 깜빡여도 같은 색이라 거의 보이지 않는다. 다른 재질의 쌍이 먼저 고칠 것이다
    if (w > EPS && h > EPS) hits.push({ sameMat: a.mesh.material === b.mesh.material, axis: 'xyz'[a.axis], sign: a.sign, at: +a.at.toFixed(4), area: +(w * h).toFixed(4), a: label(a.mesh), b: label(b.mesh) });
  }
  return hits;
}

export function setupDev(ctx) {
  ctx.on(ctx.root, 'heap:dev', async e => {
    const { cmd, cb } = e.detail || {};
    if (typeof cb !== 'function') return;
    if (cmd === 'audit') cb(audit(ctx.scene));
    else if (cmd === 'project') { // detail.at = [x, y, z] (월드) → 화면 좌표(px). 클릭 시험이 물건을 정확히 누르도록
      const v = new THREE.Vector3(...e.detail.at).project(ctx.camera), r = ctx.canvas.getBoundingClientRect();
      cb({ x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height });
    } else if (cmd === 'state') cb({ mode: ctx.mode, slots: ctx.build.slots.map(s => s.fn?.kind), slotMeshes: ctx.build.slotMeshes.length, seatMeshes: ctx.build.seatMeshes.length });
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
