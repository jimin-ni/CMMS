// 꾸미기 가구 목록의 그림 (design/editor.md 의 B3). 진짜 Kenney 모델을 지금 방의 팔레트로 물들여 화면 밖에서 한 장씩 그린다.
// 방의 렌더러와 따로 작은 렌더러 하나를 쓴다: 방의 렌더러로 그리면 렌더 타깃에서 톤 매핑과 sRGB 가 빠져 방과 색이 달라진다.
// 처음 부탁을 받을 때 만들고, 마운트가 끝날 때 함께 버린다. 모델은 models.js 의 캐시(loadModel)를 같이 쓴다.
//   받는 것  heap:thumb { id, cb, token? }  id 는 카탈로그 모델 id. cb(dataURL | null) 은 그림이 나오면 한 번 불린다 (모르는 모델이나 실패는 null).
//            token.live 가 false 가 되면 그 부탁은 그리지 않고 cb 도 부르지 않는다 (room-editor.tsx 가 정리할 때 끈다).
//            heap:edit false (꾸미기를 닫음): 줄을 비우고 렌더러와 그림을 버린다. 다시 열면 처음부터 그린다.
// 그림은 이 마운트 안에서 id 로 기억한다. 팔레트가 바뀌면 방이 다시 마운트되므로(edit.js 의 remount) 캐시도 새로 시작한다.
import * as THREE from 'three';

const W = 152, H = 112; // 칸의 그림 76 x 56 의 두 배
const VIEW = new THREE.Vector3(9.4, 8.6, 9.4).normalize(); // 방 카메라(loop.js 의 ROOM_CAM)와 같은 쪽에서 본다

export function setupDockThumbs(ctx) {
  const { root, on, onDispose } = ctx;
  const done = new Map(); // id → dataURL | null
  let r = null, queue = Promise.resolve(), gen = 0;

  function rig() {
    if (r) return r;
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12; // 방과 같은 톤 (scene.js)
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffe6c4, 0x5a4a38, 1.1));
    const sun = new THREE.DirectionalLight(0xfff0dc, 1.5); sun.position.set(3, 6, 4); scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.01, 100);
    r = { canvas, renderer, scene, camera };
    return r;
  }
  const drop = () => { if (r) { r.renderer.dispose(); r.renderer.forceContextLoss(); r = null; } };
  onDispose(drop);
  on(root, 'heap:edit', e => { if (e.detail) return; gen++; queue = Promise.resolve(); done.clear(); drop(); });

  // 모델 하나를 그린다. 재질은 furniture.js 처럼 이름으로 물들인 복사본을 쓰고, 그린 뒤 버린다 (기하는 캐시의 것이라 두고 간다).
  async function draw(id) {
    const m = await ctx.loadModel(id);
    if (!m || ctx.disposed) return null;
    const { renderer, scene, camera, canvas } = rig();
    const inst = m.root.clone(), own = new Map();
    inst.traverse(o => {
      if (!o.isMesh) return;
      const col = ctx.TINT[o.material.name];
      if (!col) return;
      if (!own.has(o.material)) { const c = o.material.clone(); c.color.set(col); own.set(o.material, c); }
      o.material = own.get(o.material);
    });
    const hold = new THREE.Group();
    hold.scale.setScalar(ctx.scaleOf(m.entry)); hold.add(inst); scene.add(hold);
    hold.updateMatrixWorld(true);
    const sphere = new THREE.Box3().setFromObject(hold, true).getBoundingSphere(new THREE.Sphere());
    const fit = Math.max(0.05, sphere.radius) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.copy(sphere.center).addScaledVector(VIEW, fit * 0.9);
    camera.near = fit / 20; camera.far = fit * 4; camera.updateProjectionMatrix();
    camera.lookAt(sphere.center);
    renderer.render(scene, camera);
    const url = canvas.toDataURL('image/png');
    scene.remove(hold);
    for (const c of own.values()) c.dispose();
    return url;
  }

  on(root, 'heap:thumb', e => {
    const d = e.detail;
    if (!d || typeof d.id !== 'string' || typeof d.cb !== 'function') return;
    const g = gen, live = () => !ctx.disposed && g === gen && d.token?.live !== false;
    if (done.has(d.id)) { d.cb(done.get(d.id)); return; }
    // 한 번에 하나씩 그린다. 같은 id 가 줄에 두 번 서도 두 번째는 캐시에서 나간다. 꺼진 부탁은 건너뛴다
    queue = queue.then(async () => {
      if (!live()) return;
      if (!done.has(d.id)) {
        let url = null;
        try { url = await draw(d.id); } catch (err) { if (!ctx.disposed) console.error('[heap-room] thumb', d.id, err); }
        if (ctx.disposed || g !== gen) return;
        done.set(d.id, url);
      }
      if (live()) d.cb(done.get(d.id));
    });
  });
}
