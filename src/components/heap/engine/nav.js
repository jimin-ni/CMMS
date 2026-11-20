// 온보딩 내비게이션 바가 방 안의 자리로 옮기는 훅. 보내지 않으면 아무것도 하지 않는다: 보통 방은 그대로다.
//   root.dispatchEvent(new CustomEvent('heap:go', { detail }))
//   detail = 'room'     처음 들어온 상태: 창과 모드를 모두 닫고(앉기, 상영, 책장, 트리, 걸터앉기) 처음 선 자리(문 앞)로 돌아간다
//            'polaroid' 탁자에 앉아 더미 맨 위 사진을 집는다 (사진을 눌렀을 때와 같은 화면)
//            'phone'    탁자에 앉아 휴대폰을 연다 (휴대폰을 눌렀을 때와 같은 화면)
//            'guestbook' 방 모드로 돌아와 방명록 창을 연다 (방명록 가구를 눌렀을 때와 같은 창)
// 꾸미기 중에는 듣지 않는다.

// 엔진이 여닫는 창 (input.js 의 Esc 와 같은 목록)
const OVERLAYS = ['phone', 'pc', 'keepsake', 'calendar', 'grid', 'rooms', 'guestbook'];

export function setupNav(ctx) {
  const { root, on, $, me, pickables } = ctx;
  // 처음 선 자리 (walk.js 가 문 앞에 세운다)
  const start = { pos: me.position.clone(), rotY: me.rotation.y };

  // 걷는 방 모드로 돌린다. 각 모드를 나가는 함수가 집은 사진, 상영 중인 사진, 쪽지 판을 정리한다.
  function toRoom() {
    for (const id of OVERLAYS) $(id).hidden = true;
    if (ctx.mode === 'tree') ctx.exitTree();
    else if (ctx.mode === 'sort') ctx.exitSort();
    else if (ctx.mode === 'sit') ctx.stand();
    if (ctx.perch) ctx.unperch();
    ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = []; ctx.seatTarget = null;
  }
  // 탁자 더미의 맨 위 사진
  function topCard() {
    let best = null;
    for (const m of pickables) {
      const c = m.userData.card;
      if (c && (!best || c.position.y > best.position.y)) best = c;
    }
    return best;
  }

  on(root, 'heap:go', e => {
    if (ctx.mode === 'edit') return;
    const where = e.detail;
    if (where !== 'room' && where !== 'polaroid' && where !== 'phone' && where !== 'guestbook') return;
    toRoom();
    if (where === 'guestbook') { ctx.openGuestbook(); return; }
    if (where === 'room') {
      me.position.copy(start.pos); me.rotation.y = start.rotY;
      return;
    }
    ctx.sit();
    if (where === 'phone') { ctx.openPhone(); return; }
    const card = topCard();
    if (card) ctx.pickUp(card);
  });
}
