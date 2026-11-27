// 사진 더미: 쌓이는 모양, 떨어지는 움직임, 카드, 벽 포스터.
import * as THREE from 'three';
import { viewsNum, hasThumb } from './format.js';
import { drawFit, NO_PHOTO, canvasTexture } from './draw.js';
import { tone } from './palette.js';

export function setupHeap(ctx) {
  const {
    Yv, Xv, rand, renderer, DIMS, drawFanFront, drawCard, drawFanBack, drawBack,
    gauss, scene, reels, fanReels, layout, box, C,
  } = ctx;

  // 사진 더미: 모양을 잡아 쌓는다. 카드는 자기 모서리와 가장자리 아래에 있는 것 위에 놓인다.
  const cards = []; // stack order, bottom → top
  const pickables = [];
  // 더미가 없는 방(HOST null)도 카드는 만든다 (벽 포스터가 카드의 그림을 쓴다). 카드는 보이지 않고 집을 수 없다.
  const HOST = ctx.HOST ?? { x: 0, z: 0, top: 0, w: 1.2, d: 0.9, box: false, boxW: 1.12, boxD: 0.66, item: null };
  const GAP = 0.0035, MAX_SLOPE = 0.32;
  // 더미의 모양: 'pile'(기본, 받침 위에 흩어진 더미) 또는 'box'(열린 신발상자 안에 쌓인 더미, heap 가구의 style "box"). 상자 안쪽 크기와 벽 높이는 BOX_IN.
  // 상자는 카드가 탁자에 어지럽게 퍼지지 않게 담는다. 카드를 집는 광선은 카드만 보므로 상자 벽이 막지 않는다.
  const BOX_IN = { w: 1.12, d: 0.66, h: 0.22, wall: 0.018, base: 0.012 };
  // 더미 자리에서 셈하는 값. 꾸미기가 더미를 옮기면 fit 이 다시 셈한다 (rehostHeap)
  //   EXCL: 같은 받침 위에 선 다른 물건(휴대폰, 방명록, 스노우 글로브, 좌식 탁자의 머그)은 카드가 비켜 간다
  //   BASE: 카드가 놓이는 바닥 · PM, SX, SZ: 흩어진 더미가 퍼지는 넓이 (받침 가장자리에서 PM 안쪽, 가우스 퍼짐. 원래 탁자 2.6 x 1.8 에서 0.42, 0.28)
  const EXCL = [];
  let BOX = null, BASE = 0, PM = 0, SX = 0, SZ = 0;
  function fit(items) {
    EXCL.length = 0;
    if (ctx.HOST) for (const o of items) {
      if (o === HOST.item || o.type === 'heap' || Math.abs((o.y || 0) - HOST.top) > 0.03 || Math.abs(o.x - HOST.x) > HOST.w / 2 + 0.3 || Math.abs(o.z - HOST.z) > HOST.d / 2 + 0.3) continue;
      const e = ctx.opts.itemHalfExtents?.(o); if (e) EXCL.push({ x: o.x, z: o.z, r: Math.max(e.hx, e.hz) + 0.08 });
    }
    const lowT = ctx.HOST && items.find(o => o.type === 'lowTable' && Math.abs(o.x - HOST.x) < 1.3 && Math.abs(o.z - HOST.z) < 0.9 && Math.abs(HOST.top - 0.56) < 0.03);
    if (lowT) { const a = THREE.MathUtils.degToRad(lowT.rot || 0); EXCL.push({ x: lowT.x + Math.cos(a) * 1.05 + Math.sin(a) * 0.6, z: lowT.z - Math.sin(a) * 1.05 + Math.cos(a) * 0.6, r: 0.18 });
    } // 머그 (fixtures.js)
    BOX = HOST.box ? { x: HOST.x, z: HOST.z, ...BOX_IN, w: HOST.boxW, d: HOST.boxD, floor: HOST.top + BOX_IN.base } : null;
    BASE = BOX ? BOX.floor : HOST.top;
    PM = Math.min(0.18, HOST.w * 0.15, HOST.d * 0.15); SX = Math.min(0.42, HOST.w * 0.16); SZ = Math.min(0.28, HOST.d * 0.155);
    // 흩어진 더미의 높이 격자: 받침 넓이에 카드 반 장만큼 여유를 둔다
    G.x0 = HOST.x - HOST.w / 2 - 0.2; G.z0 = HOST.z - HOST.d / 2 - 0.2;
    G.nx = Math.ceil((HOST.w + 0.4) / G.cell); G.nz = Math.ceil((HOST.d + 0.4) / G.cell);
    G.h = new Float32Array(G.nx * G.nz);
    // 바닥 높이: 받침 윗면. 상자가 있으면 안쪽은 상자 바닥, 벽 자리는 벽 위
    G.base = new Float32Array(G.nx * G.nz).fill(HOST.top);
    if (BOX) for (let i = 0; i < G.nx; i++) for (let j = 0; j < G.nz; j++) {
      const ax = Math.abs(G.x0 + (i + 0.5) * G.cell - BOX.x), az = Math.abs(G.z0 + (j + 0.5) * G.cell - BOX.z);
      if (ax <= BOX.w / 2 && az <= BOX.d / 2) G.base[i * G.nz + j] = BOX.floor;
      else if (ax <= BOX.w / 2 + BOX.wall && az <= BOX.d / 2 + BOX.wall) G.base[i * G.nz + j] = HOST.top + BOX.h;
    }
    lastSeq = []; // 격자가 새로 생겼다: 다음 settle 은 모두 다시 셈한다
  }
  // 더미는 높이 격자 위에 쌓는다. 칸마다 그 자리에서 가장 높은 카드 윗면(카드가 없으면 바닥 G.base)의 높이를 둔다.
  // 흩어진 카드는 자기 밑의 칸들 위에서 가운데가 가장 낮아지는 기울기로 놓인다 (받침점에 얹혀 쉬는 판).
  // 그 기울기가 SLIDE 보다 가파르면 비탈 아래로 1cm 씩 미끄러진다. 미끄러진 자리는 카드의 place 에 남는다.
  // 상자 안의 카드는 평평하게 눕는다. 상자 밖(탁자 위)으로 꺼낸 카드는 흩어진 카드와 같다.
  const G = { cell: 0.02, x0: 0, z0: 0, nx: 0, nz: 0, h: null, base: null };
  const SLIDE = Math.tan(THREE.MathUtils.degToRad(12));
  let lastSeq = []; // 지난 settle 에서 더미에 있던 카드의 차례 (settle 이 아래쪽을 다시 셈하지 않으려고 본다)
  fit(layout.items || []);
  const _inv = new THREE.Quaternion(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
  // 놓여 있는 카드의 (x, z) 위 면 높이. (x, z) 가 카드 밖이면 -Infinity
  function surfaceAt(c, x, z) {
    const { pos, quat } = c.userData.home, d = c.userData.d;
    _n.set(0, 0, 1).applyQuaternion(quat);
    if (Math.abs(_n.y) < 0.2) return -Infinity;
    const y = pos.y - (_n.x * (x - pos.x) + _n.z * (z - pos.z)) / _n.y;
    _v.set(x - pos.x, y - pos.y, z - pos.z).applyQuaternion(_inv.copy(quat).invert());
    return Math.abs(_v.x) <= d.w / 2 && Math.abs(_v.y) <= d.h / 2 ? y : -Infinity;
  }
  function supportAt(x, z, below) {
    if (G.h) return gridAt(x, z); // 마지막 settle 이 채운 격자 (끄는 카드는 빠져 있다). below 는 격자가 없을 때만 본다
    let h = BASE;
    for (const c of below) h = Math.max(h, surfaceAt(c, x, z) + GAP);
    return h;
  }
  const SAMPLES = [-1, 0, 1].flatMap(a => [-1, 0, 1].map(b => [a * 0.47, b * 0.47]));
  const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  function restPose(card, below) {
    if (BOX) clampPlace(card.userData.place, card.userData.d); // 다른 파일의 clampPlace 는 카드 크기를 모른다: 넓은 카드도 벽 안에
    const { x, z, yaw, faceUp } = card.userData.place, d = card.userData.d;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const pts = SAMPLES.map(([a, b]) => { const lx = a * d.w, lz = b * d.h; const dx = lx * cs + lz * sn, dz = -lx * sn + lz * cs; return { dx, dz, h: below.length ? supportAt(x + dx, z + dz, below) : BASE }; }); // 빈 below: 끄는 카드의 평평한 자세 (loop.js)
    // 받침의 최소제곱 기울기를 구한 뒤, 아무것도 뚫고 나오지 않을 때까지 면을 들어 올린다
    const mean = pts.reduce((s, p) => s + p.h, 0) / pts.length;
    let sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
    for (const p of pts) { sxx += p.dx * p.dx; szz += p.dz * p.dz; sxz += p.dx * p.dz; sxh += p.dx * (p.h - mean); szh += p.dz * (p.h - mean); }
    const det = sxx * szz - sxz * sxz || 1;
    let a = (sxh * szz - szh * sxz) / det, b = (szh * sxx - sxh * sxz) / det;
    const m = Math.hypot(a, b); if (m > MAX_SLOPE) { a *= MAX_SLOPE / m; b *= MAX_SLOPE / m; }
    let c = -Infinity; for (const p of pts) c = Math.max(c, p.h - a * p.dx - b * p.dz);
    const up = new THREE.Vector3(-a, 1, -b).normalize();
    const quat = _q1.setFromUnitVectors(Yv, up).clone()
      .multiply(_q2.setFromAxisAngle(Yv, yaw))
      .multiply(new THREE.Quaternion().setFromAxisAngle(Xv, faceUp ? -Math.PI / 2 : Math.PI / 2));
    return { pos: new THREE.Vector3(x, c + 0.0015, z), quat };
  }
  // 카드 밑의 칸: 칸 번호와 카드 가운데에서 칸 가운데까지 (dx, dz)
  const FK = [], FX = [], FZ = [];
  function footprint(x, z, yaw, d) {
    FK.length = FX.length = FZ.length = 0;
    const cs = Math.cos(yaw), sn = Math.sin(yaw), hw = d.w / 2, hh = d.h / 2;
    const ex = Math.abs(cs) * hw + Math.abs(sn) * hh, ez = Math.abs(sn) * hw + Math.abs(cs) * hh;
    const i0 = Math.max(0, Math.floor((x - ex - G.x0) / G.cell)), i1 = Math.min(G.nx - 1, Math.floor((x + ex - G.x0) / G.cell));
    const j0 = Math.max(0, Math.floor((z - ez - G.z0) / G.cell)), j1 = Math.min(G.nz - 1, Math.floor((z + ez - G.z0) / G.cell));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const dx = G.x0 + (i + 0.5) * G.cell - x, dz = G.z0 + (j + 0.5) * G.cell - z;
      // 카드 자리 축으로 (restPose 의 yaw 와 같은 돌림)
      if (Math.abs(dx * cs - dz * sn) <= hw && Math.abs(dx * sn + dz * cs) <= hh) { FK.push(i * G.nz + j); FX.push(dx); FZ.push(dz); }
    }
    if (!FK.length) { FK.push(-1); FX.push(0); FZ.push(0); } // 격자 밖: 받침 높이
  }
  function lift(a, b) { // 기울기 (a, b) 로 놓았을 때 아무 칸도 뚫지 않는 가운데 높이
    let m = -Infinity;
    for (let k = 0; k < FK.length; k++) { const h = FK[k] < 0 ? HOST.top : G.h[FK[k]], v = h - a * FX[k] - b * FZ[k]; if (v > m) m = v; }
    return m;
  }
  function restPile(card) {
    const p = card.userData.place, d = card.userData.d;
    let a = 0, b = 0, c = 0;
    if (BOX) clampPlace(p, d);
    if (inBox(p)) { // 상자 안: 카드는 평평하게 눕는다. 처음 쌓은 카드는 자기 켜의 높이에, 옮긴 카드는 밑에서 가장 높은 칸 위에
      footprint(p.x, p.z, p.yaw, d);
      const L = card.userData.layer;
      c = L ? BOX.floor + L.n * GAP + L.k : lift(0, 0);
    } else for (let it = 0; ; it++) {
      footprint(p.x, p.z, p.yaw, d);
      // 가운데가 가장 낮은 기울기: 7 x 7 후보를 네 번 좁혀 가며 찾는다
      a = 0; b = 0; c = lift(0, 0);
      for (let r = 0, step = MAX_SLOPE / 3; r < 4; r++, step /= 3) {
        const ca = a, cb = b;
        for (let u = -3; u <= 3; u++) for (let v = -3; v <= 3; v++) {
          const aa = ca + u * step, bb = cb + v * step;
          if ((u || v) && Math.hypot(aa, bb) <= MAX_SLOPE) { const cc = lift(aa, bb); if (cc < c - 1e-6) { a = aa; b = bb; c = cc; } }
        }
      }
      const s = Math.hypot(a, b);
      if (s <= SLIDE || it >= 40) break;
      const ox = p.x, oz = p.z;
      p.x -= a / s * 0.01; p.z -= b / s * 0.01; clampPlace(p, d);
      if (Math.hypot(p.x - ox, p.z - oz) < 0.002) break; // 가장자리나 다른 물건에 막혔다
    }
    const fk = [], hv = [];
    for (let k = 0; k < FK.length; k++) if (FK[k] >= 0) { G.h[FK[k]] = c + a * FX[k] + b * FZ[k] + GAP; fk.push(FK[k]); hv.push(G.h[FK[k]]); }
    card.userData.rest = { x: p.x, z: p.z, yaw: p.yaw, faceUp: p.faceUp, fk: Int32Array.from(fk), hv: Float32Array.from(hv) };
    const quat = _q1.setFromUnitVectors(Yv, _v.set(-a, 1, -b).normalize()).clone()
      .multiply(_q2.setFromAxisAngle(Yv, p.yaw))
      .multiply(new THREE.Quaternion().setFromAxisAngle(Xv, p.faceUp ? -Math.PI / 2 : Math.PI / 2));
    return { pos: new THREE.Vector3(p.x, c + 0.0015, p.z), quat };
  }
  function gridAt(x, z) {
    const i = Math.floor((x - G.x0) / G.cell), j = Math.floor((z - G.z0) / G.cell);
    return i < 0 || j < 0 || i >= G.nx || j >= G.nz ? HOST.top : G.h[i * G.nz + j];
  }
  // 카드 가운데가 상자 안쪽에 있다 (상자가 없으면 false)
  const inBox = p => !!BOX && Math.abs(p.x - BOX.x) <= BOX.w / 2 && Math.abs(p.z - BOX.z) <= BOX.d / 2;
  // 카드를 놓일 수 있는 곳으로 당긴다. 가운데가 상자 안이면 돌린 카드의 반폭이 벽 안에 들게 (상자보다 크면 가운데에).
  // 그 밖이면 받침 가장자리에서 PM 안쪽, 같은 받침의 다른 물건(EXCL)을 비켜서, 상자 벽에 걸치지 않게 벽 바깥으로 민다:
  // 벽에 걸쳐 놓은 카드는 가운데가 있는 쪽으로 떨어진다
  function clampPlace(p, d = DIMS.tall) {
    const c = Math.abs(Math.cos(p.yaw ?? 0)), s = Math.abs(Math.sin(p.yaw ?? 0)), ex = (c * d.w + s * d.h) / 2, ez = (s * d.w + c * d.h) / 2;
    if (inBox(p)) {
      const hx = Math.max(0, BOX.w / 2 - ex - 0.004), hz = Math.max(0, BOX.d / 2 - ez - 0.004);
      p.x = THREE.MathUtils.clamp(p.x, BOX.x - hx, BOX.x + hx);
      p.z = THREE.MathUtils.clamp(p.z, BOX.z - hz, BOX.z + hz);
      return p;
    }
    const onHost = () => {
      p.x = THREE.MathUtils.clamp(p.x, HOST.x - HOST.w / 2 + PM, HOST.x + HOST.w / 2 - PM);
      p.z = THREE.MathUtils.clamp(p.z, HOST.z - HOST.d / 2 + PM, HOST.z + HOST.d / 2 - PM);
    };
    onHost();
    for (const e of EXCL) {
      const dx = p.x - e.x, dz = p.z - e.z, dd = Math.hypot(dx, dz);
      if (dd < e.r) { p.x = e.x + (dd ? dx / dd : 1) * e.r; p.z = e.z + (dd ? dz / dd : 0) * e.r; }
    }
    if (BOX) {
      const ox = BOX.w / 2 + BOX.wall + ex + 0.004, oz = BOX.d / 2 + BOX.wall + ez + 0.004, dx = p.x - BOX.x, dz = p.z - BOX.z;
      if (Math.abs(dx) < ox && Math.abs(dz) < oz) { // 벽에 걸친다: 덜 밀어도 되는 쪽으로 벽 바깥에
        if (ox - Math.abs(dx) < oz - Math.abs(dz)) p.x = BOX.x + Math.sign(dx || 1) * ox; else p.z = BOX.z + Math.sign(dz || 1) * oz;
        onHost();
      }
    }
    return p;
  }
  const inPile = c => c !== ctx.held && c !== ctx.loaded && c !== ctx.dragging;
  // recompute every resting pose bottom → top; cards whose support changed fall into place
  // 흩어진 더미는 지난번과 같은 차례, 같은 자리인 아래쪽 카드를 다시 셈하지 않고 남긴 칸 높이만 다시 쓴다 (맨 위 카드를 집거나 놓을 때 거의 공짜)
  function settle(instant = false) {
    const seq = [];
    let replay = true;
    G.h.set(G.base);
    for (const c of cards) {
      if (!inPile(c)) continue;
      const prev = c.userData.home, R = c.userData.rest, p = c.userData.place;
      seq.push(c);
      if (replay && lastSeq[seq.length - 1] === c && R && R.x === p.x && R.z === p.z && R.yaw === p.yaw && R.faceUp === p.faceUp && prev) {
        for (let k = 0; k < R.fk.length; k++) G.h[R.fk[k]] = R.hv[k];
        if (instant) { c.position.copy(prev.pos); c.quaternion.copy(prev.quat); c.userData.anim = null; }
        continue;
      }
      replay = false;
      c.userData.home = restPile(c);
      if (instant || !prev) { c.position.copy(c.userData.home.pos); c.quaternion.copy(c.userData.home.quat); c.userData.anim = null; continue; }
      const moved = prev.pos.distanceTo(c.userData.home.pos) > 0.002 || prev.quat.angleTo(c.userData.home.quat) > 0.01;
      if (moved && !c.userData.anim) startAnim(c, 'settle');
    }
    lastSeq = seq;
  }
  function toTop(c) { cards.splice(cards.indexOf(c), 1); cards.push(c); c.userData.layer = null; } // 옮긴 카드는 켜를 떠나 맨 위에 눕는다
  ctx.heapHasBox = () => !!BOX;
  // 움직임: 'drop' 은 펄럭이며 호를 그려 내려와 조금 튕기고, 'settle' 은 중력으로 떨어진다
  function startAnim(c, kind) {
    c.userData.anim = { kind, t: 0, dur: kind === 'drop' ? 0.6 : 0.28, from: c.position.clone(), fromQ: c.quaternion.clone(), axis: new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize(), arc: kind === 'drop' ? 0.08 : 0 };
  }
  const _fq = new THREE.Quaternion();
  function stepAnim(c, dt) {
    const A = c.userData.anim, H = c.userData.home;
    A.t = Math.min(1, A.t + dt / A.dur);
    const t = A.t;
    if (A.kind === 'drop') {
      const e = 1 - Math.pow(1 - t, 3);
      c.position.lerpVectors(A.from, H.pos, e);
      const fall = t < 0.8 ? (t / 0.8) ** 2 : 1;
      c.position.y = A.from.y + (H.pos.y - A.from.y) * fall + Math.sin(Math.PI * Math.min(1, t / 0.8)) * A.arc
        + (t > 0.8 ? Math.sin((t - 0.8) / 0.2 * Math.PI) * 0.006 : 0);
      c.quaternion.slerpQuaternions(A.fromQ, H.quat, e);
      c.quaternion.premultiply(_fq.setFromAxisAngle(A.axis, 0.28 * (1 - t) * Math.sin(t * 17)));
    } else {
      const fall = t * t;
      c.position.lerpVectors(A.from, H.pos, fall);
      c.quaternion.slerpQuaternions(A.fromQ, H.quat, fall);
    }
    if (t >= 1) { c.position.copy(H.pos); c.quaternion.copy(H.quat); c.userData.anim = null; }
  }

  function makeCard(reel) {
    const aniso = renderer.capabilities.getMaxAnisotropy(), d = reel.wide ? DIMS.wide : DIMS.tall, fan = reel.kind === 'fan';
    const frontC = fan ? drawFanFront(reel) : drawCard(reel, null);
    const tex = canvasTexture(frontC, aniso);
    const btex = canvasTexture(fan ? drawFanBack(reel) : drawBack(reel), aniso);
    const card = new THREE.Group();
    const front = new THREE.Mesh(d.geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    const back = new THREE.Mesh(d.geo, new THREE.MeshStandardMaterial({ map: btex, roughness: 0.9 }));
    back.rotation.y = Math.PI; back.position.z = -0.001;
    for (const m of [front, back]) { m.castShadow = m.receiveShadow = true; m.userData.card = card; if (ctx.HOST) pickables.push(m); }
    card.add(front, back);
    // img: the best picture the card has so far (a fan piece is its own drawing) · tier: that picture's tier, -1 before any lands · asked: tiers already requested
    Object.assign(card.userData, { reel, d, img: fan ? frontC : null, tier: -1, asked: [], front: tex, place: clampPlace(BOX
      ? { x: BOX.x + gauss() * BOX.w * 0.2, z: BOX.z + gauss() * BOX.d * 0.2, yaw: rand() * Math.PI * 2, faceUp: rand() > 0.1 }
      : { x: HOST.x + gauss() * SX, z: HOST.z + gauss() * SZ, yaw: rand() * Math.PI * 2, faceUp: rand() > 0.1 }, d) });
    if (!ctx.HOST) card.visible = false; // 더미가 없는 방: 포스터에 그림만 빌려준다
    cards.push(card); scene.add(card);
    return card;
  }
  // 열린 상자: 바닥 판과 네 벽. 더미를 옮기면 지운 뒤 새 자리에 다시 짓는다 (rehostHeap)
  let boxGroup = null;
  function buildBox() {
    const g = new THREE.Group(); g.name = 'heap-box';
    const { w, d, h, wall: t } = BOX, mat = tone(C, 'woodDark'), y = HOST.top;
    box(w + 2 * t, BOX.floor - y, d + 2 * t, mat, 0, (BOX.floor - y) / 2, 0, { parent: g });
    box(w + 2 * t, h, t, mat, 0, h / 2, -(d + t) / 2, { parent: g });
    box(w + 2 * t, h, t, mat, 0, h / 2, (d + t) / 2, { parent: g });
    box(t, h, d, mat, -(w + t) / 2, h / 2, 0, { parent: g });
    box(t, h, d, mat, (w + t) / 2, h / 2, 0, { parent: g });
    g.position.set(BOX.x, y, BOX.z);
    scene.add(g); boxGroup = g;
    ctx.heapBoxParts = g.children; // 상자를 누르면 더미 앞으로 걸어가 선다 (input.js)
  }
  // 상자 안의 켜: 처음 쌓을 때 카드를 차례대로 켜에 나눠 담는다. 켜마다 상자 바닥을 COLS x ROWS 자리로 나누고
  // 카드마다 다른 자리에 조금 흩뜨려 놓는다 (자리 차례는 켜마다 어긋난다). 켜 높이는 GAP 씩, 한 켜 안의 카드는 GAP 의 0.8 안에서 차례로 조금씩 높다.
  // 카드는 상자 긴 쪽을 따라 눕고 가끔 가로로 돈다. 옮긴 카드는 켜를 떠난다 (toTop).
  function layBox() {
    const COLS = Math.max(1, Math.round(BOX.w / 0.22)), ROWS = Math.max(1, Math.round(BOX.d / 0.22)), N = COLS * ROWS;
    const PER = Math.max(1, Math.round(N * 0.9)), STRIDE = [7, 5, 3, 1].find(s => N % s !== 0 || s === 1);
    cards.forEach((c, i) => {
      const n = Math.floor(i / PER), k = i % PER, slot = (k * STRIDE + n * 3) % N, p = c.userData.place;
      p.x = BOX.x - BOX.w / 2 + ((slot % COLS) + 0.5) / COLS * BOX.w + gauss() * 0.05;
      p.z = BOX.z - BOX.d / 2 + (Math.floor(slot / COLS) + 0.5) / ROWS * BOX.d + gauss() * 0.04;
      p.yaw = (rand() < 0.5 ? 0 : Math.PI) + (rand() < 0.15 ? Math.PI / 2 : 0) + gauss() * 0.1;
      // 흩뜨린 가운데가 상자 밖으로 나가면 clampPlace 가 탁자로 내보낸다: 안쪽에 묶는다
      p.x = THREE.MathUtils.clamp(p.x, BOX.x - BOX.w * 0.45, BOX.x + BOX.w * 0.45); p.z = THREE.MathUtils.clamp(p.z, BOX.z - BOX.d * 0.45, BOX.z + BOX.d * 0.45);
      c.userData.layer = { n, k: k / PER * GAP * 0.8 };
    });
  }
  function buildHeap() {
    if (BOX) buildBox();
    const made = reels.map(reel => makeCard(reel));
    for (const p of fanReels) { const c = makeCard(p); c.userData.place.faceUp = true; }
    if (BOX) layBox();
    settle(true);
    ctx.requestPile(ctx.FAR);
    paintPosters(made);
  }
  // 꾸미기가 더미를 옮겼다 (edit.js): 방을 다시 마운트하지 않고 지금 카드를 새 자리에 다시 쌓는다. 텍스처와 메시는 그대로다.
  // 카드는 옮긴 만큼 함께 가고, 새 받침의 넓이 안으로 당긴 뒤 한 번에 내려앉는다 (settle(true)).
  // 더미가 생기거나 없어지면(HOST 가 있다가 없거나 그 반대) false: 그때는 다시 마운트해야 한다. 모양(style)이 바뀌어도 다시 마운트한다 (edit.js 가 가린다)
  function rehostHeap(items) {
    if (!ctx.HOST) return false;
    const x0 = HOST.x, z0 = HOST.z;
    if (!ctx.rehostProps(items)) return false;
    fit(items);
    const dx = HOST.x - x0, dz = HOST.z - z0;
    for (const c of cards) {
      if (!inPile(c)) continue;
      const p = c.userData.place; p.x += dx; p.z += dz; clampPlace(p, c.userData.d);
    }
    if (boxGroup) { scene.remove(boxGroup); boxGroup.traverse(m => m.geometry?.dispose()); boxGroup = null; ctx.heapBoxParts = []; }
    if (BOX) buildBox();
    settle(true);
    ctx.rehostSitCam?.();
    hideHeap(false);
    return true;
  }
  // 꾸미기에서 더미를 들고 있는 동안: 카드와 상자를 감추고 집을 수 없게 한다 (끄는 동안 카드가 제자리에 남아 보이지 않게)
  let hiddenPicks = null;
  function hideHeap(hide) {
    if (!ctx.HOST || hide === !!hiddenPicks) return;
    for (const c of cards) if (inPile(c)) c.visible = !hide;
    if (boxGroup) boxGroup.visible = !hide;
    if (hide) { hiddenPicks = pickables.splice(0); } else { pickables.push(...hiddenPicks); hiddenPicks = null; }
  }

  // 포스터: 포스터 가구(fixtures.js)마다 가장 많이 본 쇼츠 하나씩, 목록 순서대로. 각각 자기 카드의 그림으로 그려서, 그 카드의 단계가 오는 대로 채워지고 선명해진다.
  // 텍스처는 ctx.posterTexAt(k) 이다 (가구를 다시 지어도 같은 텍스처). 고를 카드가 없는 포스터는 빈 그림이다.
  function paintPosters(list) {
    for (const c of cards) delete c.userData.poster;
    const n = (ctx.build.items || []).filter(o => o.type === 'poster').length;
    const top = topShorts(list).slice(0, Math.max(3, n));
    for (let k = 0; k < Math.max(n, ctx.posterTex.length); k++) {
      const t = ctx.posterTexAt(k), card = top[k];
      if (card) { card.userData.poster = t; paintPoster(card); ctx.request(card, ctx.NEAR); continue; }
      const g = t.image.getContext('2d'); g.fillStyle = NO_PHOTO; g.fillRect(0, 0, t.image.width, t.image.height); t.needsUpdate = true;
    }
  }
  // 포스터는 썸네일이 있는 세로 영상에서만 고른다 (그림 없는 카드를 걸면 액자가 빈다)
  const topShorts = list => list.filter(c => hasThumb(c.userData.reel) && !c.userData.reel.wide).sort((a, b) => viewsNum(b.userData.reel.views) - viewsNum(a.userData.reel.views));
  // 영상 목록이 바뀐 뒤(live.js 의 replaceReels): 남은 카드에서 다시 고른 쇼츠를 액자에 건다. 고를 카드가 없는 액자는 비운다.
  // 영상 목록이나 포스터 가구가 바뀐 뒤(live.js 의 replaceReels, 꾸미기): 남은 카드에서 다시 고른 쇼츠를 건다
  const refreshPosters = () => paintPosters(cards);

  function paintPoster(card) {
    const { poster, img } = card.userData, W = poster.image.width, H = poster.image.height, g = poster.image.getContext('2d');
    if (img) drawFit(g, img, 0, 0, W, H, true); else { g.fillStyle = NO_PHOTO; g.fillRect(0, 0, W, H); }
    poster.needsUpdate = true;
  }

  Object.assign(ctx, {
    paintPoster, cards, settle, clampPlace, toTop, startAnim, makeCard, pickables, inPile, supportAt,
    restPose, stepAnim, buildHeap, refreshPosters, rehostHeap, hideHeap,
  });
}
