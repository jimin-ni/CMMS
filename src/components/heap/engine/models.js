// 가구 모델: 카탈로그, GLB 읽기, 방 색으로 물들이기.
import * as THREE from 'three';
import { disposeScene } from './util.js';

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
  const darkAccent = '#' + new THREE.Color(C.accent).multiplyScalar(0.55).getHexString();
  // material name → colour. A name that is missing here (glass) is left alone. This is the base look of every model.
  // 나무는 손으로 만든 탁자의 두 갈색(상판과 다리)을 받아, 나무 틀이 천과 구분되어 보인다. 천은 강조색이다.
  // 평범한 객체 하나로 두었으니 크리에이터별 테마가 나중에 이것을 바꿀 수 있다.
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
      if (ctx.disposed) { disposeScene(root); return null; } // 읽는 동안 dispose() 가 돌았다
      modelRoots.push(root);
      root.traverse(o => { if (o.isMesh) { KEPT.add(o.geometry); for (const m of [].concat(o.material)) KEPT.add(m); } });
      const bb = new THREE.Box3().setFromObject(root, true), mid = bb.getCenter(new THREE.Vector3());
      root.position.set(-mid.x, -bb.min.y, -mid.z); // 파일의 노드 변환은 그대로 두고 모델 전체를 옮긴다
      return { root, entry, size: bb.getSize(new THREE.Vector3()).multiplyScalar(MODEL_SCALE) };
    })().catch(e => { if (!ctx.disposed) console.error('[heap-room]', e); return null; }));
    return MODELS.get(id);
  }

  Object.assign(ctx, { loadModel, TINT, MODEL_SCALE, KEPT, getCatalogue });
}
