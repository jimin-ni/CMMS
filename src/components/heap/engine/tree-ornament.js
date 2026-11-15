// 트리 장식(방울, 선물상자, 장갑). 쪽지를 품은 껍데기. 프리미티브만으로 만든다.
// public/tree-mock/index.html 의 Ornaments 구간을 옮겼다. 씬, 카메라, DOM을 읽지 않는다.
// buildOrnament(kind, { main, accent }) -> { group, kind, mats, top, colors, dim, setOpen(f), setDim(k), setColors(c), dispose() }
// 모든 종류는 가장 긴 변이 ORN이 되도록 맞춘다. 한 세트가 한 크기로 읽힌다.
import * as THREE from 'three';

// 트리 위 Kenney 방울을 1.8 m 트리 크기로 쟀다: 0.140 x 0.140 x 0.121 m.
export const KENNEY_BAUBLE = [0.140, 0.140, 0.121];
export const KENNEY_BAUBLES = [[0.145, 0.657, 0.272], [0.193, 1.130, 0.108], [-0.277, 0.750, 0.017], [-0.107, 1.319, 0.078],
  [-0.274, 0.555, 0.155], [0.057, 0.994, 0.239], [0.157, 0.297, 0.381]].map(a => new THREE.Vector3(...a));
export const ORN = 0.088; // v1.2의 0.11의 80%, Kenney 방울의 약 63%
export const KINDS = ['bauble', 'gift', 'mitten'];
export const KIND_KO = { bauble: '방울', gift: '선물상자', mitten: '장갑' };
// 방(종이 벽, 나무 바닥, 클레이 끈)과 어울리고 초록 트리 위에서 읽히는 네 색
export const MAIN_SWATCHES = [['베리', '#b8394a'], ['크림', '#efe4cf'], ['머스터드', '#d4a537'], ['클레이', '#a6613c']];
export const ACCENTS = { gold: '#d9a441', silver: '#c9ccd1', cream: '#f3e9d6' };
export const ACCENT_KO = { gold: '금', silver: '은', cream: '크림' };

export function ornMats() {
  const main = new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true, side: THREE.DoubleSide, emissive: 0xffc070, emissiveIntensity: 0 });
  const accent = new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true, emissive: 0xffc070, emissiveIntensity: 0 });
  return { main, accent };
}
function mesh(geo, mat, parent, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0], s) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (s) m.scale.set(...s);
  m.castShadow = true; parent.add(m); return m;
}
// 경첩: 점 P의 그룹과, 좌표가 다시 부모의 것인 안쪽 그룹
function pivotAt(parent, x, y, z) {
  const pivot = new THREE.Group(); pivot.position.set(x, y, z); parent.add(pivot);
  const inner = new THREE.Group(); inner.position.set(-x, -y, -z); pivot.add(inner);
  return { pivot, inner };
}
const loopGeo = () => new THREE.TorusGeometry(0.0075, 0.0024, 4, 8);

const BUILD = {
  bauble(g, m) {
    const R = 0.042, L = pivotAt(g, 0, 0, -R), Rt = pivotAt(g, 0, 0, -R);
    mesh(new THREE.SphereGeometry(R, 8, 6, -Math.PI / 2, Math.PI), m.main, L.inner);
    mesh(new THREE.SphereGeometry(R, 8, 6, Math.PI / 2, Math.PI), m.main, Rt.inner);
    mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.012, 8), m.accent, g, [0, R + 0.004, 0]);
    mesh(loopGeo(), m.accent, g, [0, R + 0.017, 0]);
    return f => { L.pivot.rotation.y = -1.25 * f; Rt.pivot.rotation.y = 1.25 * f; };
  },
  gift(g, m) {
    mesh(new THREE.BoxGeometry(0.058, 0.05, 0.058), m.main, g, [0, -0.015, 0]);
    mesh(new THREE.BoxGeometry(0.012, 0.051, 0.0595), m.accent, g, [0, -0.015, 0]);
    mesh(new THREE.BoxGeometry(0.0595, 0.051, 0.012), m.accent, g, [0, -0.015, 0]);
    const lid = pivotAt(g, 0, 0.01, -0.032), li = lid.inner;
    mesh(new THREE.BoxGeometry(0.065, 0.014, 0.065), m.main, li, [0, 0.017, 0]);
    mesh(new THREE.BoxGeometry(0.013, 0.015, 0.066), m.accent, li, [0, 0.017, 0]);
    mesh(new THREE.BoxGeometry(0.066, 0.015, 0.013), m.accent, li, [0, 0.017, 0]);
    mesh(new THREE.TorusGeometry(0.011, 0.0045, 4, 8), m.accent, li, [-0.011, 0.033, 0], [0, 0, 0.55]);
    mesh(new THREE.TorusGeometry(0.011, 0.0045, 4, 8), m.accent, li, [0.011, 0.033, 0], [0, 0, -0.55]);
    mesh(new THREE.SphereGeometry(0.0065, 6, 4), m.accent, li, [0, 0.028, 0]);
    return f => { lid.pivot.rotation.x = -1.6 * f; lid.pivot.position.y = 0.01 + 0.008 * f; };
  },
  mitten(g, m) {
    const body = pivotAt(g, 0, -0.018, -0.012), bi = body.inner;
    mesh(new THREE.SphereGeometry(1, 7, 5), m.main, bi, [0.004, 0.012, 0], [0, 0, 0], [0.027, 0.034, 0.016]);
    mesh(new THREE.SphereGeometry(1, 6, 4), m.main, bi, [-0.025, 0.0, 0], [0, 0, 0.55], [0.009, 0.016, 0.011]);
    mesh(loopGeo(), m.accent, bi, [0.004, 0.05, 0]);
    const cuff = pivotAt(g, 0, -0.04, 0.012);
    const c = mesh(new THREE.CylinderGeometry(0.026, 0.027, 0.02, 8), m.accent, cuff.inner, [0.002, -0.03, 0], [0, 0, 0], [1, 1, 0.65]);
    return f => { body.pivot.rotation.x = -0.95 * f; cuff.pivot.rotation.x = 0.35 * f; c.scale.set(1 + 0.18 * f, 1, 0.65 + 0.25 * f); };
  },
};

export function buildOrnament(kind, colors) {
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const mats = ornMats();
  const setOpenRaw = BUILD[kind](body, mats);
  // 모든 종류가 한 크기: 가장 긴 변이 ORN
  setOpenRaw(0); body.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(body), size = bb.getSize(new THREE.Vector3()), mid = bb.getCenter(new THREE.Vector3());
  const k = ORN / Math.max(size.x, size.y, size.z);
  body.scale.setScalar(k); body.position.copy(mid).multiplyScalar(-k);
  const o = { group, kind, mats, top: size.y * k / 2, colors: { ...colors }, dim: 1 };
  o.setOpen = f => setOpenRaw(f);
  o.setColors = c => { Object.assign(o.colors, c); o.setDim(o.dim); };
  o.setDim = d => {
    o.dim = d;
    mats.main.color.set(o.colors.main).multiplyScalar(d);
    mats.accent.color.set(ACCENTS[o.colors.accent] ?? o.colors.accent).multiplyScalar(d);
    mats.accent.metalness = o.colors.accent === 'cream' ? 0 : 0.2;
  };
  o.setDim(1);
  o.dispose = () => { group.traverse(x => { if (x.isMesh) x.geometry.dispose(); }); mats.main.dispose(); mats.accent.dispose(); };
  return o;
}
