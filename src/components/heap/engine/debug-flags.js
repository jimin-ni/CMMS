// 임시 시험 값. 방 주소에 ?debug=1 이 있을 때만 오른쪽 디버그 사이드바(heap-room.tsx)가 뜨고, 그때만 localStorage 의 값을 읽는다.
//   fold:   쪽지가 접히고 펼쳐지는 구간. 끄면 종이가 장식 안으로 바로 들어가고 바로 나온다 (tree-note.js 의 skipTest).
//   bauble: 장식이 열리고 닫히는 구간과 그 앞뒤 쉼. 끄면 장식이 바로 열리고 바로 닫힌다.
//   shadow: 그림자 보기. "all" 은 지금 그대로, "room" 은 방 밖(땅)에 지는 그림자를 감춘다, "none" 은 그림자를 모두 감춘다 (shell.js 의 applyShadowMode).
// 처음과 마지막 모습은 그대로다. 비교가 끝나면 이 파일과 사이드바를 걷어 낸다.
const KEY = 'heap-debug';
export const DEBUG_ON = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
export const ANIM_TEST = { fold: true, bauble: true };
export const SHADOW_MODES = ['all', 'room', 'none'];
export const SHADOW_TEST = { mode: 'all' };
if (DEBUG_ON) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    for (const k of Object.keys(ANIM_TEST)) if (typeof saved?.[k] === 'boolean') ANIM_TEST[k] = saved[k];
    if (SHADOW_MODES.includes(saved?.shadow)) SHADOW_TEST.mode = saved.shadow;
  } catch { /* 막힌 저장소나 깨진 값: 기본값 */ }
}
export function saveDebugFlags() {
  try { localStorage.setItem(KEY, JSON.stringify({ ...ANIM_TEST, shadow: SHADOW_TEST.mode })); } catch { /* 막힌 저장소 */ }
}
