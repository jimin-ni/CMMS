// 예전의 고정 소품을 가구(layout.items 의 손 가구)로 짓는다: 좌식 탁자, 휴대폰, 방명록, 스크린, 포스터, 창.
// 꾸미는 사람이 넣고 빼고 옮긴다. 모양은 예전 고정 소품(props.js)의 치수 그대로다. 규칙은 docs/dev/heap-room-v2.md.
// 사진 더미(heap)는 furniture.js 가, 창의 벽 구멍과 햇빛은 shell.js 가 짓는다 (창 가구의 묶음은 비어 있다).
import * as THREE from 'three';
import { flat, makeCanvas, canvasTexture } from './draw.js';
import { tone, mark } from './palette.js';
import { makeChip } from './chip.js';
import { buildSnowGlobe, GLOBE_HEIGHT } from '../../snow-globe/model.js';

// 좌식 탁자 위 스노우 글로브의 지역 자리: 사진 더미 뒤, 탁자 가운데 쪽. 사진 더미(heap.js)는 반지름 r 안을 비켜 간다.
// 정면(집 앞, 지역 +z)은 탁자 앞 방석(지역 (0, 1.4), props.js 의 SEAT)을 본다: 더미를 보는 사람에게 정면이 보인다
export const LOW_TABLE_GLOBE = { x: 0.45, z: -0.6, r: 0.24 };

