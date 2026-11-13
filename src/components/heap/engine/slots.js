// item.fn 기능이 달린 가구의 3D 쪽: 기념품, TV 화면, 달력.
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { paper, wrap, drawFit, NO_PHOTO, flat, cropToShape, makeCanvas, canvasTexture } from './draw.js';
import { ksDay, seoulDay } from './format.js';

export function setupSlots(ctx) {
  const { opts, C, box, BUILD, reels } = ctx;

  // ---------- 슬롯: item.fn (기능 하나, 껍데기 여럿) ----------
  // 레이아웃에서 기능(item.fn, 서버가 검사한다: src/lib/heap/slots.ts)이 달린 가구는 방 모드에서 누를 수 있다.
  //   pc        링크 창을 연다: fn.links, 없으면 방의 creator.json 링크
  //   keepsake  이름, 날짜, 설명, 링크가 있는 그림. 벽 액자(type "frame") 또는 선반 같은 가구 위의 스탠드
  //   music     유튜브 영상이나 재생목록. 오른쪽 위의 독 플레이어를 연다 (라디오, 스피커, TV)
  //   latest    화면에 가장 최근 영상의 썸네일을 보여 주는 TV. 누르면 그 영상이 영사기로 간다
  //   calendar  책상 위 달력(type "calendar", 손으로 만든다): 팬에게 알리는 날짜를 창에 보여 준다
  // build.slots 가 이들을 나열하고({ it, fn, start? }) build.slotMeshes 가 클릭이 닿는 메시를 담는다 (각각 userData.slot 이 있다).
  ctx.slotsLive = false; // 글꼴이 준비되면 true: 그때부터 기념품 텍스처가 자기 글꼴로 그려지고 그림을 받는다
  const KS = { tall: { cw: 180, ch: 320, strip: 44 }, wide: { cw: 320, ch: 180, strip: 40 } }; // 캔버스 픽셀: 그림과 그 아래 이름 띠
  // 링크가 그림에 대해 알려 주는 것: id 는 유튜브 영상(그 영상의 썸네일), tall 은 쇼츠, host 는 글자 카드의 출처다.
  function keepsakeLook(fn) {
    let host = '', hit = null;
    if (fn.link && opts.isWebLink(fn.link)) {
      try { host = new URL(fn.link).hostname.replace(/^www\./, ''); } catch {}
      hit = opts.parseLink?.(fn.link) ?? null;
    }
    const yt = hit && hit.platform === 'youtube' ? hit : null;
    return { id: yt ? yt.externalId : null, tall: !!yt && yt.wide === false, host };
  }

  function paintKeepsake(canvas, fn, look, img) {
    const k = look.tall ? KS.tall : KS.wide, W = k.cw, H = k.ch + k.strip, g = canvas.getContext('2d'), B = 8;
    g.clearRect(0, 0, W, H);
    paper(g, W, H, mulberry32(11), 0.3);
    const x0 = B, y0 = B, w = W - 2 * B, h = k.ch - B;
    const plain = !look.id; // 유튜브가 아닌 게시물이거나 링크가 없다: 제목이 적힌 카드
    if (plain) {
      g.fillStyle = '#e6d8bf'; g.fillRect(x0, y0, w, h);
      g.fillStyle = 'rgba(86, 83, 68, 0.95)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let size = Math.round(h * 0.3), lines;
      for (;;) { g.font = `${size}px "Nanum Pen Script", cursive`; lines = wrap(g, fn.name || '', w * 0.86); if (lines.length * size * 1.05 <= h * 0.8 || size < 14) break; size -= 2; }
      lines.forEach((l, i) => g.fillText(l, W / 2, y0 + h / 2 + (i - (lines.length - 1) / 2) * size * 1.05));
    } else {
      g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
      if (img) drawFit(g, img, x0, y0, w, h, true); else { g.fillStyle = NO_PHOTO; g.fillRect(x0, y0, w, h); }
      g.fillStyle = 'rgba(214, 170, 120, 0.1)'; g.fillRect(x0, y0, w, h);
      g.restore();
    }
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    // 띠: 그림 아래의 이름, 또는 (글자 카드) 날짜나 출처
    const sub = plain ? (ksDay(fn.date) || look.host) : fn.name;
    if (sub) {
      g.fillStyle = 'rgba(86, 83, 68, 0.95)'; g.textAlign = 'left'; g.textBaseline = 'middle';
      let size = Math.round(k.strip * 0.62);
      for (; size > 10; size -= 1) { g.font = `${size}px "Nanum Pen Script", cursive`; if (g.measureText(sub).width <= W * 0.86) break; }
      g.fillText(sub, W * 0.07, k.ch + k.strip * 0.52);
    }
  }
  // shape 'frame': flat on a wall, centred on (x, y, z) in the item's local space · 'standee': leaning back a little on a small base, bottom at y
  function keepsakeObject(g, it, build, shape, x, y, z) {
    const fn = it.fn?.kind === 'keepsake' ? it.fn : { kind: 'keepsake', name: '' }; // 기념품이 아직 없는 액자는 빈 액자다
    const look = keepsakeLook(fn), k = look.tall ? KS.tall : KS.wide, W = k.cw, H = k.ch + k.strip;
    const pw = shape === 'frame' ? (look.tall ? 0.55 : 0.95) : (look.tall ? 0.2 : 0.32), ph = pw * H / W, rim = shape === 'frame' ? 0.045 : 0.03;
    const grp = new THREE.Group(), wood = flat(C.woodDark);
    const canvas = makeCanvas(W, H);
    const tex = canvasTexture(canvas, 4);
    const frame = box(pw + 2 * rim, ph + 2 * rim, 0.04, wood, 0, 0, 0.02, { cast: shape !== 'frame', parent: grp });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })); pic.position.z = 0.042; grp.add(pic);
    if (shape === 'frame') grp.position.set(x, y, z);
    else {
      box(pw + 0.08, 0.02, 0.1, wood, x, y + 0.01, z, { parent: g });
      grp.position.set(x, y + 0.02 + (ph + 2 * rim) / 2, z - 0.01); grp.rotation.x = -0.12;
    }
    g.add(grp);
    paintKeepsake(canvas, fn, look, null);
    if (!it.fn) return;
    registerSlot(build, { it, fn }, [frame, pic], () => {
      paintKeepsake(canvas, fn, look, null); tex.needsUpdate = true;
      if (look.id) ksLoad(build, look, look.tall ? ['hqdefault'] : ['mqdefault'], img => { if (build === ctx.build) { paintKeepsake(canvas, fn, look, img); tex.needsUpdate = true; } });
    });
  }
  // 기능이 달린 가구를 slot 으로 등록한다: 눌리는 메시를 묶고, 글꼴이 준비되면(이미 준비됐으면 바로) run 을 한 번 돌리는 start 를 단다.
  // 그 사이 가구가 다시 지어졌다면(build 가 바뀌었다면) start 는 아무것도 하지 않는다.
  function registerSlot(build, slot, meshes, run) {
    for (const m of meshes) { m.userData.slot = slot; build.slotMeshes.push(m); }
    if (!build.slots.includes(slot)) build.slots.push(slot);
    slot.started = false;
    slot.start = () => {
      if (slot.started || build !== ctx.build) return;
      slot.started = true;
      run();
    };
    if (ctx.slotsLive) slot.start();
  }
  // 기념품 자신의 그림: 영상의 썸네일을 그 모양으로 잘랐다. 없는 썸네일은 자리 표시 그림이 남는다.
  // ksPics 는 끝난 그림(영상과 모양별)을 방이 있는 동안 지니므로, 다시 지어도 이미 가진 것은 네트워크에 묻지 않는다.
  // 아직 받는 Image 는 그 build 에 속한다(build.loads): 다음 build 가 요청을 쌓지 않고 취소한다.
  const ksPics = new Map();
  function ksLoad(build, look, files, done) {
    const key = `${look.id}:${look.tall ? 't' : 'w'}`;
    if (ksPics.has(key)) return done(ksPics.get(key));
    ctx.loadThumb(look.id, files, im => {
      if (!im) return;
      const pic = cropToShape(im, { wide: !look.tall });
      ksPics.set(key, pic);
      done(pic);
    }, build.loads);
  }
  BUILD.frame = (g, it, build) => { keepsakeObject(g, it, build, 'frame', 0, it.y ?? 1.9, 0); return {}; };

  // 가장 최근 영상: 가장 늦은 게시일, 같은 날이거나 날짜가 없으면 목록 자체의 순서(서버가 최신순으로 준다)
  const newestReel = () => { let best = null; for (const r of reels) if (r.published && (!best || r.published > best.published)) best = r; return best ?? reels[0] ?? null; };

  // TV 화면(`screen` 이 있는 카탈로그 모델, 파일 단위): 모델 자신의 화면 바로 앞의 평면, 슬롯이 그린다.
  //   latest  가장 최근 영상의 썸네일, 쇼츠는 양옆을 비워 맞춘다        music  영상의 썸네일, 재생목록 링크는 음표
  function tvContent(fn) {
    if (fn.kind === 'latest') { const r = newestReel(); return { id: r ? r.id : null, tall: !!r && !r.wide, label: '최신 영상', note: '▶' }; }
    const p = opts.parseMusic(fn.url);
    return { id: p?.video ?? null, tall: false, label: '음악', note: '♪' };
  }
  function paintTv(canvas, pic, what) {
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    g.fillStyle = '#16130f'; g.fillRect(0, 0, W, H);
    if (pic) drawFit(g, pic, 0, 0, W, H, false);
    else { g.fillStyle = 'rgba(243, 234, 219, 0.35)'; g.font = `${Math.round(H * 0.4)}px "IBM Plex Sans KR", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(what.note, W / 2, H / 2); }
    g.fillStyle = 'rgba(0, 0, 0, 0.1)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    const sh = g.createLinearGradient(0, H * 0.72, 0, H); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = sh; g.fillRect(0, H * 0.72, W, H * 0.28);
    g.fillStyle = 'rgba(243, 234, 219, 0.95)'; g.font = `${Math.round(H * 0.15)}px "Nanum Pen Script", cursive`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(what.label, W * 0.04, H * 0.95);
  }
  function tvScreen(inst, build, slot, s) {
    const canvas = makeCanvas(320, 180);
    const tex = canvasTexture(canvas);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    plane.position.set(s.x, s.y, s.z); inst.add(plane);
    const what = tvContent(slot.fn);
    paintTv(canvas, null, what);
    registerSlot(build, slot, [plane], () => {
      paintTv(canvas, null, what); tex.needsUpdate = true;
      if (what.id) ksLoad(build, { id: what.id, tall: what.tall }, what.tall ? ['hqdefault'] : ['mqdefault'], pic => { if (build === ctx.build) { paintTv(canvas, pic, what); tex.needsUpdate = true; } });
    });
  }

  // 책상 위 달력(type "calendar", fn.kind "calendar"): 종이 한 장이 달린 작은 스탠드. 쪽은 다음 날짜가 있는 달(없으면 이번 달)을 보여 주고
  // 항목이 있는 날에 동그라미를 친다. 손으로 만든다: 키트에 달력이 없다.
  function paintCalendar(canvas, fn) {
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    const entries = (fn.entries ?? []).filter(e => typeof e?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date));
    const today = seoulDay.format(new Date()), next = entries.filter(e => e.date >= today).map(e => e.date).sort()[0];
    const [y, m] = (next ?? today).split('-').map(Number);
    paper(g, W, H, mulberry32(5), 0.2);
    g.fillStyle = C.accent; g.fillRect(0, 0, W, 40);
    g.fillStyle = C.paper; g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = `32px "Nanum Pen Script", cursive`; g.fillText(`${m}월`, 14, 21);
    g.textAlign = 'right'; g.font = `600 14px "IBM Plex Sans KR", system-ui, sans-serif`; g.fillText(String(y), W - 14, 21);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), days = new Date(Date.UTC(y, m, 0)).getUTCDate(), cw = (W - 16) / 7;
    g.textAlign = 'center'; g.font = `600 11px "IBM Plex Sans KR", system-ui, sans-serif`; g.fillStyle = 'rgba(86, 83, 68, 0.6)';
    [...'일월화수목금토'].forEach((c, i) => g.fillText(c, 8 + cw * (i + 0.5), 54));
    const marked = new Set(entries.filter(e => e.date.startsWith(`${y}-${String(m).padStart(2, '0')}-`)).map(e => Number(e.date.slice(8))));
    g.font = `13px "IBM Plex Sans KR", system-ui, sans-serif`;
    for (let d = 1; d <= days; d++) {
      const cell = first + d - 1, cx = 8 + cw * (cell % 7 + 0.5), cy = 72 + Math.floor(cell / 7) * 22;
      if (marked.has(d)) { g.strokeStyle = C.accent; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = marked.has(d) ? C.accent : 'rgba(47, 44, 36, 0.85)'; g.fillText(String(d), cx, cy + 1);
    }
  }
  BUILD.calendar = (g, it, build) => {
    const fn = it.fn?.kind === 'calendar' ? it.fn : { kind: 'calendar', entries: [] }; // 기능이 아직 없는 달력은 빈 달력이다
    const canvas = makeCanvas(192, 192);
    const tex = canvasTexture(canvas, 4);
    const wood = flat(C.woodDark), grp = new THREE.Group(), W = 0.4, H = 0.4;
    box(W + 0.06, 0.03, 0.16, wood, 0, 0.015, 0, { parent: grp });
    const lean = new THREE.Group(); lean.position.set(0, 0.03, -0.03); lean.rotation.x = -0.3; grp.add(lean);
    const back = box(W + 0.04, H + 0.04, 0.02, wood, 0, H / 2, 0, { parent: lean });
    const page = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })); page.position.set(0, H / 2, 0.012); page.castShadow = true; lean.add(page);
    grp.position.y = it.y || 0; g.add(grp);
    paintCalendar(canvas, fn);
    if (it.fn?.kind !== 'calendar') return {};
    registerSlot(build, { it, fn }, [back, page], () => { paintCalendar(canvas, fn); tex.needsUpdate = true; });
    return {};
  };
  function startSlots() { ctx.slotsLive = true; for (const s of ctx.build.slots) s.start?.(); }

  Object.assign(ctx, { keepsakeObject, tvScreen, startSlots, keepsakeLook, newestReel });
}
