// 제작자 소개로 가는 로우폴리 스노우 글로브 모델. three 만 쓰는 순수 모듈이다.
// 미니룸 좌식 탁자 위의 글로브(heap/engine/fixtures.js, globe.js)와 제작자 소개 페이지의 캐릭터 그림(character-badge.tsx)이 쓴다.
//
// 단위: 유리 구의 반지름이 1 이다. 받침 바닥이 y 0, 전체 높이는 GLOBE_HEIGHT 다. 집과 물범, 고양이의 앞이 지역 +z 다.
// 모든 재질은 flatShading 이라 면이 각져 보인다. 정해진 시드의 난수를 써서 매번 같은 모양이 나온다.
import * as THREE from 'three';

const R = 1; // 유리 구 반지름
export const GLOBE_CENTRE_Y = 1.02; // 유리 구 중심 높이
const CY = GLOBE_CENTRE_Y;
const BASE_TOP = 0.46; // 나무 받침 윗면
const TY = 0.58; // 안쪽 땅(얼음) 윗면
const LAND_R = 0.81; // 안쪽 땅 반지름 (받침 높이에서 유리 안쪽)
export const GLOBE_HEIGHT = CY + R;

// 바다: 땅 원판을 현(수평선)으로 자른 반달 영역. 원판 넓이의 20% 가 되는 자리다
// (활꼴 넓이 비율 (θ - sin θ) / 2π = 0.2 → θ ≈ 2.113, 현까지 거리 = cos(θ / 2) ≈ 0.491). SEA_A 는 현의 반각이다.
// SEA_DIR: 바다 가운데 방향 (모양 좌표의 각도, 0 이면 오른쪽 +x). 오른쪽에서 정면(+z) 쪽으로 90도의 30% 만큼 돌렸다.
// 모양 좌표 (sx, sy) 는 눕힌 뒤 (sx, -sy) 자리가 되므로 정면 쪽은 음의 각도다
const SEA_A = Math.acos(0.491), SEA_DIR = -0.3 * Math.PI / 2;
// 얼음과 바다의 경계: 현을 따라 각진 물결로 흔든다 (꺾인 점 WAVE_N 개, 물결 세 번)
const WAVE_N = 9, WAVE_AMP = 0.055;
function shoreline(r) {
  const a = new THREE.Vector2(Math.cos(SEA_DIR - SEA_A), Math.sin(SEA_DIR - SEA_A)).multiplyScalar(r);
  const b = new THREE.Vector2(Math.cos(SEA_DIR + SEA_A), Math.sin(SEA_DIR + SEA_A)).multiplyScalar(r);
  const n = new THREE.Vector2(Math.cos(SEA_DIR), Math.sin(SEA_DIR)); // 바다 쪽
  const pts = [];
  for (let i = 1; i <= WAVE_N; i++) {
    const t = i / (WAVE_N + 1);
    pts.push(a.clone().lerp(b, t).addScaledVector(n, WAVE_AMP * Math.sin(t * Math.PI * 3) * (i % 2 ? 1 : 0.6)));
  }
  return { a, b, pts }; // a → b 는 바다 호의 시작과 끝. pts 는 a 에서 b 쪽으로 늘어선 물결 점
}

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
  // 창문 불빛: 톤 매핑을 받지 않아 방이 어두워져도(상세 화면) 밝게 남는다
  const lit = new THREE.MeshBasicMaterial({ color: '#ffd58a', toneMapped: false });
  return { rand, plain, shaded, add, lit, tone: (geo, colour, spread = 0.08) => facets(geo, colour, spread, rand) };
}

