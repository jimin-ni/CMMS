// layout.items 로 짓는 가구와 램프, 앉는 자리.
import * as THREE from 'three';
import { disposeScene, mulberry32 } from './util.js';
import { flat, makeCanvas, canvasTexture } from './draw.js';
import { tone, mark } from './palette.js';

export function setupFurniture(ctx) {
  const { rand, C, box, ALBUMS, scene } = ctx;

  // layout.items 로 가구를 짓는다 (각 builder 는 지역 좌표에서 일한다: 앞이 +z).
  // 항목에서 만든 것은 모두 한 그룹에 둔다. buildItems(items) 는 그 그룹을 치우고 새로 지으므로, 다시 마운트하지 않고도 가구가 바뀐다.
  // 벽, 바닥, 탁자, 더미는 여기 속하지 않는다.
  // OBST: 고정된 걷기 장애물 (탁자가 먼저, 그다음 방명록 받침대). 가구마다 자기 장애물은 build.obst 에 있다.
  const OBST = [], shelfParts = [];
  ctx.shelf = null;
  // shadeNow: a lamp shade's glow at the current hour (section 4b sets it) · irand: where the builders draw their random numbers
  ctx.shadeNow = 0.9; ctx.irand = rand;
  // 램프: 손으로 만든 램프와 카탈로그 category 가 "lamp" 인 모델. 각각 자기 build 의 lamps 에 { light, shades } 를 더한다:
  // 갓 안의 PointLight(없으면 null)와 갓의 재질들. time.js 가 갓의 빛남을, frame() 이 불빛의 세기를 정하므로 방의 램프는
  // 모두 같은 시각을 따라간다.
  // 불빛은 MAX_LAMP_LIGHTS 개의 램프만 갖는다: 손으로 만든 것이 먼저, 그다음 램프 모델, 각각 목록 순서대로. 그 뒤의 램프는 빛나기만 하고 비추지 않는다.
  const MAX_LAMP_LIGHTS = 3, LAMP_GLOW = '#ffb767';
  ctx.catalogue = null; // 읽은 뒤의 catalogue.json (models.js 의 getCatalogue)
  // item.lit: 주인의 스위치. 없거나 true 면 켜짐이고, 램프는 전처럼 시계를 따른다 (저녁부터 아침까지 빛나고 비춘다).
  // false 면 계속 꺼짐: 불빛도, 빛남도 없고 MAX_LAMP_LIGHTS 몫도 차지하지 않는다.
  const isLampModel = it => it.type === 'model' && ctx.catalogue?.models?.find(m => m.id === it.model)?.category === 'lamp';
  const isLit = o => o.lit !== false;
  function lampLight(build, it) {
    if (!isLit(it)) return null;
    const hand = build.items.filter(o => o.type === 'lamp' && isLit(o));
    const rank = it.type === 'lamp' ? hand.indexOf(it) : hand.length + build.items.filter(o => isLampModel(o) && isLit(o)).indexOf(it);
    return rank < MAX_LAMP_LIGHTS ? new THREE.PointLight(0xffb86b, 3.2, 9, 1.2) : null;
  }
  // 책 색: 포인트, 올리브, 고정된 넷 (palette.js 의 'book:i')
  function pottedPlant(parent, x, z, y, s) {
    box(0.36 * s, 0.34 * s, 0.36 * s, tone(C, 'accent'), x, y + 0.17 * s, z, { parent });
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 * s, 0), tone(C, ['leaf', 'leaf2', 'leafDark'][i % 3]));
      const a = i * 1.26;
      leaf.position.set(x + Math.cos(a) * 0.14 * s, y + (0.45 + ctx.irand() * 0.25) * s, z + Math.sin(a) * 0.14 * s);
      leaf.scale.set(1, 1.5, 0.6); leaf.rotation.set(ctx.irand(), a, ctx.irand() * 0.5); leaf.castShadow = true; parent.add(leaf);
    }
  }
  const BUILD = {
    bed(g) {
      box(2.8, 0.3, 1.4, tone(C, 'woodB'), 0, 0.15, 0, { parent: g });
      box(2.7, 0.18, 1.3, tone(C, 'paper'), 0, 0.39, 0, { parent: g });
      box(1.6, 0.06, 1.36, tone(C, 'accent'), 0.45, 0.5, 0, { parent: g });
      box(0.6, 0.16, 0.45, flat('#f7f1e6'), -1.0, 0.56, 0, { parent: g });
      return { hw: 1.6, hd: 0.95 };
    },
    shelf(g, it, build) {
      const wood = tone(C, 'woodDark'), add = m => { shelfParts.push(m); return m; };
      add(box(1.6, 2.2, 0.12, wood, 0, 1.1, -0.22, { parent: g }));
      for (const sx of [-0.77, 0.77]) add(box(0.06, 2.2, 0.5, wood, sx, 1.1, 0, { parent: g }));
      for (let s = 0; s < 3; s++) {
        add(box(1.6, 0.05, 0.5, wood, 0, 0.27 + s * 0.7, 0, { parent: g }));
        if (s === 1) continue;
        for (let b = 0; b < 6; b++) { const h = 0.35 + ctx.irand() * 0.15; add(box(0.16, h, 0.3, tone(C, `book:${s * 6 + b}`), 0.6 - b * 0.22, 0.3 + s * 0.7 + h / 2, 0.02, { parent: g })); }
      }
      add(box(1.6, 0.05, 0.5, wood, 0, 2.2, 0, { parent: g }));
      pottedPlant(g, 0, 0, 2.22, 0.7);
      if (it.fn?.kind === 'keepsake') ctx.keepsakeObject(g, it, build, 'standee', 0.52, 2.225, 0.06); // 선반 위의 기념품
      ctx.shelf = { group: g, albums: [] };
      ALBUMS.forEach((a, i) => {
        const lx = -0.57 + i * 0.38;
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.52, 0.36), flat(a.color));
        m.position.set(lx, 0.995 + 0.26, 0); m.castShadow = m.receiveShadow = true; m.userData.album = a.key;
        const lc = makeCanvas(96, 360);
        const lt = canvasTexture(lc);
        const label = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.41), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.9 }));
        label.material.userData.repaint = () => ctx.updateAlbums(); // 이름표는 종이, 잉크, 포인트 색으로 그린다 (shelf.js)
        label.position.set(lx, 0.995 + 0.26, 0.181); label.userData.album = a.key;
        g.add(m, label); add(m); add(label);
        ctx.shelf.albums.push({ ...a, mesh: m, label, lc, lt });
      });
      return { hw: 0.85, hd: 0.55 };
    },
    plant(g, it) { const s = it.size || 1; pottedPlant(g, 0, 0, 0, s); return { hw: 0.44 * s, hd: 0.44 * s }; },
    snake(g) {
      box(0.34, 0.4, 0.34, tone(C, 'olive'), 0, 0.2, 0, { parent: g });
      for (let i = 0; i < 6; i++) { const b = box(0.07, 0.8 + ctx.irand() * 0.5, 0.03, tone(C, ['leaf', 'leafDark'][i % 2]), (ctx.irand() - 0.5) * 0.2, 0.75, (ctx.irand() - 0.5) * 0.2, { parent: g }); b.rotation.set((ctx.irand() - 0.5) * 0.3, ctx.irand() * 3, (ctx.irand() - 0.5) * 0.3); }
      return { hw: 0.4, hd: 0.4 };
    },
    lamp(g, it, build) {
      box(0.3, 0.04, 0.3, tone(C, 'olive'), 0, 0.02, 0, { parent: g });
      box(0.04, 1.7, 0.04, tone(C, 'olive'), 0, 0.87, 0, { parent: g });
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.3, 8, 1, true), new THREE.MeshStandardMaterial({ color: '#f6dcb2', emissive: LAMP_GLOW, emissiveIntensity: isLit(it) ? ctx.shadeNow : 0, side: THREE.DoubleSide, flatShading: true }));
      shade.position.y = 1.8; g.add(shade);
      const light = lampLight(build, it);
      if (light) { light.position.y = 1.72; g.add(light); }
      build.lamps.push({ light, shades: [shade.material], off: !isLit(it) });
      return { hw: 0.35, hd: 0.35 };
    },
    books(g) {
      for (let i = 0; i < 4; i++) { const b = box(0.42, 0.08, 0.3, tone(C, `book:${i + 2}`), 0, 0.04 + i * 0.08, 0, { parent: g }); b.rotation.y = (ctx.irand() - 0.5) * 0.5; }
      return { hw: 0.45, hd: 0.4 };
    },
  };

  BUILD.model = (g, it, build) => {
    ctx.loadModel(it.model).then(m => {
      if (!m || ctx.disposed || build !== ctx.build) return; // 읽기에 실패했거나, 읽는 동안 가구가 바뀌었다
      const inst = m.root.clone(), rug = m.entry.category === 'rug', lamp = m.entry.category === 'lamp', own = new Map(), shades = [];
      inst.traverse(o => {
        if (!o.isMesh) return;
        const col = it.tint !== false && ctx.TINT[o.material.name], glow = lamp && o.material.name === 'lamp';
        if (col || glow) { // 이 가구만의 재질 복사본: 물들이고 (램프 갓은) 빛나게 한다. 캐시에 있는 원본은 파일 그대로 둔다
          if (!own.has(o.material)) {
            const c = o.material.clone();
            if (col) { c.color.set(col); mark(c, 'tint:' + o.material.name); } // 팔레트가 바뀌면 recolour.js 가 이름으로 다시 칠한다
            if (glow) { c.emissive.set(LAMP_GLOW); c.emissiveIntensity = isLit(it) ? ctx.shadeNow : 0; }
            own.set(o.material, c);
          }
          o.material = own.get(o.material);
          if (glow) shades.push(o);
        }
        o.castShadow = !rug && !o.material.transparent; o.receiveShadow = true;
      });
      const hold = new THREE.Group();
      hold.scale.setScalar(ctx.scaleOf(m.entry)); hold.position.y = (it.y || 0) + (rug ? 0.012 : 0); // 러그는 바닥 바로 위에 눕혀 둘이 깜박이지 않게 한다
      hold.add(inst); g.add(hold);
      if (it.fn?.kind === 'keepsake') ctx.keepsakeObject(g, it, build, 'standee', 0, (it.y || 0) + m.size.y, 0); // 선반 같은 가구 위에
      else if (it.fn && ['pc', 'music', 'latest'].includes(it.fn.kind)) { // 모델 전체가 버튼이다. 기능이 달린 TV 는 그려 넣은 화면도 갖는다
        const slot = { it, fn: it.fn };
        inst.traverse(o => { if (o.isMesh) { o.userData.slot = slot; build.slotMeshes.push(o); } });
        build.slots.push(slot);
        if (m.entry.screen && it.fn.kind !== 'pc') ctx.tvScreen(inst, build, slot, m.entry.screen);
      }
      const seatRule = ctx.catalogue?.seats?.[m.entry.category];
      if (seatRule) addSeats(build, g, it, m, seatRule, inst);
      if (shades.length) { // 빛은 갓의 가운데에 둔다: 갓의 삼각형이 쓰는 꼭짓점을 감싸는 상자의 가운데
        const light = lampLight(build, it), bb = new THREE.Box3(), v = new THREE.Vector3(); // (한 모델의 메시들은 꼭짓점 버퍼 하나를 나눠 쓴다)
        if (light) {
          g.updateMatrixWorld(true);
          for (const o of shades) {
            const pos = o.geometry.getAttribute('position'), idx = o.geometry.index;
            for (let i = 0, n = idx ? idx.count : pos.count; i < n; i++) bb.expandByPoint(v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(o.matrixWorld));
          }
          g.add(light); g.worldToLocal(bb.getCenter(light.position));
        }
        build.lamps.push({ light, shades: [...new Set(shades.map(o => o.material))], off: !isLit(it) });
      }
      if (rug || it.y) return; // 러그는 밟고 지나간다. 다른 가구 위에 선 물건은 자기 장애물을 더하지 않는다
      const swap = Math.round((it.rot || 0) / 90) % 2 !== 0, hw = m.size.x / 2 + 0.2, hd = m.size.z / 2 + 0.2;
      // hw, hd: the walk box (the model's half size and 0.2 more) · rhw, rhd: the model's own half size · owner: the item, so its own seat can tell which box is its
      build.obst.push({ x: it.x, z: it.z, hw: swap ? hd : hw, hd: swap ? hw : hd, rhw: (swap ? m.size.z : m.size.x) / 2, rhd: (swap ? m.size.x : m.size.z) / 2, owner: it });
    });
    return {};
  };

  // 앉는 자리: 방문자(나중에는 팬의 유령)가 앉을 수 있는 점. 모델의 바닥 크기와 카탈로그의 `seats` 규칙(의자, 소파, 러그)에서 계산한다.
  // 레이아웃에는 저장하지 않는다. 모델의 `seatY`(파일 단위)는 규칙의 `top` 비율이 맞지 않을 때 그 비율을 대신한다.
  // 자리마다 { id, kind: 'chair' | 'sofa' | 'floor', item, pos(월드: 앉는 면), yaw(앉은 사람이 보는 쪽, 라디안),
  //   stands(자리에 들어설 수 있는 바닥의 점: 앞, 뒤, 왼쪽, 오른쪽. 러그 자리는 자기 점에서 들어선다) }.
  // sitOn(walk.js)은 장애물을 돌아 걸어갈 수 있는 stand 를 고르고, 가운데가 다른 가구나 사진 탁자 안에 있는 자리는 거절한다.
  // build.seats 가 모두를 담고, 자리의 메시마다 userData.seats 에 그 가구의 자리들이 달린다.
  function addSeats(build, g, it, m, rule, inst) {
    g.updateMatrixWorld(true);
    const w = m.size.x, d = m.size.z, floor = !!rule.floor;
    const top = (it.y || 0) + (floor ? 0.012 : 0) + (m.entry.seatY != null ? m.entry.seatY * ctx.scaleOf(m.entry) : m.size.y * rule.top);
    const kx = floor ? Math.max(1, Math.floor(w)) : rule.per ? Math.max(1, Math.round(w / rule.per)) : 1, kz = floor ? Math.max(1, Math.floor(d)) : 1;
    const kind = floor ? 'floor' : rule.per ? 'sofa' : 'chair', yaw = THREE.MathUtils.degToRad(it.rot || 0), index = build.items.indexOf(it), seats = [];
    for (let i = 0; i < kx; i++) for (let j = 0; j < kz; j++) {
      const lx = (i + 0.5) / kx * w - w / 2, lz = (j + 0.5) / kz * d - d / 2;
      const pos = g.localToWorld(new THREE.Vector3(lx, 0, lz)).setY(top);
      const at = (x, z) => g.localToWorld(new THREE.Vector3(x, 0, z)).setY(0), gap = 0.55;
      const stands = floor ? [pos.clone().setY(0)] : [at(lx, d / 2 + gap), at(lx, -d / 2 - gap), at(-w / 2 - gap, lz), at(w / 2 + gap, lz)];
      seats.push({ id: `${index}:${i}${j}`, kind, item: it, pos, yaw, stands });
    }
    build.seats.push(...seats);
    inst.traverse(o => { if (o.isMesh) { o.userData.seats = seats; build.seatMeshes.push(o); } });
  }

  // ITEMS: what the last buildItems() made. group: every object built from the items · obst: their walk obstacles · items: the list itself
  //   lamps: 이 build 의 램프들, 각각 { light, shades, off } (위의 MAX_LAMP_LIGHTS 참고)
  //   slots: its functions, { it, fn, start? } each · slotMeshes: the meshes a click can hit, each with userData.slot (see the slots section above)
  //   seats / seatMeshes: addSeats 참고
  //   loads: 이 build 가 아직 기다리는 기념품 썸네일 (다음 build 가 바꿀 때 취소한다)
  ctx.build = { group: null, groups: [], obst: [], items: [], lamps: [], slots: [], slotMeshes: [], seats: [], seatMeshes: [], loads: new Set() };
  function buildItems(items, first = false) {
    if (ctx.build.group) { for (const l of ctx.build.lamps) l.light?.dispose(); scene.remove(ctx.build.group); disposeScene(ctx.build.group, ctx.KEPT); }
    shelfParts.length = 0; ctx.shelf = null;
    if (ctx.build.loads.size) ctx.cancelThumbs(ctx.build.loads); // 바뀐 가구가 아직 받던 썸네일은 여기서 멈춘다
    // groups[i]: items[i] 로 지은 그룹 (userData.itemIndex = i). 꾸미기(edit.js)가 메시에서 가구를 찾고, 끄는 동안 이 그룹만 옮긴다.
    const build = ctx.build = { group: new THREE.Group(), groups: [], obst: [], items, lamps: [], slots: [], slotMeshes: [], seats: [], seatMeshes: [], loads: new Set() };
    scene.add(build.group);
    items.forEach((it, i) => {
      // 첫 빌드는 방이 늘 써 온 공용 난수 수열을 쓴다. 다시 지을 때는 목록 순서로 가구마다 시드를 주므로
      // 그 수열은 건드리지 않고, 가구는 다시 지어도 모습이 같다.
      ctx.irand = first ? rand : mulberry32(7919 * (i + 1));
      const g = new THREE.Group(), rot = THREE.MathUtils.degToRad(it.rot || 0);
      const fp = BUILD[it.type]?.(g, it, build); if (!fp) return;
      g.position.set(it.x, 0, it.z); g.rotation.y = rot; g.userData.itemIndex = i; build.groups[i] = g; build.group.add(g); g.updateMatrixWorld(true);
      if (!fp.hw) return; // 모델은 읽힌 뒤에 자기 장애물을 더한다
      const swap = Math.round((it.rot || 0) / 90) % 2 !== 0;
      const ohw = swap ? fp.hd : fp.hw, ohd = swap ? fp.hw : fp.hd;
      build.obst.push({ x: it.x, z: it.z, hw: ohw, hd: ohd, rhw: Math.max(0.1, ohw - 0.2), rhd: Math.max(0.1, ohd - 0.2), owner: it });
    });
  }

  Object.assign(ctx, { BUILD, buildItems, OBST, shelfParts });
}
