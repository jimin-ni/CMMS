// 제작자 소개로 가는 로우폴리 스노우 글로브 모델. three 만 쓰는 순수 모듈이다.
// 미니룸 좌식 탁자 위의 작은 글로브(heap/engine/fixtures.js), 가까이 보는 화면(snow-globe-view.tsx),
// 제작자 소개 페이지의 캐릭터 그림(character-badge.tsx)이 같은 모델을 쓴다.
//
// 단위: 유리 구의 반지름이 1 이다. 받침 바닥이 y 0, 전체 높이는 GLOBE_HEIGHT 다.
// 모든 재질은 flatShading 이라 면이 각져 보인다. 정해진 시드의 난수를 써서 매번 같은 모양이 나온다.
import * as THREE from 'three';

const R = 1; // 유리 구 반지름
const CY = 1.02; // 유리 구 중심 높이
const BASE_TOP = 0.46; // 나무 받침 윗면
const TY = 0.58; // 안쪽 땅(얼음) 윗면
export const GLOBE_HEIGHT = CY + R;

// 바다는 땅 원판의 20% (72도) 부채꼴이고 +x 쪽(오른편)에 있다. 각도는 CylinderGeometry 와 같다: x = r sin θ, z = r cos θ
const SEA_START = Math.PI * 0.3, SEA_LEN = Math.PI * 0.4;

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 면마다 밝기를 조금씩 흔든 정점 색을 단다: 로우폴리 면이 서로 다른 명암으로 보이고, 나무는 결처럼 보인다
function facets(geo, colour, spread, rand) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const n = g.attributes.position.count, cols = new Float32Array(n * 3), c = new THREE.Color();
  for (let f = 0; f < n; f += 3) {
    c.set(colour).offsetHSL(0, 0, (rand() - 0.5) * spread);
    for (let k = 0; k < 3; k++) c.toArray(cols, (f + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

function makeKit(rand) {
  const plain = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });
  const shaded = plain('#ffffff', { vertexColors: true });
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  };
  return { rand, plain, shaded, add, tone: (geo, colour, spread = 0.08) => facets(geo, colour, spread, rand) };
}

// 물범: 머리가 지역 +x 쪽이다. 흰 각진 몸통을 살짝 젖혀 누워 앞발을 들고, 꼬리지느러미는 두 갈래다
export function buildSeal(kit = makeKit(seeded(7))) {
  const { add, shaded, plain, tone } = kit;
  const g = new THREE.Group(), white = '#f3f5f7', black = plain('#1d1d22', { roughness: 0.4 });
  const body = add(g, tone(new THREE.IcosahedronGeometry(0.13, 1), white, 0.1), shaded, 0, 0.085, 0);
  body.scale.set(1.5, 0.72, 0.85); body.rotation.z = 0.28;
  const head = add(g, tone(new THREE.IcosahedronGeometry(0.092, 1), white, 0.1), shaded, 0.18, 0.2, 0);
  head.rotation.z = 0.35;
  for (const s of [-1, 1]) add(g, new THREE.IcosahedronGeometry(0.014, 0), black, 0.245, 0.235, s * 0.042);
  add(g, new THREE.IcosahedronGeometry(0.016, 0), black, 0.272, 0.2, 0);
  // 수염: 코 양옆에서 세 가닥씩
  const pts = [];
  for (const s of [-1, 1]) for (const dy of [-0.012, 0, 0.012]) pts.push(0.262, 0.195, s * 0.02, 0.29, 0.19 + dy * 2.2, s * 0.09);
  const whiskers = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineBasicMaterial({ color: '#8a8f96' }));
  g.add(whiskers);
  // 든 앞발: 가슴 양옆에서 위와 바깥으로
  for (const s of [-1, 1]) {
    const f = add(g, tone(new THREE.IcosahedronGeometry(0.05, 0), '#e9edf1'), shaded, 0.1, 0.19, s * 0.1);
    f.scale.set(0.5, 1.4, 0.32); f.rotation.set(s * -0.5, 0, -0.5);
  }
  // 갈라진 꼬리지느러미
  for (const s of [-1, 1]) {
    const t = add(g, tone(new THREE.ConeGeometry(0.045, 0.13, 4), '#e9edf1'), shaded, -0.25, 0.05, s * 0.04);
    t.scale.set(1, 1, 0.35); t.rotation.set(0, s * 0.45, Math.PI / 2);
  }
  return g;
}