// 물범: 종이 접기 같은 각진 흰 몸. 등을 대고 누워 머리를 들고 앞을(+z) 본다. 머리는 지역 -x, 꼬리는 +x 쪽이고
// 몸이 U 자로 휘어 꼬리지느러미가 위로 들린다. 앞발 하나는 가슴 위로 들고, 하나는 옆으로 내린다.
// 몸은 면이 적은 이십면체(세분 0)를 크고 둥글게 써서 뭉툭하다
export function buildSeal(kit = makeKit(seeded(7))) {
  const { add, shaded, plain, tone } = kit;
  const g = new THREE.Group(), white = '#f2f4f8', shadow = '#e3e7ef', black = plain('#141418', { roughness: 0.35 });
  const part = (r, detail, colour, [x, y, z], [sx, sy, sz], [rx, ry, rz] = [0, 0, 0]) => {
    const m = add(g, tone(new THREE.IcosahedronGeometry(r, detail), colour, 0.12), shaded, x, y, z);
    m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz); return m;
  };
  part(0.15, 0, white, [0.02, 0.1, 0], [1.25, 0.82, 1.1], [0.3, 0, 0]); // 배
  part(0.14, 0, white, [-0.11, 0.16, 0.01], [1.05, 1.05, 1.08], [0, 0.4, -0.5]); // 가슴
  part(0.1, 0, white, [0.16, 0.115, 0], [1.25, 0.85, 1], [0, 0, 0.55]); // 꼬리 쪽 몸
  part(0.11, 0, white, [-0.2, 0.3, 0.025], [1, 0.95, 1], [0.2, 0.3, 0]); // 머리
  part(0.055, 0, white, [-0.18, 0.268, 0.105], [1.15, 0.8, 1]); // 주둥이
  // 크고 검은 눈, 코
  part(0.026, 0, '#141418', [-0.25, 0.33, 0.1], [1, 1, 0.45], [0, -0.35, 0]).material = black;
  part(0.026, 0, '#141418', [-0.14, 0.345, 0.105], [1, 1, 0.45], [0, 0.35, 0]).material = black;
  part(0.023, 0, '#141418', [-0.18, 0.29, 0.155], [1.2, 0.8, 0.6]).material = black;
  // 수염: 주둥이 양옆에서 세 가닥씩 바깥으로
  const pts = [];
  for (const s of [-1, 1]) for (const dy of [-0.018, 0, 0.018]) pts.push(-0.18 + s * 0.035, 0.27, 0.145, -0.18 + s * 0.14, 0.27 + dy * 2.4, 0.135);
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineBasicMaterial({ color: '#2a2a30' })));
  // 앞발: 가슴 위로 든 것과 옆으로 내린 것
  part(0.065, 0, shadow, [-0.03, 0.27, 0.11], [0.55, 1.2, 0.95], [0.3, 0, -0.35]);
  part(0.06, 0, shadow, [-0.14, 0.08, 0.13], [0.55, 1.15, 0.9], [0.5, 0, 0.6]);
  // 두 갈래로 벌어져 위로 들린 꼬리지느러미
  for (const s of [-1, 1]) {
    const t = add(g, tone(new THREE.ConeGeometry(0.06, 0.15, 4), shadow, 0.1), shaded, 0.28, 0.21, s * 0.04);
    t.scale.set(1, 1, 0.3); t.rotation.set(s * 0.45, 0, -0.55);
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

// 나무: 눈에 덮인 가늘고 높은 원뿔. 밑동에 청록 잎이 띠처럼 드러난다
function buildTree(kit, h) {
  const { add, shaded, plain, tone } = kit;
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.018, 0.022, 0.05, 5), plain('#6e4528'), 0, 0.025, 0);
  add(g, tone(new THREE.ConeGeometry(0.095, 0.16 * h, 7), '#2b8c96', 0.12), shaded, 0, 0.04 + 0.08 * h, 0);
  add(g, tone(new THREE.ConeGeometry(0.085, 0.5 * h, 7), '#f7f9fc', 0.07), shaded, 0, 0.1 + 0.25 * h, 0);
  return g;
}

