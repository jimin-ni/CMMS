// 효과음: 내 캐릭터가 방을 걸을 때 나는 발소리.
// 마룻바닥은 녹음 그대로, 러그(카탈로그 rug 가구와 좌식 탁자의 러그) 위에서는 같은 소리를 저역 필터로 먹먹하게 낸다.
// 카펫 발소리 음원은 아직 없다 (docs/planning/10-audio.md §5). 받으면 러그 갈래를 그 파일로 바꾼다.
// 브라우저는 사용자 동작 전에 소리를 내지 못하게 하므로, 첫 클릭·키 입력 때 AudioContext 를 만든다.
import * as THREE from 'three';
import { WALK_SPEED } from './figure.js';

const FLOOR = '/audio/sfx/floor-walk-freesound-543685.mp3';
const LEVEL = { floor: 0.5, rug: 0.4 }; // 걷는 동안의 소리 크기
const RUG_CUTOFF = 500; // Hz. 러그 위 발소리의 저역 필터
const FADE = 0.06; // 초. 걷기 시작·멈춤, 바닥이 바뀔 때 소리가 바뀌는 시간
const IDLE_SUSPEND = 1.5; // 초. 이만큼 서 있으면 오디오를 멈춰 둔다
const RUG_CHECK = 0.1; // 초. 러그 위인지 다시 보는 간격

export function setupSfx(ctx) {
  const { me, on } = ctx;
  let ac = null, floorGain = null, rugGain = null, tried = false;
  let onRug = false, rugTimer = 0, idle = 0;
  const last = me.position.clone(), ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), from = new THREE.Vector3();

  async function start() {
    if (tried) return; // 한 번만 시도한다. 파일이 없거나 실패하면 소리 없이 걷는다
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    tried = true;
    try {
      const res = await fetch(FLOOR, { signal: ctx.ac.signal });
      if (!res.ok) return;
      const bytes = await res.arrayBuffer();
      if (ctx.disposed) return;
      const a = new Ctx();
      const buffer = await a.decodeAudioData(bytes);
      if (ctx.disposed) { a.close(); return; }
      // 한 소리를 두 갈래로: 마룻바닥(그대로)과 러그(저역 필터). 갈래의 크기로 바닥을 바꾼다
      const src = a.createBufferSource(); src.buffer = buffer; src.loop = true;
      floorGain = a.createGain(); rugGain = a.createGain(); floorGain.gain.value = rugGain.gain.value = 0;
      const lowpass = a.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = RUG_CUTOFF;
      src.connect(floorGain).connect(a.destination);
      src.connect(lowpass).connect(rugGain).connect(a.destination);
      src.start();
      ac = a;
      ctx.onDispose(() => { a.close(); });
    } catch (e) {
      if (!ctx.disposed && e?.name !== 'AbortError') console.warn('[heap-room] sfx:', e);
    }
  }
  on(window, 'pointerdown', start);
  on(window, 'keydown', start);
  on(document, 'visibilitychange', () => { if (document.hidden && ac?.state === 'running') ac.suspend(); });

  function rugUnderMe() {
    const rugs = ctx.build.rugMeshes;
    if (!rugs?.length) return false;
    ray.set(from.set(me.position.x, 1, me.position.z), down);
    return ray.intersectObjects(rugs, false).length > 0;
  }

  // 매 프레임 (loop.js). 방 모드에서 캐릭터가 한 프레임에 걸을 만큼 움직였으면 걷는 중이다 (앉기·서기의 순간 이동은 빼고)
  function sfxStep(dt) {
    const moved = Math.hypot(me.position.x - last.x, me.position.z - last.z);
    last.copy(me.position);
    if (!ac) return;
    const walking = ctx.mode === 'room' && !ctx.perch && moved > 1e-4 && moved < WALK_SPEED * dt * 1.5;
    if ((rugTimer -= dt) <= 0) { rugTimer = RUG_CHECK; onRug = rugUnderMe(); }
    if (walking) {
      idle = 0;
      if (ac.state === 'suspended' && !document.hidden) ac.resume();
    } else if (ac.state === 'running' && (idle += dt) > IDLE_SUSPEND) ac.suspend();
    const t = ac.currentTime;
    floorGain.gain.setTargetAtTime(walking && !onRug ? LEVEL.floor : 0, t, FADE);
    rugGain.gain.setTargetAtTime(walking && onRug ? LEVEL.rug : 0, t, FADE);
  }

  Object.assign(ctx, { sfxStep });
}
