// 쪽지함. 트리에 걸리지 않은 쪽지(자리가 없는 쪽지)가 들어 있는 작은 상자와 그 목록 창.
//
// 상자는 트리 밑동 옆 바닥에 놓인다 (자리는 tree.js 의 placeBox). 쪽지함에 든 쪽지가 0장이면 보이지 않는다.
// 트리 모드에서 상자를 누르면 목록 창(#tree-box)이 열리고, 줄을 누르면 그 쪽지가 상자 자리에서 날아와 열린다 (tree.js 의 openBoxNote).
// 봉인된 줄은 열리는 날을 보여 주고 누를 수 없다. 방 주인이 이른 검토를 켜 두었으면 서버가 봉인하지 않은 채로 보내므로 열린다.
//
// buildBox() 는 three 만 읽는다. setupTreeBox(ctx, T) 는 DOM 의 #tree-box 를 쓴다. T 는 tree.js 가 건네는 안쪽 손잡이다.
import * as THREE from 'three';
import { C } from './tree-note.js';
import { revealDay } from './tree-ids.js';

/** 트리 옆 바닥에 놓는 작은 나무 상자. 방 안의 다른 장식처럼 납작한 면과 클레이 색이다. group 의 원점은 바닥 가운데, 앞은 +z. */
export function buildBox() {
  const group = new THREE.Group(); group.name = 'tree-box';
  const wood = new THREE.MeshStandardMaterial({ color: C.clay, roughness: 0.9, flatShading: true });
  const band = new THREE.MeshStandardMaterial({ color: C.olive, roughness: 0.9, flatShading: true });
  const paper = new THREE.MeshStandardMaterial({ color: C.paper, roughness: 0.95, flatShading: true });
  const geos = [];
  const add = (geo, mat, parent, [x, y, z], [rx, ry, rz] = [0, 0, 0]) => {
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = m.receiveShadow = true; m.userData.box = true; parent.add(m); return m;
  };
  const W = 0.30, H = 0.15, D = 0.21;
  add(new THREE.BoxGeometry(W, H, D), wood, group, [0, H / 2, 0]);
  add(new THREE.BoxGeometry(W + 0.006, 0.028, D + 0.006), band, group, [0, 0.05, 0]); // 허리띠
  // 뚜껑은 뒤쪽 모서리를 축으로 살짝 열려 있다
  const hinge = new THREE.Group(); hinge.position.set(0, H, -D / 2); hinge.rotation.x = -0.42; group.add(hinge);
  add(new THREE.BoxGeometry(W + 0.01, 0.022, D + 0.01), band, hinge, [0, 0.011, D / 2]);
  // 삐죽 나온 종이 몇 장
  add(new THREE.BoxGeometry(0.07, 0.004, 0.1), paper, group, [-0.06, H + 0.01, 0.0], [0.5, 0.2, 0.1]);
  add(new THREE.BoxGeometry(0.07, 0.004, 0.1), paper, group, [0.03, H + 0.012, -0.01], [0.35, -0.3, -0.15]);
  add(new THREE.BoxGeometry(0.06, 0.004, 0.09), paper, group, [0.09, H + 0.008, 0.01], [0.6, 0.1, 0.25]);
  const meshes = []; group.traverse(o => { if (o.isMesh) meshes.push(o); });
  return {
    group, meshes, height: H + 0.02,
    dispose() { for (const g of geos) g.dispose(); wood.dispose(); band.dispose(); paper.dispose(); group.removeFromParent(); },
  };
}

export function setupTreeBox(ctx, T) {
  const { $, on, toast } = ctx;
  const overlay = $('tree-box'), listEl = $('tb-list'), countEl = $('tb-count');

  const isOpen = () => !overlay.hidden;
  function row(d) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tb-row'; b.dataset.id = d.id;
    const meta = document.createElement('span'); meta.className = 'tb-meta';
    meta.textContent = `${d.name ?? '익명'} · ${d.date}${d.mine ? ' · 내 쪽지' : ''}${d.hidden ? ' · 숨김' : ''}`;
    const text = document.createElement('span'); text.className = 'tb-text';
    if (d.sealed) {
      const day = T.revealAt() ? revealDay(T.revealAt()) : '';
      text.textContent = day ? `${day}에 열려요` : '아직 열 수 없어요';
      b.setAttribute('aria-disabled', 'true');
    } else text.textContent = d.msg.split('\n')[0] || ' ';
    b.append(meta, text);
    return b;
  }
  function render() {
    const items = T.boxedList();
    countEl.textContent = `쪽지함 ${items.length}장`;
    listEl.replaceChildren(...items.map(row));
    if (!items.length) close();
  }
  function open() {
    if (isOpen() || ctx.mode !== 'tree' || T.busy() || T.writing()) return;
    if (!T.boxedList().length) return;
    render(); overlay.hidden = false;
    listEl.scrollTop = 0; $('tb-close').focus({ preventScroll: true });
  }
  function close() { if (isOpen()) overlay.hidden = true; }

  on($('tb-close'), 'click', close);
  on(overlay, 'click', e => { if (e.target === overlay) close(); });
  on(listEl, 'click', e => {
    const b = e.target.closest?.('.tb-row'); if (!b) return;
    const d = T.boxedList().find(x => x.id === b.dataset.id);
    if (!d) return;
    if (d.sealed) {
      const day = T.revealAt() ? revealDay(T.revealAt()) : '';
      toast(day ? `${day}에 열려요` : '아직 열 수 없어요');
      return;
    }
    close();
    T.openBoxNote(d);
  });

  return {
    open, close, active: isOpen,
    /** 목록이 열려 있으면 새 쪽지 목록으로 다시 그린다 (tree.js 가 목록이 바뀔 때 부른다) */
    refresh() { if (isOpen()) render(); },
    /** Esc: 목록 창이 열려 있으면 닫고 true */
    escape() { if (!isOpen()) return false; close(); return true; },
    reset: close,
  };
}
