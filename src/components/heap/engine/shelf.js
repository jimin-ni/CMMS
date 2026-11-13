// 앨범 책장: 앨범 표지, 앨범 보기, 책장 앞 위치.
import * as THREE from 'three';
import { thumbUrl } from './util.js';
import { el, link, bindOverlay } from './dom.js';
import { ytUrl } from './format.js';

export function setupShelf(ctx) {
  const { ALBUMS, $, filed, C, setHint, syncUI, on, reels, albumName } = ctx;

  const shelfLocal = v => ctx.shelf.group.localToWorld(v.clone());

  ctx.sortCam = null; ctx.shelfSpot = null; ctx.shelfStand = null; ctx.shelfFacing = 0;
  function linkShelf() { // the album shelf's camera and standing spots; runs again after every buildItems()
    ctx.sortCam = ctx.shelfSpot = ctx.shelfStand = null;
    if (!ctx.shelf) return;
    const albumsC = shelfLocal(new THREE.Vector3(0, 1.05, 0));
    ctx.sortCam = { pos: shelfLocal(new THREE.Vector3(-1.6, 2.2, 2.5)), target: albumsC };
    ctx.shelfSpot = shelfLocal(new THREE.Vector3(-0.75, 0, 0.9)); ctx.shelfSpot.y = 0;
    ctx.shelfStand = shelfLocal(new THREE.Vector3(1.0, 0, 0.95)); ctx.shelfStand.y = 0;
    ctx.shelfFacing = ctx.shelf.group.rotation.y + Math.PI;
  }
  linkShelf();

  ALBUMS.forEach((a, i) => {
    const b = document.createElement('button'); b.className = 'btn paper'; b.type = 'button';
    b.innerHTML = `<span class="k">${i + 1}</span>`; b.append(a.name);
    b.addEventListener('click', () => albumAction(a.key));
    $('albumrow').appendChild(b);
  });

  // album shelf: browse albums (the sorting round lives in archive/album-sort/)
  function updateAlbums() {
    if (!ctx.shelf) return;
    for (const a of ctx.shelf.albums) {
      const n = [...filed.values()].filter(v => v.album === a.key).length;
      a.mesh.scale.x = Math.min(0.32, 0.13 + n * 0.008);
      const g = a.lc.getContext('2d');
      g.fillStyle = C.paper; g.fillRect(0, 0, 96, 360);
      g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      const chars = [...a.name.replace(/\s/g, '')], fs = Math.min(52, 270 / chars.length);
      g.font = `${fs}px "Nanum Pen Script", cursive`;
      chars.forEach((ch, i) => g.fillText(ch, 48, 30 + fs / 2 + i * fs));
      g.font = '600 26px "IBM Plex Sans KR", sans-serif'; g.fillStyle = C.accent;
      g.fillText(String(n), 48, 330);
      a.lt.needsUpdate = true;
    }
  }
  function enterSort() { // "sort" mode = standing at the album shelf, browsing albums
    if (!ctx.shelf) return;
    ctx.mode = 'sort'; ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = []; ctx.perch = null;
    ctx.me.position.copy(ctx.shelfStand); ctx.me.rotation.y = ctx.shelfFacing - 0.4;
    setHint('shelf'); ctx.goTo(ctx.sortCam); syncUI();
  }
  function exitSort() { ctx.mode = 'room'; ctx.camGoal = null; setHint('room'); syncUI(); }
  on($('sortexit'), 'click', exitSort);
  const albumAction = key => { if (ctx.mode === 'sort') openAlbum(key); };
  function openAlbum(key) {
    const list = $('grid-list'); list.innerHTML = '';
    const items = reels.filter(r => filed.get(r.id)?.album === key);
    $('grid-title').textContent = `${albumName(key)} · ${items.length}장`;
    for (const r of items) {
      const it = el('div', 'gitem' + (r.wide ? ' wide' : ''));
      // near tier; the grid's object-fit: cover crops YouTube's padded frame down to the picture
      const im = el('img'); im.crossOrigin = 'anonymous'; im.src = thumbUrl(r, 'hqdefault'); im.alt = ''; im.loading = 'lazy'; it.appendChild(im);
      it.appendChild(el('span', null, r.title)); it.appendChild(link('원본 ↗', ytUrl(r)));
      list.appendChild(it);
    }
    if (!items.length) list.appendChild(el('p', 'note', '아직 비어 있어요.'));
    $('grid').hidden = false;
  }
  bindOverlay(ctx, 'grid', 'grid-close');

  Object.assign(ctx, { linkShelf, updateAlbums, enterSort, exitSort, albumAction });
}
