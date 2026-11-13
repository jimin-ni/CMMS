// 가구 모델: 카탈로그, GLB 읽기, 방 색으로 물들이기.
import * as THREE from 'three';
import { disposeScene } from './util.js';

export function setupModels(ctx) {
  const { opts, dataBase, C, onDispose, getJSON, ac } = ctx;

  // ---------- models: { type: 'model', model: <catalogue id>, x, z, rot, y, tint } ----------
  // <modelBase>catalogue.json lists the GLB files (Kenney Furniture Kit, CC0). A model is fetched and parsed once per mount,
  // shifted so that the item's x, z is the centre of its footprint and its base rests on the floor, then cloned for each item that uses it.
  // It shows up when it has loaded; the room does not wait for it.
  //   y     (default 0) lifts a piece, to stand it on other furniture
  //   tint  (default true) recolours it to the room palette by material name; false keeps the file's own colours
  const MODEL_BASE = opts.modelBase ?? dataBase.replace(/[^/]+\/$/, 'models/');
  const MODEL_SCALE = 2.0; // the kit is built at about 1 unit per floor tile, half this room's scale
  const darkAccent = '#' + new THREE.Color(C.accent).multiplyScalar(0.55).getHexString();
  // material name → colour. A name that is missing here (glass) is left alone. This is the base look of every model.
  // Wood takes the hand-built table's two browns (top and legs), so a wooden frame reads apart from its fabric, which stays on the accent.
  // Kept as one plain object so a per-creator theme can replace it later.
  const TINT = {
    wood: C.woodB, woodDark: C.woodDark, carpet: C.accent, carpetDarker: darkAccent, carpetBlue: C.olive, carpetWhite: C.paper, _defaultMat: C.paper,
    plant: C.leaf, lamp: '#f6dcb2', fur: C.woodB, metal: '#a39d90', metalLight: '#c9c3b6', metalMedium: '#8f8a7e', metalDark: '#4a463e',
  };
  // MODELS: catalogue id → Promise of { root, entry, size } or null · KEPT: geometries and materials the cache owns · modelRoots: the parsed scenes
  const MODELS = new Map(), KEPT = new Set(), modelRoots = [];
  let catalogueP = null, gltfP = null;
  onDispose(() => { for (const r of modelRoots) disposeScene(r); });
  const getCatalogue = () => catalogueP ??= getJSON(MODEL_BASE + 'catalogue.json').then(c => ctx.catalogue = c).catch(e => { if (!ctx.disposed) console.error('[heap-room]', e); return null; });
  function loadModel(id) {
    if (!MODELS.has(id)) MODELS.set(id, (async () => {
      const entry = (await getCatalogue())?.models?.find(m => m.id === id);
      if (!entry) throw new Error(`model "${id}" is not in the catalogue`);
      gltfP ??= import('three/addons/loaders/GLTFLoader.js').then(m => new m.GLTFLoader());
      const [loader, res] = await Promise.all([gltfP, fetch(MODEL_BASE + entry.file, { signal: ac.signal })]);
      if (!res.ok) throw new Error(`${entry.file}: ${res.status}`);
      const root = (await loader.parseAsync(await res.arrayBuffer(), '')).scene;
      if (ctx.disposed) { disposeScene(root); return null; } // dispose() ran while this was loading
      modelRoots.push(root);
      root.traverse(o => { if (o.isMesh) { KEPT.add(o.geometry); for (const m of [].concat(o.material)) KEPT.add(m); } });
      const bb = new THREE.Box3().setFromObject(root, true), mid = bb.getCenter(new THREE.Vector3());
      root.position.set(-mid.x, -bb.min.y, -mid.z); // the file's own node transforms stay as they are; the whole model shifts
      return { root, entry, size: bb.getSize(new THREE.Vector3()).multiplyScalar(MODEL_SCALE) };
    })().catch(e => { if (!ctx.disposed) console.error('[heap-room]', e); return null; }));
    return MODELS.get(id);
  }

  Object.assign(ctx, { loadModel, TINT, MODEL_SCALE, KEPT, getCatalogue });
}