// 흰색과 검은색 얼룩 고양이: 지역 +z 를 보고 앉아 있다
export function buildCat(kit = makeKit(seeded(11))) {
  const { add, shaded, plain, tone } = kit;
  const g = new THREE.Group(), white = '#f6f6f4', black = '#202024', blackMat = plain(black, { roughness: 0.5 });
  const body = add(g, tone(new THREE.IcosahedronGeometry(0.1, 1), white, 0.1), shaded, 0, 0.1, 0);
  body.scale.set(0.9, 1.1, 1.05);
  add(g, tone(new THREE.IcosahedronGeometry(0.076, 1), white, 0.1), shaded, 0, 0.245, 0.04);
  for (const s of [-1, 1]) {
    const ear = add(g, tone(new THREE.ConeGeometry(0.032, 0.065, 4), s < 0 ? black : white), shaded, s * 0.045, 0.32, 0.03);
    ear.rotation.z = -s * 0.25;
    add(g, new THREE.IcosahedronGeometry(0.012, 0), blackMat, s * 0.028, 0.255, 0.105);
    add(g, tone(new THREE.IcosahedronGeometry(0.028, 0), white), shaded, s * 0.04, 0.025, 0.08); // 앞발
  }
  add(g, new THREE.IcosahedronGeometry(0.01, 0), plain('#e79aa4'), 0, 0.235, 0.115);
  // 얼룩: 왼쪽 귀 쪽 머리, 등, 옆구리
  const patch = (r, x, y, z, sx, sy, sz) => { const p = add(g, tone(new THREE.IcosahedronGeometry(r, 0), black), shaded, x, y, z); p.scale.set(sx, sy, sz); };
  patch(0.05, -0.038, 0.275, 0.03, 0.9, 0.7, 0.9);
  patch(0.07, 0.035, 0.15, -0.04, 0.8, 0.9, 0.9);
  patch(0.045, -0.06, 0.07, 0.02, 0.6, 0.8, 1);
  // 꼬리: 뒤에서 위로 감아 올리고 끝이 검다
  const t1 = add(g, tone(new THREE.CylinderGeometry(0.016, 0.018, 0.13, 5), white), shaded, 0.07, 0.06, -0.1);
  t1.rotation.set(0.3, 0, -1.2);
  const t2 = add(g, tone(new THREE.CylinderGeometry(0.014, 0.016, 0.1, 5), black), shaded, 0.13, 0.13, -0.11);
  t2.rotation.z = -0.2;
  return g;
}

// 나무: 원뿔 세 단과 눈 덮인 끝
function buildTree(kit, h) {
  const { add, shaded, plain, tone } = kit;
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.025 * h, 0.03 * h, 0.12 * h, 5), plain('#6e4528'), 0, 0.06 * h, 0);
  [[0.17, 0.2, 0.2], [0.13, 0.18, 0.33], [0.09, 0.15, 0.45]].forEach(([r, ch, y]) => {
    add(g, tone(new THREE.ConeGeometry(r * h, ch * h, 6), '#2f6b4f', 0.12), shaded, 0, y * h, 0);
  });
  add(g, tone(new THREE.ConeGeometry(0.045 * h, 0.06 * h, 6), '#ffffff', 0.05), shaded, 0, 0.53 * h, 0);
  return g;
}

function buildHouse(kit) {
  const { add, shaded, plain, tone } = kit;
  const g = new THREE.Group();
  add(g, tone(new THREE.BoxGeometry(0.34, 0.24, 0.28), '#d9a877', 0.1), shaded, 0, 0.12, 0);
  // 박공 지붕: 세모 기둥을 x 로 눕힌다. 붉은 지붕 위에 조금 작은 흰 눈 지붕을 얹어 처마만 붉게 보인다
  const prism = (r, len) => {
    const geo = new THREE.CylinderGeometry(r, r, len, 3);
    geo.rotateZ(Math.PI / 2); geo.rotateX(-Math.PI / 2);
    return geo;
  };
  add(g, tone(prism(0.22, 0.42), '#b8473d'), shaded, 0, 0.24 + 0.11, 0);
  add(g, tone(prism(0.2, 0.44), '#fbfdff', 0.05), shaded, 0, 0.24 + 0.135, 0);
  add(g, tone(new THREE.BoxGeometry(0.05, 0.12, 0.05), '#8c5a3c'), shaded, 0.1, 0.44, -0.04);
  add(g, new THREE.BoxGeometry(0.07, 0.13, 0.01), plain('#5b3a26'), 0.06, 0.065, 0.142);
  const lit = plain('#ffd27a', { emissive: '#ffb347', emissiveIntensity: 0.7 });
  add(g, new THREE.BoxGeometry(0.06, 0.06, 0.01), lit, -0.08, 0.13, 0.142);
  add(g, new THREE.BoxGeometry(0.01, 0.06, 0.06), lit, 0.172, 0.13, 0);
  return g;
}

