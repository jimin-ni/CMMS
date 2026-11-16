// 집어 든 카드를 HTML 로 보여 준다. 더미의 카드는 작은 텍스처(card-art.js 의 LOW)로 두고,
// 집어 든 카드가 눈앞에 다 오면 그 자리에 같은 모양의 HTML 카드를 겹치고 3D 카드는 숨긴다.
// 앞면은 사진과 글자(제목, 날짜, 조회수), 뒷면은 뒷면 그림 위에 원본으로 가는 링크다. 카드를 누르면 뒤집힌다 (modes.js 의 flip).
// 팬 작품은 3D 카드 그대로 둔다. 카드를 내려놓거나 영사기에 넣으면(ctx.held 가 바뀌면) HTML 카드를 내리고 3D 카드를 다시 보인다.
import * as THREE from 'three';
import { hasThumb, srcUrl, PLATFORM_NAME, platformOf } from './format.js';
import { thumbUrl } from './util.js';
import { makeCanvas } from './draw.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HI = 2; // HTML 카드 안의 캔버스(뒷면, 붙여 넣은 게시물의 사진 자리)를 시안 px 의 몇 배로 그릴지

export function setupCardView(ctx) {
  const { $, on, camera, canvas, CARD_FONT: F, cardIcon: ICON, INK, BACK_SVG, frontSpec, backLink, drawLinkFace, drawBack } = ctx;
  const host = $('cardview');
  let shown = null, inner = null, size = null; // 지금 띄운 카드 · 뒤집히는 상자 · 시안 px 크기 { W, H }

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
  function photoEl(reel, ph) {
    const box = { left: px(ph.x), top: px(ph.y), width: px(ph.w), height: px(ph.h) };
    if (!hasThumb(reel)) {
      const c = makeCanvas(Math.round(ph.w * HI), Math.round(ph.h * HI)), g = c.getContext('2d');
      g.scale(HI, HI); drawLinkFace(g, reel, 0, 0, ph.w, ph.h);
      Object.assign(c.style, box); return c;
    }
    const img = el('img', 'cv-photo', box);
    img.alt = ''; img.crossOrigin = 'anonymous'; img.decoding = 'async';
    const files = reel.wide ? ['hq720', 'hqdefault'] : ['oardefault', 'hqdefault'];
    let i = 0;
    const next = () => { if (++i < files.length) img.src = thumbUrl(reel, files[i]); };
    img.onload = () => { if (img.naturalWidth <= 120) next(); };
    img.onerror = next;
    img.src = thumbUrl(reel, files[0]);
    return img;
  }

  function build(card) {
    const reel = card.userData.reel, sp = frontSpec(reel), { W, H } = sp;
    size = { W, H };
    host.innerHTML = '';
    inner = el('div', 'cv-card', { width: px(W), height: px(H) });

    const front = el('div', 'cv-face', { background: sp.paper });
    front.appendChild(photoEl(reel, sp.photo));
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
    if (shown) shown.visible = true;
    shown = inner = size = null;
    host.hidden = true; host.innerHTML = '';
  }
  ctx.onDispose(hide);

  // 카드를 누르면 뒤집는다. 뒷면의 링크는 링크로만 동작한다.
  on(host, 'click', ev => { if (!ev.target.closest('a')) ctx.flip(); });

  // loop.js 가 매 프레임 부른다. arrived: 집어 든 카드가 눈앞 자리에 다 왔다.
  const _c = new THREE.Vector3(), _t = new THREE.Vector3();
  function step(arrived) {
    const c = ctx.held;
    if (shown && shown !== c) hide();
    if (!c || c.userData.reel.kind === 'fan') return;
    if (!shown) {
      if (!arrived) return;
      build(c); shown = c; c.visible = false; host.hidden = false;
    }
    // 3D 카드의 가운데와 위 가장자리를 화면에 비춰 자리와 배율을 정한다. 카드는 카메라를 똑바로 보고 있다.
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    _c.copy(c.position).project(camera);
    _t.set(0, c.userData.d.h / 2, 0).applyQuaternion(camera.quaternion).add(c.position).project(camera);
    const k = Math.abs(_t.y - _c.y) * ch / size.H;
    const x = (_c.x + 1) / 2 * cw - size.W * k / 2, y = (1 - _c.y) / 2 * ch - size.H * k / 2;
    host.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    inner.classList.toggle('flipped', ctx.heldFlipped);
  }

  Object.assign(ctx, { stepCardView: step });
}
