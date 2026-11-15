// 쪽지 트리의 겉모습: Kenney 트리 다듬기, 꼭대기 별, 불빛 줄. public/tree-mock/index.html 의 같은 구간을 옮겼다.
// 방의 트리 복제본에만 쓴다. 씬, 카메라, DOM 은 읽지 않는다 (불빛 줄만 표면을 묻는 surface 를 받는다).
// 목업은 UnrealBloomPass 로 번졌다. 이 엔진에는 composer 가 없어서 번짐은 가산 합성 스프라이트(halo, 햇살)와 emissive 가 맡는다.
import * as THREE from 'three';

// ---------- 트리 다듬기 ----------
// Kenney 트리는 메시 하나다. 떨어진 조각(위치가 같은 꼭짓점은 한 점으로 본다)으로 나눠, 구워 넣은 방울과 별을 뺀다.
// 띠 세 개(아래, 가운데, 위)는 한 세트다. 세 세트의 구슬 줄로 다시 만든다. 줄마다 띠의 중심선을 따라 돌고(모서리는 변을 따라 10% 깎아 부드럽게),
// 줄기를 축으로 45도씩 돌려 팔각 층에 맞고, 구슬은 잎에 딱 붙인다. 구슬은 평면 음영 20면체다.
const GARLAND_ROUND = 0.1, BEAD_PITCH = 2.2;
// 줄마다의 구슬 반지름, 트리 단위 (미터의 0.79배): [세트][아래, 가운데, 위]
const BEAD_R = [[0.0085, 0.0072, 0.0064], [0.0078, 0.0092, 0.007], [0.0095, 0.008, 0.0068]];
// turns = [아래, 가운데, 위], 45도 단위. 띠마다 낮은 쪽이 보는 사람을 향한다 (높은 쪽이 앞이면 띠가 납작한 막대로 읽힌다).
const GARLAND_SETS = [
  { color: '#f3e9d6', metal: 0, turns: [0, 7, 1] },
  { color: '#d9a441', metal: 0.25, turns: [2, 4, 4] },
  { color: '#8e3a2e', metal: 0, turns: [4, 5, 3] },
];
// 세트마다 한 줄보다 적은 구슬: 틈이 고르게 벌어진다 (베이지, 노랑, 갈색빛 빨강)
const BEAD_CUT = [0.05, 0.07, 0.1];

/**
 * root 안의 첫 메시를 다듬는다: 방울과 별과 띠를 빼고 구슬 줄을 mesh.parent 에 붙인다. 지오메트리는 복제하므로 캐시의 원본은 그대로다.
 * mesh.userData.tip 에 남은 삼각형의 맨 위 점(메시 좌표)을 둔다. 다듬은 메시를 돌려준다.
 * @param {THREE.Object3D} root
 * @param {() => number} rnd 구슬의 크기와 방향에 쓰는 난수 (시드를 받는 것을 쓰면 마운트마다 같다)
 */
