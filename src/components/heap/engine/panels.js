// 겹쳐 뜨는 창: 휴대폰, PC, 기념품, 달력, 문 앞 방 목록. 기능 가구를 눌렀을 때 하는 일.
import { thumbUrl } from './util.js';
import { el, link, shortUrl } from './dom.js';
import { ytUrl, ksDay, seoulDay } from './format.js';

export function setupPanels(ctx) {
  const { opts, creator, $, on, keepsakeLook, newestReel, cards, toast, sit, pickUp, feed, openMusic, ROOMS, roomId } = ctx;

  const safeHref = u => (opts.isSafeLink(u) ? u : null); // the server checks layout links before saving; this is the same check on what the DOM gets

  // one link as a bubble: a titled link, or (L.email) the address with a copy button. The phone's fallback list and the PC panel share it.
  function linkBubble(L) {
    const b = el('div', 'bubble');
    if (L.email) {
      b.appendChild(el('small', null, L.title));
      const em = el('span', 'email', L.email); b.appendChild(em);
      const cp = el('button', 'copy', '주소 복사'); cp.type = 'button';
      cp.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(L.email); cp.textContent = '복사했어요'; }
        catch { const s = getSelection(), rg = document.createRange(); rg.selectNodeContents(em); s.removeAllRanges(); s.addRange(rg); cp.textContent = '주소를 선택했어요'; }
      });
      b.appendChild(cp);
    } else if (safeHref(L.url)) {
      b.appendChild(link(`${L.title} ↗`, L.url));
      b.appendChild(el('small', null, shortUrl(L.url)));
    } else b.appendChild(el('span', null, L.title));
    return b;
  }
  // the creator.json links, as they were on the phone: the note, each link, the linktree's full list
  function legacyLinks(into) {
    if (creator.linksNote) into.appendChild(el('span', 'chip', creator.linksNote));
    for (const L of creator.links) into.appendChild(linkBubble(L));
    if (creator.linktree) { const lt = el('div', 'bubble'); lt.appendChild(link(`${creator.linktree.replace(/^https:\/\//, '')} 전체 보기 ↗`, creator.linktree)); into.appendChild(lt); }
  }
  const hasPc = () => ctx.build.items.some(it => it.fn?.kind === 'pc');
  ctx.phonePic = null; // { card, im }: the card whose picture the phone shows, so a sharper tier that lands later reaches it
  function showPhonePic() {
    const pic = ctx.phonePic.card.userData.img; // a canvas (fan drawing, cropped tier) or the close tier's own Image
    if (pic) ctx.phonePic.im.src = pic.toDataURL ? pic.toDataURL('image/jpeg', 0.8) : pic.src;
  }
  function openPhone() {
    const feedEl = $('phone-feed'); feedEl.replaceChildren();
    const bb = el('div', 'bubble');
    bb.appendChild(el('small', null, '크리에이터와 1:1 대화'));
    const open = el('a', null, '버블 열기 →'); open.href = opts.bubbleHref;
    open.addEventListener('click', e => { if (e.button || e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); opts.navigate(opts.bubbleHref); });
    bb.appendChild(open);
    feedEl.appendChild(bb);
    const curCard = ctx.held || ctx.loaded, cur = curCard?.userData.reel;
    ctx.phonePic = null;
    if (cur) {
      const b = el('div', 'bubble');
      b.appendChild(el('small', null, cur.kind === 'fan' ? `지금 보고 있는 팬 작품 · ${cur.by}` : '지금 보고 있는 사진'));
      const im = el('img'); im.crossOrigin = 'anonymous'; im.alt = ''; b.appendChild(im);
      ctx.phonePic = { card: curCard, im }; showPhonePic();
      b.appendChild(el('span', null, cur.title));
      if (cur.kind !== 'fan') b.appendChild(link('원본 보기 ↗', ytUrl(cur)));
      feedEl.appendChild(b);
    }
    if (!hasPc()) legacyLinks(feedEl);
    $('phone').hidden = false;
  }
  on($('phone-close'), 'click', () => { $('phone').hidden = true; });
  on($('phone'), 'click', e => { if (e.target.id === 'phone') $('phone').hidden = true; });

  // PC (a desk, monitor or laptop with fn.kind "pc"): the creator's links. fn.links is the owner's own list; without one the creator.json links stand in.
  function openPc(fn) {
    const list = $('pc-list'); list.replaceChildren();
    if (Array.isArray(fn.links)) for (const L of fn.links) list.appendChild(linkBubble(L)); else legacyLinks(list);
    if (!list.children.length) list.appendChild(el('p', 'note', '아직 링크가 없어요.'));
    $('pc').hidden = false;
  }
  on($('pc-close'), 'click', () => { $('pc').hidden = true; });
  on($('pc'), 'click', e => { if (e.target.id === 'pc') $('pc').hidden = true; });

  // keepsake (a wall frame or a shelf-top standee): name, date, caption, and the link to the original
  function openKeepsake(fn) {
    $('ks-title').textContent = fn.name;
    const body = $('ks-body'); body.replaceChildren();
    const look = keepsakeLook(fn);
    if (look.id) {
      const im = el('img', look.tall ? 'ks-pic tall' : 'ks-pic'); im.alt = '';
      const files = look.tall ? ['oardefault', 'hqdefault'] : ['hq720', 'mqdefault'];
      let n = 0;
      const next = () => { im.src = thumbUrl({ id: look.id }, files[n]); };
      im.addEventListener('load', () => { if (im.naturalWidth <= 120 && ++n < files.length) next(); }); // a missing thumbnail is a 120px placeholder
      im.addEventListener('error', () => { if (++n < files.length) next(); else im.remove(); });
      next(); body.appendChild(im);
    }
    if (fn.date) body.appendChild(el('div', 'ks-meta', ksDay(fn.date)));
    if (fn.caption) body.appendChild(el('p', 'ks-caption', fn.caption));
    if (fn.link && opts.isWebLink(fn.link)) {
      if (!look.id && look.host) body.appendChild(el('div', 'ks-meta', look.host));
      const a = link('원본 보기', fn.link); a.className = 'btn'; body.appendChild(a);
    }
    $('keepsake').hidden = false;
  }
  on($('ks-close'), 'click', () => { $('keepsake').hidden = true; });
  on($('keepsake'), 'click', e => { if (e.target.id === 'keepsake') $('keepsake').hidden = true; });
  // calendar (the desk calendar): the dates from today on, soonest first, each with how far off it is. Past dates are left out.
  function openCalendar(fn) {
    const body = $('cal-body'); body.replaceChildren();
    const today = seoulDay.format(new Date()), asDay = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
    const up = (fn.entries ?? []).filter(e => typeof e?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && typeof e.label === 'string' && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    for (const e of up) {
      const n = Math.round((asDay(e.date) - asDay(today)) / 864e5), row = el('div', 'cal-row');
      row.appendChild(el('b', null, ksDay(e.date)));
      row.appendChild(el('span', null, e.label));
      row.appendChild(el('small', null, n === 0 ? '오늘' : n === 1 ? '내일' : `${n}일 뒤`));
      body.appendChild(row);
    }
    if (!up.length) body.appendChild(el('p', 'note', '예정된 날짜가 없어요.'));
    $('calendar').hidden = false;
  }
  on($('cal-close'), 'click', () => { $('calendar').hidden = true; });
  on($('calendar'), 'click', e => { if (e.target.id === 'calendar') $('calendar').hidden = true; });

  // TV (fn "latest"): sit down at the table, pick up the newest reel and feed it to the projector, the same steps as doing it by hand.
  function watchLatest() {
    if (ctx.mode !== 'room') return;
    const reel = newestReel(), card = reel && cards.find(c => c.userData.reel === reel);
    if (!card) { toast('아직 올라온 영상이 없어요'); return; }
    sit(); pickUp(card); feed();
  }
  const openSlot = slot => {
    const k = slot.fn.kind;
    if (k === 'pc') openPc(slot.fn); else if (k === 'keepsake') openKeepsake(slot.fn);
    else if (k === 'music') openMusic(slot.fn); else if (k === 'latest') watchLatest(); else if (k === 'calendar') openCalendar(slot.fn);
  };

  // rooms: the door lists the other rooms; jumping fades out and hands the chosen id to opts.onNavigate
  function openRooms() {
    const list = $('roomlist'); list.innerHTML = '';
    let anyChanged = false;
    for (const r of ROOMS) {
      const b = el('button'); b.type = 'button'; b.disabled = r.id === roomId;
      const left = el('span'); left.appendChild(el('b', null, r.name));
      if (r.changed === true && r.id !== roomId) { // changed since the viewer's last visit there (heap/repo.ts listChangedRoomSlugs); the page sends it for signed-in viewers only
        const dot = el('span', 'dot'); dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', '다녀간 뒤 바뀐 방'); left.appendChild(dot); anyChanged = true;
      }
      left.appendChild(el('br')); left.appendChild(el('small', null, r.blurb || ''));
      b.appendChild(left); b.appendChild(el('small', null, r.id === roomId ? '지금 있는 방' : '들어가기 →'));
      b.addEventListener('click', () => jump(r.id));
      list.appendChild(b);
    }
    $('rooms-legend').hidden = !anyChanged;
    $('rooms').hidden = false;
  }
  function jump(id) {
    $('rooms').hidden = true; $('fade').classList.add('on');
    setTimeout(() => { if (!ctx.disposed) opts.onNavigate(id); }, 380);
  }
  on($('rooms-close'), 'click', () => { $('rooms').hidden = true; });

  Object.assign(ctx, { showPhonePic, openRooms, openPhone, openSlot });
}
