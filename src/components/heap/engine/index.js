// 힙 미니룸 엔진의 진입점. 모듈을 순서대로 세우고, 마운트를 되돌리는 dispose 를 돌려준다.
// 원래 .claude/session-artifacts/heap-poc/miniroom/room.html 의 <script type="module"> 본문이었고, 책임별 모듈로 나눴다.
// 브라우저에서만 돈다: 클라이언트 컴포넌트에서 dynamic import 로 불러온다.
//
// 모듈 규칙
//   - 모듈은 setupX(ctx) 하나를 내보낸다. 자기 몫을 짓고, 다른 모듈이 쓰는 값만 ctx 에 올린다.
//   - 바뀌는 값은 모듈 수준에 두지 않는다. 마운트마다 새 ctx 가 생기고(context.js) 이 엔진은 방을 옮길 때마다 다시 마운트된다.
//   - 메시, 텍스처, 리스너, 타이머, iframe, Image 를 만드는 모듈은 ctx.onDispose(fn) 으로 정리 함수를 등록한다.
//   - 순수 함수(draw, format, dom, util)는 import 로 가져간다.
import { createContext } from './context.js';
import { setupData } from './data.js';
import { setupHud } from './hud.js';
import { setupCardArt } from './card-art.js';
import { setupScene } from './scene.js';
import { setupShell } from './shell.js';
import { setupFurniture } from './furniture.js';
import { setupSlots } from './slots.js';
import { setupModels } from './models.js';
import { setupShelf } from './shelf.js';
import { setupTime } from './time.js';
import { setupProps } from './props.js';
import { setupWalk } from './walk.js';
import { setupHeap } from './heap.js';
import { setupThumbs } from './thumbs.js';
import { setupLoop } from './loop.js';
import { setupModes } from './modes.js';
import { setupEditorBridge } from './editor-bridge.js';
import { setupPlayers } from './players.js';
import { setupPanels } from './panels.js';
import { setupLive } from './live.js';
import { setupInput } from './input.js';
import { setupPath } from './path.js';
import { setupEdit } from './edit.js';
import { setupDockThumbs } from './dock-thumbs.js';
import { setupEditCamera } from './edit-camera.js';

// heap-room.tsx 가 그리고 엔진이 채우거나 보이게 하는 노드의 id. dispose 가 첫 렌더 상태로 되돌린다.
const LISTS = ['albumrow', 'player-frame', 'music-frame', 'phone-feed', 'pc-list', 'ks-body', 'cal-body', 'grid-list', 'gb-list', 'roomlist'];
const HIDDEN = ['visit', 'albumrow', 'stand', 'flip', 'srclink', 'eject', 'ytlink', 'sortexit', 'player', 'player-note', 'music', 'music-note', 'music-link', 'phone', 'pc', 'keepsake', 'calendar', 'grid', 'guestbook', 'rooms', 'rooms-legend'];