// 눈: 유리 구 안에서만 떨어지는 작은 팔면체 입자. start(ms) 동안 위에서 새로 내리고(다시 부르면 시간을 새로 잰다),
// 시간이 끝나면 새로 내리지 않고 남은 눈이 바닥에 닿는 대로 사라진다
function buildSnow(count, rand) {
  const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.022, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, emissive: '#dfeaf5', emissiveIntensity: 0.35 }), count);
  mesh.frustumCulled = false;
  const pos = new Float32Array(count * 3), spin = new Float32Array(count * 3), speed = new Float32Array(count), phase = new Float32Array(count), alive = new Uint8Array(count);
  const dummy = new THREE.Object3D(), TOP = CY + 0.8, FLOOR = TY + 0.01;
  const radiusAt = y => Math.sqrt(Math.max(0, R * R - (y - CY) ** 2)) * 0.86;
  function spawn(i, y) {
    const r = radiusAt(y) * Math.sqrt(rand()), a = rand() * Math.PI * 2;
    pos.set([Math.sin(a) * r, y, Math.cos(a) * r], i * 3);
    spin.set([rand() * 6, rand() * 6, rand() * 6], i * 3);
    speed[i] = 0.22 + rand() * 0.18; phase[i] = rand() * 10; alive[i] = 1;
  }
  let left = 0, t = 0;
  function write() {
    for (let i = 0; i < count; i++) {
      dummy.position.fromArray(pos, i * 3); dummy.rotation.set(spin[i * 3], spin[i * 3 + 1], spin[i * 3 + 2]);
      dummy.scale.setScalar(alive[i] ? 0.6 + (i % 5) * 0.12 : 0);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  write();
  return {
    mesh,
    get active() { return left > 0; },
    start(ms = 3000) {
      if (left <= 0) for (let i = 0; i < count; i++) if (!alive[i]) spawn(i, FLOOR + rand() * (TOP - FLOOR));
      left = ms / 1000;
    },
    step(dt) {
      if (left <= 0 && !alive.some(Boolean)) return;
      left = Math.max(0, left - dt); t += dt;
      for (let i = 0; i < count; i++) {
        if (!alive[i]) continue;
        const k = i * 3;
        pos[k + 1] -= speed[i] * dt;
        pos[k] += Math.sin(t * 1.7 + phase[i]) * 0.05 * dt; // 좌우로 흔들린다
        pos[k + 2] += Math.cos(t * 1.3 + phase[i]) * 0.05 * dt;
        spin[k] += dt * 1.2; spin[k + 1] += dt * 0.8;
        if (pos[k + 1] < FLOOR) { if (left > 0) spawn(i, TOP); else { alive[i] = 0; continue; } }
        const lim = radiusAt(pos[k + 1]), h = Math.hypot(pos[k], pos[k + 2]); // 유리 밖으로 나가지 않는다
        if (h > lim) { pos[k] *= lim / h; pos[k + 2] *= lim / h; }
      }
      write();
    },
  };
}

/**
 * 스노우 글로브 전체를 짓는다.
 * @param {{ snow?: boolean }} [opts] snow: 눈 입자를 만들지 (미니룸의 작은 글로브는 만들지 않는다)
 * @returns {{ root: THREE.Group, hitMeshes: THREE.Mesh[], sealZone: THREE.Mesh, catZone: THREE.Mesh, snow: ReturnType<typeof buildSnow> | null, dispose: () => void }}
 */
export function buildSnowGlobe({ snow = true } = {}) {
  const kit = makeKit(seeded(2026));
  const { add, shaded, plain, tone, rand } = kit;
  const root = new THREE.Group(), hitMeshes = [];

  // 나무 받침: 팔각 단을 쌓는다. 아래 띠(짙은 나무), 위로 좁아지는 몸통, 홈 띠, 윗 테두리
  const wood = (rb, rt, h, y, colour, spread = 0.16) => hitMeshes.push(add(root, tone(new THREE.CylinderGeometry(rt, rb, h, 8), colour, spread), shaded, 0, y + h / 2, 0));
  wood(1.0, 0.98, 0.1, 0, '#6b4226');
  wood(0.95, 0.86, 0.28, 0.1, '#a0673a', 0.2);
  wood(0.885, 0.885, 0.03, 0.375, '#5e3920', 0.1);
  wood(0.89, 0.87, 0.055, BASE_TOP - 0.055, '#b97a45');

  // 안쪽 땅: 얼음 80% (부채꼴 288도), 바다 20% (72도). 바다는 얼음보다 조금 낮고, 경계에는 얼음 절벽을 세운다
  const iceH = TY - BASE_TOP;
  add(root, tone(new THREE.CylinderGeometry(0.86, 0.82, iceH, 10, 1, false, SEA_START + SEA_LEN, Math.PI * 2 - SEA_LEN), '#eef5fa', 0.07), shaded, 0, BASE_TOP + iceH / 2, 0);
  const seaH = iceH - 0.03;
  add(root, tone(new THREE.CylinderGeometry(0.85, 0.82, seaH, 3, 1, false, SEA_START, SEA_LEN), '#3f8fc6', 0.12), plain('#ffffff', { vertexColors: true, roughness: 0.35 }), 0, BASE_TOP + seaH / 2, 0);
  for (const a of [SEA_START, SEA_START + SEA_LEN]) {
    const cliff = add(root, tone(new THREE.BoxGeometry(0.84, iceH, 0.02), '#dbe9f3'), shaded, Math.sin(a) * 0.42, BASE_TOP + iceH / 2, Math.cos(a) * 0.42);
    cliff.rotation.y = a - Math.PI / 2;
  }
  // 바다에 뜬 얼음 조각, 얼음 위의 눈 더미
  for (const [r, a, s] of [[0.55, 0.42, 0.07], [0.7, 0.55, 0.05], [0.42, 0.6, 0.045]]) {
    const f = add(root, tone(new THREE.DodecahedronGeometry(s, 0), '#f7fbff'), shaded, Math.sin(Math.PI * a) * r, BASE_TOP + seaH, Math.cos(Math.PI * a) * r);
    f.scale.y = 0.4;
  }
  for (const [x, z, s] of [[-0.62, 0.3, 0.1], [0.05, -0.62, 0.09], [-0.15, 0.62, 0.07], [0.4, -0.15, 0.06]]) {
    const m = add(root, tone(new THREE.IcosahedronGeometry(s, 0), '#ffffff', 0.06), shaded, x, TY, z);
    m.scale.y = 0.4;
  }

  const house = buildHouse(kit); house.position.set(-0.05, TY, -0.25); house.rotation.y = 0.15; root.add(house);
  for (const [x, z, h] of [[-0.58, -0.12, 1.05], [0.34, -0.52, 0.9], [-0.3, -0.6, 0.75]]) {
    const t = buildTree(kit, h); t.position.set(x, TY, z); t.rotation.y = rand() * Math.PI; root.add(t);
  }

  // 물범과 고양이는 앞쪽 얼음 위에 나란히 있다. 둘 둘레의 보이지 않는 구는 누르기 영역이다 (상세 화면)
  const seal = buildSeal(kit); seal.position.set(-0.32, TY, 0.36); seal.rotation.y = 0.55; root.add(seal);
  const cat = buildCat(kit); cat.position.set(0.14, TY, 0.46); cat.rotation.y = 0.5; root.add(cat);
  const zone = (r, x, z, y) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); m.position.set(x, y, z); root.add(m); return m; };
  const sealZone = zone(0.25, -0.32, 0.36, TY + 0.12), catZone = zone(0.19, 0.14, 0.46, TY + 0.15);

  const flakes = snow ? buildSnow(160, rand) : null;
  if (flakes) root.add(flakes.mesh);

  // 유리 돔: 각진 구. 안쪽 면을 먼저, 바깥 면을 나중에 그려 투명한 유리가 겹쳐 보인다. 하이라이트는 면마다 끊긴 반사광이다
  const glassGeo = new THREE.SphereGeometry(R, 14, 10);
  const glass = (side, opacity, order) => {
    const m = new THREE.Mesh(glassGeo, new THREE.MeshPhongMaterial({ color: '#dff1ff', specular: '#ffffff', shininess: 90, flatShading: true, transparent: true, opacity, depthWrite: false, side }));
    m.position.y = CY; m.renderOrder = order; root.add(m); return m;
  };
  glass(THREE.BackSide, 0.08, 1);
  hitMeshes.push(glass(THREE.FrontSide, 0.16, 2));

  function dispose() {
    const done = new Set();
    root.traverse(o => {
      for (const r of [o.geometry, ...(Array.isArray(o.material) ? o.material : [o.material])]) if (r && !done.has(r)) { done.add(r); r.dispose(); }
    });
  }
  return { root, hitMeshes, sealZone, catZone, snow: flakes, dispose };
}
