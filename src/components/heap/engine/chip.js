// 가구 위에 떠 있는 작은 알림 표지 (방명록의 "새 방명록 N"). 쪽지 트리의 표지(tree.js)와 같은 모양이다:
// 종이색 알약 위의 글자, 깊이를 무시하고 늘 위에 그린다. 숨은 동안은 누르기도 받지 않는다.
import * as THREE from 'three';

export function makeChip(ink, { w = 0.8 } = {}) {
  const cv = document.createElement('canvas'); cv.width = 360; cv.height = 100;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  sp.scale.set(w, w * cv.height / cv.width, 1); sp.renderOrder = 20; sp.visible = false;
  sp.raycast = function (ray, hits) { if (this.visible) THREE.Sprite.prototype.raycast.call(this, ray, hits); };
  let shown = null;
  // text 가 비면 숨긴다
  function paint(text) {
    if (text === shown) return;
    shown = text;
    sp.visible = !!text;
    if (!text) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, k = 8, r = 42;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(243, 234, 219, 0.94)';
    g.beginPath(); g.moveTo(k + r, k); g.arcTo(W - k, k, W - k, H - k, r); g.arcTo(W - k, H - k, k, H - k, r); g.arcTo(k, H - k, k, k, r); g.arcTo(k, k, W - k, k, r); g.closePath(); g.fill();
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 44px "IBM Plex Sans KR", system-ui, sans-serif';
    g.fillText(text, W / 2, H / 2 + 3);
    tex.needsUpdate = true;
  }
  return { sp, paint };
}
