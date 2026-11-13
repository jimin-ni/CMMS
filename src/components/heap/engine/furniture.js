// layout.items 로 짓는 가구와 램프, 앉는 자리.
import * as THREE from 'three';
import { disposeScene, mulberry32 } from './util.js';
import { flat, makeCanvas, canvasTexture } from './draw.js';

export function setupFurniture(ctx) {
  const { rand, C, box, ALBUMS, scene } = ctx;

  // layout.items 로 가구를 짓는다 (각 builder 는 지역 좌표에서 일한다: 앞이 +z).
  // 항목에서 만든 것은 모두 한 그룹에 둔다. buildItems(items) 는 그 그룹을 치우고 새로 지으므로, 다시 마운트하지 않고도 가구가 바뀐다.
  // 벽, 바닥, 탁자, 더미는 여기 속하지 않는다.
  // OBST: the fixed walk obstacles (the table first, then the guestbook stand). Each item's own obstacle is in ITEMS.obst.
  const OBST = [], shelfParts = [];
  ctx.shelf = null;
  // shadeNow: a lamp shade's glow at the current hour (section 4b sets it) · irand: where the builders draw their random numbers
  ctx.shadeNow = 0.9; ctx.irand = rand;
  // Lamps: the hand-built lamp and any model whose catalogue category is "lamp". Each adds { light, shades } to its build's lamps:
  // a PointLight inside the shade (or null) and the shade's materials. Section 4b sets every shade's glow and frame() every light's
  // intensity, so all the lamps in a room follow the hour together.
  // Only MAX_LAMP_LIGHTS lamps get a light: the hand-built ones first, then the lamp models, each in list order. A lamp past that glows and lights nothing.
  const MAX_LAMP_LIGHTS = 3, LAMP_GLOW = '#ffb767';
  ctx.catalogue = null; // catalogue.json once it has been read (getCatalogue below)
  // item.lit: the creator's switch. Absent or true = on, and the lamp then follows the clock exactly as before (glows and lights from evening to morning).
  // false = switched off for good: no light, no glow, and no share of the MAX_LAMP_LIGHTS budget.
  const isLampModel = it => it.type === 'model' && ctx.catalogue?.models?.find(m => m.id === it.model)?.category === 'lamp';
  const isLit = o => o.lit !== false;
  function lampLight(build, it) {
    if (!isLit(it)) return null;
    const hand = build.items.filter(o => o.type === 'lamp' && isLit(o));
    const rank = it.type === 'lamp' ? hand.indexOf(it) : hand.length + build.items.filter(o => isLampModel(o) && isLit(o)).indexOf(it);
    return rank < MAX_LAMP_LIGHTS ? new THREE.PointLight(0xffb86b, 3.2, 9, 1.2) : null;
  }
  const bookCols = [C.accent, C.olive, '#c9a46a', '#7d8a5a', '#d8c7a8', '#8a4f33'];
  function pottedPlant(parent, x, z, y, s) {
    box(0.36 * s, 0.34 * s, 0.36 * s, flat(C.accent), x, y + 0.17 * s, z, { parent });
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 * s, 0), flat([C.leaf, C.leaf2, C.leafDark][i % 3]));
      const a = i * 1.26;
      leaf.position.set(x + Math.cos(a) * 0.14 * s, y + (0.45 + ctx.irand() * 0.25) * s, z + Math.sin(a) * 0.14 * s);
      leaf.scale.set(1, 1.5, 0.6); leaf.rotation.set(ctx.irand(), a, ctx.irand() * 0.5); leaf.castShadow = true; parent.add(leaf);
    }
  }
  const BUILD = {
    bed(g) {
      box(2.8, 0.3, 1.4, flat(C.woodB), 0, 0.15, 0, { parent: g });
      box(2.7, 0.18, 1.3, flat(C.paper), 0, 0.39, 0, { parent: g });
      box(1.6, 0.06, 1.36, flat(C.accent), 0.45, 0.5, 0, { parent: g });
      box(0.6, 0.16, 0.45, flat('#f7f1e6'), -1.0, 0.56, 0, { parent: g });
      return { hw: 1.6, hd: 0.95 };
    },
    shelf(g, it, build) {
      const wood = flat(C.woodDark), add = m => { shelfParts.push(m); return m; };
      add(box(1.6, 2.2, 0.12, wood, 0, 1.1, -0.22, { parent: g }));
      for (const sx of [-0.77, 0.77]) add(box(0.06, 2.2, 0.5, wood, sx, 1.1, 0, { parent: g }));
      for (let s = 0; s < 3; s++) {
        add(box(1.6, 0.05, 0.5, wood, 0, 0.27 + s * 0.7, 0, { parent: g }));
        if (s === 1) continue;
        for (let b = 0; b < 6; b++) { const h = 0.35 + ctx.irand() * 0.15; add(box(0.16, h, 0.3, flat(bookCols[(s * 6 + b) % bookCols.length]), 0.6 - b * 0.22, 0.3 + s * 0.7 + h / 2, 0.02, { parent: g })); }
      }
      add(box(1.6, 0.05, 0.5, wood, 0, 2.2, 0, { parent: g }));
      pottedPlant(g, 0, 0, 2.22, 0.7);
      if (it.fn?.kind === 'keepsake') ctx.keepsakeObject(g, it, build, 'standee', 0.52, 2.225, 0.06); // the shelf top's keepsake
      ctx.shelf = { group: g, albums: [] };
      ALBUMS.forEach((a, i) => {
        const lx = -0.57 + i * 0.38;
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.52, 0.36), flat(a.color));
        m.position.set(lx, 0.995 + 0.26, 0); m.castShadow = m.receiveShadow = true; m.userData.album = a.key;
        const lc = makeCanvas(96, 360);
        const lt = canvasTexture(lc);
        const label = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.41), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.9 }));
        label.position.set(lx, 0.995 + 0.26, 0.181); label.userData.album = a.key;
        g.add(m, label); add(m); add(label);
        ctx.shelf.albums.push({ ...a, mesh: m, label, lc, lt });
      });
      return { hw: 0.85, hd: 0.55 };
    },
    plant(g, it) { const s = it.size || 1; pottedPlant(g, 0, 0, 0, s); return { hw: 0.44 * s, hd: 0.44 * s }; },
    snake(g) {
      box(0.34, 0.4, 0.34, flat(C.olive), 0, 0.2, 0, { parent: g });
      for (let i = 0; i < 6; i++) { const b = box(0.07, 0.8 + ctx.irand() * 0.5, 0.03, flat([C.leaf, C.leafDark][i % 2]), (ctx.irand() - 0.5) * 0.2, 0.75, (ctx.irand() - 0.5) * 0.2, { parent: g }); b.rotation.set((ctx.irand() - 0.5) * 0.3, ctx.irand() * 3, (ctx.irand() - 0.5) * 0.3); }
      return { hw: 0.4, hd: 0.4 };
    },
    lamp(g, it, build) {
      box(0.3, 0.04, 0.3, flat(C.olive), 0, 0.02, 0, { parent: g });
      box(0.04, 1.7, 0.04, flat(C.olive), 0, 0.87, 0, { parent: g });
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.3, 8, 1, true), new THREE.MeshStandardMaterial({ color: '#f6dcb2', emissive: LAMP_GLOW, emissiveIntensity: isLit(it) ? ctx.shadeNow : 0, side: THREE.DoubleSide, flatShading: true }));
      shade.position.y = 1.8; g.add(shade);
      const light = lampLight(build, it);
      if (light) { light.position.y = 1.72; g.add(light); }
      build.lamps.push({ light, shades: [shade.material], off: !isLit(it) });
      return { hw: 0.35, hd: 0.35 };
    },
    books(g) {
      for (let i = 0; i < 4; i++) { const b = box(0.42, 0.08, 0.3, flat(bookCols[(i + 2) % bookCols.length]), 0, 0.04 + i * 0.08, 0, { parent: g }); b.rotation.y = (ctx.irand() - 0.5) * 0.5; }
      return { hw: 0.45, hd: 0.4 };
    },
  };

  BUILD.model = (g, it, build) => {
    ctx.loadModel(it.model).then(m => {
      if (!m || ctx.disposed || build !== ctx.build) return; // a failed load, or the items were replaced while it loaded
      const inst = m.root.clone(), rug = m.entry.category === 'rug', lamp = m.entry.category === 'lamp', own = new Map(), shades = [];
      inst.traverse(o => {
        if (!o.isMesh) return;
        const col = it.tint !== false && ctx.TINT[o.material.name], glow = lamp && o.material.name === 'lamp';
        if (col || glow) { // a copy of the material for this instance, tinted and (a lamp's shade) glowing; the cached original stays as the file has it
          if (!own.has(o.material)) {
            const c = o.material.clone();
            if (col) c.color.set(col);
            if (glow) { c.emissive.set(LAMP_GLOW); c.emissiveIntensity = isLit(it) ? ctx.shadeNow : 0; }
            own.set(o.material, c);
          }
          o.material = own.get(o.material);
          if (glow) shades.push(o);
        }
        o.castShadow = !rug && !o.material.transparent; o.receiveShadow = true;
      });
      const hold = new THREE.Group();
      hold.scale.setScalar(ctx.MODEL_SCALE); hold.position.y = (it.y || 0) + (rug ? 0.012 : 0); // a rug lies just above the floor so the two do not flicker
      hold.add(inst); g.add(hold);
      if (it.fn?.kind === 'keepsake') ctx.keepsakeObject(g, it, build, 'standee', 0, (it.y || 0) + m.size.y, 0); // on top of the shelf-like piece
      else if (it.fn && ['pc', 'music', 'latest'].includes(it.fn.kind)) { // the whole model is the button; a TV with a function also gets a painted screen
        const slot = { it, fn: it.fn };
        inst.traverse(o => { if (o.isMesh) { o.userData.slot = slot; build.slotMeshes.push(o); } });
        build.slots.push(slot);
        if (m.entry.screen && it.fn.kind !== 'pc') ctx.tvScreen(inst, build, slot, m.entry.screen);
      }
      const seatRule = ctx.catalogue?.seats?.[m.entry.category];
      if (seatRule) addSeats(build, g, it, m, seatRule, inst);
      if (shades.length) { // the light sits at the centre of the shade: the box around the vertices the shade's own triangles use
        const light = lampLight(build, it), bb = new THREE.Box3(), v = new THREE.Vector3(); // (a model's meshes share one vertex buffer)
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
      if (rug || it.y) return; // a rug is walked over; a piece standing on other furniture adds no obstacle of its own
      const swap = Math.round((it.rot || 0) / 90) % 2 !== 0, hw = m.size.x / 2 + 0.2, hd = m.size.z / 2 + 0.2;
      // hw, hd: the walk box (the model's half size and 0.2 more) · rhw, rhd: the model's own half size · owner: the item, so its own seat can tell which box is its
      build.obst.push({ x: it.x, z: it.z, hw: swap ? hd : hw, hd: swap ? hw : hd, rhw: (swap ? m.size.z : m.size.x) / 2, rhd: (swap ? m.size.x : m.size.z) / 2, owner: it });
    });
    return {};
  };

  // Seats: the points where a visitor (and later a fan's ghost) can sit, worked out from a model's footprint and the catalogue's `seats` rules (chair, sofa, rug).
  // Nothing about them is stored in the layout. A model's own `seatY` (file units) replaces the rule's `top` share of its height when the share does not fit it.
  // Each seat: { id, kind: 'chair' | 'sofa' | 'floor', item, pos (world: the sitting surface), yaw (the way the sitter faces, radians),
  //   stands (floor points the seat can be entered from: front, back, left, right; a rug seat is entered at its own point) }.
  // sitOn (below) picks the stand a walk can reach around the obstacles and refuses a seat whose centre is inside another item or the photo table.
  // ITEMS.seats lists them all; each seat mesh carries userData.seats, the seats of its item.
  function addSeats(build, g, it, m, rule, inst) {
    g.updateMatrixWorld(true);
    const w = m.size.x, d = m.size.z, floor = !!rule.floor;
    const top = (it.y || 0) + (floor ? 0.012 : 0) + (m.entry.seatY != null ? m.entry.seatY * ctx.MODEL_SCALE : m.size.y * rule.top);
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
  //   lamps: its lamps, { light, shades, off } each (see MAX_LAMP_LIGHTS above)
  //   slots: its functions, { it, fn, start? } each · slotMeshes: the meshes a click can hit, each with userData.slot (see the slots section above)
  //   seats / seatMeshes: see addSeats
  //   loads: the keepsake thumbnails this build still waits for (cancelled when the next build replaces it)
  ctx.build = { group: null, obst: [], items: [], lamps: [], slots: [], slotMeshes: [], seats: [], seatMeshes: [], loads: new Set() };
  function buildItems(items, first = false) {
    if (ctx.build.group) { for (const l of ctx.build.lamps) l.light?.dispose(); scene.remove(ctx.build.group); disposeScene(ctx.build.group, ctx.KEPT); }
    shelfParts.length = 0; ctx.shelf = null;
    if (ctx.build.loads.size) ctx.cancelThumbs(ctx.build.loads); // 바뀐 가구가 아직 받던 썸네일은 여기서 멈춘다
    const build = ctx.build = { group: new THREE.Group(), obst: [], items, lamps: [], slots: [], slotMeshes: [], seats: [], seatMeshes: [], loads: new Set() };
    scene.add(build.group);
    items.forEach((it, i) => {
      // The first build draws from the room's shared sequence, as the room always has. A rebuild seeds each item by its place in the list,
      // so it leaves that sequence alone and an item keeps its look from one rebuild to the next.
      ctx.irand = first ? rand : mulberry32(7919 * (i + 1));
      const g = new THREE.Group(), rot = THREE.MathUtils.degToRad(it.rot || 0);
      const fp = BUILD[it.type]?.(g, it, build); if (!fp) return;
      g.position.set(it.x, 0, it.z); g.rotation.y = rot; build.group.add(g); g.updateMatrixWorld(true);
      if (!fp.hw) return; // a model adds its obstacle when it has loaded
      const swap = Math.round((it.rot || 0) / 90) % 2 !== 0;
      const ohw = swap ? fp.hd : fp.hw, ohd = swap ? fp.hw : fp.hd;
      build.obst.push({ x: it.x, z: it.z, hw: ohw, hd: ohd, rhw: Math.max(0.1, ohw - 0.2), rhd: Math.max(0.1, ohd - 0.2), owner: it });
    });
  }

  Object.assign(ctx, { BUILD, buildItems, OBST, shelfParts });
}
