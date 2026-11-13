// 방 데이터: creator.json, 레이아웃, 팔레트, 앨범 규칙, 카드 목록.

export async function setupData(ctx) {
  const { ac, opts, dataBase, rand } = ctx;

  // ====================================================================================
  // 1. Room data: the database part arrives in opts.data (rooms, layout, reels, pieces, guestbook, visits, creatorVisit).
  //    <dataBase><id>/creator.json (links, albums, linktree, phoneTitle) is still a static file.
  // ====================================================================================
  const getJSON = async p => { const r = await fetch(p, { signal: ac.signal }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
  const DATA = opts.data;
  const ROOMS = DATA.rooms;
  const roomId = opts.roomId;
  const BASE = `${dataBase}${roomId}/`;
  // creator.json holds links and albums. A room without one (404) falls back to no links, no albums; the title is always the room's own name (heap_rooms.name).
  let creatorJson = {};
  {
    const r = await fetch(BASE + 'creator.json', { signal: ac.signal });
    if (r.ok) creatorJson = await r.json(); else if (r.status !== 404) throw new Error(`${BASE}creator.json: ${r.status}`);
  }
  const creator = { links: [], albums: [], linktree: null, ...creatorJson, name: DATA.name, phoneTitle: creatorJson.phoneTitle || DATA.name };
  // creator.json is a static file. Only links that pass the server's checks reach the page: an absolute http(s) address with a host, or a mailto to one recipient, or an email address. The rest are dropped.
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

  const ALBUMS = creator.albums.map(a => ({ ...a, re: a.match ? new RegExp(a.match, 'i') : null }));
  const albumName = k => ALBUMS.find(a => a.key === k)?.name ?? k;
  function goldOf(r) { // album is certain from the channel or exactly one title rule; anything else is open for votes
    const byChannel = ALBUMS.find(a => a.channel && a.channel === r.channel);
    if (byChannel) return byChannel.key;
    const m = ALBUMS.filter(a => a.re && a.re.test(r.title || ''));
    return m.length === 1 ? m[0].key : null;
  }

  // 꾸미기 (room-editor.tsx, through the hooks in section 6): ORIGINAL is the layout as last saved in the database (the page's, or the one the editor just saved via heap:saved).
  // It is the editor's 처음으로 target. BASE_LAYOUT is the whole stored layout; the editor merges its items, time and room into it when it saves.
  ctx.baseLayout = structuredClone(DATA.layout);
  ctx.original = { items: (layout.items || []).map(it => ({ ...it })), time: layout.time ?? 'auto' };

  // ---------- reels ----------
  // A reel carries its linked channel's title (heap_creator_channels); the card back shows it and album rules with `channel` match it.
  // Reels with no linked channel fall back to the creator's name, so a `channel` album rule finds nothing for them (title rules still work).
  const raw = DATA.reels;
  const reels = raw.map(r => ({ ...r, channel: r.channel || creator.name }));
  reels.forEach((r, i) => { r.age = reels.length > 1 ? 1 - i / (reels.length - 1) : 0; r.seed = Math.floor(rand() * 1e9); r.gold = goldOf(r); });
  const nShorts = raw.filter(r => !r.wide).length, nWide = raw.length - nShorts;

  const fanReelOf = (p, i) => ({ ...p, kind: 'fan', wide: false, title: p.caption, channel: p.by, views: '', age: 0.05, seed: 7000 + i * 131 });
  const fanReels = (DATA.pieces || []).map(fanReelOf);

  const filed = new Map(); // reel id → { album }: only cards whose album is certain from the title or channel
  for (const r of reels) if (r.gold) filed.set(r.id, { album: r.gold });

  Object.assign(ctx, {
    C, creator, DATA, nWide, nShorts, layout, ALBUMS, reels, getJSON, fanReels, fanReelOf, ROOMS, roomId,
    filed, albumName,
  });
}
