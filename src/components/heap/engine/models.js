// 가구 모델: 카탈로그, GLB 읽기, 방 색으로 물들이기.
import * as THREE from 'three';
import { disposeScene } from './util.js';
import { tintOf } from './palette.js';

export function setupModels(ctx) {
  const { opts, dataBase, C, onDispose, ac } = ctx;

  const getJSON = async p => { const r = await fetch(p, { signal: ac.signal }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };

  // ---------- 모델: { type: 'model', model: <카탈로그 id>, x, z, rot, y, tint } ----------
  // <modelBase>catalogue.json 이 GLB 파일(Kenney Furniture Kit, CC0)을 나열한다. 모델은 마운트마다 한 번 받아 읽고,
  // 가구의 x, z 가 바닥 크기의 가운데가 되고 바닥에 닿도록 옮긴 뒤, 쓰는 가구마다 복제한다.
  // 읽히면 나타난다. 방은 기다리지 않는다.
  //   y     (기본 0) 물건을 들어 올려 다른 가구 위에 세운다
  //   tint  (기본 true) 재질 이름으로 방 팔레트에 물들인다. false 면 파일의 색을 그대로 둔다
  const MODEL_BASE = opts.modelBase ?? dataBase.replace(/[^/]+\/$/, 'models/');
  const MODEL_SCALE = 2.0; // 키트는 타일 하나에 단위 1쯤으로 만들어져, 이 방의 절반 크기다
  const scaleOf = entry => MODEL_SCALE * (entry.scale ?? 1); // 카탈로그 항목의 scale(예: 크리스마스 키트 0.4~0.64)을 곱한 실제 배율
  // material name → colour (palette.js 의 tintOf). 모든 모델의 바탕 모습이다.
  // 한 객체를 끝까지 쓴다: 팔레트가 바뀌면 recolour.js 가 이 객체의 값을 바꾸고, dock-thumbs.js 는 그릴 때마다 이것을 읽는다.
  const TINT = tintOf(C);
  // MODELS: catalogue id → Promise of { root, entry, size } or null · KEPT: geometries and materials the cache owns · modelRoots: the parsed scenes
  const MODELS = new Map(), KEPT = new Set(), modelRoots = [];
  // SIZES: 읽은 모델의 실제 크기 (배율을 곱한 경계 상자, Vector3). 꾸미기(edit.js)가 벽·천장 가구의 높이를 이것으로 정한다
  const SIZES = new Map();
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
      if (ctx.disposed) { disposeScene(root); return null; } // 읽는 동안 dispose() 가 돌았다
      modelRoots.push(root);
      root.traverse(o => { if (o.isMesh) { KEPT.add(o.geometry); for (const m of [].concat(o.material)) KEPT.add(m); } });
      const bb = new THREE.Box3().setFromObject(root, true), mid = bb.getCenter(new THREE.Vector3());
      root.position.set(-mid.x, -bb.min.y, -mid.z); // 파일의 노드 변환은 그대로 두고 모델 전체를 옮긴다
      const size = bb.getSize(new THREE.Vector3()).multiplyScalar(scaleOf(entry));
      SIZES.set(id, size);
      return { root, entry, size };
    })().catch(e => { if (!ctx.disposed) console.error('[heap-room]', e); return null; }));
    return MODELS.get(id);
  }

  Object.assign(ctx, { loadModel, TINT, MODEL_SCALE, scaleOf, KEPT, getCatalogue, modelSize: id => SIZES.get(id) ?? null });
}
