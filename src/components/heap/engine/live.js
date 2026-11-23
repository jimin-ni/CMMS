// 다른 사람이 남긴 것: 방명록, 방문 수, 올라온 팬 작품. 주기적으로 읽어 온다.
import { el, bindOverlay } from './dom.js';
import { fmtDay, reelKey } from './format.js';
import { toEngineNote } from './tree-ids.js';

export function setupLive(ctx) {
  const {
    makeCard, Xv, clampPlace, gauss, settle, startAnim, toast, DATA, $, creator,
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
      c.position.set(home.x, (ctx.HOST?.top ?? 0) + 0.9 + k * 0.01, home.z);
      c.quaternion.setFromAxisAngle(Xv, -Math.PI / 2);
      startAnim(c, 'drop'); Object.assign(c.userData.anim, { dur: 0.9, arc: 0.25 });
      request(c, FAR);
    });
    renderMeta(); updateAlbums();
    ctx.refreshPosters(); ctx.refreshLatestTv(); // 벽 포스터와 최신 영상 TV 도 남은 영상으로 다시 고른다
  }
  on(root, 'heap:reels', e => replaceReels(e.detail));
  // 방 주인이 꾸미기에서 쪽지 공개일을 바꿨다 (heap-room.tsx 가 저장된 ISO 시각 또는 null 을 보낸다): 트리가 쪽지를 다시 읽는다 (tree.js 의 setRevealAt)
  on(root, 'heap:reveal', e => ctx.setNoteRevealAt?.(typeof e.detail === 'string' ? e.detail : null));

  // 팬 작품: 방문자가 방에 있는 동안 올라온 것은 탁자 위에서 더미 꼭대기로 떨어진다
  function landPiece(p) {
    const c = makeCard(p);
    const H = ctx.HOST ?? { x: 0, z: 0, top: 0 }; // 더미가 없는 방: 카드는 보이지 않는다 (heap.js 의 makeCard)
    c.position.set(H.x, H.top + 0.9, H.z);
    c.quaternion.setFromAxisAngle(Xv, -Math.PI / 2);
    c.userData.place = clampPlace({ x: H.x + gauss() * 0.15, z: H.z + gauss() * 0.1, yaw: gauss() * 0.5, faceUp: true });
    settle();
    startAnim(c, 'drop'); Object.assign(c.userData.anim, { dur: 1.1, arc: 0.35 });
    toast(`${p.by}님의 팬 작품이 더미 위에 올라왔어요`);
  }

  // 방명록: 이름과 날짜만. 줄은 DB 행 { id, name, createdAt(ISO) } 이고 최신이 먼저이며, 페이지, 폴링, 방문자 자신의 제출에서 id 로 합친다.
  // screen(0013): removed 는 이름 자리에 서버가 삭제 문구를 넣어 보낸다. blocked·held 는 쓴 사람에게만 온다.
  const gbRow = e => ({ id: e.id, name: e.name, createdAt: e.createdAt, ...(e.screen ? { screen: e.screen } : {}), ...(e.mine ? { mine: true } : {}) });
  // 0013 남의 줄: 신고(방 주인·관리자), 차단(방 주인·관리자는 쓰기 막기, 다른 사람은 나에게서 가리기). 확인은 그 줄 안에서 한 번 더 묻는다.
  const canModerate = !!DATA.canModerate;
  let gbAsk = null; // { id, kind: 'report' | 'block' }
  let gbGuardBusy = false;
  function gbTools(e) {
    const box = el('span', 'gb-tools');
    if (gbAsk?.id === e.id) {
      box.appendChild(el('em', null, gbAsk.kind === 'report' ? '신고할까요?' : canModerate ? '쓰기를 막을까요?' : '나에게서 가릴까요?'));
      const yes = el('button', 'gb-act', '예'); yes.type = 'button';
      const no = el('button', 'gb-act', '아니요'); no.type = 'button';
      yes.onclick = () => gbConfirm(e.id, gbAsk.kind);
      no.onclick = () => { gbAsk = null; renderGuestbook(); };
      box.append(yes, no);
      return box;
    }
    if (canModerate && e.screen !== 'removed' && opts.reportPost) {
      const b = el('button', 'gb-act', '신고'); b.type = 'button';
      b.onclick = () => { gbAsk = { id: e.id, kind: 'report' }; renderGuestbook(); };
      box.appendChild(b);
    }
    if (canModerate ? opts.blockAuthor : opts.hidePerson) {
      const b = el('button', 'gb-act', '차단'); b.type = 'button';
      b.onclick = () => { gbAsk = { id: e.id, kind: 'block' }; renderGuestbook(); };
      box.appendChild(b);
    }
    return box;
  }
  async function gbConfirm(id, kind) {
    if (gbGuardBusy) return;
    gbGuardBusy = true; gbAsk = null;
    let res;
    try {
      res = kind === 'report' ? await opts.reportPost('guestbook', id)
        : canModerate ? await opts.blockAuthor('guestbook', id) : await opts.hidePerson('guestbook', id);
    } catch { res = { ok: false, error: '처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }; }
    gbGuardBusy = false;
    if (ctx.disposed) return;
    if (!res?.ok) { $('gb-msg').textContent = res?.error ?? '처리하지 못했어요.'; renderGuestbook(); return; }
    if (kind === 'report') {
      const r = gbRows.get(id);
      if (r) gbRows.set(id, { ...r, name: opts.removedText ?? '', screen: 'removed' });
      $('gb-msg').textContent = '신고했어요. 이름을 내렸어요';
    } else if (canModerate) {
      $('gb-msg').textContent = '차단했어요';
    } else {
      hideGuestbookRows(res.hiddenGuestbookIds ?? []);
      ctx.mergeTreeNotes?.([], res.hiddenNoteIds ?? []);
      ctx.refreshBlocked?.();
      $('gb-msg').textContent = '차단했어요. 이제 보이지 않아요';
    }
    renderGuestbook();
  }
  function hideGuestbookRows(ids) {
    for (const id of ids) gbRows.delete(id);
    if (!$('guestbook').hidden) renderGuestbook();
  }
  ctx.hideGuestbookRows = hideGuestbookRows;
  const gbRows = new Map((DATA.guestbook || []).map(e => [e.id, gbRow(e)]));
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
      const row = el('div', e.screen ? `gb-row ${e.screen === 'removed' ? 'removed' : 'mine-only'}` : 'gb-row');
      row.appendChild(el('span', null, e.name));
      row.appendChild(el('small', null, e.screen === 'blocked' || e.screen === 'held' ? `나에게만 보여요 · ${fmtDay(e.createdAt)}` : fmtDay(e.createdAt)));
      if (opts.signedIn && !e.mine && !e.screen?.match(/^(blocked|held)$/)) row.appendChild(gbTools(e));
      list.appendChild(row);
    }
  }
  // 방 주인의 "새 방명록 N" (fixtures.js 의 방명록 위 표지). 본 시각은 주인의 브라우저(localStorage)에만 남는다:
  // 다른 기기에서 열어 봐도 여기의 표지는 줄지 않는다. 처음이면(기록 없음) 모든 이름이 새것이다.
  const GB_SEEN = `heap-gb-seen:${opts.roomUuid}`;
  let gbSeen = '';
  try { gbSeen = localStorage.getItem(GB_SEEN) ?? ''; } catch { /* 막힌 저장소: 기록 없음 */ }
  const gbNew = () => (opts.isOwner ? [...gbRows.values()].filter(e => e.createdAt > gbSeen).length : 0);
  function paintGbChips() {
    const n = ctx.mode === 'edit' ? 0 : gbNew();
    for (const c of ctx.build?.gbChips ?? []) c.paint(n > 0 ? `새 방명록 ${n}` : '');
  }
  // 열린 방명록에 보이는 이름은 모두 본 것이다. 기준은 가장 최근 이름의 시각 (기기 시계와 상관없게)
  function markGbSeen() {
    if (!opts.isOwner) return;
    const latest = gbSorted()[0]?.createdAt ?? '';
    if (latest > gbSeen) { gbSeen = latest; try { localStorage.setItem(GB_SEEN, gbSeen); } catch { /* 막힌 저장소 */ } }
    paintGbChips();
  }
  on(root, 'heap:mode', paintGbChips); // 꾸미기 중에는 숨긴다
  ctx.paintGbChips = paintGbChips;
  paintGbChips();

  function openGuestbook() {
    renderGuestbook();
    markGbSeen();
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
        // 판정에 걸린 이름은 쓴 사람에게만 보인다. 안내는 방명록 안에 남긴다 (토스트는 금방 사라진다).
        const hiddenEntry = !!res.notice;
        gbRows.set(res.entry.id, gbRow(hiddenEntry ? { ...res.entry, screen: 'blocked' } : res.entry));
        $('gb-name').value = '';
        renderGuestbook();
        if (hiddenEntry) $('gb-msg').textContent = res.notice.text;
        else toast(`${res.entry.name}님, 다녀가셨어요`);
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
      // 쪽지: 바뀐 것은 id 로 합치고 보이지 않게 된 것은 뺀다 (tree.js 의 mergeTreeNotes). 봉인 시각과 안 읽은 수는 답이 주는 값으로 맞춘다.
      if (Array.isArray(d.notes) || Array.isArray(d.removedNoteIds) || d.noteRevealAt !== undefined) {
        const up = (Array.isArray(d.notes) ? d.notes : []).filter(n => n && typeof n.id === 'string').map(toEngineNote);
        const gone = Array.isArray(d.removedNoteIds) ? d.removedNoteIds : [];
        const reveal = d.noteRevealAt === undefined ? undefined : (typeof d.noteRevealAt === 'string' ? d.noteRevealAt : null);
        if (up.length || gone.length || reveal !== undefined) ctx.mergeTreeNotes?.(up, gone, reveal);
      }
      if (opts.isOwner && Number.isFinite(d.unreadNotes) && d.unreadNotes !== ctx.unreadNotes) { ctx.unreadNotes = d.unreadNotes; renderMeta(); }
      for (const e of d.guestbook || []) gbRows.set(e.id, gbRow(e));
      if (!$('guestbook').hidden) { renderGuestbook(); markGbSeen(); } else paintGbChips();
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