export function setupFixtures(ctx) {
  const { BUILD, C, box } = ctx;

  // 바로 동작하는 가구(휴대폰, 방명록): 메시를 누르면 panels.js 의 openSlot 이 kind 로 연다. 서버의 기능(fn)과는 상관없는 엔진 안의 표시다
  const tap = (build, it, kind, meshes) => {
    const slot = { it, fn: { kind } };
    for (const m of meshes) { m.userData.slot = slot; build.slotMeshes.push(m); }
  };

  // 포스터 그림: k 번째 포스터 가구(목록 순서)의 텍스처. heap.js 가 가장 많이 본 쇼츠의 그림을 칠한다 (paintPosters).
  // 가구를 다시 지어도 같은 텍스처를 쓰므로 그림이 남는다 (재질과 함께 dispose 되어도 three 가 다음 그릴 때 다시 올린다)
  ctx.posterTex = [];
  ctx.posterTexAt = k => (ctx.posterTex[k] ??= canvasTexture(makeCanvas(202, 360))); // 202 x 360 은 가까운 단계 그림의 크기

  // 좌식 탁자: 윗판 2.6 x 1.8, 높이 0.56. 러그(rug: { w, d }, 없으면 3.8 x 2.9), 앞쪽 방석, 머그를 함께 둔다.
  // 이 탁자 위의 사진 더미는 방석에 앉아 본다 (props.js)
  const T = { w: 2.6, d: 1.8, top: 0.56 };
  const GLOBE_SIZE = 0.36, GLOBE_AT = LOW_TABLE_GLOBE;
  BUILD.lowTable = (g, it, build) => {
    const rugC = makeCanvas(256, 192), rugTex = canvasTexture(rugC);
    const paintRug = () => {
      const r = rugC.getContext('2d'); r.fillStyle = C.paper; r.fillRect(0, 0, 256, 192);
      [[C.accent, 14, 16], [C.olive, 40, 6], [C.accent, 150, 10], [C.olive, 168, 4]].forEach(([c, y, h]) => { r.fillStyle = c; r.fillRect(0, y, 256, h); });
      for (let i = 0; i < 2000; i++) { r.fillStyle = `rgba(80,60,40,${ctx.irand() * 0.06})`; r.fillRect(ctx.irand() * 256, ctx.irand() * 192, 2, 1); }
      rugTex.needsUpdate = true;
    };
    paintRug();
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(it.rug?.w ?? 3.8, it.rug?.d ?? 2.9), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
    rug.material.userData.repaint = paintRug;
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.006, 0.15); rug.receiveShadow = true; g.add(rug); build.rugMeshes.push(rug);
    box(T.w, 0.08, T.d, tone(C, 'woodB'), 0, T.top - 0.04, 0, { parent: g });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.12, T.top - 0.08, 0.12, tone(C, 'woodDark'), sx * (T.w / 2 - 0.15), (T.top - 0.08) / 2, sz * (T.d / 2 - 0.15), { parent: g });
    box(0.75, 0.1, 0.75, tone(C, 'accent'), 0, 0.05, T.d / 2 + 0.5, { cast: false, parent: g });
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.12, 8), tone(C, 'paper')); mug.position.set(1.05, T.top + 0.06, 0.6); mug.castShadow = true; g.add(mug);
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.052, 8), flat('#4a2f1e')); coffee.rotation.x = -Math.PI / 2; coffee.position.set(1.05, T.top + 0.115, 0.6); g.add(coffee);
    // 사진 더미가 놓인 탁자에는 더미 뒤에 스노우 글로브를 둔다. 높이는 세로 사진(0.3)보다 20% 크다.
    // 누르면 글로브가 떠올라 화면 가운데로 온다 (panels.js 의 openSlot → globe.js). 더미는 이 자리를 비켜 간다 (heap.js)
    if (build.items.some(o => o.type === 'heap' && Math.abs(o.x - it.x) < 1.3 && Math.abs(o.z - it.z) < 0.9 && Math.abs((o.y || 0) - T.top) < 0.03)) {
      const unit = GLOBE_SIZE / GLOBE_HEIGHT, globe = buildSnowGlobe({ unit });
      globe.root.scale.setScalar(unit); globe.root.position.set(GLOBE_AT.x, T.top, GLOBE_AT.z);
      globe.root.rotation.y = Math.atan2(0 - GLOBE_AT.x, 1.4 - GLOBE_AT.z); // 집 앞(지역 +z)이 방석을 본다
      g.add(globe.root);
      build.globe = { ...globe, unit, anchor: g }; // anchor: 글로브가 붙는 탁자 묶음 (globe.js 가 띄웠다가 돌려 붙인다)
      tap(build, it, 'globe', globe.hitMeshes);
    }
    return { hw: T.w / 2 + 0.25, hd: T.d / 2 + 0.25 };
  };

  // 휴대폰: 누르면 그 자리에서 휴대폰 화면(버블 링크)을 연다. 화면 위의 점이 깜박인다 (loop.js 가 ctx.phoneDots 를 본다)
  BUILD.phone = (g, it, build) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.018, 0.32), tone(C, 'ink', { roughness: 0.5 }));
    body.position.y = 0.009; body.castShadow = true;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.145, 0.29), new THREE.MeshStandardMaterial({ color: '#efe6d6', emissive: '#f3d9b0', emissiveIntensity: 0.6 }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.0185;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 10), mark(new THREE.MeshBasicMaterial({ color: C.accent }), 'accent'));
    dot.rotation.x = -Math.PI / 2; dot.position.set(0.03, 0.019, -0.08);
    g.add(body, glow, dot);
    (build.phoneDots ??= []).push(dot);
    tap(build, it, 'phone', [body, glow, dot]);
    return { hw: 0.12, hd: 0.2 };
  };

  // 방명록: 펼친 공책과 펜. style "stand" 면 나무 받침째 바닥에 선다. 누르면 그 자리에서 방명록을 연다
  BUILD.guestbook = (g, it, build) => {
    const stand = it.style === 'stand', by = stand ? 0.78 : 0, parts = [];
    if (stand) parts.push(box(0.5, 0.78, 0.36, tone(C, 'woodB'), 0, 0.39, 0, { parent: g }));
    const pageL = box(0.22, 0.02, 0.3, tone(C, 'paper'), -0.11, by + 0.02, 0.02, { parent: g }), pageR = box(0.22, 0.02, 0.3, tone(C, 'paper'), 0.11, by + 0.02, 0.02, { parent: g });
    pageL.rotation.z = 0.12; pageR.rotation.z = -0.12;
    const pen = box(0.015, 0.015, 0.16, tone(C, 'accent'), 0.14, by + 0.05, 0.02, { parent: g }); pen.rotation.y = 0.5;
    parts.push(pageL, pageR, pen);
    // "새 방명록 N": 방 주인에게만, 아직 보지 않은 이름이 있을 때 공책 위에 뜬다 (live.js 가 칠하고 숨긴다). 누르면 방명록을 연다
    const chip = makeChip(C.ink); chip.sp.position.y = by + 0.5; g.add(chip.sp); parts.push(chip.sp);
    (build.gbChips ??= []).push(chip);
    ctx.paintGbChips?.();
    tap(build, it, 'guestbook', parts);
    return stand ? { hw: 0.32, hd: 0.25 } : { hw: 0.25, hd: 0.18 };
  };

  // 영사기: 예전 고정 소품의 모양 그대로 (몸통, 렌즈, 받침, 두 릴과 팔). 꾸밈만이고 누르기도 받지 않는다. 렌즈는 지역 -z 를 본다
  BUILD.projector = g => {
    const metal = flat('#3f3d32', { roughness: 0.55, metalness: 0.3 });
    box(0.26, 0.2, 0.36, tone(C, 'olive'), 0, 0.12, 0, { parent: g });
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 10), metal); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.13, -0.23);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), flat('#5b5a4a')); glass.position.set(0, 0.13, -0.291); glass.rotation.y = Math.PI;
    box(0.22, 0.03, 0.3, metal, 0, 0.015, 0, { parent: g });
    const reelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.025, 12);
    for (const z of [-0.1, 0.1]) {
      const reel = new THREE.Mesh(reelGeo, tone(C, 'accent')); reel.rotation.z = Math.PI / 2; reel.position.set(0, 0.33, z); reel.castShadow = true; g.add(reel);
    }
    box(0.03, 0.12, 0.3, metal, 0, 0.26, 0, { parent: g });
    lens.castShadow = true; g.add(lens, glass);
    return { hw: 0.15, hd: 0.21 };
  };

  // 벽 가구: 묶음은 벽 선 위(x, z)에 있고 y 는 가운데 높이다. 지역 +z 가 방 안쪽이다 (뒷벽 rot 0, 왼쪽 벽 rot 90)
  BUILD.screen = g => {
    box(1.74, 1.04, 0.05, tone(C, 'olive'), 0, 0, 0.025, { cast: false, parent: g });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), tone(C, 'paper')); s.position.z = 0.06; s.receiveShadow = true; g.add(s);
    return {};
  };
  BUILD.poster = (g, it, build) => {
    const k = build.items.filter(o => o.type === 'poster').indexOf(it);
    box(0.74, 1.2, 0.05, tone(C, 'woodDark'), 0, 0, 0.025, { cast: false, parent: g });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.07), new THREE.MeshStandardMaterial({ map: ctx.posterTexAt(Math.max(0, k)), roughness: 0.6 }));
    p.position.z = 0.055; g.add(p);
    return {};
  };
  BUILD.window = () => ({}); // 벽 구멍, 창틀, 햇빛은 shell.js 가 layout.items 의 창 가구로 짓는다
}