export function trimTree(root, rnd) {
  let mesh = null; root.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
  if (!mesh) throw new Error('tree: no mesh');
  const src = mesh.geometry, geo = src.clone();
  const pos = geo.attributes.position, idx = geo.index.array, N = pos.count;
  const par = Int32Array.from({ length: N }, (_, i) => i);
  const find = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  const keyOf = i => `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
  const seen = new Map();
  for (let i = 0; i < N; i++) { const k = keyOf(i); if (seen.has(k)) join(i, seen.get(k)); else seen.set(k, i); }
  for (let t = 0; t < idx.length; t += 3) { join(idx[t], idx[t + 1]); join(idx[t], idx[t + 2]); }
  const parts = new Map();
  for (let i = 0; i < N; i++) {
    const r = find(i);
    if (!parts.has(r)) parts.set(r, { verts: [], box: new THREE.Box3() });
    const p = parts.get(r); p.verts.push(i); p.box.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, i));
  }
  const H = new THREE.Box3().setFromBufferAttribute(pos).max.y, drop = new Set(), bands = [];
  for (const [r, part] of parts) {
    const s = part.box.getSize(new THREE.Vector3()), wide = Math.max(s.x, s.z);
    if (part.box.min.y > H * 0.8 || Math.max(s.x, s.y, s.z) < 0.2) drop.add(r); // 별(과 받침), 방울
    else if (s.y < 0.35 && wide > 0.5) { drop.add(r); bands.push({ r, ...part }); } // 띠: 아래에서 다시 만든다
  }
  const kept = [];
  for (let t = 0; t < idx.length; t += 3) if (!drop.has(find(idx[t]))) kept.push(idx[t], idx[t + 1], idx[t + 2]);
  geo.setIndex(kept);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  mesh.geometry = geo;
  // 바운딩 박스는 뺀 별의 꼭짓점도 세므로, 꼭대기는 남은 삼각형으로 잰다
  let tipY = -Infinity; for (const i of kept) tipY = Math.max(tipY, pos.getY(i));
  mesh.userData.tip = new THREE.Vector3(0, tipY, 0);
  bands.sort((a, b) => a.box.min.y - b.box.min.y);
  const beadGeo = new THREE.IcosahedronGeometry(1, 0), Y = new THREE.Vector3(0, 1, 0);
  // 다듬은 잎 (트리 단위): 구슬이 얹힐 면을 찾는다
  const leaves = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), ray = new THREE.Raycaster();
  const snug = (p, r, lift) => {
    const out = new THREE.Vector3(p.x, 0, p.z).normalize();
    ray.set(out.clone().multiplyScalar(2).setY(p.y), out.clone().negate());
    const hit = ray.intersectObject(leaves)[0];
    return hit ? out.multiplyScalar(2 - hit.distance + r * 0.6 + lift).setY(p.y) : p;
  };
  GARLAND_SETS.forEach((set, si) => {
    const mat = new THREE.MeshStandardMaterial({ color: set.color, roughness: 0.55, metalness: set.metal, flatShading: true });
    const beads = [];
    bands.forEach((band, k) => {
      const R = BEAD_R[si][k % 3];
      const turn = new THREE.Quaternion().setFromAxisAngle(Y, set.turns[k % 3] * Math.PI / 4);
      const path = new THREE.CatmullRomCurve3(bandPath(pos, band.verts, GARLAND_ROUND).map(p => p.applyQuaternion(turn)), true);
      const n = Math.round(path.getLength() / (R * BEAD_PITCH) * (1 - BEAD_CUT[si]));
      // 세트마다 머리카락 하나만큼 더 바깥에 얹혀, 줄이 엇갈리는 곳에서 서로 얹히고 합쳐지지 않는다.
      // 구슬마다 무작위로 돌려(면이 빛을 달리 받는다) 조금 크게 또는 작게 한다
      for (const p of path.getSpacedPoints(n).slice(0, n)) {
        const r = R * (0.85 + rnd() * 0.3);
        beads.push(new THREE.Matrix4().compose(snug(p, r, si * 0.003),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6.3, rnd() * 6.3, 0)), new THREE.Vector3(r, r, r)));
      }
    });
    const m = new THREE.InstancedMesh(beadGeo, mat, beads.length);
    beads.forEach((b, i) => m.setMatrixAt(i, b)); m.computeBoundingSphere();
    m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
    m.castShadow = m.receiveShadow = true; mesh.parent.add(m);
  });
  return mesh;
}

// 띠는 리본이다: 모서리마다 너비를 가로지르는 꼭짓점 한 쌍(아래, 위 가장자리). 중심선은 각도 순서로 쌍의 중점을 지나고,
// 모서리는 두 변을 따라 round 만큼 간 두 점으로 바뀐다.
function bandPath(pos, verts, round) {
  const uniq = [];
  for (const i of verts) { const v = new THREE.Vector3().fromBufferAttribute(pos, i); if (!uniq.some(u => u.distanceTo(v) < 1e-5)) uniq.push(v); }
  const used = new Set(), corners = [];
  for (const v of uniq) {
    if (used.has(v)) continue;
    let best = null, bd = Infinity;
    for (const u of uniq) if (u !== v && !used.has(u)) { const d = v.distanceTo(u); if (d < bd) { bd = d; best = u; } }
    used.add(v); used.add(best);
    const mid = v.clone().add(best).multiplyScalar(0.5);
    corners.push({ a: Math.atan2(mid.z, mid.x), mid });
  }
  corners.sort((p, q) => p.a - q.a);
  const n = corners.length, out = [];
  for (let i = 0; i < n; i++) {
    const c = corners[i].mid, prev = corners[(i + n - 1) % n].mid, next = corners[(i + 1) % n].mid;
    out.push(c.clone().lerp(prev, round), c.clone().lerp(next, round));
  }
  return out;
}

// ---------- 꼭대기 별 ----------
// 낮은 다각 별이 스스로 빛난다. 깜빡이지 않고 뒤의 햇살만 천천히 돈다. 목업의 treetop 점광원(0.35)은 두지 않았다:
// 방의 빛 개수가 바뀌면 모든 재질이 다시 컴파일되고, 그 세기는 램프 하나에 견주어 무시할 만하다.
function sunRaysTexture() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), c = S / 2;
  g.translate(c, c);
  for (let k = 0; k < 12; k++) {
    const len = c * (k % 2 ? 0.62 : 0.95), half = k % 2 ? 0.07 : 0.1;
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, len);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.4, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0);
    g.lineTo(Math.cos(-half) * len, Math.sin(-half) * len); g.lineTo(Math.cos(half) * len, Math.sin(half) * len);
    g.closePath(); g.fill(); g.rotate(Math.PI / 6);
  }
  return new THREE.CanvasTexture(cv);
}
// 둥근 빛: 센 심지가 빨리 줄고, 길고 거의 투명한 가장자리가 이어진다
function haloTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,.55)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.14)'); gr.addColorStop(0.7, 'rgba(255,255,255,.03)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}
/** @returns {{ group: THREE.Group, update: (t: number) => void }} group 은 트리 틀(미터)에서 topY 를 꼭대기로 선다 */
export function buildTopStar(topY) {
  const group = new THREE.Group();
  const s = new THREE.Shape(), ro = 0.06, ri = 0.027;
  for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? ri : ro; s[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.009, bevelSize: 0.006, bevelSegments: 1, curveSegments: 1 });
  geo.center();
  const star = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf0c055, roughness: 0.55, flatShading: true, emissive: 0xffc04a, emissiveIntensity: 1.25 }));
  star.position.set(0, topY + ro * 0.85, 0);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.03, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a2e, roughness: 0.6, flatShading: true }));
  stem.position.set(0, topY + 0.008, 0);
  const sprite = (map, size, opacity) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0xffcf7a, opacity, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    sp.scale.setScalar(size); sp.position.copy(star.position).add(new THREE.Vector3(0, 0, -0.02)); return sp;
  };
  const glow = sprite(haloTexture(), 0.36, 0.55), rays = sprite(sunRaysTexture(), 0.42, 0.4);
  group.add(glow, rays, star, stem);
  return { group, update(t) { rays.material.rotation = t * 0.12; } };
}

// ---------- 불빛 줄 ----------
// 잎 바로 바깥을 얕게 늘어진 갈색 전선과 작은 뭉툭한 전구. 전구는 저마다의 박자로 서서히 켜지고 꺼진다.
// 아래, 가운데, 위는 따뜻한 흰 줄이고 그 사이는 금빛 줄이다. 줄마다 제 방향으로 기운다 (tilt = 수평에서 몇 도, dir = 가장 높은 쪽).
const LIGHT_STRINGS = [
  { h: 0.55, tilt: 6, dir: 1.9, color: 0xEAE5D9 }, { h: 0.9, tilt: 9, dir: 4.4, color: 0xEAE5D9 }, { h: 1.22, tilt: 7.5, dir: 0.3, color: 0xEAE5D9 },
  { h: 0.7, tilt: 10, dir: 3.6, color: 0xCDAB3D }, { h: 1.06, tilt: 12, dir: 0.8, color: 0xCDAB3D }, { h: 1.34, tilt: 17, dir: 2.2, color: 0xCDAB3D },
];
const LIGHT_GAP = 0.075, LIGHT_SAG = 0.014, LIGHT_HOOKS = 8, LIGHT_HALO = 0.085;
/**
 * @param {{ hit: (angle: number, y: number) => ({ out: THREE.Vector3, r: number } | null) }} surface 트리 틀의 표면 (tree.js 의 makeSurface)
 * @param {() => number} rnd
 * @returns {{ group: THREE.Group, update: (t: number) => void }}
 */
export function buildFairyLights(surface, rnd) {
  const group = new THREE.Group(), bulbs = [];
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 0.9, flatShading: true });
  const bulbGeo = new THREE.IcosahedronGeometry(0.0075, 0); bulbGeo.scale(1, 1.3, 1);
  const halo = haloTexture();
  for (const { h, tilt, dir, color } of LIGHT_STRINGS) {
    const glass = new THREE.Color(color).multiplyScalar(0.75);
    // 기운 평면: 이 높이의 트리 반지름 곱하기 tan(tilt) 만큼 오르내린다
    const rise = (surface.hit(0, h)?.r ?? 0.3) * Math.tan(THREE.MathUtils.degToRad(tilt));
    // 전선: 가지 LIGHT_HOOKS 곳에 걸리고 사이가 살짝 처진다
    const S = 96, pts = [];
    for (let i = 0; i < S; i++) {
      const a = i / S * Math.PI * 2;
      const y = h + rise * Math.cos(a - dir) - LIGHT_SAG * Math.sin(Math.PI * ((i / S * LIGHT_HOOKS) % 1));
      const hit = surface.hit(a, y);
      if (hit) pts.push(hit.out.clone().multiplyScalar(hit.r + 0.007).setY(y));
    }
    if (pts.length < 8) continue; // 이 높이에 잎이 거의 없다
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.0012, 4, true), wireMat);
    wire.castShadow = true; group.add(wire);
    // 전구: 고르게 떨어져 전선 바로 아래에 매달린다
    const n = Math.round(curve.getLength() / LIGHT_GAP);
    curve.getSpacedPoints(n).slice(0, n).forEach(p => {
      const mat = new THREE.MeshStandardMaterial({ color: glass, roughness: 0.5, flatShading: true, emissive: color });
      const b = new THREE.Mesh(bulbGeo, mat); b.position.copy(p).add(new THREE.Vector3(0, -0.007, 0));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      glow.scale.setScalar(LIGHT_HALO); glow.position.copy(b.position);
      group.add(b, glow);
      bulbs.push({ mat, glow, period: 2.4 + rnd() * 1.6, phase: rnd() });
    });
  }
  return {
    group,
    // 부드럽게: 꺼짐(어두운 유리) -> 켜짐(빛남) -> 꺼짐, 딱 끊기지 않는다
    update(t) {
      for (const b of bulbs) {
        const f = 0.5 - 0.5 * Math.cos(2 * Math.PI * (t / b.period + b.phase));
        b.mat.emissiveIntensity = 0.08 + 1.5 * f;
        b.glow.material.opacity = 0.85 * f;
      }
    },
  };
}
