// 사진 더미: 쌓이는 모양, 떨어지는 움직임, 카드, 벽 포스터.
import * as THREE from 'three';
import { viewsNum } from './format.js';
import { flat, drawFit, NO_PHOTO, makeCanvas, canvasTexture } from './draw.js';

export function setupHeap(ctx) {
  const {
    PROJ, MUG, PHONE, TABLE, Yv, Xv, rand, renderer, DIMS, drawFanFront, drawCard, drawFanBack, drawBack,
    gauss, scene, reels, fanReels, layout, box, C, onWall,
  } = ctx;

  // 사진 더미: 모양을 잡아 쌓는다. 카드는 자기 모서리와 가장자리 아래에 있는 것 위에 놓인다.
  const cards = []; // stack order, bottom → top
  const pickables = [];
  const EXCL = [{ x: PROJ.x, z: PROJ.z, r: 0.42 }, { x: MUG.x, z: MUG.z, r: 0.18 }, { x: PHONE.x, z: PHONE.z, r: 0.26 }];
  const GAP = 0.0035, MAX_SLOPE = 0.32;
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
    let h = TABLE.top;
    for (const c of below) h = Math.max(h, surfaceAt(c, x, z) + GAP);
    return h;
  }
  const SAMPLES = [-1, 0, 1].flatMap(a => [-1, 0, 1].map(b => [a * 0.47, b * 0.47]));
  const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  function restPose(card, below) {
    const { x, z, yaw, faceUp } = card.userData.place, d = card.userData.d;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const pts = SAMPLES.map(([a, b]) => { const lx = a * d.w, lz = b * d.h; const dx = lx * cs + lz * sn, dz = -lx * sn + lz * cs; return { dx, dz, h: supportAt(x + dx, z + dz, below) }; });
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
  function clampPlace(p) {
    p.x = THREE.MathUtils.clamp(p.x, TABLE.x - TABLE.w / 2 + 0.18, TABLE.x + TABLE.w / 2 - 0.18);
    p.z = THREE.MathUtils.clamp(p.z, TABLE.z - TABLE.d / 2 + 0.18, TABLE.z + TABLE.d / 2 - 0.18);
    for (const e of EXCL) {
      const dx = p.x - e.x, dz = p.z - e.z, dd = Math.hypot(dx, dz);
      if (dd < e.r) { p.x = e.x + (dd ? dx / dd : 1) * e.r; p.z = e.z + (dd ? dz / dd : 0) * e.r; }
    }
    return p;
  }
  const inPile = c => c !== ctx.held && c !== ctx.loaded && c !== ctx.dragging;
  // recompute every resting pose bottom → top; cards whose support changed fall into place
  function settle(instant = false) {
    const placed = [];
    for (const c of cards) {
      if (!inPile(c)) continue;
      const prev = c.userData.home;
      c.userData.home = restPose(c, placed);
      placed.push(c);
      if (instant || !prev) { c.position.copy(c.userData.home.pos); c.quaternion.copy(c.userData.home.quat); c.userData.anim = null; continue; }
      const moved = prev.pos.distanceTo(c.userData.home.pos) > 0.002 || prev.quat.angleTo(c.userData.home.quat) > 0.01;
      if (moved && !c.userData.anim) startAnim(c, 'settle');
    }
  }
  function toTop(c) { cards.splice(cards.indexOf(c), 1); cards.push(c); }
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
    for (const m of [front, back]) { m.castShadow = m.receiveShadow = true; m.userData.card = card; pickables.push(m); }
    card.add(front, back);
    // img: the best picture the card has so far (a fan piece is its own drawing) · tier: that picture's tier, -1 before any lands · asked: tiers already requested
    Object.assign(card.userData, { reel, d, img: fan ? frontC : null, tier: -1, asked: [], front: tex, place: clampPlace({ x: TABLE.x + gauss() * 0.42, z: TABLE.z + gauss() * 0.28, yaw: rand() * Math.PI * 2, faceUp: rand() > 0.1 }) });
    cards.push(card); scene.add(card);
    return card;
  }
  function buildHeap() {
    const made = reels.map(reel => makeCard(reel));
    for (const p of fanReels) { const c = makeCard(p); c.userData.place.faceUp = true; }
    settle(true);
    ctx.requestPile(ctx.FAR);
    // 포스터: 가장 많이 본 쇼츠 셋. 각각 자기 카드의 그림으로 그려서, 그 카드의 단계가 오는 대로 채워지고 선명해진다.
    const top3 = made.filter(c => !c.userData.reel.wide).sort((a, b) => viewsNum(b.userData.reel.views) - viewsNum(a.userData.reel.views)).slice(0, 3);
    (layout.posters?.at || []).forEach((u, k) => {
      const card = top3[k];
      if (!card) return;
      const t = card.userData.poster = canvasTexture(makeCanvas(202, 360)); // 202 x 360 은 가까운 단계 그림의 크기
      paintPoster(card); ctx.request(card, ctx.NEAR);
      const g = new THREE.Group();
      box(0.74, 1.2, 0.05, flat(C.woodDark), 0, 0, 0.025, { cast: false, parent: g });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.07), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })); p.position.z = 0.055; g.add(p);
      onWall(layout.posters.wall, u, 2.5, 0, g);
    });
  }
  function paintPoster(card) {
    const { poster, img } = card.userData, W = poster.image.width, H = poster.image.height, g = poster.image.getContext('2d');
    if (img) drawFit(g, img, 0, 0, W, H, true); else { g.fillStyle = NO_PHOTO; g.fillRect(0, 0, W, H); }
    poster.needsUpdate = true;
  }

  Object.assign(ctx, {
    paintPoster, cards, settle, clampPlace, toTop, startAnim, makeCard, pickables, inPile, supportAt,
    restPose, stepAnim, buildHeap,
  });
}
