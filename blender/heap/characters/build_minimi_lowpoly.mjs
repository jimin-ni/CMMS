// Builds the first low-poly minimi (bob) and writes public/heap/models/minimi/minimi.glb.
// From then on the .glb is the source: edit it in Blockbench and keep the node and material names below.
//   node blender/heap/characters/build_minimi_lowpoly.mjs
//
// Budget (docs: memory "feedback-asset-detail-budget"): in the room view the figure is 70–100 px tall,
// the head about 50 px wide. Kenney furniture is 60–200 triangles. Target: under 900 triangles, no hidden faces.
// Sizes follow the approved model sheet (.claude/session-artifacts/minimi/sheet/): 1 unit = 1 m, height 0.98, face +z.
//
// Names the engine relies on (src/components/heap/engine/figure.js):
//   nodes      minimi (root) · leg_L / leg_R (pivot at the hip, 0.175; no dots, three.js drops them)
//   materials  skin · hair · hair_whorl · eye · eye_light · blush · shirt · shirt_band · trousers · trouser_cuff · shoe · sole
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url)), REPO = resolve(HERE, '../../..');
const require = createRequire(resolve(REPO, 'package.json'));
globalThis.FileReader = class { // GLTFExporter needs FileReader, which Node lacks
  readAsArrayBuffer(b) { b.arrayBuffer().then(r => { this.result = r; this.onloadend?.(); }); }
  readAsDataURL(b) { b.arrayBuffer().then(r => { this.result = `data:${b.type || 'application/octet-stream'};base64,` + Buffer.from(r).toString('base64'); this.onloadend?.(); }); }
};
const THREE = await import(pathToFileURL(require.resolve('three')).href);
const { GLTFExporter } = await import(pathToFileURL(require.resolve('three/examples/jsm/exporters/GLTFExporter.js')).href);
const { mergeGeometries } = await import(pathToFileURL(require.resolve('three/examples/jsm/utils/BufferGeometryUtils.js')).href);
const V = (x, y, z) => new THREE.Vector3(x, y, z), D = Math.PI / 180;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// an n-gon with its corners on a circle covers less than the circle; scaling the corners by fit(n) gives the same area,
// so the outline lands on the sheet instead of inside it
const fit = n => Math.sqrt(2 * Math.PI / (n * Math.sin(2 * Math.PI / n)));
const HEAD_NU = 10, HEAD_FIT = fit(HEAD_NU);

// ---------- head shape (sheet: 532 × 518 × 500, centre 0.697, fuller cheeks, deeper at the back) ----------
const HY = 0.697, HA = 0.266, HB = 0.259, HC = 0.25;
function headPoint(th, ph) {
  const st = Math.sin(th), p = V(HA * st * Math.sin(ph), HB * Math.cos(th), HC * st * Math.cos(ph));
  const k = Math.max(0, -p.y / HB), bulge = Math.sin(Math.PI * Math.min(1, k * 1.35));
  p.x *= 1 + 0.03 * bulge; p.z *= 1 + 0.03 * bulge;
  if (p.z < 0) p.z *= 1.05;
  p.x *= HEAD_FIT; p.z *= HEAD_FIT;
  return p;
}
function headNormal(th, ph) {
  const e = 1e-3, p = headPoint(th, ph), a = headPoint(th + e, ph).sub(p), b = headPoint(th, ph + e).sub(p);
  const n = new THREE.Vector3().crossVectors(b, a).normalize();
  return n.dot(p) < 0 ? n.negate() : n;
}
function frontAt(x, y) { let best, bd = Infinity;
  for (let th = 10; th <= 170; th += 0.5) for (let ph = -89; ph <= 89; ph += 0.5) { const p = headPoint(th * D, ph * D), d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = [th * D, ph * D]; } }
  return best; }
function topAt(x, z) { let best, bd = Infinity;
  for (let th = 0; th <= 90; th += 0.5) for (let ph = -180; ph <= 180; ph += 1) { const p = headPoint(th * D, ph * D), d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = [th * D, ph * D]; } }
  return best; }
const sheet = (sx, sy) => [(sx - 300) / 1000, (1000 - sy) / 1000 - HY];

