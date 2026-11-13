// 썸네일 불러오기: 세 단계로 나눠 천천히 선명해진다.
import { thumbUrl } from './util.js';
import { cropToShape } from './draw.js';

export function setupThumbs(ctx) {
  const { cleanups, drawCard, paintPoster, drawProjection, cards } = ctx;

  // ====================================================================================
  // 5b. Thumbnails: each card shows the video's chosen thumbnail in three tiers, loaded lazily and sharpened in place
  //   far    mqdefault (320x180, ~7 KB): every card, top of the pile first, once the room is on screen
  //   near   hqdefault (480x360, ~14 KB): the wall posters, and every card once the visitor sits at the table
  //   close  oardefault (a Short's chosen vertical thumbnail, ~160 KB) or hq720 (a wide video): only a card that is picked up
  // A card never drops back a tier. A tier that fails leaves the card as it was.
  // ====================================================================================
  const FAR = 0, NEAR = 1, CLOSE = 2, MAX_LOADS = 6;
  const thumbFiles = (reel, tier) => tier === FAR ? ['mqdefault'] : tier === NEAR ? ['hqdefault'] : reel.wide ? ['hq720', 'hqdefault'] : ['oardefault'];
  const loadQueue = [], inFlight = new Set(); // { card, tier } jobs waiting in load order · Images still downloading
  let loading = 0;
  cleanups.push(() => { loadQueue.length = 0; for (const im of inFlight) { im.onload = im.onerror = null; im.src = ''; } inFlight.clear(); });

  function landed(card, tier, im) {
    const u = card.userData;
    if (u.tier >= tier) return;
    u.tier = tier; u.img = cropToShape(im, u.reel);
    drawCard(u.reel, u.img, u.front.image); u.front.needsUpdate = true;
    if (u.poster) paintPoster(card);
    if (card === ctx.loaded) drawProjection(u.reel, u.img);
    if (card === ctx.phonePic?.card) ctx.showPhonePic();
  }
  function load(card, tier, files) {
    const im = new Image(); im.crossOrigin = 'anonymous';
    const end = ok => {
      im.onload = im.onerror = null; inFlight.delete(im);
      if (ctx.disposed) return;
      if (!ok && files.length > 1) return load(card, tier, files.slice(1)); // the tier's fallback file takes over the same slot
      try { if (ok) landed(card, tier, im); } catch (e) { console.error('[heap-room]', e); }
      loading--; pump();
    };
    im.onload = () => end(im.naturalWidth > 120); // a missing thumbnail answers 404 with a 120px placeholder that still fires load
    im.onerror = () => end(false);
    inFlight.add(im); im.src = thumbUrl(card.userData.reel, files[0]);
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

  Object.assign(ctx, { inFlight, requestPile, FAR, request, NEAR, CLOSE });
}
