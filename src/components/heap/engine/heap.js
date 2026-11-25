// 사진 더미: 쌓이는 모양, 떨어지는 움직임, 카드, 벽 포스터.
import * as THREE from 'three';
import { viewsNum, hasThumb } from './format.js';
import { drawFit, NO_PHOTO, canvasTexture } from './draw.js';
import { tone } from './palette.js';
import { LOW_TABLE_GLOBE } from './fixtures.js';

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
  //   EXCL: 같은 받침 위에 선 다른 물건(휴대폰, 방명록, 좌식 탁자의 머그)은 카드가 비켜 간다
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
      const G = LOW_TABLE_GLOBE; EXCL.push({ x: lowT.x + Math.cos(a) * G.x + Math.sin(a) * G.z, z: lowT.z - Math.sin(a) * G.x + Math.cos(a) * G.z, r: G.r }); } // 머그와 스노우 글로브 (fixtures.js)
    BOX = HOST.box ? { x: HOST.x, z: HOST.z, ...BOX_IN, w: HOST.boxW, d: HOST.boxD, floor: HOST.top + BOX_IN.base } : null;
    BASE = BOX ? BOX.floor : HOST.top;
    PM = Math.min(0.18, HOST.w * 0.15, HOST.d * 0.15); SX = Math.min(0.42, HOST.w * 0.16); SZ = Math.min(0.28, HOST.d * 0.155);
  }
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
  function clampPlace(p, d = DIMS.tall) {
    if (BOX) { // 돌린 카드의 반폭이 벽 안에 들도록 가운데를 가둔다. 상자보다 크면 가운데에 둔다
      const c = Math.abs(Math.cos(p.yaw ?? 0)), s = Math.abs(Math.sin(p.yaw ?? 0));
      const hx = Math.max(0, BOX.w / 2 - (c * d.w + s * d.h) / 2 - 0.004), hz = Math.max(0, BOX.d / 2 - (s * d.w + c * d.h) / 2 - 0.004);
      p.x = THREE.MathUtils.clamp(p.x, BOX.x - hx, BOX.x + hx);
      p.z = THREE.MathUtils.clamp(p.z, BOX.z - hz, BOX.z + hz);
      return p;
    }
    p.x = THREE.MathUtils.clamp(p.x, HOST.x - HOST.w / 2 + PM, HOST.x + HOST.w / 2 - PM);
    p.z = THREE.MathUtils.clamp(p.z, HOST.z - HOST.d / 2 + PM, HOST.z + HOST.d / 2 - PM);
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
  function buildHeap() {
    if (BOX) buildBox();
    const made = reels.map(reel => makeCard(reel));
    for (const p of fanReels) { const c = makeCard(p); c.userData.place.faceUp = true; }
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
