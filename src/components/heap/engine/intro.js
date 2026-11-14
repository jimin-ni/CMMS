// 온보딩(컨셉 B, C)이 방을 연출하는 훅. 보내지 않으면 아무것도 하지 않는다: 보통 방은 그대로다.
//   root.dispatchEvent(new CustomEvent('heap:intro', { detail }))
//   detail = { items?, pile?, dist?, turn?, focus?, album? } 또는 null (연출 끝: 가구, 사진, 카메라는 제자리. 꽂은 앨범은 남는다)
//     items[i]: build.items[i] 가 놓인 정도 0~1. 0 이면 아직 없고, 1 이면 제자리, 그 사이는 위에서 떨어지며 튄다. 빠진 값은 1.
//     pile: 0 이면 탁자 위 사진이 없다. 0 에서 커지면 사진이 위에서 쏟아져 내린다 (loop.js 가 카드를 제자리로 끌어당긴다).
//     dist: 방 카메라 거리 배율 (1 이 보통 구도). turn: 방 카메라를 Y 축으로 돌리는 각도(라디안). loop.js 의 roomCam 이 읽는다.
//     focus: 0~1. 1 이면 방 카메라가 같은 방향에서 책장의 빈 칸(앨범 자리)으로 다가간다. 없으면 0.
//     album: true 면 그 빈 칸에 앨범 한 권이 꽂혀 있다 (온보딩 B 의 노트가 접혀 꽂힌 것).
//   root.dispatchEvent(new CustomEvent('heap:introquery', { detail: cb }))
//     cb({ x, y, h }) 를 부른다: 앨범 자리의 화면 좌표(가운데, px)와 화면에서의 높이(px). 책장이 없으면 cb(null).
// 온보딩은 스크롤하는 동안 매 프레임 보내고, 방 안으로 들어가면 null 을 한 번 보낸다.
import * as THREE from 'three';
import { makeCanvas, canvasTexture } from './draw.js';

const easeOutCubic = t => 1 - (1 - t) ** 3;
function easeOutBounce(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
const unit = (v, empty = 1) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : empty);

// 앨범 자리: 책장(furniture.js 의 shelf) 맨 윗칸 왼쪽 끝의 빈 곳. 책장의 지역 좌표.
// 윗칸 바닥판 윗면 1.695, 천장판 아랫면 2.175. 책은 x 0.6 ~ -0.58 에 있고, 옆판 안쪽은 -0.74 다.
const ALBUM = { x: -0.665, y: 1.925, z: 0.02, w: 0.07, h: 0.46, d: 0.29 };
const ALBUM_COLOR = '#A6613C';

export function setupIntro(ctx) {
  const { on, root, camera, canvas, onDispose } = ctx;
  ctx.introView = { dist: 1, turn: 0, focus: 0, focusPoint: null, focusDist: 2.4 };
  let pileShown = true, album = null;

  const slotWorld = () => (ctx.shelf ? ctx.shelf.group.localToWorld(new THREE.Vector3(ALBUM.x, ALBUM.y, ALBUM.z)) : null);

  // 앨범 한 권: 등(+z)에 제목을 그린다. 다른 면은 천 표지 색이다
  function makeAlbum() {
    const c = makeCanvas(64, 420), g = c.getContext('2d');
    g.fillStyle = ALBUM_COLOR; g.fillRect(0, 0, 64, 420);
    g.fillStyle = '#2f2c24'; g.fillRect(0, 18, 64, 6); g.fillRect(0, 396, 64, 6);
    g.save(); g.translate(32, 210); g.rotate(Math.PI / 2);
    g.fillStyle = '#fff8ec'; g.font = '600 34px "IBM Plex Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('MEMORIES', 0, 0);
    g.restore();
    const spine = new THREE.MeshStandardMaterial({ map: canvasTexture(c), roughness: 0.85 });
    const cloth = new THREE.MeshStandardMaterial({ color: ALBUM_COLOR, roughness: 0.9 });
    const pages = new THREE.MeshStandardMaterial({ color: '#f3eadb', roughness: 1 });
    // BoxGeometry 면 순서: +x, -x, +y, -y, +z(등), -z(책 안쪽 끝)
    const m = new THREE.Mesh(new THREE.BoxGeometry(ALBUM.w, ALBUM.h, ALBUM.d), [cloth, cloth, pages, pages, spine, pages]);
    m.castShadow = m.receiveShadow = true;
    m.position.set(ALBUM.x, ALBUM.y, ALBUM.z);
    return m;
  }
  function setAlbum(show) {
    if (!ctx.shelf) return;
    if (show && (!album || album.parent !== ctx.shelf.group)) { // 책장을 다시 지었으면 새 책장에 다시 꽂는다
      album = makeAlbum();
      ctx.shelf.group.add(album);
    }
    if (album) album.visible = show;
  }
  onDispose(() => {
    if (!album) return;
    album.geometry.dispose();
    for (const m of album.material) { m.map?.dispose(); m.dispose(); }
  });

  function apply(d) {
    ctx.introView.dist = Number.isFinite(d?.dist) ? d.dist : 1;
    ctx.introView.turn = Number.isFinite(d?.turn) ? d.turn : 0;
    ctx.introView.focus = unit(d?.focus, 0);
    ctx.introView.focusPoint = ctx.introView.focus > 0 ? slotWorld() : null;
    if (d) setAlbum(!!d.album);
    const build = ctx.build;
    build.groups.forEach((g, i) => {
      if (!g) return;
      const p = unit(d?.items?.[i]), e = easeOutCubic(p);
      g.visible = p > 0.001;
      g.position.y = (1 - easeOutBounce(p)) * 3.2;
      g.rotation.y = THREE.MathUtils.degToRad(build.items[i]?.rot || 0) + (1 - e) * (i % 2 ? 0.7 : -0.7);
      g.scale.setScalar(0.8 + 0.2 * e);
    });
    const show = unit(d?.pile) > 0;
    // 다시 나타날 때 카드를 위로 올려 둔다. 프레임 루프가 제자리로 끌어내려 쏟아지는 것처럼 보인다
    if (show && !pileShown) ctx.cards.forEach((c, i) => { c.position.y += 1.4 + (i % 9) * 0.14; });
    pileShown = show;
    for (const c of ctx.cards) c.visible = show;
  }

  // 앨범 자리를 지금 카메라로 화면에 비춘다
  const v = new THREE.Vector3();
  function project() {
    const p = slotWorld();
    if (!p) return null;
    const r = canvas.getBoundingClientRect();
    const toScreen = w => { v.copy(w).project(camera); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; };
    const mid = toScreen(p), top = toScreen(p.clone().setY(p.y + ALBUM.h / 2)), bottom = toScreen(p.clone().setY(p.y - ALBUM.h / 2));
    return { x: mid.x, y: mid.y, h: Math.abs(bottom.y - top.y) };
  }

  on(root, 'heap:intro', e => apply(e.detail && typeof e.detail === 'object' ? e.detail : null));
  on(root, 'heap:introquery', e => { if (typeof e.detail === 'function') e.detail(project()); });
}
