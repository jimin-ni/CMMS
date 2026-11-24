// 스노우 글로브 모드. 좌식 탁자 위의 글로브(fixtures.js)를 누르면 카메라가 글로브 가까이 다가간다.
// 탁자 뒤쪽에서 글로브를 보므로 뒤로 사진 더미와 탁자가 보인다. 방은 어두워지고 집 창문의 불빛이 번진다.
// 끌어서 돌리고 휠로 다가간다. 들어올 때와 빈 곳을 누를 때 3초 동안 눈이 내린다 (내리는 중에 또 누르면 3초를 새로 잰다).
// 누르기: 물범과 그 둘레는 지민 프로필, 고양이와 그 둘레는 규노 프로필(새 탭), 글로브의 나머지는 제작자 소개. Esc 나 단추로 물러난다.
import * as THREE from 'three';
import { GLOBE_CENTRE_Y } from '../../snow-globe/model.js';
import { MAKER_LINKS } from '../../snow-globe/links';

const SNOW_MS = 3000;
const VIEW_DIST = 1.15; // 처음 구도에서 글로브 중심까지의 거리 (글로브 높이 0.36 이 화면의 60% 쯤)
const DARK = 0.62; // 상세 화면에서 방 노출을 줄이는 몫

export function setupGlobe(ctx) {
  const { controls, renderer, $, on, opts, onDispose } = ctx;
  const G = () => ctx.build.globe;
  let dim = 0, keep = null, snowTimer = 0;
  ctx.globeFrom = null; // 들어오기 전 모드 ('room' 또는 'sit'): 물러날 때 돌아간다
  onDispose(() => clearTimeout(snowTimer));

  // 처음 구도: 글로브 중심을 탁자 지역의 view 방향(탁자 뒤 위)에서 본다
  function view(g) {
    const target = g.root.localToWorld(new THREE.Vector3(0, GLOBE_CENTRE_Y, 0));
    const dir = new THREE.Vector3(...g.view).normalize().applyQuaternion(g.root.parent.getWorldQuaternion(new THREE.Quaternion()));
    return { pos: target.clone().addScaledVector(dir, VIEW_DIST), target };
  }

  function snow() {
    G()?.snow.start(SNOW_MS);
    $('globe-snow').classList.add('on');
    clearTimeout(snowTimer);
    snowTimer = setTimeout(() => $('globe-snow').classList.remove('on'), SNOW_MS);
  }

  function enterGlobe() {
    const g = G();
    if (!g || ctx.mode === 'globe' || ctx.mode === 'edit') return;
    if (ctx.held) ctx.putBack();
    ctx.globeFrom = ctx.mode === 'sit' ? 'sit' : 'room';
    ctx.mode = 'globe'; ctx.hovered = null; ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = [];
    keep = { min: controls.minDistance, max: controls.maxDistance, polar: controls.maxPolarAngle };
    controls.minDistance = 0.5; controls.maxDistance = 1.8; controls.maxPolarAngle = 1.4;
    ctx.goTo(view(g));
    ctx.setHint('globe'); ctx.syncUI();
    snow();
  }

  function exitGlobe() {
    if (ctx.mode !== 'globe') return;
    if (keep) { controls.minDistance = keep.min; controls.maxDistance = keep.max; controls.maxPolarAngle = keep.polar; keep = null; }
    clearTimeout(snowTimer); $('globe-snow').classList.remove('on');
    G()?.snow.stop();
    ctx.mode = ctx.globeFrom === 'sit' && ctx.SIT_CAM ? 'sit' : 'room';
    ctx.globeFrom = null; controls.enabled = false;
    if (ctx.mode === 'sit') ctx.goTo(ctx.SIT_CAM); else ctx.camGoal = null; // 방 카메라는 loop.js 가 제자리로 데려간다
    ctx.setHint(ctx.mode); ctx.syncUI();
  }
  on($('globeexit'), 'click', exitGlobe);

  // 누른 자리: 'jimin' | 'gyuno' | 'makers' | null (글로브 밖)
  function pick(ray) {
    const g = G(); if (!g) return null;
    if (ray.intersectObject(g.sealZone, false).length) return 'jimin';
    if (ray.intersectObject(g.catZone, false).length) return 'gyuno';
    return ray.intersectObjects(g.hitMeshes, false).length ? 'makers' : null;
  }
  function globeClick(ray) {
    const t = pick(ray);
    if (t === 'gyuno') window.open(MAKER_LINKS.gyuno, '_blank', 'noopener,noreferrer');
    else if (t) opts.navigate(MAKER_LINKS[t]);
    else snow();
  }

  // 매 프레임 (loop.js): 눈, 방 어둡히기와 창문 불빛. 노출의 기준은 시간대(time.js 의 baseExposure)다
  function globeStep(dt) {
    const g = G();
    if (!g) { if (ctx.mode === 'globe') exitGlobe(); return; } // 다시 지은 방에 글로브가 없다
    g.snow.step(dt);
    const want = ctx.mode === 'globe' ? 1 : 0;
    if (dim === 0 && want === 0) return; // 방: 노출은 time.js 가 정한 그대로
    dim = Math.abs(want - dim) < 0.002 ? want : dim + (want - dim) * Math.min(1, dt * 3);
    g.setGlow(dim);
    renderer.toneMappingExposure = (ctx.baseExposure ?? renderer.toneMappingExposure) * (1 - DARK * dim);
  }

  Object.assign(ctx, { enterGlobe, exitGlobe, globeClick, globeHover: ray => !!pick(ray), globeStep });
}
