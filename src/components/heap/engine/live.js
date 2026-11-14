// 다른 사람이 남긴 것: 방명록, 방문 수, 올라온 팬 작품. 주기적으로 읽어 온다.
import { el, bindOverlay } from './dom.js';
import { fmtDay, reelKey } from './format.js';

export function setupLive(ctx) {
  const {
    makeCard, TABLE, Xv, clampPlace, gauss, settle, startAnim, toast, DATA, $, creator,
    root, on, opts, ac, renderMeta, renderCreatorVisit, fanReels, fanReelOf, onDispose,
    cards, pickables, scene, reels, filed, prepReel, request, FAR, updateAlbums,
  } = ctx;

  // 크리에이터의 영상 목록이 바뀌었다 (꾸미기의 채널 탭: 채널 연결, 빼기, 되돌리기). heap-room.tsx 가 새 스냅샷의 reels 를 heap:reels 로 보낸다.
  // 목록에서 빠진 영상의 카드는 더미에서 치우고, 새로 온 영상은 탁자 위에서 떨어뜨린다. 남은 카드는 자리를 지킨다.
  // 손에 들었거나 영사기에 걸린 카드는 치우지 않는다 (다음 방문에 빠진다).
  function replaceReels(list) {
    if (!Array.isArray(list)) return;
    const next = list.filter(r => r && typeof r.id === 'string');
    const want = new Set(next.map(reelKey));
    let changed = false;
    for (const c of [...cards]) {
      const r = c.userData.reel;
      if (r.kind === 'fan' || want.has(reelKey(r)) || c === ctx.held || c === ctx.loaded || c === ctx.dragging) continue;
      cards.splice(cards.indexOf(c), 1);
      for (const m of c.children) { const k = pickables.indexOf(m); if (k >= 0) pickables.splice(k, 1); m.material.map?.dispose(); m.material.dispose(); }
      scene.remove(c); // 지오메트리는 카드끼리 함께 쓴다 (DIMS): 지우지 않는다
      if (ctx.hovered === c) ctx.hovered = null;
      delete c.userData.poster; // 늦게 온 썸네일이 포스터에 그리지 않게
      const i = reels.indexOf(r); if (i >= 0) reels.splice(i, 1);
      filed.delete(reelKey(r));
      changed = true;
    }
    const have = new Set(reels.map(reelKey)), added = [];
    next.forEach((raw, i) => {
      if (have.has(reelKey(raw))) return;
      const reel = prepReel(raw, i, next.length);
      reels.push(reel);
      if (reel.gold) filed.set(reelKey(reel), { album: reel.gold });
      added.push(makeCard(reel));
    });
    if (!changed && !added.length) return;
    settle(); // 한 번에 다시 쌓는다 (카드마다 부르면 느리다). 새 카드는 여기서 제자리를 얻는다
    // 새 카드는 제자리 위에서 시작해 떨어진다
    added.forEach((c, k) => {
      const home = c.userData.home.pos;
      c.position.set(home.x, TABLE.top + 0.9 + k * 0.01, home.z);
      c.quaternion.setFromAxisAngle(Xv, -Math.PI / 2);
      startAnim(c, 'drop'); Object.assign(c.userData.anim, { dur: 0.9, arc: 0.25 });
      request(c, FAR);
    });
    renderMeta(); updateAlbums();
    ctx.refreshPosters(); ctx.refreshLatestTv(); // 벽 포스터와 최신 영상 TV 도 남은 영상으로 다시 고른다
  }
  on(root, 'heap:reels', e => replaceReels(e.detail));

  // 팬 작품: 방문자가 방에 있는 동안 올라온 것은 탁자 위에서 더미 꼭대기로 떨어진다
  function landPiece(p) {
    const c = makeCard(p);
    c.position.set(TABLE.x, TABLE.top + 0.9, TABLE.z);
    c.quaternion.setFromAxisAngle(Xv, -Math.PI / 2);
    c.userData.place = clampPlace({ x: TABLE.x + gauss() * 0.15, z: TABLE.z + gauss() * 0.1, yaw: gauss() * 0.5, faceUp: true });
    settle();
    startAnim(c, 'drop'); Object.assign(c.userData.anim, { dur: 1.1, arc: 0.35 });
    toast(`${p.by}님의 팬 작품이 더미 위에 올라왔어요`);
  }

  // 방명록: 이름과 날짜만. 줄은 DB 행 { id, name, createdAt(ISO) } 이고 최신이 먼저이며, 페이지, 폴링, 방문자 자신의 제출에서 id 로 합친다.
  const gbRows = new Map((DATA.guestbook || []).map(e => [e.id, { id: e.id, name: e.name, createdAt: e.createdAt }]));
  const gbSorted = () => [...gbRows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? 1 : -1));
  function renderGuestbook() {
    const list = $('gb-list'); list.innerHTML = '';
    if (ctx.creatorDay) { // 다녀감: the creator's own row comes first
      const row = el('div', 'gb-row owner');
      row.appendChild(el('span', null, creator.name));
      row.appendChild(el('small', null, `주인 · ${ctx.creatorDay}`));
      list.appendChild(row);
    }
    for (const e of gbSorted()) {
      const row = el('div', 'gb-row');
      row.appendChild(el('span', null, e.name));
      row.appendChild(el('small', null, fmtDay(e.createdAt)));
      list.appendChild(row);
    }
  }
  function openGuestbook() {
    renderGuestbook();
    $('gb-msg').textContent = '';
    $('guestbook').hidden = false;
    setTimeout(() => $('gb-name')?.focus(), 50);
  }
  let gbBusy = false;
  const gbForm = root.querySelector('#gb-form'); // 로그아웃한 사람에게는 없다: heap-room.tsx 가 대신 로그인 안내를 보여 준다
  if (gbForm) on(gbForm, 'submit', async e => {
    e.preventDefault();
    if (gbBusy) return;
    const name = $('gb-name').value.trim();
    if (!name) { $('gb-name').focus(); return; }
    gbBusy = true; $('gb-submit').disabled = true; $('gb-msg').textContent = '';
    try {
      const res = await opts.addGuestbook(name);
      if (ctx.disposed) return;
      if (res.ok) {
        gbRows.set(res.entry.id, res.entry);
        $('gb-name').value = '';
        renderGuestbook(); toast(`${res.entry.name}님, 다녀가셨어요`);
      } else $('gb-msg').textContent = res.message;
    } catch {
      if (!ctx.disposed) $('gb-msg').textContent = '지금은 남기지 못했어요. 잠시 뒤에 다시 시도해 주세요.';
    } finally { gbBusy = false; if (!ctx.disposed) $('gb-submit').disabled = false; }
  });
  bindOverlay(ctx, 'guestbook', 'gb-close');

  // polling: what others changed (guestbook rows, visit counts, 다녀감, landed pieces) every opts.pollMs while the tab is visible.
  // 첫 기준점은 스냅샷의 serverTime 이고, 답마다 다음 기준점이 온다. 겹치는 줄은 id 로 합친다.
  let cursor = DATA.serverTime, polling = false;
  async function poll() {
    if (ctx.disposed || polling) return;
    polling = true;
    try {
      const res = await fetch(`/api/heap/rooms/${encodeURIComponent(opts.roomUuid)}/changes?since=${encodeURIComponent(cursor)}`, { cache: 'no-store', signal: ac.signal });
      if (!res.ok || ctx.disposed) return;
      const d = await res.json();
      if (ctx.disposed) return;
      if (typeof d.cursor === 'string') cursor = d.cursor;
      if (d.visits && Number.isFinite(d.visits.today) && Number.isFinite(d.visits.total)) { ctx.visits = { today: d.visits.today, total: d.visits.total }; renderMeta(); }
      if (typeof d.creatorVisitedAt === 'string') { const day = fmtDay(d.creatorVisitedAt); if (day && day !== ctx.creatorDay) { ctx.creatorDay = day; renderCreatorVisit(); } }
      for (const e of d.guestbook || []) gbRows.set(e.id, { id: e.id, name: e.name, createdAt: e.createdAt });
      if (!$('guestbook').hidden) renderGuestbook();
      // 작품: 새로 올라온 것은 더미로 떨어진다. 더미에 있는 카드는 그 작품이 내려져도 남는다 (팬 작품 화면이 생기기 전까지)
      for (const p of d.pieces || []) {
        if (p.status !== 'landed' || fanReels.some(f => f.id === p.id)) continue;
        const fan = fanReelOf({ id: p.id, by: p.submitterName ?? '알 수 없음', date: fmtDay(p.landedAt ?? p.createdAt), caption: p.title || p.note || '팬 작품' }, fanReels.length);
        fanReels.push(fan);
        landPiece(fan);
      }
    } catch (e) {
      if (!ctx.disposed && e?.name !== 'AbortError') console.warn('[heap-room] poll', e);
    } finally { polling = false; }
  }
  function schedulePoll() {
    clearTimeout(ctx.pollTimer);
    if (ctx.disposed || document.hidden) return;
    ctx.pollTimer = setTimeout(async () => { await poll(); schedulePoll(); }, opts.pollMs);
  }
  on(document, 'visibilitychange', () => { if (document.hidden) clearTimeout(ctx.pollTimer); else { poll().then(schedulePoll); } });
  onDispose(() => clearTimeout(ctx.pollTimer));

  Object.assign(ctx, { openGuestbook, poll, schedulePoll });
}