/**
 * 방을 `root`(heap-room.tsx 가 그린 요소)에 올리고 dispose 함수를 돌려준다.
 * 라이브 훅은 `root` 에 보내는 CustomEvent 다: `heap:time`(time.js), `heap:items`, `heap:get`, `heap:saved`, `heap:edit`(editor-bridge.js),
 * `heap:editcmd`(edit.js), `heap:thumb`(dock-thumbs.js).
 * 꾸미기가 팔레트나 방의 틀(템플릿)을 바꾸면 엔진은 `heap:remount`(detail: 편집 상태)를 보낸다. heap-room.tsx 가 그 상태를 opts.resume 으로 넘겨 다시 마운트한다:
 * resume { edit, items, time, palette, shell, name, savedName, hist, future, saved, original, baseLayout } (edit.js 의 remount 참고).
 * 엔진이 `root` 에 직접 보내는 것은 둘이다. `heap:mode`(detail: 'room' | 'sit' | 'watch' | 'sort')는 모드가 정해질 때마다,
 * `heap:ready` 는 방이 화면에 뜬 뒤에 한 번.
 * `modelBase` 는 가구 모델과 catalogue.json 이 있는 폴더다. 없으면 `dataBase` 옆의 "models/" 다.
 * `data` 는 서버가 DB에서 읽은 값이다 (page.tsx 가 바꿔 넘긴다): { roomUuid, name, serverTime, rooms, layout, reels, pieces, guestbook, visits, creatorVisit }.
 * creator.json(링크, 앨범)은 아직 `dataBase` 에서 읽는다. 없는 방은 링크와 앨범이 비어 있다.
 * 쓰기는 opts.recordVisit() 와 opts.addGuestbook(name) 으로 간다 (서버 액션, heap-room.tsx 가 연결). 다른 사람이 바꾼 것은 opts.pollMs 마다 읽어 온다.
 * opts.bubbleHref 는 휴대폰이 여는 곳(주인의 버블 방 또는 목록), opts.navigate(href) 가 연다. opts.parseLink(url) 는 기념품 링크가 유튜브 게시물인지 알려 준다 (platform.ts).
 * opts.isSafeLink / isWebLink / isEmail 은 서버의 링크 검사다 (slots.ts). 링크는 이 중 하나를 통과해야 href 에 닿는다.
 * opts.parseMusic(url) 은 slots.ts 의 parseMusicUrl 이다: { video, list } (정규식을 통과한 임베드 ID) 또는 null. data.rooms[].changed 는 문 앞 방 목록의 그 방에 점을 찍는다.
 * 꾸미기(edit.js)는 서버와 같은 규칙을 쓴다: opts.itemHalfExtents, opts.placementError 는 layout.ts 의 itemHalfExtents, itemPlacementError 이고
 * opts.policy 는 policy.ts 의 HEAP_POLICY 다 (frameY, frameWallMargin).
 * @param {HTMLElement} root
 * @param {{ roomId: string, roomUuid: string, dataBase: string, modelBase?: string, data: any, viewerName: string | null, signedIn: boolean, pollMs: number, bubbleHref: string, navigate: (href: string) => void, parseLink: (url: string) => ({ platform: string, externalId: string, wide: boolean | null } | null), parseMusic: (url: string) => ({ video: string | null, list: string | null } | null), isSafeLink: (v: unknown) => boolean, isWebLink: (v: unknown) => boolean, isEmail: (v: unknown) => boolean, recordVisit: () => Promise<any>, addGuestbook: (name: string) => Promise<any>, onNavigate: (roomId: string) => void, itemHalfExtents: (item: any) => ({ hx: number, hz: number } | null), placementError: (item: any, room: { w: number, d: number }, table: { x: number, z: number }) => (string | null), surfaces?: any, policy: { frameY: number, frameWallMargin: number }, resume?: any }} opts
 * @returns {() => void}
 */
export function mountRoom(root, opts) {
  const ctx = createContext(root, opts);

  run(ctx).catch(e => { if (!ctx.disposed) console.error('[heap-room]', e); });

  return function dispose() {
    if (ctx.disposed) return;
    ctx.disposed = true;
    // 어느 단계가 던져도 나머지는 모두 돈다: 반쯤 끝난 dispose 는 죽은 엔진의 타이머, 프레임 루프, 리스너를 남긴다
    const safe = (step, what) => { try { step(); } catch (e) { console.error('[heap-room] dispose:', what, e); } };
    safe(() => ctx.ac.abort(), 'listeners and requests');
    while (ctx.cleanups.length) safe(ctx.cleanups.pop(), 'cleanup');
    restoreMarkup(ctx, safe);
  };
}

