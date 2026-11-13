// 시간대: 시각에 따라 햇빛, 조명, 하늘, 램프를 바꾼다.
import * as THREE from 'three';

export function setupTime(ctx) {
  const { layout, scene, renderer, hemi, fill, sun, WIN, WALLS, on, root } = ctx;
  const tA = new THREE.Vector3(); // 햇빛 끝점 계산용 임시 벡터

  // 시간대: 방의 빛이 시각을 따라간다.
  //   ?time=       페이지 주소의 값이 먼저다 (시연, 시험): 0-24 의 소수 시각(?time=6.5), 이름, 또는 auto.
  //   layout.time  layout.json 의 값: "auto", 이름, 또는 소수 시각. 없으면 "auto" 다.
  //   이름: night | dawn | morning | noon | golden | dusk.
  //   auto 는 보는 사람이 어디에 있든 한국 시간의 지금 시각이고, frame() 이 1분에 한 번쯤 다시 읽는다.
  //   golden 줄이 방의 원래 고정된 모습이다: applyTime(17.5) 는 장면이 지어질 때의 값을 그대로 넣는다.
  const NIGHT = { sun: '#aebfe0', sunI: 0.35, drop: 3.2, sky: ['#2e3350', '#4a4358', '#2e2b24'], hemiSky: '#d6c0aa', hemiGround: '#453a30', hemiI: 0.52, fillI: 0.2, lampI: 4.4, shadeI: 1.3, shaft: '#b9c8e6', shaftO: 0.012, mote: '#d5def0', moteO: 0.06, exposure: 1.26, bg: 0.4 };
  // h: hour · sun, sunI, drop: sun colour, intensity, and how steeply it falls (higher = higher sun) · sky: backdrop gradient top, middle, bottom
  // hemi*, fillI: ambient · lampI, shadeI: lamp light and its shade's glow · shaft*, mote*: light shaft and dust · bg: scale on the backdrop colour
  const TIMES = [
    { h: 4.5, ...NIGHT },
    { h: 6, sun: '#ffb38a', sunI: 1.4, drop: 1.9, sky: ['#e9c3b4', '#f4c9a0', '#7d7458'], hemiSky: '#f3d6c2', hemiGround: '#54463a', hemiI: 0.55, fillI: 0.26, lampI: 1.2, shadeI: 0.5, shaft: '#ffc9a8', shaftO: 0.05, mote: '#ffe0c8', moteO: 0.4, exposure: 1.14, bg: 0.75 },
    { h: 9, sun: '#ffe2b8', sunI: 2.6, drop: 3.4, sky: ['#cfe0dc', '#f3e3c4', '#8c8558'], hemiSky: '#fff0d8', hemiGround: '#62523e', hemiI: 0.9, fillI: 0.45, lampI: 0, shadeI: 0.12, shaft: '#ffe6bf', shaftO: 0.045, mote: '#fff0d4', moteO: 0.45, exposure: 1.08, bg: 1 },
    { h: 13, sun: '#fff1d6', sunI: 2.6, drop: 6, sky: ['#bcd6dc', '#e6e6d2', '#8f8c62'], hemiSky: '#fff3e0', hemiGround: '#6a5a46', hemiI: 1.0, fillI: 0.5, lampI: 0, shadeI: 0.12, shaft: '#fff0d0', shaftO: 0.025, mote: '#fff4dc', moteO: 0.25, exposure: 1.05, bg: 1 },
    { h: 17.5, sun: '#ffb066', sunI: 3.0, drop: 2.55, sky: ['#f2c48f', '#e9a46b', '#8a7a55'], hemiSky: '#ffe6c4', hemiGround: '#5a4a38', hemiI: 0.7, fillI: 0.35, lampI: 3.2, shadeI: 0.9, shaft: '#ffc98a', shaftO: 0.07, mote: '#ffe0b0', moteO: 0.7, exposure: 1.12, bg: 1 },
    { h: 19.5, sun: '#e8875a', sunI: 0.9, drop: 1.7, sky: ['#a98a9a', '#e08f62', '#5f5744'], hemiSky: '#e8c4a8', hemiGround: '#4e4034', hemiI: 0.48, fillI: 0.22, lampI: 4.0, shadeI: 1.15, shaft: '#f0a57c', shaftO: 0.035, mote: '#f6c9a4', moteO: 0.3, exposure: 1.15, bg: 0.75 },
    { h: 21.5, ...NIGHT },
  ].map(k => Object.fromEntries(Object.entries(k).map(([key, v]) => [key, toRGB(v)])));
  const TIME_NAMES = { night: 1, dawn: 6, morning: 9, noon: 13, golden: 17.5, dusk: 19.5 };
  function toRGB(v) { return typeof v === 'string' ? [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16)) : Array.isArray(v) ? v.map(toRGB) : v; }
  const mix = (a, b, t) => Array.isArray(a) ? a.map((x, i) => mix(x, b[i], t)) : a + (b - a) * t;
  function timeAt(hour) { // the two neighbouring rows, eased; on a row's own hour the result is that row exactly
    let i = TIMES.length - 1;
    TIMES.forEach((k, n) => { if (k.h <= hour) i = n; });
    const a = TIMES[i], b = TIMES[(i + 1) % TIMES.length];
    const t = ((hour - a.h + 24) % 24) / ((b.h - a.h + 24) % 24 || 24), s = t * t * (3 - 2 * t);
    return Object.fromEntries(Object.keys(a).map(key => [key, mix(a[key], b[key], s)]));
  }
  function parseTime(v) { // → an hour in [0, 24), 'auto', or null when it says nothing usable
    const s = typeof v === 'string' ? v.trim().toLowerCase() : v;
    if (s === 'auto') return 'auto';
    if (typeof s === 'string' && s in TIME_NAMES) return TIME_NAMES[s];
    const n = typeof s === 'number' ? s : typeof s === 'string' && s ? Number(s) : NaN;
    return Number.isFinite(n) ? ((n % 24) + 24) % 24 : null;
  }
  let timeSpec = parseTime(new URLSearchParams(location.search).get('time')) ?? parseTime(layout.time) ?? 'auto';
  ctx.timeChoice = parseTime(layout.time) == null ? 'auto' : layout.time; // the room's own choice, as it was given; ?time= does not change it. heap:get reports it.
  const seoulFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function seoulHour() {
    const part = Object.fromEntries(seoulFmt.formatToParts(new Date()).map(p => [p.type, Number(p.value)]));
    return (part.hour % 24) + part.minute / 60;
  }
  const bgBase = scene.background.clone();
  const setCol = (c, [r, g, b]) => c.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  const css = c => `rgb(${c.map(Math.round).join(',')})`;
  ctx.lampBase = 3.2; ctx.readGlow = 0; let nextClock = 0;
  function applyTime(hour) {
    const k = timeAt(hour);
    renderer.toneMappingExposure = k.exposure;
    scene.background.copy(bgBase).multiplyScalar(k.bg);
    setCol(hemi.color, k.hemiSky); setCol(hemi.groundColor, k.hemiGround); hemi.intensity = k.hemiI;
    fill.intensity = k.fillI;
    ctx.readGlow = Math.min(0.4, Math.max(0, (1.6 - k.sunI) * 0.3)); // a card in hand lights itself when the room is dim; 0 from morning to golden hour
    setCol(sun.color, k.sun); sun.intensity = k.sunI;
    ctx.sunDir.copy(ctx.sunHeading).setY(-k.drop).normalize();
    if (WIN) sun.target.position.copy(WALLS[WIN.wall].point(WIN.at, WIN.y, 0)).addScaledVector(ctx.sunDir, WIN.y / -ctx.sunDir.y);
    sun.position.copy(sun.target.position).addScaledVector(ctx.sunDir, -11);
    if (ctx.shaftGeo) { // the shaft's floor end and the motes follow the sun's new drop
      const pos = ctx.shaftGeo.attributes.position;
      ctx.shaftCorners.forEach((p, i) => { tA.copy(p).addScaledVector(ctx.sunDir, p.y / -ctx.sunDir.y); pos.setXYZ(4 + i, tA.x, tA.y, tA.z); });
      pos.needsUpdate = true; ctx.shaftGeo.computeBoundingSphere(); ctx.moteGeo.boundingSphere = null;
      setCol(ctx.shaftMat.color, k.shaft); ctx.shaftMat.opacity = k.shaftO;
      setCol(ctx.moteMat.color, k.mote); ctx.moteMat.opacity = k.moteO;
    }
    if (ctx.skyTex) {
      const sg = ctx.skyTex.image.getContext('2d'), gr = sg.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, css(k.sky[0])); gr.addColorStop(0.55, css(k.sky[1])); gr.addColorStop(1, css(k.sky[2])); sg.fillStyle = gr; sg.fillRect(0, 0, 4, 128);
      ctx.skyTex.needsUpdate = true;
    }
    ctx.lampBase = k.lampI; // frame() gives it to every lamp's light
    ctx.shadeNow = k.shadeI;
    for (const l of ctx.build.lamps) for (const s of l.shades) s.emissiveIntensity = l.off ? 0 : ctx.shadeNow;
  }
  function tickClock() { // auto only: called from frame(), so it stops with the rAF loop on dispose (no timer of its own)
    if (timeSpec !== 'auto' || Date.now() < nextClock) return;
    nextClock = Date.now() + 60000;
    applyTime(seoulHour());
  }
  if (timeSpec === 'auto') tickClock(); else applyTime(timeSpec);
  // Live change without a reload: root.dispatchEvent(new CustomEvent('heap:time', { detail: 'dusk' | 6.5 | 'auto' }))
  on(root, 'heap:time', e => {
    const spec = parseTime(e.detail);
    if (spec == null) return;
    timeSpec = spec; ctx.timeChoice = e.detail; nextClock = 0;
    if (timeSpec === 'auto') tickClock(); else applyTime(timeSpec);
  });

  Object.assign(ctx, { tickClock });
}
