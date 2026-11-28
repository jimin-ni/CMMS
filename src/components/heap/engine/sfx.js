// 효과음: 내 캐릭터가 방을 걸을 때 나는 발소리.
// 발이 땅에 닿을 때마다 (walk.js 가 걸음 박자에서 부른다) 한 발자국 소리를 한 번 낸다.
// 걷기 시작한 첫 발은 01, 다음 발은 02, 그다음은 다시 01 … 로 번갈아 낸다. 멈추면 다음 걸음은 01부터.
// 러그(카탈로그 rug 가구와 좌식 탁자의 러그) 위에서는 같은 소리를 저역 필터로 먹먹하게 낸다.
// 브라우저는 사용자 동작 전에 소리를 내지 못하게 하므로, 첫 클릭·키 입력 때 AudioContext 를 만들고 두 파일을 미리 풀어 둔다.
import * as THREE from 'three';

const FILES = ['/audio/sfx/footstep-01.mp3', '/audio/sfx/footstep-02.mp3'];
const LEVEL = { floor: 0.6, rug: 0.45 }; // 한 발자국 소리 크기
const RUG_CUTOFF = 500; // Hz. 러그 위 발소리의 저역 필터

export function setupSfx(ctx) {
  const { me, on } = ctx;
  let ac = null, buffers = null, floorOut = null, rugOut = null, tried = false;
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), from = new THREE.Vector3();

  async function start() {
    if (tried) return; // 한 번만 시도한다. 파일이 없거나 실패하면 소리 없이 걷는다
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    tried = true;
    try {
      const a = new Ctx();
      ctx.onDispose(() => { a.close(); });
      const decoded = await Promise.all(FILES.map(async url => {
        const res = await fetch(url, { signal: ctx.ac.signal });
        if (!res.ok) throw new Error(`${url} ${res.status}`);
        return a.decodeAudioData(await res.arrayBuffer());
      }));
      if (ctx.disposed) return;
      floorOut = a.createGain(); floorOut.gain.value = LEVEL.floor; floorOut.connect(a.destination);
      const lowpass = a.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = RUG_CUTOFF;
      rugOut = a.createGain(); rugOut.gain.value = LEVEL.rug; rugOut.connect(lowpass).connect(a.destination);
      buffers = decoded; ac = a;
    } catch (e) {
      if (!ctx.disposed && e?.name !== 'AbortError') console.warn('[heap-room] sfx:', e);
    }
  }
  on(window, 'pointerdown', start);
  on(window, 'keydown', start);
  on(document, 'visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend(); else ac.resume();
  });

  function rugUnderMe() {
    const rugs = ctx.build.rugMeshes;
    if (!rugs?.length) return false;
    ray.set(from.set(me.position.x, 1, me.position.z), down);
    return ray.intersectObjects(rugs, false).length > 0;
  }

  // 한 발자국. n: 걷기 시작부터 몇 번째 발인지 (0부터). 짝수면 01, 홀수면 02
  function footstep(n) {
    if (!ac || ctx.mode !== 'room') return;
    const src = ac.createBufferSource();
    src.buffer = buffers[n % 2];
    src.connect(rugUnderMe() ? rugOut : floorOut);
    src.start();
  }

  Object.assign(ctx, { footstep });
}