// 모듈을 세우는 순서가 방의 모습을 정한다: 난수 수열을 쓰는 순서(data, shell, furniture, heap)와 scene 에 붙이는 순서다.
async function run(ctx) {
  await setupData(ctx); // creator.json 을 기다리는 동안 dispose 될 수 있다
  if (ctx.disposed) return;
  setupHud(ctx);
  setupCardArt(ctx);
  setupScene(ctx);
  setupShell(ctx);
  setupFurniture(ctx);
  setupSlots(ctx);
  setupModels(ctx);
  // 받침 위에 선 작은 가구를 받침의 윗면에 딱 맞춰 짓는다 (surfaces.ts 의 settleItems: 러브쑤 방의 조리대 위 물건 0.9 → 0.84).
  // DB 는 고치지 않는다. 기준(original, baseLayout)도 맞춘 값으로 두어 꾸미기가 바뀐 것으로 보지 않고, 다음 저장에 맞춘 값이 들어간다.
  // 다시 마운트(opts.resume)는 이미 맞춘 목록을 이어받는다.
  const settled = !ctx.opts.resume && ctx.opts.surfaces ? ctx.opts.surfaces.settleItems(ctx.layout.items || []) : null;
  if (settled?.moved.length) {
    ctx.layout.items = settled.items;
    ctx.original.items = settled.items.map(it => ({ ...it }));
    if (Array.isArray(ctx.baseLayout.items)) ctx.baseLayout.items = settled.items.map(it => ({ ...it }));
  }
  ctx.buildItems(ctx.layout.items || [], true); // 첫 빌드는 방의 공용 난수 수열을 쓴다
  setupShelf(ctx);
  setupTime(ctx);
  setupProps(ctx);
  setupWalk(ctx);
  setupHeap(ctx);
  setupThumbs(ctx);
  setupLoop(ctx);
  setupModes(ctx);
  setupEditorBridge(ctx);
  setupPlayers(ctx);
  setupPanels(ctx);
  setupLive(ctx);
  setupInput(ctx);
  setupPath(ctx);
  setupDockThumbs(ctx); // 꾸미기 가구 목록의 그림 (heap:thumb)
  setupEditCamera(ctx); // 꾸미기의 카메라: 맞춤, 확대, 이동, 평면도 (loop.js 의 ROOM_CAM 을 쓴다)
  setupEdit(ctx); // 꾸미기. 포인터를 방 루트의 capture 단계에서 먼저 받으므로 input.js 뒤에 세워도 된다

  await fontsReady(); // 썸네일은 기다리지 않는다: buildHeap() 이 줄을 세우고 카드는 그림이 오는 대로 채워진다
  if (ctx.disposed) return;
  start(ctx);
}

async function fontsReady() {
  const wait = Promise.all([document.fonts.load('40px "Nanum Pen Script"', '가나 abc'), document.fonts.load('600 20px "IBM Plex Sans KR"', '만 1234')]);
  await Promise.race([wait, new Promise(r => setTimeout(r, 3000))]);
}

// 방을 화면에 올린다: 카드, 앨범 표지, 기능 가구를 채우고 첫 프레임을 그린 뒤 알린다.
function start(ctx) {
  const { root, opts, $, camera, controls, ROOM_CAM } = ctx;
  ctx.buildHeap();
  ctx.updateAlbums();
  ctx.startSlots(); // 기념품이 글꼴로 그려지고 썸네일을 받기 시작한다
  ctx.resize();
  camera.position.copy(ROOM_CAM.pos); controls.target.copy(ROOM_CAM.target); camera.lookAt(ROOM_CAM.target);
  ctx.setHint('room'); ctx.syncUI();
  $('status').hidden = true;
  ctx.frame();
  root.dispatchEvent(new CustomEvent('heap:ready'));
  // 로그인한 방문자는 마운트마다 한 번 기록된다 (서버는 사람당 하루 한 줄만 둔다). 로그인하지 않은 사람은 기록하지 않는다
  if (opts.signedIn) opts.recordVisit().then(r => { if (!ctx.disposed && r?.ok && r.recorded) ctx.poll(); }).catch(() => {});
  ctx.schedulePoll();
}

// React 가 그린 노드를 첫 렌더 상태로 되돌려, 다음 마운트가 깨끗하게 시작하게 한다
function restoreMarkup({ root, $, prevTitle, roomTitle }, safe) {
  for (const id of LISTS) safe(() => { $(id).innerHTML = ''; }, id);
  for (const id of HIDDEN) safe(() => { $(id).hidden = true; }, id);
  safe(() => { $('status').hidden = false; $('fade').classList.remove('on'); }, 'status');
  safe(() => { $('toast').textContent = ''; $('gb-msg').textContent = ''; $('visit').textContent = ''; $('hint').textContent = ''; delete $('hint').dataset.k; }, 'texts');
  safe(() => { root.style.removeProperty('--clay'); root.style.removeProperty('--music-w'); }, 'root style');
  safe(() => { if (roomTitle && document.title === roomTitle) document.title = prevTitle; }, 'title');
}
