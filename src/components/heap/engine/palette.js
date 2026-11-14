// 팔레트 키 → 색. 상태를 갖지 않는 순수 함수다.
// 방의 색을 다시 칠하는 길(recolour.js): 팔레트에서 색을 받는 재질은 userData.pal 에 그 색의 이름(spec)을 적어 둔다.
// 팔레트가 바뀌면 recolour 가 장면을 한 번 돌며 이름이 적힌 재질을 새 색으로 칠한다. 다시 마운트하지 않는다.
//   spec  'wall', 'accent' …  C 의 키 그대로
//         'floor:i'          i 번째 바닥 널 (널 수가 바뀌어도 C.floor 를 돌아가며 쓴다)
//         'tint:<재질 이름>'  가구 모델의 재질 이름으로 TINT 에서 (models.js)
//         'book:i'           책 색 목록의 i 번째 (앞의 둘은 포인트와 올리브, 나머지는 고정)
//         'accentDark'       포인트 × 0.55 (짙은 천)
// 캔버스에 구워 넣은 색(러그, 문패, 앨범 이름표, 달력)은 재질의 userData.repaint 에 다시 그리는 함수를 둔다.
import * as THREE from 'three';
import { flat } from './draw.js';

const BOOK_FIXED = ['#c9a46a', '#7d8a5a', '#d8c7a8', '#8a4f33'];
export const BOOK_COUNT = 2 + BOOK_FIXED.length;

// 가구 모델의 재질 이름 → 색. 이름이 없는 재질(유리)은 손대지 않는다. 램프와 금속은 팔레트와 상관없이 고정이다.
// 나무는 손으로 만든 탁자의 두 갈색(상판과 다리)을 받아, 나무 틀이 천과 구분되어 보인다. 천은 포인트 색이다.
export function tintOf(C) {
  const darkAccent = '#' + new THREE.Color(C.accent).multiplyScalar(0.55).getHexString();
  return {
    wood: C.woodB, woodDark: C.woodDark, carpet: C.accent, carpetDarker: darkAccent, carpetBlue: C.olive, carpetWhite: C.paper, _defaultMat: C.paper,
    plant: C.leaf, lamp: '#f6dcb2', fur: C.woodB, metal: '#a39d90', metalLight: '#c9c3b6', metalMedium: '#8f8a7e', metalDark: '#4a463e',
  };
}

export function palColour(C, spec) {
  if (spec.startsWith('floor:')) { const i = Number(spec.slice(6)); return C.floor[i % C.floor.length]; }
  if (spec.startsWith('tint:')) return tintOf(C)[spec.slice(5)];
  if (spec.startsWith('book:')) { const i = Number(spec.slice(5)) % BOOK_COUNT; return i === 0 ? C.accent : i === 1 ? C.olive : BOOK_FIXED[i - 2]; }
  if (spec === 'accentDark') return tintOf(C).carpetDarker;
  return C[spec];
}

// 팔레트 색을 받는 평면 재질. flat(C.x) 대신 쓴다: 색이 바뀌면 recolour 가 다시 칠한다.
export const tone = (C, spec, extra) => mark(flat(palColour(C, spec), extra), spec);
// 이미 만든 재질에 팔레트 이름을 단다
export function mark(mat, spec) { mat.userData.pal = spec; return mat; }