// 집: 가파른 박공의 붉은 A 자 집. 두꺼운 눈 지붕, 굴뚝, 정면에 창 세 개(박공의 둥근 창, 양옆 네모 창)와 유리창 달린 현관문.
// lights 에 불빛이 번지는 자리(집 지역 좌표)를 넣는다
function buildHouse(kit, lights) {
  const { add, shaded, plain, tone, lit } = kit;
  const g = new THREE.Group(), W = 0.17, WALL = 0.13, APEX = 0.4, D = 0.32;
  // 정면 오각형을 깊이 D 로 민다 (앞면이 z = D / 2)
  const front = new THREE.Shape([new THREE.Vector2(-W, 0), new THREE.Vector2(W, 0), new THREE.Vector2(W, WALL), new THREE.Vector2(0, APEX), new THREE.Vector2(-W, WALL)]);
  const body = new THREE.ExtrudeGeometry(front, { depth: D, bevelEnabled: false });
  body.translate(0, 0, -D / 2);
  add(g, tone(body, '#c8323a', 0.12), shaded);
  // 벽의 가로 널 띠
  const trim = plain('#9e2229');
  for (const y of [0.035, 0.07, 0.105]) add(g, new THREE.BoxGeometry(2 * W + 0.004, 0.006, D + 0.004), trim, 0, y, 0);
  // 지붕: 두 경사면에 두꺼운 눈 판을 얹는다. 처마가 앞뒤와 옆으로 조금 나온다
  const run = W, rise = APEX - WALL, slope = Math.hypot(run, rise), ang = Math.atan2(rise, run), T = 0.05;
  for (const s of [-1, 1]) {
    const snow = add(g, tone(new THREE.BoxGeometry(slope + 0.07, T, D + 0.06), '#fbfdff', 0.06), shaded);
    const nx = s * Math.sin(ang), ny = Math.cos(ang); // 경사면 바깥 방향
    snow.position.set(s * run / 2 + nx * T / 2 + s * 0.012, WALL + rise / 2 + ny * T / 2, 0);
    snow.rotation.z = -s * ang;
  }
  // 굴뚝 (붉은 벽돌, 눈 뚜껑)
  add(g, tone(new THREE.BoxGeometry(0.055, 0.14, 0.055), '#b3262e'), shaded, 0.08, 0.37, -0.06);
  add(g, tone(new THREE.BoxGeometry(0.07, 0.025, 0.07), '#ffffff', 0.04), shaded, 0.08, 0.45, -0.06);
  // 정면 창: 둥근 창, 양옆 네모 창 (흰 창틀, 십자 창살), 현관문의 유리
  const z = D / 2 + 0.002, frame = plain('#f4eee6');
  const pane = (geo, x, y) => { add(g, geo, lit, x, y, z + 0.002).castShadow = false; lights.push(new THREE.Vector3(x, y, z)); };
  add(g, new THREE.CircleGeometry(0.042, 10), frame, 0, 0.255, z);
  pane(new THREE.CircleGeometry(0.032, 10), 0, 0.255);
  for (const s of [-1, 1]) {
    add(g, new THREE.PlaneGeometry(0.068, 0.062), frame, s * 0.105, 0.075, z);
    pane(new THREE.PlaneGeometry(0.052, 0.048), s * 0.105, 0.075);
    add(g, new THREE.PlaneGeometry(0.004, 0.048), frame, s * 0.105, 0.075, z + 0.004);
    add(g, new THREE.PlaneGeometry(0.052, 0.004), frame, s * 0.105, 0.075, z + 0.004);
  }
  add(g, new THREE.BoxGeometry(0.07, 0.125, 0.012), plain('#5b3424'), 0, 0.0625, z);
  pane(new THREE.PlaneGeometry(0.036, 0.034), 0, 0.09);
  add(g, new THREE.BoxGeometry(0.1, 0.012, 0.03), plain('#ffffff'), 0, 0.006, z + 0.015); // 현관 앞 눈
  return g;
}

// 불빛 번짐: 가운데가 밝고 가장자리로 사라지는 따뜻한 원. 더하기 혼합이라 겹치면 더 밝다
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,214,140,1)'); grad.addColorStop(0.35, 'rgba(255,170,80,0.45)'); grad.addColorStop(1, 'rgba(255,140,50,0)');
  x.fillStyle = grad; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 눈: 유리 구 안에서만 떨어지는 작은 팔면체 입자. start(ms) 동안 위에서 새로 내리고(다시 부르면 시간을 새로 잰다),
