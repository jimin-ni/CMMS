// 화면 위 글자: 방 이름, TODAY/TOTAL, 다녀감, 안내 문구, 알림, 모드에 따른 버튼.
import { srcUrl } from './format.js';

export function setupHud(ctx) {
  const { root, C, creator, $, DATA, reels, opts } = ctx;

  root.style.setProperty('--clay', C.accent);
  // 방 이름을 화면에 쓴다. 꾸미기(edit.js)가 이름을 고치면 저장하기 전에도 바로 바꿔 쓴다 (팔로워로 보기에 보인다).
  function showName(name) {
    document.title = ctx.roomTitle = `${name} Miniroom`;
    $('cname').textContent = name;
    $('avatar').textContent = Array.from(name)[0] ?? '';
  }
  showName(creator.name);
  $('phone-title').textContent = creator.phoneTitle || creator.name;
  $('phone-sub').textContent = '버블';

  ctx.visits = { today: DATA.visits.today, total: DATA.visits.total };
  // 새 쪽지: 방 주인에게만 센다 (opts.unreadNotes 는 서버가 주인에게만 0 이 아닌 값을 준다). live.js 의 폴링이 바꾼다.
  ctx.unreadNotes = opts.isOwner && Number.isFinite(opts.unreadNotes) ? opts.unreadNotes : 0;
  // 영상 수는 그릴 때마다 센다: 채널 탭이 영상을 넣고 빼면 reels 가 바뀐다 (live.js 의 replaceReels)
  function renderMeta() {
    const nShorts = reels.filter(r => !r.wide).length, nWide = reels.length - nShorts;
    const metaBase = nWide ? `쇼츠 ${nShorts} · 영상 ${nWide}` : `쇼츠 ${nShorts}`;
    const unread = opts.isOwner && ctx.unreadNotes > 0 ? ` · 새 쪽지 ${ctx.unreadNotes}` : '';
    $('meta').textContent = `${metaBase} · TODAY ${ctx.visits.today} · TOTAL ${ctx.visits.total.toLocaleString('ko-KR')}${unread}` + (opts.viewerName ? ` · ${opts.viewerName}` : '');
  }
  renderMeta();
  // 다녀감: the day the creator last came by, "2026.11.12" (Asia/Seoul), or null. From heap_rooms.creator_visited_at.
  ctx.creatorDay = typeof DATA.creatorVisit === 'string' && /^\d{4}\.\d{1,2}\.\d{1,2}$/.test(DATA.creatorVisit) ? DATA.creatorVisit : null;
  function renderCreatorVisit() { if (ctx.creatorDay) { $('visit').textContent = `주인 다녀감 ${ctx.creatorDay.split('.').slice(1).join('.')}`; $('visit').hidden = false; } }
  renderCreatorVisit();

  const hint = $('hint');
  const HINTS = {
    room: '방향키·WASD 또는 바닥을 눌러 걷기 · 사진 더미, 책장, 문을 눌러 보세요',
    near: 'E 또는 사진 더미를 눌러 보기',
    nearShelf: 'E 또는 책장을 눌러 앨범 정리하기',
    nearDoor: 'E 또는 문을 눌러 다른 방으로',
    sit: '사진을 눌러 집기 · 끌어서 옮기기',
    held: '사진을 눌러 뒤집기 · 두 번 눌러 영상 보기 · 바깥을 눌러 내려놓기',
    drag: '원하는 곳에 놓으세요',
    shelf: '앨범을 눌러 안을 보기 · Esc로 물러나기',
    nearTree: 'E 또는 트리를 눌러 쪽지 보기',
    tree: '장식을 눌러 쪽지 읽기 · 끌어서 트리 돌리기 · Esc로 물러나기',
    treeNote: '‹ › 로 다른 쪽지 · 바깥을 누르거나 Esc로 접기',
    globe: '끌어서 글로브 돌리기 · 누르면 눈 · Esc로 물러나기',
    perch: '방향키·WASD 또는 바닥을 눌러 일어나기 · Esc로도 일어나요',
  };
  // 트리 모드 안내에는 쪽지함의 개수가 붙는다 (자리가 없는 쪽지: tree.js 의 ctx.boxedNotes)
  const hintText = k => HINTS[k] + (k === 'tree' && ctx.boxedNotes > 0 ? ` · 쪽지함 ${ctx.boxedNotes}장은 상자를 눌러 열기` : '');
  const setHint = k => { const t = hintText(k); if (hint.dataset.k !== k || hint.textContent !== t) { hint.dataset.k = k; hint.textContent = t; } };
  const refreshHint = () => { if (hint.dataset.k) setHint(hint.dataset.k); };

  function syncUI() {
    const seated = ctx.mode === 'sit';
    $('stand').hidden = !(seated || ctx.perch);
    $('flip').hidden = !(ctx.mode === 'sit' && ctx.held);
    const isFan = c => c?.userData.reel.kind === 'fan';
    $('srclink').hidden = !(ctx.mode === 'sit' && ctx.held) || isFan(ctx.held);
    if (ctx.held && !isFan(ctx.held)) $('srclink').href = srcUrl(ctx.held.userData.reel);
    $('eject').hidden = true; $('ytlink').hidden = true; // 영사기를 걷어 내며 쓰지 않는다 (마크업은 heap-room.tsx)
    $('sortexit').hidden = ctx.mode !== 'sort';
    $('albumrow').hidden = ctx.mode !== 'sort';
    $('treeexit').hidden = ctx.mode !== 'tree';
    $('globeexit').hidden = ctx.mode !== 'globe';
    $('tree-write').hidden = ctx.mode !== 'tree'; // 쪽지 쓰기 (tree-write.js)
    root.dispatchEvent(new CustomEvent('heap:mode', { detail: ctx.mode })); // heap-room.tsx shows its 꾸미기 button in room mode only
  }

  ctx.toastTimer = 0;
  function toast(t) { $('toast').textContent = t; ctx.toastTimer = 2.2; }

  Object.assign(ctx, { setHint, refreshHint, syncUI, toast, renderMeta, renderCreatorVisit, showName });
}
