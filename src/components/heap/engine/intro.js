// 온보딩(컨셉 C)이 방을 연출하는 훅. 보내지 않으면 아무것도 하지 않는다: 보통 방은 그대로다.
//   root.dispatchEvent(new CustomEvent('heap:intro', { detail }))
//   detail = { items?: number[], pile?: number, dist?: number, turn?: number } 또는 null (연출 끝: 모두 제자리)
//     items[i]: build.items[i] 가 놓인 정도 0~1. 0 이면 아직 없고, 1 이면 제자리, 그 사이는 위에서 떨어지며 튄다. 빠진 값은 1.
//     pile: 0 이면 탁자 위 사진이 없다. 0 에서 커지면 사진이 위에서 쏟아져 내린다 (loop.js 가 카드를 제자리로 끌어당긴다).
//     dist: 방 카메라 거리 배율 (1 이 보통 구도). turn: 방 카메라를 Y 축으로 돌리는 각도(라디안). loop.js 의 roomCam 이 읽는다.
// 온보딩은 스크롤하는 동안 매 프레임 보내고, 방 안으로 들어가면 null 을 한 번 보낸다.
import * as THREE from 'three';

const easeOutCubic = t => 1 - (1 - t) ** 3;
function easeOutBounce(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
const unit = v => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

export function setupIntro(ctx) {
  const { on, root } = ctx;
  ctx.introView = { dist: 1, turn: 0 };
  let pileShown = true;

  function apply(d) {
    ctx.introView.dist = Number.isFinite(d?.dist) ? d.dist : 1;
    ctx.introView.turn = Number.isFinite(d?.turn) ? d.turn : 0;
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

  on(root, 'heap:intro', e => apply(e.detail && typeof e.detail === 'object' ? e.detail : null));
}
