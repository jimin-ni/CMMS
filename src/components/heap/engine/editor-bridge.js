// 꾸미기 패널과 주고받는 이벤트: heap:items, heap:get, heap:saved, heap:edit.

export function setupEditorBridge(ctx) {
  const {
    on, root, unperch, buildItems, linkShelf, updateAlbums, startSlots, enterSort, exitSort,
    getCatalogue, RX, RZ, TABLE, DOOR, WIN, creator,
  } = ctx;

  // 꾸미기 패널을 위한 방 내용의 라이브 훅. 방이 뜬 뒤(#status 가 사라진 뒤) mountRoom 에 넘긴 요소에 보낸다:
  //   root.dispatchEvent(new CustomEvent('heap:items', { detail: itemsArray }))
  //     layout.items 로 지은 것을 모두 바꾼다. 항목 모양은 layout.json 과 같다.
  //   root.dispatchEvent(new CustomEvent('heap:get', { detail: cb }))
  //     모델 카탈로그를 읽은 뒤 cb({ room: { w, d }, layout, items, catalogue, table, door, window, time, original }) 를 부른다
  //     (카탈로그를 못 읽었으면 catalogue 는 null). items 는 지금 방에 있는 목록의 복사본이고 catalogue 는 catalogue.json 그대로다.
  //     table { x, z, w, d }, door { wall, at }, window { wall, at, w } 는 평면도가 보여 주는 고정 부분이다 (door, window 는 null 일 수 있다).
  //     creatorLinks 는 creator.json 의 링크 목록(PC 의 대체)이고 linktree 는 그 링크트리 주소 또는 null 이다: 주인이 PC 를 꾸밀 때 패널이 권한다.
  //     seats 는 지금까지 지은 가구의 앉는 자리 { id, kind, x, y, z, yaw } 목록이다 (addSeats 참고): 앉는 모델은 첫 빌드 뒤에 읽힌다.
  //     time 은 방의 시간 선택을 준 그대로('auto', 이름, 시각)이고 original { items, time } 은 DB 에 마지막으로 저장된 레이아웃이다.
  //     layout 은 저장된 레이아웃 전체의 복사본이다: 패널은 저장하기 전에 자기 items, time, room 을 여기에 합친다.
  //   root.dispatchEvent(new CustomEvent('heap:saved', { detail: layout }))
  //     tells the engine the editor saved this whole layout: it becomes the new original / 처음으로 target.
  // 벽, 바닥, 탁자, 더미, 영사기, 휴대폰, 방명록 받침대는 지은 그대로 둔다.
  on(root, 'heap:items', e => {
    if (!Array.isArray(e.detail)) return;
    if (ctx.perch) unperch(); // 앉은 자리가 곧 다시 지어진다
    buildItems(e.detail.filter(it => it && typeof it === 'object').map(it => ({ ...it })));
    // 라디오, 스피커, TV 가 없어졌거나 링크가 바뀐 음악은 멈춘다
    if (ctx.musicUrl && !ctx.build.items.some(it => it.fn?.kind === 'music' && it.fn.url === ctx.musicUrl)) ctx.closeMusic();
    linkShelf(); updateAlbums(); startSlots();
    if (ctx.mode === 'sort') { if (ctx.shelf) enterSort(); else exitSort(); }
  });
  on(root, 'heap:edit', e => { if (e.detail) ctx.closeMusic(); }); // heap-room.tsx: the 꾸미기 panel opened (true) or closed (false); the panel takes the dock's corner, so the music stops
  on(root, 'heap:saved', e => {
    const l = e.detail;
    if (!l || typeof l !== 'object' || !Array.isArray(l.items)) return;
    ctx.baseLayout = structuredClone(l);
    ctx.original = { items: l.items.map(it => ({ ...it })), time: l.time ?? 'auto' };
  });
  on(root, 'heap:get', e => {
    if (typeof e.detail !== 'function') return;
    getCatalogue().then(catalogue => {
      if (ctx.disposed) return;
      e.detail({
        room: { w: 2 * RX, d: 2 * RZ }, layout: structuredClone(ctx.baseLayout), items: ctx.build.items.map(it => ({ ...it })), catalogue,
        table: { x: TABLE.x, z: TABLE.z, w: TABLE.w, d: TABLE.d },
        door: DOOR ? { wall: DOOR.wall, at: DOOR.at } : null, window: WIN ? { wall: WIN.wall, at: WIN.at, w: WIN.w } : null,
        time: ctx.timeChoice, original: { items: ctx.original.items.map(it => ({ ...it })), time: ctx.original.time },
        creatorLinks: creator.links.map(L => ({ ...L })), linktree: creator.linktree ?? null,
        seats: ctx.build.seats.map(s => ({ id: s.id, kind: s.kind, x: s.pos.x, y: s.pos.y, z: s.pos.z, yaw: s.yaw })),
      });
    });
  });
}
