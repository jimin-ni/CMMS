// 방 효과(셰이더 팩) 시험 값. ?debug=1 일 때만 디버그 사이드바(heap-room.tsx)에 뜨고, 그때만 이 값으로 그린다.
// 디버그가 아니면 모든 효과가 꺼진 채라 방은 지금과 똑같이 그려진다 (fx.js 의 draw 가 renderer.render 를 그대로 부른다).
// three 를 불러오지 않는다: React 사이드바가 이 파일의 표(FX_GROUPS)로 토글과 슬라이더를 그린다.
//
// 기본값의 근거는 docs/dev/room-fx.md 에 적는다. 측정은 dev.js 의 'fxprobe' 명령이 한다.
import { DEBUG_ON } from './debug-flags.js';

const KEY = 'heap-fx';

// 그룹마다 on 과 숫자 값들. 슬라이더는 change 에만 엔진에 보낸다 (그림자 각도 같은 값은 셰이더를 다시 만든다).
// dflt 는 엔진 기본값·연구 값을 출발점으로, fxprobe 측정(정한 목표에 맞춘 사후 조정)으로 고른 값이다. 근거는 docs/dev/room-fx.md.
export const FX_GROUPS = [
  {
    key: 'ao', label: 'AO (구석 그늘)', on: true,
    params: [
      { key: 'intensity', label: '세기', min: 0, max: 1, step: 0.05, dflt: 0.5 },
      { key: 'radius', label: '반경 (m)', min: 0.05, max: 1.5, step: 0.05, dflt: 0.5 },
      { key: 'falloff', label: '거리 감쇠', min: 0, max: 1, step: 0.05, dflt: 1 },
      { key: 'thickness', label: '두께 (m)', min: 0.1, max: 3, step: 0.1, dflt: 1 },
      { key: 'res', label: '해상도 배율', min: 0.5, max: 1, step: 0.5, dflt: 0.5 },
    ],
  },
  {
    key: 'shadow', label: '부드러운 그림자 (PCSS)', on: true,
    params: [
      // 해(방향광)의 겉보기 크기. 실제 해는 0.53°. 창으로 들어오는 하늘빛까지 치면 더 넓게 퍼진다
      { key: 'angle', label: '광원 크기 (°)', min: 0.25, max: 8, step: 0.25, dflt: 2 },
      { key: 'samples', label: '표본 수', min: 8, max: 48, step: 8, dflt: 16 },
    ],
  },
  {
    key: 'ibl', label: '환경광 (IBL)', on: true,
    params: [
      { key: 'intensity', label: '세기', min: 0, max: 1.5, step: 0.05, dflt: 0.6 },
      // 환경광을 켜면 반구광(scene.js 의 hemi)과 겹친다. 이 비율만큼만 남긴다
      { key: 'hemi', label: '반구광 남김', min: 0, max: 1, step: 0.05, dflt: 0.2 },
    ],
  },
  {
    key: 'bloom', label: '블룸 (빛 번짐)', on: true,
    params: [
      { key: 'strength', label: '세기', min: 0, max: 1, step: 0.02, dflt: 0.2 },
      { key: 'radius', label: '퍼짐', min: 0, max: 1, step: 0.05, dflt: 0.5 },
      // 선형 HDR 밝기 기준. 1 보다 크면 흰색보다 밝은 곳(램프 갓, 햇빛 든 창)만 번진다
      { key: 'threshold', label: '문턱 (선형)', min: 0.5, max: 4, step: 0.1, dflt: 1.0 },
    ],
  },
  {
    key: 'dof', label: '피사계 심도', on: false,
    params: [
      { key: 'aperture', label: '조리개', min: 0, max: 0.02, step: 0.0005, dflt: 0.001 },
      { key: 'maxblur', label: '최대 흐림', min: 0, max: 0.02, step: 0.001, dflt: 0.006 },
    ],
  },
  {
    key: 'grade', label: '색 보정', on: false,
    params: [
      { key: 'warmth', label: '따뜻함 (K)', min: -1000, max: 2000, step: 50, dflt: 400 },
      { key: 'lift', label: '검정 띄움 (L*)', min: 0, max: 20, step: 1, dflt: 8 },
      { key: 'saturation', label: '채도', min: 0.5, max: 1.3, step: 0.02, dflt: 0.9 },
      { key: 'contrast', label: '대비', min: 0.7, max: 1.3, step: 0.02, dflt: 0.95 },
    ],
  },
  {
    key: 'film', label: '그레인·비네트', on: false,
    params: [
      { key: 'vignette', label: '비네트 (모서리 EV)', min: 0, max: 1.5, step: 0.05, dflt: 0.6 },
      { key: 'grain', label: '그레인', min: 0, max: 0.1, step: 0.005, dflt: 0.03 },
    ],
  },
];

export function fxDefaults() {
  const out = {};
  for (const g of FX_GROUPS) {
    out[g.key] = { on: g.on };
    for (const p of g.params) out[g.key][p.key] = p.dflt;
  }
  return out;
}

// 엔진과 사이드바가 같이 보는 값. 디버그가 아니면 모두 끈다.
export const FX = fxDefaults();
if (!DEBUG_ON) for (const g of FX_GROUPS) FX[g.key].on = false;
else {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    for (const g of FX_GROUPS) {
      const s = saved?.[g.key];
      if (!s) continue;
      if (typeof s.on === 'boolean') FX[g.key].on = s.on;
      for (const p of g.params) if (typeof s[p.key] === 'number' && s[p.key] >= p.min && s[p.key] <= p.max) FX[g.key][p.key] = s[p.key];
    }
  } catch { /* 막힌 저장소나 깨진 값: 기본값 */ }
}

export function saveFx() {
  try { localStorage.setItem(KEY, JSON.stringify(FX)); } catch { /* 막힌 저장소 */ }
}

export function resetFx() {
  const d = fxDefaults();
  for (const k of Object.keys(d)) FX[k] = d[k];
  saveFx();
}
