// 카드 그림: 앞면, 뒷면, 팬 작품.
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { paper, drawFit, NO_PHOTO, wrap, crayon, ring, makeCanvas } from './draw.js';
import { hasThumb, platformOf, PLATFORM_NAME } from './format.js';

export function setupCardArt(ctx) {
  const { C, creator } = ctx;

  // 카드 그림: 쇼츠는 세로, 영상은 가로. 캔버스에 그리고 텍스처로 쓴다.
  const PX = 340, PXB = 220, S = 0.26;
  const DIMS = {
    tall: { CW: 1, B: 0.06, PW: 0.88, PH: 0.88 * 16 / 9, STRIP: 0.30 },
    wide: { CW: 1.5, B: 0.05, PW: 1.4, PH: 1.4 * 9 / 16, STRIP: 0.27 },
  };
  for (const d of Object.values(DIMS)) { d.CH = d.B + d.PH + d.STRIP; d.w = d.CW * S; d.h = d.CH * S; d.geo = new THREE.PlaneGeometry(d.w, d.h); }

  // 붙여 넣은 게시물 카드(인스타그램·틱톡·X)의 색: 방 팔레트에서 플랫폼마다 하나씩 가져온다.
  const LINK_TONE = { instagram: 'accent', tiktok: 'olive', x: 'ink' };
  // 플랫폼 표시. 로고 파일을 쓰지 않고 선 몇 개로 그린다. col 은 선 색이다.
  function platformMark(g, platform, cx, cy, s, col) {
    g.save();
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = Math.max(2, s * 0.1); g.lineCap = 'round'; g.lineJoin = 'round';
    if (platform === 'instagram') {
      const r = s * 0.3;
      g.beginPath(); g.roundRect(cx - s * 0.75, cy - s * 0.75, s * 1.5, s * 1.5, r); g.stroke();
      g.beginPath(); g.arc(cx, cy, s * 0.42, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(cx + s * 0.46, cy - s * 0.46, s * 0.1, 0, Math.PI * 2); g.fill();
    } else if (platform === 'tiktok') {
      g.beginPath(); g.arc(cx - s * 0.3, cy + s * 0.5, s * 0.3, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(cx, cy + s * 0.5); g.lineTo(cx, cy - s * 0.75); g.stroke();
      g.beginPath(); g.moveTo(cx, cy - s * 0.75); g.quadraticCurveTo(cx + s * 0.8, cy - s * 0.55, cx + s * 0.55, cy - s * 0.02); g.stroke();
    } else if (platform === 'x') {
      g.beginPath(); g.moveTo(cx - s * 0.6, cy - s * 0.6); g.lineTo(cx + s * 0.6, cy + s * 0.6); g.stroke();
      g.beginPath(); g.moveTo(cx + s * 0.6, cy - s * 0.6); g.lineTo(cx - s * 0.6, cy + s * 0.6); g.stroke();
    } else {
      g.beginPath(); g.moveTo(cx - s * 0.4, cy - s * 0.6); g.lineTo(cx + s * 0.65, cy); g.lineTo(cx - s * 0.4, cy + s * 0.6); g.closePath(); g.fill();
    }
    g.restore();
  }
  // 썸네일이 없는 카드의 사진 자리: 방 색으로 칠하고 플랫폼 표시와 이름을 올린다.
  function drawLinkFace(g, reel, x0, y0, w, h) {
    const platform = platformOf(reel);
    g.fillStyle = C[LINK_TONE[platform] || 'woodB'] || C.olive;
    g.fillRect(x0, y0, w, h);
    const ink = C.paper || '#F3EADB';
    platformMark(g, platform, x0 + w / 2, y0 + h * 0.42, Math.min(w, h) * 0.17, ink);
    g.save();
    g.fillStyle = ink; g.globalAlpha = 0.9; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${Math.round(Math.min(w, h) * 0.085)}px "IBM Plex Sans KR", system-ui, sans-serif`;
    g.fillText(PLATFORM_NAME[platform] || platform, x0 + w / 2, y0 + h * 0.68);
    g.restore();
  }

  // 영상 카드의 글꼴과 색 (시안 「폴라로이드 - 쇼츠·롱폼」 앞뒷면). 온보딩 컨셉의 머니그라피(Pixel, Rounded)와 Pretendard 다.
  // heap-room.tsx 가 루트에 붙인 next/font 의 CSS 변수에서 글꼴 이름을 읽는다. index.js 의 fontsReady 가 이 글꼴을 기다린다.
  const cssFont = (name, fallback) => getComputedStyle(ctx.root).getPropertyValue(name).trim() || fallback;
  const F = { pixel: cssFont('--font-oc-pixel', 'sans-serif'), rounded: cssFont('--font-oc-rounded', 'sans-serif'), body: cssFont('--font-oc-body', 'system-ui, sans-serif') };
  const INK = '#6B4E37';
  // 픽셀 아이콘 (Pixelarticons 모양). path 는 시안 SVG 의 것을 그대로 옮겼고, o 는 그 path 의 왼쪽 위다.
  const ICON = {
    calendar: { o: [23, 603.333], h: 13.333, p: new Path2D('M24.3333 604.667H33.6667V606H24.3333V604.667ZM24.3333 615.333H33.6667V616.667H24.3333V615.333ZM23 608.667H24.3333V615.333H23V608.667ZM23 606H24.3333V607.333H23V606ZM33.6667 606H35V607.333H33.6667V606ZM33.6667 608.667H35V615.333H33.6667V608.667ZM23 607.333H35V608.667H23V607.333ZM31 603.333H32.3333V604.667H31V603.333ZM25.6667 603.333H27V604.667H25.6667V603.333ZM25.6667 610H27V611.333H25.6667V610ZM25.6667 612.667H27V614H25.6667V612.667ZM28.3333 610H29.6667V611.333H28.3333V610ZM28.3333 612.667H29.6667V614H28.3333V612.667ZM31 610H32.3333V611.333H31V610Z') },
    play: { o: [27.625, 626.708], h: 9.583, p: new Path2D('M27.625 636.292H29.5417V634.375H31.4583V632.458H33.375V630.542H31.4583V628.625H29.5417V626.708H27.625V636.292Z') },
    link: { o: [253, 564], h: 36, p: new Path2D('M269 568H253V572H269V568ZM257 572H253V596H257V572ZM285 596H253V600H285V596ZM285 584H281V596H285V584ZM269 584H265V588H269V584ZM273 580H269V584H273V580ZM277 576H273V580H277V576ZM281 572H277V576H281V572ZM285 568H281V572H285V568ZM289 564H285V580H289V564ZM289 564H273V568H289V564Z') },
  };
  // 아이콘을 왼쪽 x, 가운데 높이 cy 에 그린다
  function icon(g, k, x, cy) {
    const I = ICON[k];
    g.save(); g.translate(x - I.o[0], cy - I.h / 2 - I.o[1]); g.fillStyle = INK; g.fill(I.p); g.restore();
  }
  // 한 줄에 넣는다: 글자 크기를 size 에서 min 까지 줄여 보고, 그래도 넘치면 끝을 "…" 로 자른다. g.font 는 고른 크기로 남는다.
  function fitLine(g, text, maxW, font, size, min = size) {
    g.font = font(size);
    while (size > min && g.measureText(text).width > maxW) g.font = font(--size);
    if (g.measureText(text).width <= maxW) return text;
    const ch = Array.from(text);
    while (ch.length && g.measureText(ch.join('') + '…').width > maxW) ch.pop();
    return ch.join('') + '…';
  }

  // 앞면: 사진, 그 아래 띠에 제목(머니그라피 Pixel), 달력과 날짜, 재생과 조회수.
  // PX(340) 가 시안의 쇼츠 폭과 같아서 시안의 px 를 그대로 쓴다 (롱폼 510 = 1.5 × PX). 롱폼은 띠가 낮아 줄들이 4px 위에 있다.
  // 카드 자신의 캔버스를 넘기면 그 자리에서 다시 그린다. 시드가 같아 틀과 글씨는 그대로이고 사진만 바뀐다.
  function drawCard(reel, img, c = document.createElement('canvas')) {
    const d = reel.wide ? DIMS.wide : DIMS.tall, r = mulberry32(reel.seed), age = reel.age;
    const W = Math.round(d.CW * PX), H = Math.round(d.CH * PX);
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    paper(g, W, H, r, age);
    const x0 = d.B * PX, y0 = d.B * PX, w = d.PW * PX, h = d.PH * PX;
    const link = !hasThumb(reel); // 붙여 넣은 게시물 카드: 썸네일이 없어 플랫폼 표시로 그린다
    g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    if (link) drawLinkFace(g, reel, x0, y0, w, h);
    else if (img) drawFit(g, img, x0, y0, w, h, true);
    else { g.fillStyle = NO_PHOTO; g.fillRect(x0, y0, w, h); }
    g.fillStyle = `rgba(214, 170, 120, ${0.04 + age * 0.12})`; g.fillRect(x0, y0, w, h);
    g.restore();
    const pb = y0 + h, lift = reel.wide ? 4 : 0, nudge = reel.wide ? -1 : 0;
    g.fillStyle = INK; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(fitLine(g, reel.title || '', W - (x0 + 1) * 2, s => `${s}px ${F.pixel}`, 22, 16), x0 + 1, pb + 23 - lift);
    g.font = `500 13px ${F.body}`;
    [['calendar', 2, reel.published], ['play', 6.6, reel.views]].forEach(([k, ix, text], i) => {
      if (!text) return;
      const cy = pb + 58 - lift + i * 21.5;
      icon(g, k, x0 + ix + nudge, cy);
      g.fillText(text, x0 + 24.6 + nudge, cy + 0.5);
    });
    return c;
  }

  // 뒷면 왼쪽 위의 채널 이름 로고: 낱말이 여럿이면 긴 줄이 가장 짧아지게 두 줄로 나누고, maxW 에 맞을 때까지 줄인다.
  function logoLines(g, name, maxW) {
    const words = name.split(/\s+/).filter(Boolean), font = s => `${s}px ${F.pixel}`;
    let lines = [name];
    g.font = font(23);
    for (let i = 1, best = Infinity; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '), m = Math.max(g.measureText(a).width, g.measureText(b).width);
      if (m < best) { best = m; lines = [a, b]; }
    }
    let size = 23;
    const widest = () => Math.max(...lines.map(l => g.measureText(l).width));
    while (size > 12 && widest() > maxW) g.font = font(--size);
    lines = lines.map(l => fitLine(g, l, maxW, font, size));
    return { lines, size, width: widest() };
  }
  // 한 줄을 width 폭에 맞춰 글자 사이를 벌려 쓴다. 너무 벌어지면(글자 크기의 0.8 넘게) 벌리지 않는다.
  function spread(g, text, x, y, width, size) {
    const ch = Array.from(text), gap = ch.length > 1 ? (width - g.measureText(text).width) / (ch.length - 1) : 0;
    if (gap <= 0 || gap > size * 0.8) { g.fillText(text, x, y); return; }
    for (const c of ch) { g.fillText(c, x, y); x += g.measureText(c).width + gap; }
  }

  // 뒷면: 왼쪽 위에 채널 이름 로고, 그 오른쪽에 방 이름, 방 소개(흐리게), @핸들. 오른쪽 아래에 원본으로 가는 링크 아이콘.
  // 시안의 글자가 8px 로 작아서 뒷면도 앞면과 같은 PX 로 그린다 (시안의 px 그대로). 팬 작품의 뒷면은 여전히 PXB 다.
  function drawBack(reel) {
    const d = reel.wide ? DIMS.wide : DIMS.tall, r = mulberry32(reel.seed + 7);
    const W = Math.round(d.CW * PX), H = Math.round(d.CH * PX);
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    paper(g, W, H, r, reel.age * 0.6);
    const DW = W, DH = H, L = 55, T = 54;
    g.save();
    g.fillStyle = INK; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const logo = logoLines(g, (reel.channel || creator.name || '').trim(), DW - L * 2 - 100);
    const lineH = logo.size * 24 / 23, base0 = T + logo.size * 0.76;
    logo.lines.forEach((l, i) => spread(g, l, L, base0 + i * lineH, logo.width, logo.size));
    const colX = L + logo.width + 9, colW = DW - L - colX, small = s => `${s}px ${F.rounded}`;
    const blurb = ctx.ROOMS?.find(x => x.id === ctx.roomId)?.blurb || '';
    const handle = reel.handle || PLATFORM_NAME[platformOf(reel)] || '';
    g.fillText(fitLine(g, creator.name || '', colW, small, 8), colX, T + 7);
    g.globalAlpha = 0.5; g.fillText(fitLine(g, blurb, colW, small, 8), colX, T + 15); g.globalAlpha = 1;
    g.fillText(fitLine(g, handle, colW, small, 8), colX, Math.max(base0 + (logo.lines.length - 1) * lineH, T + 26));
    icon(g, 'link', DW - 87, DH - 72);
    g.restore();
    return c;
  }

  function drawFanFront(p) {
    const d = DIMS.tall, r = mulberry32(p.seed);
    const W = Math.round(d.CW * PX), H = Math.round(d.CH * PX);
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    paper(g, W, H, r, 0);
    const x0 = d.B * PX, y0 = d.B * PX, w = d.PW * PX, h = d.PH * PX, cx = x0 + w / 2, cy = y0 + h * 0.42, s = w * 0.36;
    g.fillStyle = '#fbf5e8'; g.fillRect(x0, y0, w, h);
    for (let i = 0; i < 18; i++) crayon(g, [[x0 + r() * w, y0 + h * 0.85 + r() * h * 0.12], [x0 + r() * w, y0 + h * 0.85 + r() * h * 0.12]], '#9fbf7a', 6, r);
    const M = p.motif;
    if (M === 'heart') {
      const pts = Array.from({ length: 30 }, (_, i) => { const t = i / 30 * Math.PI * 2; return [cx + s * 0.06 * 16 * Math.sin(t) ** 3, cy - s * 0.06 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]; });
      crayon(g, pts, '#d9534f', 9, r, true);
      for (let i = 0; i < 40; i++) { const [a, b] = pts[Math.floor(r() * pts.length)]; crayon(g, [[a, b], [cx + (a - cx) * 0.2, cy + (b - cy) * 0.2]], '#e8837f', 7, r); }
    } else if (M === 'magnet') {
      crayon(g, [[cx - s, cy - s * 0.6], [cx + s, cy - s * 0.6], [cx + s, cy + s * 0.6], [cx - s, cy + s * 0.6]], C.accent, 10, r, true);
      g.fillStyle = C.accent; g.font = `${Math.round(s * 0.42)}px "Nanum Pen Script", cursive`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(creator.name, cx, cy);
      crayon(g, [[cx - s * 0.9, cy - s * 0.85], [cx + s * 0.9, cy - s * 0.85]], '#888', 5, r);
    } else if (M === 'face') {
      crayon(g, ring(cx, cy, s * 0.75, s * 0.85), '#e0a37a', 8, r, true);
      crayon(g, ring(cx, cy - s * 0.35, s * 0.85, s * 0.55, 16, a => (Math.sin(a) < 0 ? 1 : 0.2)), '#4a3328', 12, r);
      crayon(g, [[cx - s * 0.3, cy], [cx - s * 0.22, cy]], '#333', 8, r); crayon(g, [[cx + s * 0.22, cy], [cx + s * 0.3, cy]], '#333', 8, r);
      crayon(g, [[cx - s * 0.25, cy + s * 0.3], [cx, cy + s * 0.42], [cx + s * 0.25, cy + s * 0.3]], '#c0392b', 6, r);
    } else if (M === 'block' || M === 'creeper') {
      const col = M === 'creeper' ? '#5aa64a' : '#c79a4a';
      crayon(g, [[cx - s * 0.8, cy - s * 0.8], [cx + s * 0.8, cy - s * 0.8], [cx + s * 0.8, cy + s * 0.8], [cx - s * 0.8, cy + s * 0.8]], col, 10, r, true);
      for (let i = 0; i < 30; i++) { const y = cy - s * 0.75 + i * s * 0.05; crayon(g, [[cx - s * 0.75, y], [cx + s * 0.75, y]], col, 6, r); }
      if (M === 'creeper') for (const [a, b, ww, hh] of [[-0.5, -0.4, 0.3, 0.3], [0.2, -0.4, 0.3, 0.3], [-0.15, 0, 0.3, 0.45], [-0.35, 0.2, 0.2, 0.4], [0.15, 0.2, 0.2, 0.4]]) { g.fillStyle = '#222'; g.fillRect(cx + a * s, cy + b * s, ww * s, hh * s); }
      else { g.fillStyle = '#fff'; g.font = `${Math.round(s * 0.9)}px "Nanum Pen Script", cursive`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', cx, cy); }
    } else {
      crayon(g, [[cx, cy - s], [cx + s * 0.8, cy - s * 0.2], [cx, cy + s], [cx - s * 0.8, cy - s * 0.2]], '#4fb3c9', 10, r, true);
      crayon(g, [[cx - s * 0.8, cy - s * 0.2], [cx + s * 0.8, cy - s * 0.2]], '#4fb3c9', 6, r);
    }
    g.fillStyle = 'rgba(86,83,68,0.85)'; g.font = `${Math.round(PX * 0.07)}px "Nanum Pen Script", cursive`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(`${creator.name} ♥`, cx, y0 + h * 0.82);
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    const sy = (d.B + d.PH) * PX;
    g.fillStyle = 'rgba(86, 83, 68, 0.95)'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.font = `${Math.round(PX * 0.085)}px "Nanum Pen Script", cursive`;
    wrap(g, p.caption, W * 0.84).slice(0, 2).forEach((l, i) => g.fillText(l, W * 0.08, sy + d.STRIP * PX * 0.12 + i * PX * 0.09));
    return c;
  }
  function drawFanBack(p) {
    const d = DIMS.tall, r = mulberry32(p.seed + 7);
    const W = Math.round(d.CW * PXB), H = Math.round(d.CH * PXB);
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    paper(g, W, H, r, 0);
    const pad = W * 0.09; g.textBaseline = 'top';
    g.fillStyle = C.accent; g.font = `${Math.round(PXB * 0.1)}px "Nanum Pen Script", cursive`; g.fillText('팬 작품', pad, pad);
    g.fillStyle = 'rgba(86, 83, 68, 0.95)'; g.font = `${Math.round(PXB * 0.095)}px "Nanum Pen Script", cursive`;
    let y = pad + PXB * 0.16;
    for (const l of [`보낸 사람 · ${p.by}`, p.date, ...wrap(g, p.caption, W - pad * 2)]) { g.fillText(l, pad, y); y += PXB * 0.1; }
    return c;
  }

  Object.assign(ctx, { DIMS, CARD_FONT: F, drawFanFront, drawCard, drawFanBack, drawBack });
}
