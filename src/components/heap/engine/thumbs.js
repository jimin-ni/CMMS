// 썸네일 불러오기: 세 단계로 나눠 천천히 선명해진다.
import * as THREE from 'three';
import { thumbUrl } from './util.js';
import { hasThumb } from './format.js';
import { cropToShape } from './draw.js';

export function setupThumbs(ctx) {
  const { onDispose, drawCard, paintPoster, cards } = ctx;

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
    drawCard(u.reel, u.img, u.front.image, u.sharp || undefined); u.front.needsUpdate = true;
    if (u.poster) paintPoster(card);
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
  // 카드를 집어 든 동안 더미의 줄은 멈춘다: 집은 카드의 큰 그림이 연결을 혼자 쓴다. 내려놓으면 modes.js 가 다시 부른다
  function pump() {
    while (!ctx.held && loading < MAX_LOADS && loadQueue.length) {
      const { card, tier } = loadQueue.shift();
      if (card.userData.tier >= tier) continue; // 더 선명한 그림이 이미 카드에 있다
      loading++; load(card, tier, thumbFiles(card.userData.reel, tier));
    }
  }
  // now = true 는 줄을 건너뛴다: 방문자가 방금 집어 든 카드 한 장
  function request(card, tier, now = false) {
    const u = card.userData;
    // 썸네일이 있는 카드만 받는다 (유튜브). 팬 작품과 붙여 넣은 게시물 카드는 자기 그림으로 끝이다.
    if (ctx.disposed || !hasThumb(u.reel) || u.asked[tier] || u.tier >= tier) return;
    u.asked[tier] = true;
    if (now) { loading++; load(card, tier, thumbFiles(u.reel, tier)); } else { loadQueue.push({ card, tier }); pump(); }
  }
  function requestPile(tier) { for (let i = cards.length - 1; i >= 0; i--) request(cards[i], tier); } // cards runs bottom → top, so this asks top first

  // 집어 든 카드의 앞면을 화면에 뜰 크기로 다시 그린다: 날아오는 동안에도 선명하다. 큰 그림은 받는 대로 이 크기로 그린다 (landed).
  // 내려놓으면 더미 크기(LOW)로 돌린다. 팬 작품은 자기 그림이라 그대로 둔다.
  // 배율: 눈앞에 다 왔을 때 카드가 화면에 차지하는 실제 px 높이(loop.js 의 dist 와 같은 셈) 의 1.25 배. 든 동안은 밉맵을 끈다: 밉맵은 글자를 흐린다
  function sharpen(card, on) {
    const u = card.userData, t = u.front;
    if (u.reel.kind === 'fan' || !!u.sharp === on) return;
    if (on) {
      const cam = ctx.camera, tn = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), d = u.d;
      const dist = Math.max(d.h / (1.5 * tn), d.w / (1.7 * tn * cam.aspect));
      const px = ctx.renderer.domElement.height * d.h / (2 * dist * tn); // 눈앞의 카드 높이 (그리기 버퍼 px)
      u.sharp = Math.min(4, Math.max(1, px / ctx.frontSpec(u.reel).H * 1.25));
    } else u.sharp = 0;
    drawCard(u.reel, u.img, t.image, u.sharp || undefined);
    t.generateMipmaps = !on; t.minFilter = on ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
    t.dispose(); t.needsUpdate = true; // 크기와 밉맵이 바뀌었다: GPU 쪽 텍스처를 새로 만든다
  }

  Object.assign(ctx, { loadThumb, cancelThumbs, requestPile, FAR, request, NEAR, CLOSE, pumpThumbs: pump, sharpen });
}
