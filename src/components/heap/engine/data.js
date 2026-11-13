// 방 데이터: creator.json, 레이아웃, 팔레트, 앨범 규칙, 카드 목록.

export async function setupData(ctx) {
  const { ac, opts, dataBase, rand } = ctx;

  // 방 데이터: DB 에서 읽은 부분은 opts.data 로 온다 (rooms, layout, reels, pieces, guestbook, visits, creatorVisit).
  // <dataBase><id>/creator.json (링크, 앨범, 링크트리, 휴대폰 제목)은 아직 정적 파일이다.
  const DATA = opts.data;
  const ROOMS = DATA.rooms;
  const roomId = opts.roomId;
  const BASE = `${dataBase}${roomId}/`;
  // creator.json 에는 링크와 앨범이 있다. 없는 방(404)은 링크도 앨범도 없이 시작하고, 제목은 늘 방 자신의 이름(heap_rooms.name)이다.
  let creatorJson = {};
  {
    const r = await fetch(BASE + 'creator.json', { signal: ac.signal });
    if (r.ok) creatorJson = await r.json(); else if (r.status !== 404) throw new Error(`${BASE}creator.json: ${r.status}`);
  }
  const creator = { links: [], albums: [], linktree: null, ...creatorJson, name: DATA.name, phoneTitle: creatorJson.phoneTitle || DATA.name };
  // creator.json 은 정적 파일이다. 서버 검사를 통과한 링크만 화면에 닿는다: 호스트가 있는 절대 http(s) 주소, 받는 사람 한 명의 mailto, 이메일 주소. 나머지는 버린다.
  creator.links = (Array.isArray(creator.links) ? creator.links : []).flatMap(L => {
    if (!L || typeof L.title !== 'string') return [];
    if (L.email != null) return L.url == null && opts.isEmail(L.email) ? [{ title: L.title, email: L.email }] : [];
    return opts.isSafeLink(L.url) ? [{ title: L.title, url: L.url }] : [];
  });
  creator.linktree = opts.isWebLink(creator.linktree) ? creator.linktree : null;
  const layout = structuredClone(DATA.layout);

  const DEFAULT_PALETTE = {
    olive: '#565344', accent: '#A6613C', paper: '#F3EADB', ink: '#2f2c24',
    wall: '#EADCC4', trim: '#565344', floor: ['#9a6a43', '#8b5d3a', '#a7774d'], woodB: '#8b5d3a', woodDark: '#6e4a30',
    leaf: '#6f7d4f', leaf2: '#87925f', leafDark: '#556240',
  };
  const C = { ...DEFAULT_PALETTE, ...(layout.palette || {}) };
  ctx.DEFAULT_PALETTE = DEFAULT_PALETTE;

  const ALBUMS = creator.albums.map(a => ({ ...a, re: a.match ? new RegExp(a.match, 'i') : null }));
  const albumName = k => ALBUMS.find(a => a.key === k)?.name ?? k;
  function goldOf(r) { // 앨범이 채널이나 제목 규칙 하나로 확실하면 그 앨범, 아니면 투표에 열어 둔다
    const byChannel = ALBUMS.find(a => a.channel && a.channel === r.channel);
    if (byChannel) return byChannel.key;
    const m = ALBUMS.filter(a => a.re && a.re.test(r.title || ''));
    return m.length === 1 ? m[0].key : null;
  }

  // 꾸미기 (room-editor.tsx, through the hooks in section 6): ORIGINAL is the layout as last saved in the database (the page's, or the one the editor just saved via heap:saved).
  // It is the editor's 처음으로 target. BASE_LAYOUT is the whole stored layout; the editor merges its items, time and room into it when it saves.
  // 팔레트를 바꾸며 다시 마운트할 때(opts.resume, edit.js 의 remount)는 그 전 마운트의 기준을 그대로 잇는다: 그 사이에 저장했을 수 있다.
  const R = opts.resume;
  ctx.baseLayout = structuredClone(R?.baseLayout ?? DATA.layout);
  // 마지막으로 저장한 방 이름. 꾸미기가 이름을 고쳐 저장하면 heap:saved 로 바뀐다 (editor-bridge.js). 화면의 이름(DATA.name)은 고친 이름일 수 있다.
  ctx.savedName = typeof R?.savedName === 'string' ? R.savedName : DATA.name;
  ctx.original = R?.original
    ? { items: R.original.items.map(it => ({ ...it })), time: R.original.time, palette: R.original.palette ?? null }
    : { items: (layout.items || []).map(it => ({ ...it })), time: layout.time ?? 'auto', palette: layout.palette ?? null };

  // ---------- 카드 목록 ----------
  // 영상은 연결된 채널의 제목(heap_creator_channels)을 가진다. 카드 뒷면에 보이고 `channel` 앨범 규칙이 이것으로 맞춘다.
  // 채널이 연결되지 않은 영상은 크리에이터 이름으로 대신한다. 그래서 `channel` 앨범 규칙은 그런 영상을 찾지 못한다 (제목 규칙은 그대로 통한다).
  const raw = DATA.reels;
  const reels = raw.map(r => ({ ...r, channel: r.channel || creator.name }));
  reels.forEach((r, i) => { r.age = reels.length > 1 ? 1 - i / (reels.length - 1) : 0; r.seed = Math.floor(rand() * 1e9); r.gold = goldOf(r); });
  const nShorts = raw.filter(r => !r.wide).length, nWide = raw.length - nShorts;

  const fanReelOf = (p, i) => ({ ...p, kind: 'fan', wide: false, title: p.caption, channel: p.by, views: '', age: 0.05, seed: 7000 + i * 131 });
  const fanReels = (DATA.pieces || []).map(fanReelOf);

  const filed = new Map(); // reel id → { album }: only cards whose album is certain from the title or channel
  for (const r of reels) if (r.gold) filed.set(r.id, { album: r.gold });

  Object.assign(ctx, {
    C, creator, DATA, nWide, nShorts, layout, ALBUMS, reels, fanReels, fanReelOf, ROOMS, roomId,
    filed, albumName,
  });
}
