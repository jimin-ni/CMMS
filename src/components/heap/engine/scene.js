// 렌더러, 카메라, 기본 조명, 방 크기와 벽 좌표.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { disposeScene } from './util.js';
import { tone } from './palette.js';
import { makeCanvas, canvasTexture } from './draw.js';

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
  // 벽 높이: layout.room.h (2.4..4). 없으면 2.5 다 (러브쑤 시안 2 에서 정한 높이. 전에는 4 였다). 카메라 맞춤(loop.js)도 벽 윗선을 쓰므로 벽이 낮으면 방이 더 크게 잡힌다
  const WALL_H = THREE.MathUtils.clamp(Number(layout.room?.h) || 2.5, 2.4, 4), Yv = new THREE.Vector3(0, 1, 0), Xv = new THREE.Vector3(1, 0, 0);
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
  // 바닥 밑 땅: 방이 허공에 뜨지 않고 놓여 보이게 한다. 색은 layout.ground.colour 가 있으면 그것, 없으면 모든 방이 같이 쓰는 policy.groundColour 다.
  // 바닥 널 밑면(y -0.1)에 깔고, 가장자리로 갈수록 흐려져 배경에 녹는다. 방 둘레에 은은한 접지 그림자를 그려 넣고, 해 그림자도 받는다.
  // 벽(shell.js)은 이때 y -0.1 까지 내려와 땅에 닿는다.
  ctx.groundY = 0;
  const groundColour = layout.ground?.colour ?? ctx.opts.policy?.groundColour;
  if (groundColour) {
    ctx.groundY = -0.1;
    // 방 모서리에서 0.5 까지는 짙은 색, 그 뒤 3 단위에 걸쳐 흐려진다 (카메라에 잡히는 바깥은 바닥 모서리 근처뿐이다)
    const solid = Math.hypot(RX, RZ) + 0.5, M = solid + 3 - Math.min(RX, RZ);
    const gw = 2 * RX + 2 * M, gd = 2 * RZ + 2 * M, px = 1024 / Math.max(gw, gd);
    const c = makeCanvas(Math.round(gw * px), Math.round(gd * px)), g = c.getContext('2d');
    const cx = c.width / 2, cy = c.height / 2;
    const fade = g.createRadialGradient(cx, cy, solid * px, cx, cy, (solid + 3) * px);
    fade.addColorStop(0, groundColour); fade.addColorStop(1, groundColour + '00');
    g.fillStyle = fade; g.fillRect(0, 0, c.width, c.height);
    // 접지 그림자: 방 바닥(벽 두께 포함) 둘레를 흐리게 어둡힌다
    g.filter = `blur(${Math.round(0.25 * px)}px)`; g.fillStyle = 'rgba(40, 28, 18, 0.35)';
    g.fillRect(cx - (RX + 0.25) * px, cy - (RZ + 0.25) * px, (2 * RX + 0.35) * px, (2 * RZ + 0.35) * px);
    g.filter = 'none';
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), new THREE.MeshStandardMaterial({ map: canvasTexture(c), transparent: true, roughness: 1 }));
    // 1 mm 아래: 바닥 널과 벽의 밑면과 한 평면에 두지 않는다
    ground.name = 'ground'; ground.rotation.x = -Math.PI / 2; ground.position.set(0, ctx.groundY - 0.001, 0);
    ground.receiveShadow = true; scene.add(ground);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * RX, 2 * RZ), new THREE.MeshBasicMaterial({ visible: false }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  Object.assign(ctx, { WALLS, box, WALL_H, onWall, RX, RZ, scene, renderer, hemi, fill, Yv, Xv, camera, controls, canvas, floor });
}
