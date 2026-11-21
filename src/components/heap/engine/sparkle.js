// 누를 수 있는 물건 바로 위에서 작은 빛이 반짝인다: 기능 가구(휴대폰, 방명록, PC, 트리 같은 slot), 책장, 문, 탁자의 사진 더미.
// 온보딩 둘러보기(onboarding-c/room-tour.tsx)가 켜고 끈다. 보내지 않으면 아무것도 보이지 않는다: 보통 방은 그대로다.
//   root.dispatchEvent(new CustomEvent('heap:sparkle', { detail: true | false }))
// 걷는 방 모드에서 창이 닫혀 있을 때만 보인다. 가구 모델은 늦게 읽히고 꾸미기가 가구를 다시 지으므로, 자리는 1초마다 다시 잰다.
import * as THREE from 'three';
import { makeCanvas, canvasTexture } from './draw.js';

const LIFT = 0.22; // 물건 윗면에서 빛까지의 높이 (m)
const SIZE = 0.2; // 빛의 크기 (m)

// 네 갈래 별과 둥근 번짐
function starTexture() {
  const n = 64, c = makeCanvas(n, n), g = c.getContext('2d'), h = n / 2;
  const glow = g.createRadialGradient(h, h, 0, h, h, h);
  glow.addColorStop(0, 'rgba(255,248,220,0.9)'); glow.addColorStop(0.25, 'rgba(255,226,160,0.35)'); glow.addColorStop(1, 'rgba(255,210,140,0)');
  g.fillStyle = glow; g.fillRect(0, 0, n, n);
  g.fillStyle = 'rgba(255,252,236,1)';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 3 : h - 2, a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(h + Math.cos(a) * r, h + Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  return canvasTexture(c);
}

export function setupSparkle(ctx) {
  const { scene, root, on, onDispose } = ctx;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tex = starTexture();
  const sprites = []; // 물건 하나에 하나. 수가 줄면 남는 것은 숨긴다
  let enabled = false, clock = 1, t = 0;

  function sprite(i) {
    if (sprites[i]) return sprites[i];
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.renderOrder = 3; s.userData.phase = i * 1.7;
    scene.add(s); sprites[i] = s;
    return s;
  }
  onDispose(() => { for (const s of sprites) { scene.remove(s); s.material.dispose(); } tex.dispose(); });

  // 누를 수 있는 물건마다 메시 묶음 하나
  function targets() {
    const out = [], b = ctx.build, bySlot = new Map();
    for (const m of b?.slotMeshes ?? []) {
      const s = m.userData.slot;
      if (!bySlot.has(s)) bySlot.set(s, []);
      bySlot.get(s).push(m);
    }
    out.push(...bySlot.values());
    if (ctx.shelfParts?.length) out.push(ctx.shelfParts);
    if (ctx.doorParts?.length) out.push(ctx.doorParts);
    const pile = (ctx.cards ?? []).filter(c => c.visible);
    if (pile.length) out.push(pile);
    else if (ctx.heapBoxParts?.length) out.push(ctx.heapBoxParts);
    return out;
  }
  const box = new THREE.Box3(), mid = new THREE.Vector3();
  function place() {
    let n = 0;
    for (const meshes of targets()) {
      box.makeEmpty();
      for (const m of meshes) if (m.visible !== false) box.expandByObject(m);
      if (box.isEmpty()) continue;
      box.getCenter(mid);
      sprite(n++).position.set(mid.x, box.max.y + LIFT, mid.z);
    }
    for (let i = 0; i < sprites.length; i++) sprites[i].userData.live = i < n;
  }

  // 프레임마다 (loop.js)
  ctx.sparkleStep = dt => {
    const show = enabled && ctx.mode === 'room' && !ctx.anyOverlay?.();
    if (show && (clock += dt) > 1) { clock = 0; place(); }
    t += dt;
    for (const s of sprites) {
      s.visible = show && !!s.userData.live;
      if (!s.visible) continue;
      // 천천히 반짝이며 돈다. 줄인 움직임에서는 가만히 빛난다
      const k = reduced ? 1 : 0.55 + 0.45 * Math.sin(t * 2.6 + s.userData.phase);
      s.scale.setScalar(SIZE * (0.7 + 0.3 * k));
      s.material.opacity = 0.35 + 0.65 * k;
      s.material.rotation = reduced ? 0 : t * 0.6 + s.userData.phase;
    }
  };

  on(root, 'heap:sparkle', e => { enabled = e.detail === true; clock = 1; });
}
