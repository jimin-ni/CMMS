// 사진 더미의 자리(HOST)와 그것을 보는 자리(SEAT).
// 예전의 고정 소품(탁자, 러그, 방석, 머그, 휴대폰, 방명록, 스크린, 영사기)은 이제 가구다 (fixtures.js, docs/dev/heap-room-v2.md).
import * as THREE from 'three';

export function setupProps(ctx) {
  const { layout, OBST } = ctx;

  // HOST: layout.items 의 heap 가구가 놓인 곳. 방에 더미가 없으면 null 이고, 그 방에는 더미 보기가 없다.
  //   x, z: 더미 가운데 · top: 카드가 놓이는 바닥 높이(가구 위에 올렸으면 그 윗면, 바닥이면 0) · w, d: 카드가 퍼지는 넓이
  //   box: 열린 신발상자 안에 쌓는다 (heap.style "box"). boxW, boxD: 상자 안쪽 크기 (받침보다 크면 받침에 맞춰 줄인다)
  // 다른 가구 위에 올렸으면 받침 가구의 윗면 넓이만큼 퍼진다. 바닥에 두면 1.2 x 0.9 다.
  // items 로 HOST, SEAT, seatFace 를 셈한다. 바닥 가구의 막힘(ctx.build.obst)은 지금 지어진 것을 본다
  function hostOf(items) {
    const heapIt = items.find(it => it?.type === 'heap');
    let HOST = null, SEAT = null, seatFace = Math.PI;
    if (heapIt) {
      const under = heapIt.y > 0 ? items.find(o => {
        if (o === heapIt || o.type === 'heap') return false;
        const e = ctx.opts.itemHalfExtents?.(o);
        return e && Math.abs(heapIt.x - o.x) <= e.hx && Math.abs(heapIt.z - o.z) <= e.hz;
      }) : null;
      const ue = under && ctx.opts.itemHalfExtents(under);
      // 좌식 탁자의 바닥 크기에는 둘레 여유가 없다 (서버 표 2.6 x 1.8 = 윗판). 다른 받침도 바닥 크기를 윗면으로 본다
      const w = ue ? 2 * ue.hx : 1.2, d = ue ? 2 * ue.hz : 0.9;
      HOST = {
        x: heapIt.x, z: heapIt.z, top: heapIt.y || 0, w, d, box: heapIt.style === 'box', item: heapIt,
        boxW: Math.min(1.12, ue ? w - 0.12 : 1.12), boxD: Math.min(0.66, ue ? d - 0.12 : 0.66),
      };
      if (under?.type === 'lowTable') {
        // 좌식 탁자 위의 더미는 탁자 앞 방석에 앉아 본다 (방석은 탁자 지역 (0, 0, 1.4), fixtures.js)
        const a = THREE.MathUtils.degToRad(under.rot || 0);
        SEAT = new THREE.Vector3(under.x + Math.sin(a) * 1.4, 0, under.z + Math.cos(a) * 1.4);
        seatFace = Math.PI + a;
      } else {
        // 서서 보는 자리: 더미(받침 가구가 있으면 그 가장자리)에서 0.45 떨어진 옆, 더미를 바라본다. 앞에 서면 보는 카메라가 머리에 막힌다.
        // 오른쪽, 왼쪽, 뒤, 앞 순으로 벽 안이고 바닥 가구에 막히지 않은 첫 자리. 모두 막히면 오른쪽
        const hx = ue ? ue.hx : w / 2, hz = ue ? ue.hz : d / 2, cx = ue ? under.x : HOST.x, cz = ue ? under.z : HOST.z;
        const blocked = (x, z) => Math.abs(x) > ctx.RX - 0.3 || Math.abs(z) > ctx.RZ - 0.3
          || [...OBST, ...ctx.build.obst].some(o => o.owner !== under && o.owner !== heapIt && Math.abs(x - o.x) < o.hw && Math.abs(z - o.z) < o.hd);
        const sides = [[cx + hx + 0.45, HOST.z, -Math.PI / 2], [cx - hx - 0.45, HOST.z, Math.PI / 2], [HOST.x, cz - hz - 0.45, 0], [HOST.x, cz + hz + 0.45, Math.PI]];
        const pick = sides.find(([x, z]) => !blocked(x, z)) ?? sides[0];
        SEAT = new THREE.Vector3(pick[0], 0, pick[1]);
        seatFace = pick[2];
      }
    }
    return { HOST, SEAT, seatFace };
  }

  const first = hostOf(layout.items || []);
  Object.assign(ctx, first);
  // 꾸미기가 더미를 옮겼을 때 (heap.js 의 rehostHeap): 다시 마운트하지 않고 HOST, SEAT 를 제자리에서 고친다.
  // HOST, SEAT 는 여러 파일이 마운트 때 받아 둔 같은 객체라 바꿔 끼우지 않고 값을 고친다. 더미가 생기거나 없어지면 false (다시 마운트해야 한다)
  ctx.rehostProps = items => {
    const next = hostOf(items);
    if (!next.HOST || !ctx.HOST) return false;
    Object.assign(ctx.HOST, next.HOST); ctx.SEAT.copy(next.SEAT); ctx.seatFace = next.seatFace;
    return true;
  };
}