// 시간이 끝나면 새로 내리지 않고 남은 눈이 바닥이나 유리에 닿는 대로 사라진다.
// 떨어지는 방향은 step 이 받는 down(글로브 지역 좌표의 아래)이다: 글로브를 돌려도 눈은 세상의 아래로 내린다
function buildSnow(count, rand) {
  const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.022, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, emissive: '#dfeaf5', emissiveIntensity: 0.35 }), count);
  mesh.frustumCulled = false; mesh.castShadow = false;
  const pos = new Float32Array(count * 3), spin = new Float32Array(count * 3), speed = new Float32Array(count), phase = new Float32Array(count), alive = new Uint8Array(count);
  const dummy = new THREE.Object3D(), FLOOR = TY + 0.01, IN = 0.86; // IN: 눈이 머무는 구의 반지름 (유리 안쪽)
  const C = new THREE.Vector3(0, CY, 0), down = new THREE.Vector3(0, -1, 0), u = new THREE.Vector3(), w = new THREE.Vector3(), p = new THREE.Vector3();
  const sideways = () => { // down 에 수직인 두 방향 (흔들림과 뿌리는 원판)
    u.set(Math.abs(down.y) < 0.9 ? 0 : 1, Math.abs(down.y) < 0.9 ? 1 : 0, 0).cross(down).normalize();
    w.crossVectors(down, u);
  };
  // along: 구 중심에서 down 쪽으로 얼마나 (-IN 은 맨 위). 그 높이의 원판 안 아무 곳에 둔다
  function spawn(i, along) {
    const r = Math.sqrt(Math.max(0, IN * IN - along * along)) * Math.sqrt(rand()), a = rand() * Math.PI * 2;
    p.copy(C).addScaledVector(down, along).addScaledVector(u, Math.cos(a) * r).addScaledVector(w, Math.sin(a) * r);
    p.toArray(pos, i * 3);
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
  sideways();
  return {
    mesh,
    get active() { return left > 0; },
    start(ms = 3000) {
      if (left <= 0) for (let i = 0; i < count; i++) if (!alive[i]) spawn(i, (rand() * 2 - 1) * IN * 0.95);
      left = ms / 1000;
    },
    stop() { left = 0; alive.fill(0); write(); },
    // localDown: 글로브 지역 좌표의 아래 방향 (없으면 지역 -y)
    step(dt, localDown) {
      if (left <= 0 && !alive.some(Boolean)) return;
      if (localDown) { down.copy(localDown).normalize(); sideways(); }
      left = Math.max(0, left - dt); t += dt;
      for (let i = 0; i < count; i++) {
        if (!alive[i]) continue;
        const k = i * 3;
        p.fromArray(pos, k).addScaledVector(down, speed[i] * dt)
          .addScaledVector(u, Math.sin(t * 1.7 + phase[i]) * 0.05 * dt) // 좌우로 흔들린다
          .addScaledVector(w, Math.cos(t * 1.3 + phase[i]) * 0.05 * dt);
        spin[k] += dt * 1.2; spin[k + 1] += dt * 0.8;
        // 땅 위에 닿았거나 아래쪽 유리에 닿았다: 내리는 중이면 맨 위에서 다시, 아니면 사라진다
        const landed = p.y < FLOOR || (p.distanceTo(C) > IN && p.clone().sub(C).dot(down) > 0);
        if (landed) { if (left > 0) spawn(i, -IN * 0.95); else alive[i] = 0; continue; }
        if (p.distanceTo(C) > IN) p.sub(C).setLength(IN).add(C); // 유리 밖으로 나가지 않는다
        p.toArray(pos, k);
      }
      write();
    },
  };
}

/**
 * 스노우 글로브 전체를 짓는다.
 * @param {{ unit?: number }} [opts] unit: 모델 1 단위가 세상에서 몇인지 (root 에 줄 배율). 집 앞 불빛의 거리와 세기를 맞춘다
 * @returns {{ root: THREE.Group, hitMeshes: THREE.Mesh[], sealZone: THREE.Mesh, catZone: THREE.Mesh, snow: ReturnType<typeof buildSnow>, setGlow: (k: number) => void, setInvite: (k: number) => void, dispose: () => void }}
 */