// ---------- hair: one shell with thickness only at its edge (no inner surface) ----------
// fringe: the sheet's four lock tips and three notches, with a rounded midpoint between each
const F = [[98, 250], [150, 270], [196, 246], [238, 292], [284, 250], [330, 286], [376, 244], [418, 272], [502, 244]].map(p => frontAt(...sheet(...p)));
const SIDE_TH = 138 * D, NAPE_TH = 134 * D;
const cols = []; // [ph, hem th]
for (let i = 0; i < F.length; i++) {
  cols.push([F[i][1], F[i][0]]);
  if (i < F.length - 1) cols.push([(F[i][1] + F[i + 1][1]) / 2, (F[i][0] + F[i + 1][0]) / 2 + (F[i + 1][0] > F[i][0] ? -1 : 1) * 1.2 * D]);
}
const phL = F[0][1], phR = F[F.length - 1][1];
// the side panel starts with a near-vertical step at each temple (as on the sheet), then runs round the back
const STEP = 3 * D, s0 = phR + STEP, s1 = phL + 2 * Math.PI - STEP, BACK = 8;
for (let k = 0; k <= BACK; k++) {
  const ph = s0 + (k / BACK) * (s1 - s0), a = Math.abs(Math.atan2(Math.sin(ph), Math.cos(ph)));
  cols.push([ph, lerp(SIDE_TH, NAPE_TH, ss(120 * D, 175 * D, a))]);
}
function thick(th, ph, hemTh) {
  const a = Math.abs(Math.atan2(Math.sin(ph), Math.cos(ph)));
  const base = 0.02 + 0.006 * ss(0.3, 1.2, th) + 0.004 * ss(100 * D, 170 * D, a) * ss(0.4, 1.3, th) + 0.004 * (1 - ss(40 * D, 60 * D, a));
  return base * (1 - 0.6 * ss(hemTh - 0.14, hemTh, th));
}
const LIFT = 0.004, RINGS = [0.1, 0.27, 0.47, 0.68, 0.87, 1];
function hairPoint(ph, hemTh, f, inner = false) {
  const th = Math.max(1e-3, hemTh * f), p = headPoint(th, ph), n = headNormal(th, ph), t = inner ? 0 : thick(th, ph, hemTh);
  const o = p.clone().addScaledVector(n, LIFT + t);
  if (th > Math.PI / 2) { // the bob hangs straight, then tucks in at the hem
    const eq = headPoint(Math.PI / 2, ph), eqR = Math.hypot(eq.x, eq.z), g = ss(Math.PI / 2, hemTh, th);
    const want = (eqR + LIFT + thick(th, ph, hemTh)) * (1 - 0.12 * ss(0.5, 1, g)) - (inner ? 0.016 : 0), h = Math.hypot(o.x, o.z);
    if (!inner || h < want) { o.x *= want / h; o.z *= want / h; }
  }
  return o;
}
function hairGeometry() {
  const P = [], tri = (a, b, c) => P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z), n = cols.length;
  const ring0 = cols.map(([ph, h]) => hairPoint(ph, h, RINGS[0]));
  const crown = V(0, ring0.reduce((a, p) => a + p.y, 0) / ring0.length + 0.004, 0); // a gentle dome over the first ring
  for (let i = 0; i < n; i++) {
    const [p0, h0] = cols[i], [p1, h1] = cols[(i + 1) % n];
    const r0 = RINGS.map(f => hairPoint(p0, h0, f)), r1 = RINGS.map(f => hairPoint(p1, h1, f));
    tri(crown, r0[0], r1[0]);
    for (let j = 0; j < RINGS.length - 1; j++) { tri(r0[j], r0[j + 1], r1[j + 1]); tri(r0[j], r1[j + 1], r1[j]); }
    const i0 = hairPoint(p0, h0, 1, true), i1 = hairPoint(p1, h1, 1, true), e0 = r0.at(-1), e1 = r1.at(-1);
    tri(e0, i0, i1); tri(e0, i1, e1); // the visible thickness at the edge
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
}
// the crown whorl: a short spiral lying on the hair
function whorlGeometry() {
  const [wt, wp] = topAt((352 - 300) / 1000, (228 - 290) / 1000), pts = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 1.6, r = 0.006 + i * 0.0022, th = wt + r * 3.2 * Math.cos(a), ph = wp + r * 6.5 * Math.sin(a);
    pts.push(headPoint(th, ph).addScaledVector(headNormal(th, ph), LIFT + thick(th, ph, 2) - 0.001));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.0035, 3);
}

