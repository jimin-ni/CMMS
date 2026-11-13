// 겹쳐 뜨는 창: 휴대폰, PC, 기념품, 달력, 문 앞 방 목록. 기능 가구를 눌렀을 때 하는 일.
import { thumbUrl } from './util.js';
import { el, link, shortUrl, bindOverlay } from './dom.js';
import { ytUrl, ksDay, seoulDay } from './format.js';

export function setupPanels(ctx) {
  const { opts, creator, $, keepsakeLook, newestReel, cards, toast, sit, pickUp, feed, openMusic, ROOMS, roomId } = ctx;

  const safeHref = u => (opts.isSafeLink(u) ? u : null); // 서버가 저장 전에 레이아웃 링크를 검사한다. 이것은 DOM 이 받는 값에 하는 같은 검사다

  // 링크 하나를 말풍선으로: 제목 붙은 링크, 또는 (L.email) 주소와 복사 버튼. 휴대폰의 대체 목록과 PC 창이 함께 쓴다.
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
  // creator.json 링크, 휴대폰에 있던 그대로: 안내 글, 링크들, 링크트리 전체 목록
  function legacyLinks(into) {
    if (creator.linksNote) into.appendChild(el('span', 'chip', creator.linksNote));
    for (const L of creator.links) into.appendChild(linkBubble(L));
    if (creator.linktree) { const lt = el('div', 'bubble'); lt.appendChild(link(`${creator.linktree.replace(/^https:\/\//, '')} 전체 보기 ↗`, creator.linktree)); into.appendChild(lt); }
  }
  const hasPc = () => ctx.build.items.some(it => it.fn?.kind === 'pc');
  ctx.phonePic = null; // { card, im }: 휴대폰이 그림을 보여 주는 카드. 나중에 더 선명한 단계가 오면 휴대폰에도 닿게 한다
  function showPhonePic() {
    const pic = ctx.phonePic.card.userData.img; // 캔버스(팬 그림, 잘린 단계) 또는 가까운 단계의 Image 그대로
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
  bindOverlay(ctx, 'phone', 'phone-close', { backdrop: true });

  // PC (fn.kind "pc" 가 달린 책상, 모니터, 노트북): 크리에이터의 링크. fn.links 가 주인의 목록이고, 없으면 creator.json 링크가 대신한다.
  function openPc(fn) {
    const list = $('pc-list'); list.replaceChildren();
    if (Array.isArray(fn.links)) for (const L of fn.links) list.appendChild(linkBubble(L)); else legacyLinks(list);
    if (!list.children.length) list.appendChild(el('p', 'note', '아직 링크가 없어요.'));
    $('pc').hidden = false;
  }
  bindOverlay(ctx, 'pc', 'pc-close', { backdrop: true });

  // 기념품(액자 또는 선반 위 스탠드): 이름, 날짜, 설명, 원본 링크
  function openKeepsake(fn) {
    $('ks-title').textContent = fn.name;
    const body = $('ks-body'); body.replaceChildren();
    const look = keepsakeLook(fn);
    if (look.id) {
      const im = el('img', look.tall ? 'ks-pic tall' : 'ks-pic'); im.alt = '';
      const files = look.tall ? ['oardefault', 'hqdefault'] : ['hq720', 'mqdefault'];
      let n = 0;
      const next = () => { im.src = thumbUrl({ id: look.id }, files[n]); };
      im.addEventListener('load', () => { if (im.naturalWidth <= 120 && ++n < files.length) next(); }); // 없는 썸네일은 120px 자리 표시 그림이다
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
  bindOverlay(ctx, 'keepsake', 'ks-close', { backdrop: true });
  // 달력(책상 위): 오늘부터의 날짜를 가까운 순서로, 며칠 남았는지와 함께. 지난 날짜는 뺀다.
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
  bindOverlay(ctx, 'calendar', 'cal-close', { backdrop: true });

  // TV(fn "latest"): 탁자에 앉아 가장 최근 영상을 집어 영사기에 넣는다. 손으로 하는 것과 같은 단계다.
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

  // 방 목록: 문 앞에서 다른 방을 보여 준다. 이동은 화면을 어둡게 한 뒤 고른 id 를 opts.onNavigate 에 넘긴다.
  function openRooms() {
    const list = $('roomlist'); list.innerHTML = '';
    let anyChanged = false;
    for (const r of ROOMS) {
      const b = el('button'); b.type = 'button'; b.disabled = r.id === roomId;
      const left = el('span'); left.appendChild(el('b', null, r.name));
      if (r.changed === true && r.id !== roomId) { // 방문자가 마지막으로 다녀간 뒤 바뀐 방 (heap/repo.ts listChangedRoomSlugs). 로그인한 사람에게만 페이지가 보낸다
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
  bindOverlay(ctx, 'rooms', 'rooms-close');

  Object.assign(ctx, { showPhonePic, openRooms, openPhone, openSlot });
}
