// 썸네일 불러오기: 세 단계로 나눠 천천히 선명해진다.
import { thumbUrl } from './util.js';
import { cropToShape } from './draw.js';

export function setupThumbs(ctx) {
  const { onDispose, drawCard, paintPoster, drawProjection, cards } = ctx;

  // 썸네일: 카드는 영상이 고른 썸네일을 세 단계로 보여 준다. 천천히 받아서 그 자리에서 선명해진다.
  //   far    mqdefault (320x180, 약 7 KB): 방이 뜬 뒤 모든 카드, 더미 위쪽부터
  //   near   hqdefault (480x360, 약 14 KB): 벽 포스터, 그리고 탁자에 앉았을 때 모든 카드
  //   close  oardefault (쇼츠가 고른 세로 썸네일, 약 160 KB) 또는 hq720 (가로 영상): 집어 든 카드만
  // 카드는 한 단계 위로 올라가면 다시 내려오지 않는다. 받지 못한 단계는 카드를 그대로 둔다.
  const FAR = 0, NEAR = 1, CLOSE = 2, MAX_LOADS = 6;
  const thumbFiles = (reel, tier) => tier === FAR ? ['mqdefault'] : tier === NEAR ? ['hqdefault'] : reel.wide ? ['hq720', 'hqdefault'] : ['oardefault'];
  const loadQueue = [], inFlight = new Set(); // { card, tier } jobs waiting in load order · Images still downloading
  let loading = 0;
  onDispose(() => { loadQueue.length = 0; cancelThumbs(inFlight); });

  function landed(card, tier, im) {
    const u = card.userData;
    if (u.tier >= tier) return;
    u.tier = tier; u.img = cropToShape(im, u.reel);
    drawCard(u.reel, u.img, u.front.image); u.front.needsUpdate = true;
    if (u.poster) paintPoster(card);
    if (card === ctx.loaded) drawProjection(u.reel, u.img);
    if (card === ctx.phonePic?.card) ctx.showPhonePic();
  }
  // 썸네일 한 장: files 를 앞에서부터 시도해 처음 쓸 수 있는 Image 를 done 에 준다. 모두 실패하면 done(null).
  // dispose 뒤에는 부르지 않는다. group 은 같은 주인의 요청을 함께 멈추려는 Set 이다 (가구를 다시 지으면 아직 받는 기념품 썸네일이 멈춘다).
  function loadThumb(id, files, done, group) {
    const im = new Image(); im.crossOrigin = 'anonymous';
    const end = ok => {
      im.onload = im.onerror = null; inFlight.delete(im); group?.delete(im);
      if (ctx.disposed) return;
      if (!ok && files.length > 1) return loadThumb(id, files.slice(1), done, group); // 다음 파일이 같은 자리를 이어받는다
      try { done(ok ? im : null); } catch (e) { console.error('[heap-room]', e); }
    };
    im.onload = () => end(im.naturalWidth > 120); // 없는 썸네일은 404 와 함께 120px 자리 표시 그림이 오고, 그래도 load 가 불린다
    im.onerror = () => end(false);
    inFlight.add(im); group?.add(im); im.src = thumbUrl({ id }, files[0]);
  }
  function cancelThumbs(group) {
    for (const im of group) { im.onload = im.onerror = null; im.src = ''; inFlight.delete(im); }
    group.clear();
  }
  function load(card, tier, files) {
    loadThumb(card.userData.reel.id, files, im => {
      try { if (im) landed(card, tier, im); } finally { loading--; pump(); }
    });
  }
  function pump() {
    while (loading < MAX_LOADS && loadQueue.length) {
      const { card, tier } = loadQueue.shift();
      if (card.userData.tier >= tier) continue; // a sharper picture is already on the card
      loading++; load(card, tier, thumbFiles(card.userData.reel, tier));
    }
  }
  // now = true skips the queue: the one card the visitor has just picked up
  function request(card, tier, now = false) {
    const u = card.userData;
    if (ctx.disposed || u.reel.kind === 'fan' || u.asked[tier] || u.tier >= tier) return;
    u.asked[tier] = true;
    if (now) { loading++; load(card, tier, thumbFiles(u.reel, tier)); } else { loadQueue.push({ card, tier }); pump(); }
  }
  function requestPile(tier) { for (let i = cards.length - 1; i >= 0; i--) request(cards[i], tier); } // cards runs bottom → top, so this asks top first

  Object.assign(ctx, { loadThumb, cancelThumbs, requestPile, FAR, request, NEAR, CLOSE });
}