export function buildSnowGlobe({ unit = 1 } = {}) {
  const kit = makeKit(seeded(2026));
  const { add, shaded, plain, tone, rand } = kit;
  const root = new THREE.Group(), hitMeshes = [];

  // 나무 받침: 팔각 단을 쌓는다. 아래 띠(짙은 나무), 위로 좁아지는 몸통, 홈 띠, 윗 테두리
  const wood = (rb, rt, h, y, colour, spread = 0.16) => { hitMeshes.push(add(root, tone(new THREE.CylinderGeometry(rt, rb, h, 8), colour, spread), shaded, 0, y + h / 2, 0)); };
  wood(1.0, 0.98, 0.1, 0, '#6b4226');
  wood(0.95, 0.86, 0.28, 0.1, '#a0673a', 0.2);
  wood(0.885, 0.885, 0.03, 0.375, '#5e3920', 0.1);
  wood(0.89, 0.87, 0.055, BASE_TOP - 0.055, '#b97a45');

  // 안쪽 땅: 원판을 x = LAND_R cos(SEA_A) 의 직선으로 잘라 왼쪽 큰 쪽(80%)은 얼음, 오른쪽 반달(20%)은 한 단 낮은 바다다.
  // 모양은 x-y 평면에 그려 위로 민 뒤 눕힌다 (모양의 y 는 -z 가 된다). 잘린 얼음 옆면이 바다 위 절벽이 된다
  const slab = (shape, h, curveSegments) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments });
    geo.rotateX(-Math.PI / 2); return geo;
  };
  // 얼음: 바다 호의 끝(b)에서 큰 호를 돌아 시작(a)까지, 그다음 물결 점을 따라 b 로 돌아온다. 바다: 작은 호 a → b, 물결 점을 거꾸로
  const shore = shoreline(LAND_R);
  const ice = new THREE.Shape(); ice.absarc(0, 0, LAND_R, SEA_DIR + SEA_A, SEA_DIR - SEA_A + Math.PI * 2, false);
  for (const p of shore.pts) ice.lineTo(p.x, p.y);
  ice.closePath();
  add(root, tone(slab(ice, TY - BASE_TOP, 14), '#eef5fa', 0.07), shaded, 0, BASE_TOP, 0);
  const seaTop = TY - 0.03, sea = new THREE.Shape(); sea.absarc(0, 0, LAND_R - 0.004, SEA_DIR - SEA_A, SEA_DIR + SEA_A, false);
  for (const p of [...shore.pts].reverse()) sea.lineTo(p.x, p.y);
  sea.closePath();
  add(root, tone(slab(sea, seaTop - BASE_TOP, 5), '#2f7fb8', 0.14), plain('#ffffff', { vertexColors: true, roughness: 0.3 }), 0, BASE_TOP, 0);
  // 바다에 뜬 얼음 조각, 얼음 위의 눈 더미와 청록 덤불
  for (const [r, da, s] of [[0.6, 0.15, 0.065], [0.63, -0.25, 0.05], [0.55, -0.5, 0.04]]) { // 바다 가운데 방향에서 da 만큼 돌린 자리
    const a = SEA_DIR + da, f = add(root, tone(new THREE.DodecahedronGeometry(s, 0), '#f7fbff'), shaded, Math.cos(a) * r, seaTop, -Math.sin(a) * r);
    f.scale.y = 0.4;
  }
  for (const [x, z, s, c] of [[-0.62, 0.22, 0.1, '#ffffff'], [-0.05, -0.62, 0.09, '#ffffff'], [-0.18, 0.63, 0.07, '#ffffff'], [0.2, 0.12, 0.05, '#2b8c96'], [-0.45, 0.05, 0.045, '#2b8c96']]) {
    const m = add(root, tone(new THREE.IcosahedronGeometry(s, 0), c, 0.08), shaded, x, TY, z);
    m.scale.y = 0.45;
  }

  // 누르기를 기다리는 반짝임: 집, 물범, 고양이는 따로 만든 재질을 써서 그것만 흐린 노란빛으로 빛난다 (setInvite)
  const invite = { ...kit, shaded: plain('#ffffff', { vertexColors: true, emissive: '#fff2a8', emissiveIntensity: 0 }) };
  const lights = [];
  const house = buildHouse(invite, lights); house.position.set(-0.04, TY, -0.14); root.add(house);
  for (const [x, z, h] of [[-0.4, -0.38, 1.25], [0.3, -0.42, 1.05], [-0.2, -0.6, 1.4], [0.33, -0.14, 0.75]]) {
    const t = buildTree(kit, h); t.position.set(x, TY, z); t.rotation.y = rand() * Math.PI; root.add(t);
  }

  // 물범과 고양이는 앞쪽 얼음 위에 나란히 있다. 둘 둘레의 보이지 않는 구는 누르기 영역이다 (globe.js)
  const seal = buildSeal(invite); seal.position.set(-0.4, TY, 0.3); seal.rotation.y = 0.2; seal.scale.setScalar(0.85); root.add(seal);
  const cat = buildCat(invite); cat.position.set(0.12, TY, 0.46); cat.rotation.y = -0.25; root.add(cat);
  const zone = (r, x, z, y) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); m.position.set(x, y, z); root.add(m); return m; };
  const sealZone = zone(0.2, -0.4, 0.3, TY + 0.15), catZone = zone(0.17, 0.12, 0.46, TY + 0.15);

  // 창문 불빛이 번진다: 창마다 따뜻한 빛 원(스프라이트), 집 앞 눈밭을 비추는 작은 점광원. setGlow(k) 가 세기를 정한다 (0 방, 1 상세 화면)
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  const halos = lights.map(p => {
    const s = new THREE.Sprite(glowMat); s.position.copy(p).add(house.position).add(new THREE.Vector3(0, 0, 0.03));
    s.scale.setScalar(0.2); s.renderOrder = 1; root.add(s); return s;
  });
  const lamp = new THREE.PointLight('#ffb15c', 0, 1.1 * unit, 2);
  lamp.position.set(-0.04, TY + 0.14, 0.2); root.add(lamp);
  function setGlow(k) {
    glowMat.opacity = 0.35 + 0.65 * k;
    for (const s of halos) s.scale.setScalar(0.16 + 0.1 * k);
    lamp.intensity = (0.4 + 2.6 * k) * (0.3 * unit) ** 2; // 집 앞 0.3 거리에서 0.4 ~ 3
  }
  setGlow(0);
  const setInvite = k => { invite.shaded.emissiveIntensity = k; };

  const snow = buildSnow(160, rand);
  root.add(snow.mesh);

  // 유리 돔: 각진 구. 안쪽 면을 먼저, 바깥 면을 나중에 그려 투명한 유리가 겹쳐 보인다. 하이라이트는 면마다 끊긴 반사광이다
  const glassGeo = new THREE.SphereGeometry(R, 14, 10);
  const glass = (side, opacity, order) => {
    const m = new THREE.Mesh(glassGeo, new THREE.MeshPhongMaterial({ color: '#dff1ff', specular: '#ffffff', shininess: 90, flatShading: true, transparent: true, opacity, depthWrite: false, side }));
    m.position.y = CY; m.renderOrder = order; root.add(m); return m;
  };
  glass(THREE.BackSide, 0.08, 2);
  hitMeshes.push(glass(THREE.FrontSide, 0.16, 3));

  function dispose() {
    const done = new Set();
    root.traverse(o => {
      for (const r of [o.geometry, ...(Array.isArray(o.material) ? o.material : [o.material])]) if (r && !done.has(r)) { done.add(r); r.dispose(); }
    });
    glowMat.map.dispose();
  }
  return { root, hitMeshes, sealZone, catZone, snow, setGlow, setInvite, dispose };
}
