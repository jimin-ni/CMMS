// 엔진 한 번의 마운트가 가지는 모든 상태: 모듈들이 함께 쓰는 ctx 객체를 만든다.
// 모듈 수준에는 바뀌는 값이 없다. 마운트마다 새 ctx 가 생기고 dispose 가 끝나면 함께 버려진다.
//
// ctx 가 처음부터 가진 것 (createContext): root, opts, ac, cleanups, onDispose, prevTitle, dataBase, disposed, raf, pollTimer, roomTitle, rand, gauss, $, on
// 나머지는 각 모듈이 setup 안에서 채운다. 모듈이 만든 값 중 다른 모듈이 쓰는 것만 ctx 에 올라간다.
import { mulberry32 } from './util.js';

// 마크업에 있어야 할 노드가 없을 때(핫 리로드로 낡은 마크업, 고친 heap-room.tsx)도 마운트와 dispose 가 멈추지 않게,
// 어떤 호출이든 받고 아무것도 보이지 않는 빈 요소를 대신 돌려준다. 로그아웃한 사람에게는 방명록 폼이 없는 것이 정상이다.
const ABSENT_OK = new Set(['gb-form', 'gb-name', 'gb-submit']);

function makeLookup(root, warnable) {
  const standIns = new Map();
  return id => {
    const found = root.querySelector('#' + id);
    if (found) return found;
    if (!standIns.has(id)) {
      if (warnable() && !ABSENT_OK.has(id)) console.warn(`[heap-room] #${id} is missing from the markup`);
      standIns.set(id, document.createElement('div'));
    }
    return standIns.get(id);
  };
}

export function createContext(root, opts) {
  const ac = new AbortController();
  const rand = mulberry32(20261112), cleanups = [];
  const ctx = {
    root, opts, ac, rand,
    cleanups, prevTitle: document.title, dataBase: opts.dataBase.replace(/\/?$/, '/'),
    disposed: false, raf: 0, pollTimer: 0, roomTitle: null, // pollTimer 는 run() 이 중간에 멈춰도 dispose 가 지울 수 있게 여기 둔다
    gauss: () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
    // 세 번째 인자(capture, passive 등)는 abort signal 과 합친다
    on: (target, type, fn, opts) => target.addEventListener(type, fn, { ...(opts || {}), signal: ac.signal }),
    // dispose 가 거꾸로 돌리는 정리 함수. 메시, 텍스처, 타이머, iframe, Image 를 만든 모듈이 등록한다
    onDispose: fn => { cleanups.push(fn); },
  };
  ctx.$ = makeLookup(root, () => !ctx.disposed);
  return ctx;
}
