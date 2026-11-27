// 집어 든 카드를 HTML 로 보여 준다. 더미의 카드는 작은 텍스처(card-art.js 의 LOW)로 두고,
// 집어 든 카드가 눈앞에 다 오면 그 자리에 같은 모양의 HTML 카드를 겹치고 3D 카드는 숨긴다.
// 앞면은 사진과 글자(제목, 날짜, 조회수), 뒷면은 뒷면 그림 위에 원본으로 가는 링크다. 앞면 양옆 20% 나 뒷면을 누르면 뒤집히고, 앞면 가운데 60% 를 두 번 누르면 재생한다 (modes.js 의 flipAt).
// 팬 작품은 3D 카드 그대로 둔다. 카드를 내려놓거나 영사기에 넣으면(ctx.held 가 바뀌면) HTML 카드를 내리고 3D 카드를 다시 보인다.
import * as THREE from 'three';
import { hasThumb, srcUrl, PLATFORM_NAME, platformOf } from './format.js';
import { thumbUrl } from './util.js';
import { makeCanvas, drawFit } from './draw.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HI = 2; // HTML 카드 안의 캔버스(뒷면, 붙여 넣은 게시물의 사진 자리)를 시안 px 의 몇 배로 그릴지

export function setupCardView(ctx) {
  const { $, on, camera, canvas, CARD_FONT: F, cardIcon: ICON, INK, BACK_SVG, frontSpec, backLink, drawLinkFace, drawBack } = ctx;
  const host = $('cardview');
  let shown = null, inner = null, size = null; // 지금 띄운 카드 · 뒤집히는 상자 · 시안 px 크기 { W, H, photo }
  let at = null; // 마지막 프레임에 놓은 자리 { x, y, k } (방 px, 배율)

  const el = (tag, cls, style) => { const e = document.createElement(tag); if (cls) e.className = cls; if (style) Object.assign(e.style, style); return e; };
  const px = v => `${v}px`;
  function iconEl(k, x, cy) {
    const I = ICON[k], s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', `${I.o[0]} ${I.o[1]} ${I.w} ${I.h}`);
    s.setAttribute('width', I.w); s.setAttribute('height', I.h); s.setAttribute('aria-hidden', 'true');
    Object.assign(s.style, { left: px(x), top: px(cy - I.h / 2) });
    const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', I.d); p.setAttribute('fill', INK);
    s.appendChild(p);
    return s;
  }
  // 줄 글자: 캔버스의 textBaseline 'middle' 처럼 cy 가 글줄의 가운데다
  const textEl = (text, x, cy, font) => { const e = el('div', 'cv-text', { left: px(x), top: px(cy), font }); e.textContent = text; return e; };

  // 사진 자리: 유튜브는 가장 큰 썸네일부터 받아 본다 (없는 썸네일은 120px 자리 표시 그림이 와서 그다음 것으로 넘어간다).
  // crossOrigin 은 thumbs.js 의 요청과 같게 둬서 이미 받은 그림을 다시 받지 않는다.
  // have: 3D 카드가 이미 가진 그림 (thumbs.js 의 img). 큰 그림이 오기 전까지 그 자리에 깔아 둔다: 사진 자리가 비지 않는다
  function photoEl(reel, ph, have) {
    const box = { left: px(ph.x), top: px(ph.y), width: px(ph.w), height: px(ph.h) };
    if (!hasThumb(reel)) {
      const c = makeCanvas(Math.round(ph.w * HI), Math.round(ph.h * HI)), g = c.getContext('2d');
      g.scale(HI, HI); drawLinkFace(g, reel, 0, 0, ph.w, ph.h);
      Object.assign(c.style, box); return c;
    }
    const out = document.createDocumentFragment();
    if (have) {
      const c = makeCanvas(Math.round(ph.w * HI), Math.round(ph.h * HI));
      drawFit(c.getContext('2d'), have, 0, 0, c.width, c.height, true);
      Object.assign(c.style, box); out.appendChild(c);
    }
    const img = el('img', 'cv-photo', box);
    out.appendChild(img);
    img.alt = ''; img.crossOrigin = 'anonymous'; img.decoding = 'async';
    const files = reel.wide ? ['hq720', 'hqdefault'] : ['oardefault', 'hqdefault'];
    let i = 0;
    const next = () => { if (++i < files.length) img.src = thumbUrl(reel, files[i]); };
    img.style.visibility = 'hidden'; // 쓸 수 있는 그림이 올 때까지 숨긴다 (밑에 깐 그림이나 자리 표시 그림이 보인다)
    img.onload = () => { if (img.naturalWidth <= 120) next(); else img.style.visibility = ''; };
    img.onerror = next;
    img.src = thumbUrl(reel, files[0]);
    return out;
  }

  function build(card) {
    const reel = card.userData.reel, sp = frontSpec(reel), { W, H } = sp;
    size = { W, H, photo: sp.photo };
    host.innerHTML = '';
    inner = el('div', 'cv-card', { width: px(W), height: px(H) });

    const front = el('div', 'cv-face', { background: sp.paper });
    front.appendChild(photoEl(reel, sp.photo, card.userData.img));
    if (sp.tint) front.appendChild(el('div', null, { left: px(sp.photo.x), top: px(sp.photo.y), width: px(sp.photo.w), height: px(sp.photo.h), background: `rgba(214, 170, 120, ${sp.tint})` }));
    front.appendChild(textEl(sp.title.text, sp.title.x, sp.title.cy, `${sp.title.size}px ${F.pixel}`));
    for (const row of sp.rows) { front.appendChild(iconEl(row.k, row.ix, row.cy)); front.appendChild(textEl(row.text, row.tx, row.cy + 0.5, `500 13px ${F.body}`)); }

    const back = el('div', 'cv-face cv-back', { background: sp.paper });
    const svg = BACK_SVG[reel.wide ? 'wide' : 'tall'];
    let art;
    if (svg) { art = el('img', null, { left: 0, top: 0, width: px(W), height: px(H) }); art.alt = ''; art.src = svg; }
    else { art = drawBack(reel, HI); Object.assign(art.style, { left: 0, top: 0, width: px(W), height: px(H) }); }
    back.appendChild(art);
    const ln = backLink(W, H), pad = 6, a = el('a', 'cv-link', { left: px(ln.x - pad), top: px(ln.cy - ln.size / 2 - pad), width: px(ln.size + pad * 2), height: px(ln.size + pad * 2) });
    a.href = srcUrl(reel); a.target = '_blank'; a.rel = 'noopener';
    a.setAttribute('aria-label', `${PLATFORM_NAME[platformOf(reel)]}에서 보기`);
    back.appendChild(a);

    inner.append(front, back);
    host.appendChild(inner);
    host.setAttribute('aria-label', reel.title || '사진');
  }
  function hide() {
    if (ctx.playerFitted?.()) ctx.closePlayer(); // 카드에 맞춘 플레이어는 카드와 함께 내려간다
    if (shown) shown.visible = true;
    shown = inner = size = at = sampleFor = light = null;
    host.hidden = true; host.innerHTML = '';
  }
  ctx.onDispose(hide);

  // 누른 자리의 카드 가로 비율 (0 왼쪽 ~ 1 오른쪽). host 는 돌지 않고 배율만 바뀌므로 host 의 상자로 잰다
  const fxOf = ev => { const r = host.getBoundingClientRect(); return (ev.clientX - r.left) / r.width; };
  // 앞면 양옆 20 을 누르거나 뒷면 어디를 누르면 그쪽으로 당겨 뒤집는다 (modes.js 의 flipAt). 뒷면의 링크는 링크로만 동작한다.
  // pairFront: 두 번 누르기의 첫 click 이 앞면에서 시작했는지. 뒷면의 첫 click 이 앞면으로 뒤집은 뒤 둘째 click 이 재생하지 않게 한다
  let pairFront = false;
  on(host, 'click', ev => {
    if (ev.detail <= 1) pairFront = !ctx.heldFlipped;
    if (!ev.target.closest('a')) ctx.flipAt(fxOf(ev));
  });
  // 앞면 가운데 60 을 두 번 누르면 공식 플레이어로 영상을 연다. 가운데의 click 은 뒤집지 않으므로 앞면 그대로다.
  // 팬 작품은 영상이 없어 열지 않는다
  on(host, 'dblclick', ev => {
    if (ev.target.closest('a') || !ctx.held || ctx.heldFlipped || !pairFront) return;
    const fx = fxOf(ev);
    if (fx < 0.2 || fx > 0.8) return;
    const reel = ctx.held.userData.reel;
    if (reel && reel.kind !== 'fan') ctx.openPlayer(reel, photoRect());
  });

  // 사진 자리의 방 px 상자와 카드의 위·오른쪽 가장자리 (players.js 의 fitPlayer 가 받는 모양)
  function photoRect() {
    if (!at) return null;
    const { x, y, k } = at, ph = size.photo;
    return { x: x + ph.x * k, y: y + ph.y * k, w: ph.w * k, h: ph.h * k, cardTop: y, cardRight: x + size.W * k };
  }

  // 방의 빛: 3D 카드는 방 조명과 노출(톤 매핑)을 받아 어둡고 따뜻한데 HTML 카드는 그림 색 그대로다. 바뀌는 순간 두 배쯤 밝아진다.
  // 카드가 눈앞에 다 오면 한 프레임 더 3D 카드를 그리고, 그린 바로 뒤(afterDraw, loop.js) 3D 카드의 화면 색을 여러 점에서 읽는다.
  // 같은 점의 앞면 텍스처 색(HTML 카드가 보이는 색)과 짝지어 채널마다 out = a · in^e 를 맞춘다 (로그 공간의 최소제곱).
  // 톤 매핑이 어두운 쪽을 더 누르므로 곱하기 하나로는 사진이 밝게 남는다. 이 곡선을 SVG 필터(feComponentTransfer gamma)로
  // HTML 카드의 두 면과 카드에 맞춘 플레이어에 건다 (heap-room.css 의 --cv-light).
  let sampleFor = null, light = null;
  const _p = new THREE.Vector3(), _px = new Uint8Array(4);
  const NS = 'http://www.w3.org/2000/svg', fid = 'cv-light-' + Math.random().toString(36).slice(2, 8);
  const svg = document.createElementNS(NS, 'svg'), funcs = {};
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.style, { position: 'absolute', width: 0, height: 0 });
  const filt = document.createElementNS(NS, 'filter'); filt.id = fid; filt.setAttribute('color-interpolation-filters', 'sRGB');
  const ct = document.createElementNS(NS, 'feComponentTransfer');
  for (const ch of ['R', 'G', 'B']) { const f = document.createElementNS(NS, 'feFunc' + ch); f.setAttribute('type', 'gamma'); f.setAttribute('offset', '0'); ct.appendChild(f); funcs[ch] = f; }
  filt.appendChild(ct); svg.appendChild(filt); ctx.root.appendChild(svg);
  ctx.onDispose(() => svg.remove());

  function sampleLight(c) {
    const u = c.userData, sp = frontSpec(u.reel), { W, H, photo: ph } = sp, d = u.d;
    const gl = ctx.renderer.getContext(), bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const tex = u.front.image, tk = tex.width / W, tg = tex.getContext('2d');
    // 점 (시안 px): 테두리 종이 넷, 사진 안쪽 4 x 4
    const spots = [[W / 2, ph.y / 2], [ph.x / 2, ph.y + ph.h / 2], [W - ph.x / 2, ph.y + ph.h / 2], [W - ph.x / 2, H - ph.x / 2]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) spots.push([ph.x + ph.w * (0.15 + 0.7 * i / 3), ph.y + ph.h * (0.15 + 0.7 * j / 3)]);
    const pairs = [];
    for (const [sx, sy] of spots) {
      _p.set((sx / W - 0.5) * d.w, (0.5 - sy / H) * d.h, 0.002);
      c.localToWorld(_p).project(camera);
      const x = Math.round((_p.x + 1) / 2 * bw), y = Math.round((_p.y + 1) / 2 * bh);
      if (x < 0 || y < 0 || x >= bw || y >= bh) continue;
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px);
      const t = tg.getImageData(Math.min(tex.width - 1, Math.round(sx * tk)), Math.min(tex.height - 1, Math.round(sy * tk)), 1, 1).data;
      pairs.push([[t[0], t[1], t[2]], [_px[0], _px[1], _px[2]]]);
    }
    // 채널마다 ln out = ln a + e ln in. 곡선은 종이 점(앞 넷의 가운데 값)을 꼭 지나게 묶고, e 만 사진 점으로 맞춘다:
    // 사진 점이 많아 종이 쪽이 어긋나면 흰 종이에 색이 낀다. 아주 어두운 점(8 아래)은 잡음이라 뺀다. 맞출 점이 모자라면 곱하기만 (e = 1)
    const L = v => Math.log(Math.max(1, v) / 255);
    const fit = i => {
      const paper = pairs.slice(0, Math.min(4, pairs.length)).map(([t, r]) => [L(t[i]), L(r[i])]).sort((p, q) => p[1] - q[1]);
      if (!paper.length) return { a: 1, e: 1 };
      const [px, py] = paper[paper.length >> 1];
      let sxx = 0, sxy = 0;
      for (const [t, r] of pairs.slice(4)) if (t[i] >= 8 && r[i] >= 2) { const dx = L(t[i]) - px, dy = L(r[i]) - py; sxx += dx * dx; sxy += dx * dy; }
      const e = sxx > 0.05 ? Math.min(2.5, Math.max(0.8, sxy / sxx)) : 1;
      return { a: Math.min(1.5, Math.exp(py - e * px)), e };
    };
    return { R: fit(0), G: fit(1), B: fit(2) };
  }
  function afterDraw() {
    if (!sampleFor || light || ctx.held !== sampleFor) return;
    light = sampleLight(sampleFor);
    for (const ch of ['R', 'G', 'B']) { funcs[ch].setAttribute('amplitude', light[ch].a.toFixed(4)); funcs[ch].setAttribute('exponent', light[ch].e.toFixed(4)); }
    ctx.root.style.setProperty('--cv-light', `url(#${fid})`);
    // 플레이어에는 걸지 않는다: 유튜브 임베드 규정이 플레이어 앞의 덮개와 플레이어를 바꾸는 것을 막는다 (Required Minimum Functionality)
  }

  // loop.js 가 매 프레임 부른다. arrived: 집어 든 카드가 눈앞 자리에 다 왔다.
  const _c = new THREE.Vector3(), _t = new THREE.Vector3();
  function step(arrived) {
    const c = ctx.held;
    if (shown && shown !== c) hide();
    if (!c || c.userData.reel.kind === 'fan') return;
    if (!shown) {
      if (!arrived) return;
      if (sampleFor !== c) { sampleFor = c; light = null; return; } // 이 프레임은 3D 카드를 그리고 afterDraw 가 색을 읽는다
      if (!light) return;
      build(c); shown = c; c.visible = false; host.hidden = false;
    }
    // 3D 카드의 가운데와 위 가장자리를 화면에 비춰 자리와 배율을 정한다. 카드는 카메라를 똑바로 보고 있다.
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    _c.copy(c.position).project(camera);
    _t.set(0, c.userData.d.h / 2, 0).applyQuaternion(camera.quaternion).add(c.position).project(camera);
    const k = Math.abs(_t.y - _c.y) * ch / size.H;
    const x = (_c.x + 1) / 2 * cw - size.W * k / 2, y = (1 - _c.y) / 2 * ch - size.H * k / 2;
    host.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    at = { x, y, k }; ctx.fitPlayer?.(photoRect()); // 카드에 맞춘 플레이어가 열려 있으면 카드를 따라간다
    inner.style.transform = `rotateY(${(ctx.heldTurn || 0) * 180}deg)`; // 돈 만큼 쌓인 각도: 누른 쪽으로 돈다
  }

  Object.assign(ctx, { stepCardView: step, cardViewAfterDraw: afterDraw });
}
