// 예전의 고정 소품을 가구(layout.items 의 손 가구)로 짓는다: 좌식 탁자, 휴대폰, 방명록, 스크린, 포스터, 창, 스노우 글로브.
// 꾸미는 사람이 넣고 빼고 옮긴다. 모양은 예전 고정 소품(props.js)의 치수 그대로다. 규칙은 docs/dev/heap-room-v2.md.
// 사진 더미(heap)는 furniture.js 가, 창의 벽 구멍과 햇빛은 shell.js 가 짓는다 (창 가구의 묶음은 비어 있다).
import * as THREE from 'three';
import { flat, makeCanvas, canvasTexture } from './draw.js';
import { tone, mark } from './palette.js';
import { makeChip } from './chip.js';
import { buildSnowGlobe, GLOBE_HEIGHT } from '../../snow-globe/model.js';

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
  // 탁자, 러그, 방석은 Kenney 모델(tableCoffee, rugRectangle, pillow)을 예전 치수의 상자에 맞춘 것이다 (furniture.js 의 fitModel).
  // 치수가 같아서 더미와 방석 자리(props.js)는 그대로다
  BUILD.lowTable = (g, it, build) => {
    // 러그는 예전처럼 종이 색 바탕에 포인트 색 테두리다: 바닥 널(나무색)과 구별된다
    ctx.fitModel(g, build, 'rugRectangle', { z: 0.15, y: 0.004, w: it.rug?.w ?? 3.8, h: 0.02, d: it.rug?.d ?? 2.9, rug: true, as: { carpet: 'carpetWhite', carpetDarker: 'carpet' } });
    ctx.fitModel(g, build, 'tableCoffee', { w: T.w, h: T.top, d: T.d });
    ctx.fitModel(g, build, 'pillow', { z: T.d / 2 + 0.5, w: 0.75, h: 0.1, d: 0.75, lay: true });
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.12, 8), tone(C, 'paper')); mug.position.set(1.05, T.top + 0.06, 0.6); mug.castShadow = true; g.add(mug);
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.052, 8), flat('#4a2f1e')); coffee.rotation.x = -Math.PI / 2; coffee.position.set(1.05, T.top + 0.115, 0.6); g.add(coffee);
    return { hw: T.w / 2 + 0.25, hd: T.d / 2 + 0.25 };
  };

  // 스노우 글로브: 따로 옮기는 소품. 높이 0.36 (세로 사진 0.3 보다 20% 크다), 집 앞(지역 +z)이 가구의 앞이다.
  // 누르면 글로브가 떠올라 화면 가운데로 오고 출처 목록이 뜬다 (panels.js 의 openSlot → globe.js, heap-room.tsx).
  // 글로브 모드는 방에 하나만 다룬다: 방에 글로브가 여럿이면 처음 지은 것을 쓰고, 나머지는 꾸밈만이다 (꾸미기는 하나까지만 놓게 한다)
  const GLOBE_SIZE = 0.36;
  BUILD.globe = (g, it, build) => {
    const unit = GLOBE_SIZE / GLOBE_HEIGHT, globe = buildSnowGlobe({ unit });
    globe.root.scale.setScalar(unit);
    g.add(globe.root);
    if (build.globe) return { hw: 0.17, hd: 0.17 };
    build.globe = { ...globe, unit, anchor: g }; // anchor: 글로브가 붙는 소품 묶음 (globe.js 가 띄웠다가 돌려 붙인다)
    tap(build, it, 'globe', globe.hitMeshes);
    return { hw: 0.17, hd: 0.17 };
  };

  // 휴대폰: 누르면 그 자리에서 휴대폰 화면(버블 링크)을 연다. 화면 위의 점이 깜박인다 (loop.js 가 ctx.phoneDots 를 본다)
  BUILD.phone = (g, it, build) => {
    const body = ctx.bevel(0.17, 0.018, 0.32, tone(C, 'ink', { roughness: 0.5 }), 0, 0.009, 0, { r: 0.007, receive: false, parent: g });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.145, 0.29), new THREE.MeshStandardMaterial({ color: '#efe6d6', emissive: '#f3d9b0', emissiveIntensity: 0.6 }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.0185;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 10), mark(new THREE.MeshBasicMaterial({ color: C.accent }), 'accent'));
    dot.rotation.x = -Math.PI / 2; dot.position.set(0.03, 0.019, -0.08);
    g.add(glow, dot);
    (build.phoneDots ??= []).push(dot);
    tap(build, it, 'phone', [body, glow, dot]);
    return { hw: 0.12, hd: 0.2 };
  };

  // 방명록: 펼친 공책과 펜. style "stand" 면 나무 받침째 바닥에 선다. 누르면 그 자리에서 방명록을 연다
  BUILD.guestbook = (g, it, build) => {
    const stand = it.style === 'stand', by = stand ? 0.78 : 0, parts = [];
    // 받침은 Kenney 협탁처럼 짓는다: 안으로 들어간 밑단, 깎은 몸통, 앞뒤로 조금 나온 윗판 (윗면 높이 0.78 은 그대로)
    if (stand) {
      parts.push(box(0.42, 0.06, 0.28, tone(C, 'woodDark'), 0, 0.03, 0, { parent: g }));
      parts.push(ctx.bevel(0.48, 0.68, 0.34, tone(C, 'woodB'), 0, 0.4, 0, { parent: g }));
      parts.push(ctx.bevel(0.52, 0.04, 0.38, tone(C, 'woodB'), 0, 0.76, 0.01, { r: 0.012, parent: g }));
    }
    const pageL = ctx.bevel(0.22, 0.025, 0.3, tone(C, 'paper'), -0.11, by + 0.02, 0.02, { r: 0.006, parent: g }), pageR = ctx.bevel(0.22, 0.025, 0.3, tone(C, 'paper'), 0.11, by + 0.02, 0.02, { r: 0.006, parent: g });
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
    ctx.bevel(0.26, 0.2, 0.36, tone(C, 'olive'), 0, 0.12, 0, { r: 0.025, parent: g });
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
    ctx.bevel(1.74, 1.04, 0.05, tone(C, 'olive'), 0, 0, 0.025, { r: 0.018, cast: false, parent: g });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), tone(C, 'paper')); s.position.z = 0.06; s.receiveShadow = true; g.add(s);
    return {};
  };
  BUILD.poster = (g, it, build) => {
    const k = build.items.filter(o => o.type === 'poster').indexOf(it);
    ctx.bevel(0.74, 1.2, 0.05, tone(C, 'woodDark'), 0, 0, 0.025, { r: 0.018, cast: false, parent: g });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.07), new THREE.MeshStandardMaterial({ map: ctx.posterTexAt(Math.max(0, k)), roughness: 0.6 }));
    p.position.z = 0.055; g.add(p);
    return {};
  };
  BUILD.window = () => ({}); // 벽 구멍, 창틀, 햇빛은 shell.js 가 layout.items 의 창 가구로 짓는다
}
