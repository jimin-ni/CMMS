// 다른 사람이 남긴 것: 방명록, 방문 수, 올라온 팬 작품. 주기적으로 읽어 온다.
import { el } from './dom.js';
import { fmtDay } from './format.js';

export function setupLive(ctx) {
  const {
    makeCard, TABLE, Xv, clampPlace, gauss, settle, startAnim, toast, DATA, $, creatorVisit, creator,
    root, on, opts, ac, renderMeta, renderCreatorVisit, fanReels, fanReelOf, onDispose,
  } = ctx;

  // fan pieces: one that lands while the visitor is in the room drops onto the top of the heap from above the table
  function landPiece(p) {
    const c = makeCard(p);
    c.position.set(TABLE.x, TABLE.top + 0.9, TABLE.z);
    c.quaternion.setFromAxisAngle(Xv, -Math.PI / 2);
    c.userData.place = clampPlace({ x: TABLE.x + gauss() * 0.15, z: TABLE.z + gauss() * 0.1, yaw: gauss() * 0.5, faceUp: true });
    settle();
    startAnim(c, 'drop'); Object.assign(c.userData.anim, { dur: 1.1, arc: 0.35 });
    toast(`${p.by}님의 팬 작품이 더미 위에 올라왔어요`);
  }

  // guestbook: names and dates only. Rows are database rows { id, name, createdAt (ISO) }, newest first, merged by id from the page, the poll and the visitor's own submit.
  const gbRows = new Map((DATA.guestbook || []).map(e => [e.id, { id: e.id, name: e.name, createdAt: e.createdAt }]));
  const gbSorted = () => [...gbRows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? 1 : -1));
  function renderGuestbook() {
    const list = $('gb-list'); list.innerHTML = '';
    if (creatorVisit()) { // 다녀감: the creator's own row comes first
      const row = el('div', 'gb-row owner');
      row.appendChild(el('span', null, creator.name));
      row.appendChild(el('small', null, `주인 · ${creatorVisit()}`));
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
  const gbForm = root.querySelector('#gb-form'); // absent for a signed-out viewer: heap-room.tsx shows a sign-in line instead
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
  on($('gb-close'), 'click', () => { $('guestbook').hidden = true; });

  // polling: what others changed (guestbook rows, visit counts, 다녀감, landed pieces) every opts.pollMs while the tab is visible.
  // The first cursor is the snapshot's serverTime; each reply carries the next. Overlapping rows are merged by id.
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
      // pieces: a newly landed one drops onto the heap. A card already on the heap stays when its piece is taken off (until fan pieces get their own screens)
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
