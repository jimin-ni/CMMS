// 렌더러, 카메라, 기본 조명, 방 크기와 벽 좌표.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { disposeScene } from './util.js';
import { tone } from './palette.js';

export function setupScene(ctx) {
  const { $, onDispose, C, layout } = ctx;

  // 렌더러, 조명, 벽 (layout 으로 짓는다)
  const canvas = document.createElement('canvas'); canvas.id = 'scene';
  canvas.setAttribute('aria-label', '크리에이터의 미니룸. 탁자 위에 지난 영상들이 사진처럼 쌓여 있고, 영사기와 휴대폰, 앨범 책장, 다른 방으로 가는 문이 있다');
  $('scene-host').appendChild(canvas);
  onDispose(() => canvas.remove());
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene();
  // 방 뒤의 배경은 time.js 가 칠한다 (시간 따라 바뀌는 그라데이션 또는 주인이 고른 색)
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
  const controls = new OrbitControls(camera, canvas);
  onDispose(() => { controls.dispose(); disposeScene(scene); renderer.dispose(); renderer.forceContextLoss(); });
  controls.enabled = false; controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = 0.6; controls.maxDistance = 4; controls.maxPolarAngle = 1.25;
  const hemi = new THREE.HemisphereLight(0xffe6c4, 0x5a4a38, 0.7); scene.add(hemi);
  const fill = new THREE.DirectionalLight(0xffe2bd, 0.35); fill.position.set(8, 6, 8); scene.add(fill);

  // 평면도: layout.room = { w, d } (단위), 각각 6..12 로 제한한다. 없는 값은 원래의 8 x 8 이다.
  // RX, RZ 는 반지름이다: 바닥은 x 로 -RX..RX, z 로 -RZ..RZ 에 걸친다.
  const roomDim = v => THREE.MathUtils.clamp(Number(v) || 8, 6, 12);
  const RX = roomDim(layout.room?.w) / 2, RZ = roomDim(layout.room?.d) / 2;
  const WALL_H = 4, Yv = new THREE.Vector3(0, 1, 0), Xv = new THREE.Vector3(1, 0, 0);
  function box(w, h, d, mat, x, y, z, { cast = true, receive = true, parent = scene } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
  }
  // 벽: "back" 은 z = -RZ 에서 x 를 따라 달린다 (+z 를 본다). "left" 는 x = -RX 에서 z 를 따라 달린다 (+x 를 본다)
  // half: 벽 길이의 절반. 벽 위의 위치("at", u)는 벽 가운데에서 잰다.
  const WALLS = {
    back: { point: (u, y, off = 0) => new THREE.Vector3(u, y, -RZ + off), half: RX, rotY: 0, n: new THREE.Vector3(0, 0, 1), axis: new THREE.Vector3(1, 0, 0) },
    left: { point: (u, y, off = 0) => new THREE.Vector3(-RX + off, y, u), half: RZ, rotY: Math.PI / 2, n: new THREE.Vector3(1, 0, 0), axis: new THREE.Vector3(0, 0, 1) },
  };
  const onWall = (wall, u, y, off, obj) => { obj.position.copy(WALLS[wall].point(u, y, off)); obj.rotation.y = WALLS[wall].rotY; scene.add(obj); return obj; };

  // 바닥 널: x 방향으로 폭 1. w 가 정수가 아니면 마지막 널이 더 좁다
  for (let i = 0; i < 2 * RX; i++) { const bw = Math.min(1, 2 * RX - i); box(bw, 0.1, 2 * RZ, tone(C, `floor:${i}`), -RX + i + bw / 2, -0.05, 0, { cast: false }); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * RX, 2 * RZ), new THREE.MeshBasicMaterial({ visible: false }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  Object.assign(ctx, { WALLS, box, WALL_H, onWall, RX, RZ, scene, renderer, hemi, fill, Yv, Xv, camera, controls, canvas, floor });
}
