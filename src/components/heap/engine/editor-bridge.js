// 꾸미기 패널과 주고받는 이벤트: heap:items, heap:get, heap:saved, heap:edit.

export function setupEditorBridge(ctx) {
  const {
    on, root, unperch, buildItems, linkShelf, updateAlbums, startSlots, enterSort, exitSort,
    getCatalogue, RX, RZ, TABLE, DOOR, WIN, creator,
  } = ctx;

  // Live room contents, for a creator's editor. Dispatch on the element given to mountRoom once the room is up (#status hidden):
  //   root.dispatchEvent(new CustomEvent('heap:items', { detail: itemsArray }))
  //     replaces everything built from layout.items. Same item shapes as layout.json.
  //   root.dispatchEvent(new CustomEvent('heap:get', { detail: cb }))
  //     calls cb({ room: { w, d }, layout, items, catalogue, table, door, window, time, original }) once the model catalogue has been read
  //     (catalogue is null if it could not be). items is a copy of the list now in the room; catalogue is catalogue.json as it is.
  //     table { x, z, w, d }, door { wall, at } and window { wall, at, w } are the fixed parts a floor plan shows (door and window may be null).
  //     creatorLinks is the links list of creator.json (the PC's fallback) and linktree its linktree address or null: the editor offers them when an owner sets up a PC.
  //     seats lists the seat points of the items built so far, { id, kind, x, y, z, yaw } each (see addSeats): the models that sit on loaded after the first build.
  //     time is the room's time choice as it was given ('auto', a name or an hour); original { items, time } is the layout as last saved in the database;
  //     layout is the whole stored layout (a copy): the editor merges its items, time and room into it before saving.
  //   root.dispatchEvent(new CustomEvent('heap:saved', { detail: layout }))
  //     tells the engine the editor saved this whole layout: it becomes the new original / 처음으로 target.
  // Walls, floor, table, heap, projector, phone and guestbook stay as they were built.
  on(root, 'heap:items', e => {
    if (!Array.isArray(e.detail)) return;
    if (ctx.perch) unperch(); // the seat is about to be rebuilt
    buildItems(e.detail.filter(it => it && typeof it === 'object').map(it => ({ ...it })));
    // music that no longer has its radio, speaker or TV (or whose link was changed) stops
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
