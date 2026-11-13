// 팔레트를 다시 마운트하지 않고 바꾼다 (design/editor.md 의 B10).
// 팔레트 색을 받는 재질은 만들 때 userData.pal 에 색 이름을 달아 두었다 (palette.js 의 tone, mark). 여기서는 장면을 한 번 돌며
// 그 재질의 색을 새 팔레트로 바꾸고, 캔버스에 색을 구워 넣은 재질(userData.repaint: 러그, 문패, 앨범 이름표, 달력)은 다시 그린다.
// 등록부를 따로 두지 않는다: 가구를 다시 지으면 옛 재질은 장면에서 빠지고 새 재질이 이름을 달고 들어오므로 남는 것이 없다.
//   ctx.recolour(palette | null)  null 은 기본 올리브 오후다. 빠진 키는 기본값으로 채운다.
// C 는 같은 객체를 고친다: 마운트 때 C 를 받아 둔 모듈(가구 짓기, 달력, 이름표)이 다음에 그릴 때 새 색을 쓴다.
// 다시 칠하지 않는 것: 카드 그림(card-art.js 의 팬 작품 표시, 앨범 표시 글씨). 카드는 처음 그릴 때의 포인트 색을 그대로 둔다.
import { palColour, tintOf } from './palette.js';

export function setupRecolour(ctx) {
  const { scene, root, C, DEFAULT_PALETTE, layout } = ctx;

  function recolour(palette) {
    const next = structuredClone({ ...DEFAULT_PALETTE, ...(palette || {}) });
    for (const k of Object.keys(C)) delete C[k];
    Object.assign(C, next);
    Object.assign(ctx.TINT, tintOf(C));
    const seen = new Set(), repaint = new Set();
    scene.traverse(o => {
      for (const m of [].concat(o.material ?? [])) {
        if (seen.has(m)) continue;
        seen.add(m);
        if (m.userData.pal) m.color.set(palColour(C, m.userData.pal));
        if (m.userData.repaint) repaint.add(m.userData.repaint);
      }
    });
    for (const fn of repaint) fn();
    root.style.setProperty('--clay', C.accent);
    // 꾸미기에 다시 들어올 때(edit.js 의 enter) 지금 칠한 팔레트에서 시작한다
    if (palette) layout.palette = structuredClone(palette); else delete layout.palette;
    ctx.look = JSON.stringify(C);
    return seen.size;
  }

  Object.assign(ctx, { recolour });
}
