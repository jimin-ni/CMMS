// 화면 위 글자: 방 이름, TODAY/TOTAL, 다녀감, 안내 문구, 알림, 모드에 따른 버튼.
import { ytUrl } from './format.js';

export function setupHud(ctx) {
  const { root, C, creator, $, DATA, nWide, nShorts, opts } = ctx;

  root.style.setProperty('--clay', C.accent);
  document.title = ctx.roomTitle = `${creator.name} Miniroom`;
  $('cname').textContent = creator.name;
  $('avatar').textContent = Array.from(creator.name)[0] ?? '';
  $('phone-title').textContent = creator.phoneTitle || creator.name;
  $('phone-sub').textContent = '버블';

  ctx.visits = { today: DATA.visits.today, total: DATA.visits.total };
  const metaBase = nWide ? `쇼츠 ${nShorts} · 영상 ${nWide}` : `쇼츠 ${nShorts}`;
  function renderMeta() { $('meta').textContent = `${metaBase} · TODAY ${ctx.visits.today} · TOTAL ${ctx.visits.total.toLocaleString('ko-KR')}` + (opts.viewerName ? ` · ${opts.viewerName}` : ''); }
  renderMeta();
  // 다녀감: the day the creator last came by, "2026.11.12" (Asia/Seoul), or null. From heap_rooms.creator_visited_at.
  ctx.creatorDay = typeof DATA.creatorVisit === 'string' && /^\d{4}\.\d{1,2}\.\d{1,2}$/.test(DATA.creatorVisit) ? DATA.creatorVisit : null;
  function renderCreatorVisit() { if (ctx.creatorDay) { $('visit').textContent = `주인 다녀감 ${ctx.creatorDay.split('.').slice(1).join('.')}`; $('visit').hidden = false; } }
  renderCreatorVisit();

  const hint = $('hint');
  const HINTS = {
    room: '방향키·WASD 또는 바닥을 눌러 걷기 · 탁자, 책장, 문을 눌러 보세요',
    near: 'E 또는 탁자를 눌러 앉기',
    nearShelf: 'E 또는 책장을 눌러 앨범 정리하기',
    nearDoor: 'E 또는 문을 눌러 다른 방으로',
    sit: '사진을 눌러 집기 · 끌어서 옮기기 · 휴대폰을 눌러 버블 열기',
    held: '사진을 눌러 뒤집기 · 영사기를 눌러 상영 · 바깥을 눌러 내려놓기',
    drag: '원하는 곳에 놓으세요',
    needcard: '사진을 먼저 집어 든 다음 영사기를 눌러 보세요',
    watch: '상영 중 · 스크린을 눌러 다시 재생 · Esc로 사진 꺼내기',
    shelf: '앨범을 눌러 안을 보기 · Esc로 물러나기',
    nearBook: 'E 또는 방명록을 눌러 이름 남기기',
    perch: '방향키·WASD 또는 바닥을 눌러 일어나기 · Esc로도 일어나요',
  };
  const setHint = k => { if (hint.dataset.k !== k) { hint.dataset.k = k; hint.textContent = HINTS[k]; } };

  function syncUI() {
    const seated = ctx.mode === 'sit' || ctx.mode === 'watch';
    $('stand').hidden = !(seated || ctx.perch);
    $('flip').hidden = !(ctx.mode === 'sit' && ctx.held);
    const isFan = c => c?.userData.reel.kind === 'fan';
    $('srclink').hidden = !(ctx.mode === 'sit' && ctx.held) || isFan(ctx.held);
    if (ctx.held && !isFan(ctx.held)) $('srclink').href = ytUrl(ctx.held.userData.reel);
    $('eject').hidden = ctx.mode !== 'watch';
    $('ytlink').hidden = ctx.mode !== 'watch' || isFan(ctx.loaded);
    $('sortexit').hidden = ctx.mode !== 'sort';
    $('albumrow').hidden = ctx.mode !== 'sort';
    root.dispatchEvent(new CustomEvent('heap:mode', { detail: ctx.mode })); // heap-room.tsx shows its 꾸미기 button in room mode only
  }

  ctx.toastTimer = 0;
  function toast(t) { $('toast').textContent = t; ctx.toastTimer = 2.2; }

  Object.assign(ctx, { setHint, syncUI, toast, renderMeta, renderCreatorVisit });
}
