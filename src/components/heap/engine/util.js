// 엔진 전체가 쓰는 순수 함수. 상태를 갖지 않는다.

export const thumbUrl = (reel, name) => `https://i.ytimg.com/vi/${reel.id}/${name}.jpg`;

// 시드를 받는 난수. 같은 시드는 같은 수열을 낸다.
export function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// keep: 이 객체보다 오래 사는 지오메트리와 재질의 Set (모델 캐시)
export function disposeScene(scene, keep) {
  scene.traverse(o => {
    if (!keep?.has(o.geometry)) o.geometry?.dispose();
    for (const m of [].concat(o.material ?? [])) {
      if (keep?.has(m)) continue;
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
  });
}