// ---------- head: smooth, low poly, with every face the hair fully covers removed ----------
function hemAt(ph) { // the hair's lower edge at this angle, from the columns
  const a = ((ph - cols[0][0]) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) + cols[0][0];
  for (let i = 0; i < cols.length; i++) {
    const [p0, h0] = cols[i], [p1raw, h1] = cols[(i + 1) % cols.length], p1 = i === cols.length - 1 ? p1raw + 2 * Math.PI : p1raw;
    if (a >= p0 && a <= p1) return lerp(h0, h1, (a - p0) / (p1 - p0));
  }
  return cols[0][1];
}
function headGeometry() {
  const NU = HEAD_NU, TH = [0, 25, 50, 75, 96, 116, 134, 150, 165, 180], NV = TH.length - 1, grid = [];
  for (let j = 0; j <= NV; j++) { grid.push([]); for (let i = 0; i <= NU; i++) { const th = TH[j] * D, ph = -Math.PI + (i / NU) * 2 * Math.PI + Math.PI / NU; grid[j].push({ th, ph, p: headPoint(th, ph) }); } }
  const covered = v => v.th < hemAt(v.ph) - 6 * D;
  const idx = [], pos = [];
  grid.flat().forEach(v => pos.push(v.p.x, v.p.y, v.p.z));
  const id = (j, i) => j * (NU + 1) + i;
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const q = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
    if (q.every(covered)) continue;
    if (j > 0) idx.push(id(j, i), id(j + 1, i), id(j + 1, i + 1));
    if (j < NV - 1) idx.push(id(j, i), id(j + 1, i + 1), id(j, i + 1));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals(); // shared vertices: the face stays smooth
  return g;
}
const HEAD_MESH = { m: null };
function decal(th, ph, w, h, seg, lift) {
  const g = new THREE.CircleGeometry(1, seg), o = new THREE.Object3D();
  const dir = headPoint(th, ph).normalize(), hit = new THREE.Raycaster(V(0, 0, 0), dir).intersectObject(HEAD_MESH.m)[0];
  const p = hit.point, n = hit.face.normal.clone();
  o.position.copy(p).addScaledVector(n, lift); o.lookAt(p.clone().addScaledVector(n, 1)); o.scale.set(w, h, 1); o.updateMatrix();
  return g.applyMatrix4(o.matrix);
}

// ---------- body: octagonal, with a flat face to the front like the Kenney pieces ----------
const lathe = (prof, seg, zs) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * fit(seg), y)), seg, Math.PI / seg).scale(1, 1, zs);
const F6 = fit(6), F5 = fit(5);
const at = (g, { x = 0, y = 0, z = 0, rz = 0, sx = 1, sy = 1, sz = 1, parent } = {}) => {
  const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.z = rz; o.scale.set(sx, sy, sz); o.updateMatrix();
  const m = parent ? parent.clone().multiply(o.matrix) : o.matrix; return g.applyMatrix4(m);
};
const mat = (x, y, z, rz) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.z = rz; o.updateMatrix(); return o.matrix.clone(); };

const parts = { skin: [], hair: [], hair_whorl: [], eye: [], eye_light: [], blush: [], shirt: [], shirt_band: [], trousers: [] };
// head and face
const headGeo = headGeometry(); HEAD_MESH.m = new THREE.Mesh(headGeo.clone(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); // the ray starts inside the head HEAD_MESH.m.updateMatrixWorld(true);
headGeo.translate(0, HY, 0); parts.skin.push(headGeo);
const hair = hairGeometry(); hair.translate(0, HY, 0); parts.hair.push(hair);
const whorl = whorlGeometry(); whorl.translate(0, HY, 0); parts.hair_whorl.push(whorl);
for (const s of [-1, 1]) {
  const e = frontAt(0.092 * s, -0.061), l = frontAt(0.092 * s + 0.007, -0.05), b = frontAt(0.144 * s, -0.127);
  parts.eye.push(decal(...e, 0.021, 0.029, 10, 0.0015).translate(0, HY, 0));
  parts.eye_light.push(decal(...l, 0.0065, 0.0065, 6, 0.003).translate(0, HY, 0));
  parts.blush.push(decal(...b, 0.042, 0.02, 10, 0.0015).translate(0, HY, 0));
}
// shirt (hem at 0.175, shoulders at 0.4) and the darker hem band
parts.shirt.push(lathe([[0.137, 0.19], [0.151, 0.215], [0.15, 0.3], [0.13, 0.4], [0.06, 0.452]], 8, 0.84));
parts.shirt_band.push(lathe([[0.13, 0.175], [0.138, 0.18], [0.138, 0.193]], 8, 0.85));
// arms: sleeve (capped at the top), sleeve band (capped below), forearm, mitten hand. Arms do not move, so they join the body.
for (const s of [-1, 1]) {
  const sh = mat(0.12 * s, 0.386, 0, 0.27 * s), el = sh.clone().multiply(mat(0, -0.085, 0, -0.2 * s));
  parts.shirt.push(at(new THREE.CylinderGeometry(0.042 * F6, 0.045 * F6, 0.075, 6, 1, false).deleteAttribute('uv'), { y: -0.04, parent: sh }));
  parts.shirt_band.push(at(new THREE.CylinderGeometry(0.046 * F6, 0.046 * F6, 0.014, 6, 1, true).deleteAttribute('uv'), { y: -0.08, parent: sh }));
  parts.skin.push(at(new THREE.CylinderGeometry(0.026 * F5, 0.026 * F5, 0.09, 5, 1, true).deleteAttribute('uv'), { y: -0.045, parent: el }));
  parts.skin.push(at(new THREE.IcosahedronGeometry(0.03, 0).deleteAttribute('uv'), { y: -0.103, z: 0.004, sy: 1.1, sz: 0.85, parent: el }));
}
// trousers seat, inside the shirt from 0.19 up
parts.trousers.push(lathe([[0.1, 0.134], [0.118, 0.145], [0.12, 0.17], [0.118, 0.2]], 8, 0.92));

// legs swing from the hip: trouser leg, rolled cuff, shoe, cream sole band
function leg(s) {
  const p = { trousers: [], trouser_cuff: [], shoe: [], sole: [] };
  p.trousers.push(at(new THREE.CylinderGeometry(0.049 * F6, 0.047 * F6, 0.1, 6, 1, true).deleteAttribute('uv'), { y: -0.05 }));
  p.trouser_cuff.push(at(new THREE.CylinderGeometry(0.052 * F6, 0.052 * F6, 0.036, 6, 1, true).deleteAttribute('uv'), { y: -0.109 }));
  p.shoe.push(at(new THREE.SphereGeometry(1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).deleteAttribute('uv'), { x: 0.004 * s, y: -0.162, z: 0.02, sx: 0.052 * F6, sy: 0.042, sz: 0.08 * F6 }));
  p.sole.push(at(new THREE.CylinderGeometry(1, 1, 0.013, 6, 1, true).deleteAttribute('uv'), { x: 0.004 * s, y: -0.1685, z: 0.02, sx: 0.052 * F6, sz: 0.08 * F6 }));
  return p;
}

// ---------- materials (default look; the engine replaces each by name) ----------
const COLOUR = { skin: '#efcdb2', hair: '#3d2c22', hair_whorl: '#2f221a', eye: '#2a2230', eye_light: '#fff6e8', blush: '#e09a86', shirt: '#a6613c', shirt_band: '#925539', trousers: '#565344', trouser_cuff: '#4a473b', shoe: '#4a3426', sole: '#e9dcc6' };
const SMOOTH = new Set(['skin', 'eye', 'eye_light', 'blush']);
const M = {};
for (const [k, c] of Object.entries(COLOUR)) M[k] = new THREE.MeshStandardMaterial({ name: k, color: c, roughness: 0.88, flatShading: !SMOOTH.has(k), side: k === 'hair' ? THREE.DoubleSide : THREE.FrontSide });

function meshes(group, set) {
  for (const [k, list] of Object.entries(set)) {
    if (!list.length) continue;
    let g = mergeGeometries(list.map(x => { const y = x.index ? x.toNonIndexed() : x; for (const a of Object.keys(y.attributes)) if (a !== 'position') y.deleteAttribute(a); return y; }));
    if (!SMOOTH.has(k)) g.computeVertexNormals(); // non-indexed: one normal per face, flat
    else if (k === 'skin') { g = mergeGeometries([headGeo, ...list.slice(1).map(x => { const y = x.index ? x.toNonIndexed() : x; for (const a of Object.keys(y.attributes)) if (a !== 'position') y.deleteAttribute(a); y.computeVertexNormals(); return y; })].map(x => { for (const a of Object.keys(x.attributes)) if (a !== 'position' && a !== 'normal') x.deleteAttribute(a); return x.index ? x.toNonIndexed() : x; })); }
    else g.computeVertexNormals();
    const m = new THREE.Mesh(g, M[k]); m.name = k; group.add(m);
  }
}
const root = new THREE.Group(); root.name = 'minimi';
meshes(root, parts);
for (const s of [-1, 1]) {
  // no dots in the name: three.js drops '.' from node names when it loads
  const hip = new THREE.Group(); hip.name = s < 0 ? 'leg_R' : 'leg_L'; hip.position.set(0.071 * s, 0.175, 0); root.add(hip);
  meshes(hip, leg(s));
}

// ---------- write ----------
let tris = 0, draws = 0; const per = {};
root.traverse(o => { if (o.isMesh) { const t = o.geometry.attributes.position.count / 3; tris += t; draws++; per[o.material.name] = (per[o.material.name] || 0) + t; } });
const OUT = resolve(REPO, 'public/heap/models/minimi');
mkdirSync(OUT, { recursive: true });
const glb = await new GLTFExporter().parseAsync(root, { binary: true });
writeFileSync(resolve(OUT, 'minimi.glb'), Buffer.from(glb));
console.log(JSON.stringify({ triangles: tris, draws, kb: Math.round(glb.byteLength / 1024), per }));
