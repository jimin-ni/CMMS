// 꾸미기: 방 안에서 가구를 집고, 끌고, 돌리고, 넣는다 (design/editor.md 의 B1, B2). 팔레트(B4)와 모양 바꾸기(B5)도 여기서 한 걸음이 된다.
// 편집 중의 가구 목록, 고른 가구, 되돌리기 기록은 이 모듈이 갖는다. 화면 위 단추(위 막대, 가구 목록, 가구 위 막대, 기능 칸)는
// room-editor.tsx 가 그리고, 이 모듈과는 방 루트의 이벤트로만 이야기한다.
//   받는 것  heap:edit (true 면 들어오고 false 면 나간다, heap-room.tsx)
//            heap:editcmd { op, ... }  op: arm(template), rotate(dir), copy, remove, undo, redo, time(value), fn(index, fn), lit, select(index | null), cancel, reset(처음으로), discard(나가며 버리기),
//                                     palette(palette | null), swap(index, to { type, model? }), plan(value?: 위에서 보기를 켜고 끈다), fit(구도 맞추기),
//                                     lift(dir: 1 | -1, 벽 가구의 높이. PageUp/PageDown 과 같다),
//                                     name(value: 방 이름, 검사는 room-editor.tsx 와 서버가 한다), load(layout { items, palette, shell?, time? }, name?: 템플릿이나 저장 전 모습을 한 걸음으로 깐다),
//                                     preview(value: 팔로워로 보기를 켜고 끈다), palhover(palette | null: 팔레트 카드 위에 올린 동안 방에 미리 칠한다. null 이면 되돌린다. 걸음이 아니다),
//                                     backdrop(value: { mode: 'colour', top, bottom? } | null = 시간 따라). palette 는 brand(브랜드 색 목록 | null)를 함께 줄 수 있다
//            heap:saved { roomUuid, layout, name? } (editor-bridge.js 와 함께): 저장된 레이아웃과 이름이 새 기준이 된다. 다른 방의 것은 버린다
//   보내는 것 heap:editstate { items, sel, moving, canUndo, canRedo, dirty, time, notice, palette, backdrop, brand, look, mount, placed, busy, view { plan, fitted },
//                              shell, name, savedName, preview }  바뀔 때마다
//            heap:remount { edit, items, time, palette, backdrop, brand, shell, name, savedName, hist, future, saved, original, baseLayout, plan }  방의 틀이 바뀔 때 (아래 remount)
// 방의 틀(shell): 방 크기와 고정된 것(창문, 문, 스크린, 방명록, 포스터, 사진 탁자)의 자리. 템플릿을 깔면 바뀌고, 바뀌면 팔레트처럼 다시 마운트한다.
// 방 이름도 되돌리기 기록에 든다: 이름 하나를 고치는 것이 한 걸음이고, 저장 안 된 변경으로 센다. 화면 왼쪽 위의 이름(hud.js 의 showName)도 바로 바뀐다.
// 팔로워로 보기(preview): 편집 상태는 그대로 두고, 카메라는 방 카메라로, 발판·격자·막대는 숨기고, 포인터와 키는 받지 않는다 (room-editor.tsx 가 키를 받아 돌아간다).
// 카메라(B6)는 edit-camera.js 의 ctx.editCam 이다: 휠 확대, 오른쪽 끌기 이동(움직이지 않은 오른쪽 클릭은 취소), T 평면도, Home 또는 0 맞추기.
// 집고 놓는 일은 지금 화면의 카메라로 하므로 두 카메라에서 같다. 평면도에서 벽 액자는 가까운 벽을 따르고, 맞은 메시가 없으면 바닥의 발판으로 고른다.
// 들고 있는 가구가 다른 가구에 가리면 옅은 그림자(실루엣)로 비쳐 보이고, 발판의 점선 테두리는 늘 보인다 (아래 그림자).
// 팔레트는 그 자리에서 다시 칠한다 (recolour.js: 다시 마운트하지 않는다). 배경(backdrop)도 그 자리에서 바뀐다 (time.js 의 setBackdrop).
// 방의 틀(템플릿)은 다시 마운트한다 (1초쯤). 편집 상태와 되돌리기 기록은 heap:remount 로 heap-room.tsx 에 넘기고,
// 새 마운트가 opts.resume 으로 받아 이어 간다. 그 사이 방 안의 상태(앉은 자리, 음악)는 처음으로 돌아간다.
// 끄는 동안에는 그 가구의 그룹만 프레임마다 옮기고, 놓을 때 한 번 buildItems 로 다시 짓는다 (applyItems, editor-bridge.js).
// 가구끼리 겹치는 것은 막지 않는다. 막는 것은 서버가 거절하는 자리(opts.placementError = layout.ts 의 itemPlacementError)와,
// 기능에 닿지 못하게 하는 자리(사진 탁자와 그 앞자리, 문 앞, 방명록 앞, 창문·스크린·문 위의 액자와 벽 가구)뿐이다. 방 밖은 막지 않고 안으로 당긴다.
// 벽 가구(catalogue.json 의 mount "wall")는 액자처럼 벽을 따라 움직이고 PageUp/PageDown 으로 높이를 바꾼다. 천장 가구(mount "ceiling")는
// 천장에 매달려 방 안을 움직인다. 아래 "벽·천장 가구" 참고.
// 작은 가구(라디오, 노트북, 탁상 조명, 책, 작은 화분, 달력 …)는 커서 아래 가구의 윗면에 올라선다 (B7). 높이는 받침의 y + 받침의 윗면 높이(카탈로그의 tops, surfaces.ts)다.
// 받침을 옮기거나 돌리거나 넣으면 그 위에 선 것이 함께 간다. 아래 "가구 위에 얹기" 참고.
// 바닥 가구를 들고 있는 동안 비워 둘 바닥(사진 탁자와 앞자리, 문 앞, 방명록 앞)이 옅은 빗금과 이름으로 보인다.
import * as THREE from 'three';
import { makeCanvas, canvasTexture } from './draw.js';

const GRID = 0.25, WALL_SNAP = 0.3, EDGE_SNAP = 0.2, UNDO_MAX = 50, FN_DELAY = 300;
// 벽·천장 가구 (catalogue.json 의 mount). 높이는 모델의 경계 상자(models.js 의 modelSize)에서 읽는다.
//   NUDGE: PageUp/PageDown 한 번에 올리고 내리는 높이 · COUNTER: 하부장 모델을 아직 못 읽었을 때 쓰는 조리대 높이
//   WALL_SPOT: 벽 가구의 기본 높이 규칙. 처음 맞는 줄을 쓴다. gap 은 조리대 위의 틈(밑면), mid 는 가운데 높이, below 는 천장에서 윗면까지
const NUDGE = 0.1, COUNTER = 0.9;
const WALL_SPOT = [
  { re: /^hood/i, gap: 0.65 }, // 후드: 상부장보다 조금 높이 (러브쑤 방의 손으로 놓은 자리와 같다)
  { re: /^kitchenCabinetUpper/, gap: 0.6 }, // 상부장: 밑면이 조리대 위 0.6
  { re: /mirror/i, mid: 1.6 }, // 거울: 눈높이
  { re: /^lampWall/, mid: 2.0 },
  { re: /wreath/i, mid: 2.4 },
  { re: /lights/i, below: 0.35 }, // 전구 줄: 천장 바로 아래
];
const OK = '#7d9a4a', BAD = '#c2452d', PICKED = '#A6613C';
// 엔진이 직접 만드는 가구의 이름 (알림 문구용). 모델은 카탈로그의 label 을 쓴다.
const HAND_LABEL = { bed: '침대', shelf: '앨범 책장', plant: '화분', snake: '산세베리아', lamp: '조명', books: '책 더미', frame: '벽 액자', calendar: '탁상 달력' };
const OVERLAYS = ['phone', 'pc', 'keepsake', 'calendar', 'grid', 'rooms', 'guestbook'];
// 방의 틀의 레이아웃 열쇠. 순서가 비교 문자열(snap)의 순서다.
const SHELL_KEYS = ['room', 'window', 'door', 'screen', 'guestbook', 'posters', 'table'];
const shellOf = l => Object.fromEntries(SHELL_KEYS.filter(k => l && l[k] !== undefined).map(k => [k, structuredClone(l[k])]));

const r2 = v => Math.round(v * 100) / 100;
const snapGrid = v => Math.round(v / GRID) * GRID;
const clamp = (v, lo, hi) => (lo > hi ? 0 : Math.min(hi, Math.max(lo, v)));
const normRot = r => ((Math.round(r / 90) * 90) % 360 + 360) % 360;

export function setupEdit(ctx) {
  const {
    root, opts, on, $, canvas, camera, scene, RX, RZ, WALLS, WALL_H, TABLE, DOOR, WIN, SCR, GB, SEAT, me,
    tableTop, projParts, phoneParts, doorParts, bookParts, screen, getCatalogue,
  } = ctx;
  const room = { w: 2 * RX, d: 2 * RZ }, tableAt = { x: TABLE.x, z: TABLE.z };
  const FRAME_Y = opts.policy.frameY, FRAME_M = opts.policy.frameWallMargin, Y_MAX = opts.policy.layoutItemYMax;

  // 편집 상태. move: 커서에 붙은 가구 { i, isNew, base, rot, kids, kidsBase, grab, cand, why }
  //   i 는 지금 build 의 번호다. 새 가구는 ed.items 끝(ed.items.length)에 붙어 지어지고, 놓을 때 ed.items 에 들어간다.
  // press: 가구를 눌렀지만 아직 움직이지 않았다 · hist/future: { items, time } JSON · tag: 이어지는 고침을 한 걸음으로 묶는 표 (기능 칸의 글자)
  const ed = {
    on: false, items: [], time: 'auto', sel: null, move: null, press: null, hist: [], future: [], tag: null, saved: '',
    alt: false, last: null, notice: null, seq: 0, fnTimer: 0,
    // palette: layout.palette (없으면 null = 기본 올리브 오후) · placed: 방금 내려놓은 새 가구 { index, seq } (기능 말풍선을 연다) · busy: 다시 마운트를 기다린다
    palette: null, placed: null, busy: false,
    // backdrop: layout.backdrop (null = 시간 따라) · brand: layout.brand, 주인이 넣은 브랜드 색 1~3개 (null = 없음)
    backdrop: null, brand: null,
    // shell: 방의 틀 (위 SHELL_KEYS) · name: 방 이름 · preview: 팔로워로 보기 중
    shell: {}, name: '', preview: false,
  };
  // 이 마운트의 번호. 칠한 색(look)은 ctx.look 이다: 가구 목록의 그림은 그 색으로 그려진다 (dock-thumbs.js)
  const MOUNT = Math.floor(Math.random() * 1e9);
  ctx.onDispose(() => clearTimeout(ed.fnTimer));

  // ---------- 규칙 ----------
  const entryOf = it => (it.type === 'model' ? ctx.catalogue?.models?.find(m => m.id === it.model) : null);
  const isRug = it => entryOf(it)?.category === 'rug';
  const labelOf = it => entryOf(it)?.label ?? HAND_LABEL[it.type] ?? it.model ?? it.type;
  // 바닥에서 차지하는 반쪽 크기 (회전한 뒤). 액자는 벽을 따라 FRAME_M 이다. 크기를 모르는 가구는 0.25 로 본다.
  const ext = it => (it.type === 'frame' ? { hx: FRAME_M, hz: 0.06 } : opts.itemHalfExtents(it) ?? { hx: 0.25, hz: 0.25 });
  // ---------- 벽·천장 가구 ----------
  // mount 'wall': 뒷벽(0도)이나 왼쪽 벽(90도)에 등을 붙이고 벽을 따라 미끄러진다. 높이는 PageUp/PageDown 으로 바꾼다 (서버: layout.ts 의 wallMountError).
  // mount 'ceiling': 윗면이 천장(WALL_H)에 닿게 매달고, 방 안 어디로든 옮긴다. 바닥의 비워 둘 자리와는 상관없다.
  // mount 'structure'(벽 조각)는 독에 나오지 않는다 (room-editor.tsx). 저장된 방에 있으면 바닥 가구처럼 다루되, 다른 가구를 얹지도 않고 얹히지도 않는다.
  // mountOf: 카탈로그의 mount 그대로 ('wall' | 'ceiling' | 'structure' | null) · isHung: 벽이나 천장에 거는 것
  const mountOf = it => entryOf(it)?.mount ?? null;
  const isHung = it => mountOf(it) === 'wall' || mountOf(it) === 'ceiling';
  const isWallPiece = it => mountOf(it) === 'wall';
  const onWallType = it => it.type === 'frame' || isWallPiece(it); // 벽을 따라서만 움직이는 것
  const wallOf = it => (it.rot === 90 ? 'left' : 'back');
  const heightOf = it => (it.type === 'model' ? ctx.modelSize(it.model)?.y ?? null : null);
  const floor2 = v => Math.floor(v * 100 + 1e-6) / 100;
  // y 가 갈 수 있는 범위: 바닥 위, 윗면이 천장 아래, 서버의 범위(0..layoutItemYMax) 안
  const yRange = it => [0, Math.max(0, floor2(Math.min(Y_MAX, WALL_H - (heightOf(it) ?? 0))))];
  // 새로 꺼낸 벽·천장 가구의 높이 (밑면). 모델을 아직 못 읽었으면 null
  function mountY(it) {
    const kind = mountOf(it), h = heightOf(it);
    if (!isHung(it) || h == null) return null;
    const [lo, hi] = yRange(it);
    if (kind === 'ceiling') return hi;
    const s = WALL_SPOT.find(r => r.re.test(it.model));
    const counter = ctx.modelSize('kitchenCabinet')?.y ?? COUNTER;
    const y = s?.gap != null ? counter + s.gap : s?.mid != null ? s.mid - h / 2 : s?.below != null ? WALL_H - s.below - h : FRAME_Y - h / 2;
    return r2(clamp(y, lo, hi));
  }
  // 벽 가구를 wall 의 u 자리에 건 항목: 등이 벽에 닿고(바닥 크기의 뒷면 = 벽), 벽을 따라 방 안에 든다
  function hangAt(it, wall, u) {
    const c = { ...it, rot: wall === 'back' ? 0 : 90 }, e = ext(c);
    const along = wall === 'back' ? e.hx : e.hz, half = WALLS[wall].half;
    u = r2(clamp(u, -half + along, half - along));
    return wall === 'back' ? { ...c, x: u, z: r2(-RZ + e.hz) } : { ...c, x: r2(-RX + e.hx), z: u };
  }
  // 벽을 따라 붙는 자리: 같은 벽의 벽 가구, 그 벽에 등을 댄 주방 바닥 가구(하부장, 개수대)와 가장자리나 가운데를 맞춘다. 가까운 것이 EDGE_SNAP 안에 없으면 null
  function snapAlong(it, wall, u, skip) {
    const e = ext({ ...it, rot: wall === 'back' ? 0 : 90 }), al = wall === 'back' ? e.hx : e.hz;
    let best = null, gap = EDGE_SNAP;
    ed.items.forEach((o, j) => {
      if (skip.has(j) || o.type === 'frame' || mountOf(o) === 'ceiling') return;
      const oe = ext(o), back = wall === 'back';
      const counter = !o.y && entryOf(o)?.category === 'kitchen' && (back ? o.z - oe.hz < -RZ + WALL_SNAP : o.x - oe.hx < -RX + WALL_SNAP);
      const touches = isWallPiece(o) ? wallOf(o) === wall : counter;
      if (!touches) return;
      const ou = back ? o.x : o.z, oal = back ? oe.hx : oe.hz;
      for (const t of [ou, ou + oal + al, ou - oal - al, ou + oal - al, ou - oal + al]) if (Math.abs(u - t) < gap) { gap = Math.abs(u - t); best = t; }
    });
    return best;
  }

  // ---------- 가구 위에 얹기 ----------
  // 규칙은 opts.surfaces (src/lib/heap/surfaces.ts) 가 갖는다. 받침은 윗면 높이(tops: 카탈로그에 잰 값)를 가진 가구이고,
  // 작은 가구의 y 는 받침의 y + 그 받침의 윗면 하나다. 메시에 빛을 쏘지 않는다: 받침은 바닥 크기 × 키의 상자로만 본다.
  // 위에 선 것(kidsOf)은 저장하지 않고 끌기를 시작할 때마다 다시 찾는다: 가운데가 받침의 바닥 크기 안에 있고 밑면이 받침의 윗면에서 SURFACE_REST(0.08) 안인 가구.
  const SURF = opts.surfaces;
  const isHost = it => !!it && !!SURF.surfaceTops(it);
  const isSmall = it => SURF.isSmallItem(it);
  const inRect = (x, z, h, e = ext(h)) => Math.abs(x - h.x) <= e.hx && Math.abs(z - h.z) <= e.hz;
  const hostBox = new THREE.Box3(), hitP = new THREE.Vector3();
  // 커서(rayFrom 을 마친 ray) 아래의 받침 윗면 { j, y, x, z }. 없으면 null. skip 의 번호는 받침으로 보지 않는다 (들고 있는 것과 그 위의 것).
  // 받침마다: 커서가 상자를 지나지 않으면 건너뛴다. 지나면 높은 윗면부터, 커서가 그 높이의 평면을 받침의 바닥 크기 안에서 지나는 첫 면을 고른다
  // (위에서 보면 꼭대기, 책장의 칸을 가리키면 그 칸). 어느 면도 안에서 지나지 않으면(책상 앞판을 가리킨다) 커서가 상자에 들어간 높이 아래의 가장 높은 면
  // (없으면 가장 낮은 면)에, 들어간 자리를 바닥 크기 안으로 당겨 둔다. 여러 받침이 걸리면 카메라에 가장 가까운 것.
  function surfaceUnder(skip) {
    const o = ray.ray.origin, d = ray.ray.direction;
    let best = null;
    ed.items.forEach((h, j) => {
      const tops = !skip.has(j) && SURF.surfaceTops(h);
      if (!tops) return;
      const e = ext(h), y0 = h.y || 0, top = y0 + (SURF.itemHeight(h) ?? Math.max(...tops));
      hostBox.min.set(h.x - e.hx, y0, h.z - e.hz); hostBox.max.set(h.x + e.hx, top, h.z + e.hz);
      if (!ray.ray.intersectBox(hostBox, hitP)) return;
      let pick = null;
      if (d.y < -1e-6) for (let n = tops.length - 1; n >= 0; n--) {
        const y = r2(y0 + tops[n]), t = (y - o.y) / d.y, x = o.x + d.x * t, z = o.z + d.z * t;
        if (t > 0 && inRect(x, z, h, e)) { pick = { j, y, x, z, dist: t }; break; }
      }
      if (!pick) {
        const below = tops.filter(t => y0 + t <= hitP.y + 0.02), t = below.length ? Math.max(...below) : tops[0];
        pick = { j, y: r2(y0 + t), x: clamp(hitP.x, h.x - e.hx * 0.9, h.x + e.hx * 0.9), z: clamp(hitP.z, h.z - e.hz * 0.9, h.z + e.hz * 0.9), dist: hitP.distanceTo(o) };
      }
      if (!best || pick.dist < best.dist) best = pick;
    });
    return best;
  }
  // 받침 i 위에 선 가구들 { list, parent }. 그 위에 선 것도 (책 더미 위의 화분) 함께, 받침보다 뒤에 온다. parent[j] 는 j 가 선 받침의 번호.
  // 벽·천장 가구는 바닥 가구 위에 떠 있어도 그 가구의 것이 아니다 (하부장을 옮겨도 상부장은 벽에 남는다).
  function kidsTree(i) {
    const list = [], parent = new Map();
    if (!isHost(ed.items[i])) return { list, parent };
    const todo = [i];
    while (todo.length) {
      const k = todo.shift(), h = ed.items[k];
      ed.items.forEach((o, j) => {
        // 작은 가구만 딸려 간다 (하부장 높이에 놓인 스피커처럼 큰 것은 제자리에 남는다, codex)
        if (j === i || parent.has(j) || !(o.y > 0) || o.type === 'frame' || mountOf(o) || !isSmall(o)) return;
        if (SURF.restingTop(o, h) == null) return;
        list.push(j); parent.set(j, k);
        if (isHost(o)) todo.push(j);
      });
    }
    return { list, parent };
  }
  const kidsOf = i => kidsTree(i).list;
  const withY = (it, y) => { const o = { ...it }; if (y > 0) o.y = y; else delete o.y; return o; };
  // 벽의 열린 곳: 액자를 걸 수 없는 자리 (벽을 따라 at 에서 half 안)
  const OPENINGS = [
    WIN && { wall: WIN.wall, at: WIN.at, half: WIN.w / 2 + 0.08, name: '창문' },
    SCR && { wall: SCR.wall, at: SCR.at, half: SCR.w / 2 + 0.07, name: '스크린' },
    DOOR && { wall: DOOR.wall, at: DOOR.at, half: 0.56, name: '문' },
  ].filter(Boolean);
  // 비워 둘 바닥: 사진 탁자, 그 앞의 방석, 문 앞, 방명록 앞. 바닥에 선 가구만 본다 (러그와 가구 위의 물건은 길을 막지 않는다).
  // name 은 꾸미는 동안 바닥에 그리는 짧은 이름, labelY 는 그 이름의 높이 (아래 "비워 둘 바닥 그리기")
  const zoneAt = (wall, at, along, off, why, name) => {
    const p = WALLS[wall].point(at, 0, off);
    return wall === 'back' ? { x: p.x, z: p.z, hx: along, hz: off, why, name } : { x: p.x, z: p.z, hx: off, hz: along, why, name };
  };
  const ZONES = [
    { x: TABLE.x, z: TABLE.z, hx: TABLE.w / 2, hz: TABLE.d / 2, why: '사진 탁자 자리예요', name: '사진 탁자', labelY: TABLE.top + 0.35 },
    { x: SEAT.x, z: SEAT.z, hx: 0.4, hz: 0.4, why: '사진 탁자 앞자리는 비워 둬요', name: '앞자리' },
    DOOR && zoneAt(DOOR.wall, DOOR.at, 0.6, 0.6, '문 앞은 비워 둬요', '문 앞'),
    GB && zoneAt(GB.wall, GB.at, 0.4, 0.6, '방명록 자리예요', '방명록 앞'),
  ].filter(Boolean);
  // 이 자리가 왜 안 되는지, 되면 null. 서버의 문구가 먼저다.
  function why(it) {
    const server = opts.placementError(it, room, tableAt);
    if (server) return server;
    if (!isHung(it) && (it.y || 0) > Y_MAX) return '너무 높아요'; // 높이 띄운 받침 위: 서버의 높이 범위(0..layoutItemYMax)를 넘는다
    if (onWallType(it)) { // 액자와 벽 가구: 창문, 스크린, 문 위에는 걸 수 없다 (높이는 보지 않는다). 서로, 그리고 액자와는 겹쳐도 된다
      const wall = wallOf(it), u = wall === 'back' ? it.x : it.z, e = ext(it);
      const al = it.type === 'frame' ? FRAME_M : wall === 'back' ? e.hx : e.hz;
      const o = OPENINGS.find(o => o.wall === wall && Math.abs(u - o.at) < al + o.half - 0.02);
      return o ? `${o.name} 자리와 겹쳐요` : null;
    }
    if (it.y || isRug(it) || isHung(it)) return null; // 천장 가구는 바닥의 비워 둘 자리와 상관없다
    const e = ext(it);
    const z = ZONES.find(q => Math.abs(it.x - q.x) < e.hx + q.hx - 0.02 && Math.abs(it.z - q.z) < e.hz + q.hz - 0.02);
    return z ? z.why : null;
  }
  // 주인 가구가 base 에서 cand 로 갈 때 그 위의 물건이 가는 자리 (돌린 만큼 주인의 가운데를 돌아가고, 주인이 오르내린 만큼 함께 오르내린다)
  function kidAt(kid, base, cand) {
    const d = (cand.rot || 0) - (base.rot || 0), a = THREE.MathUtils.degToRad(d), dx = kid.x - base.x, dz = kid.z - base.z;
    const c = Math.cos(a), s = Math.sin(a);
    const moved = { ...kid, x: r2(cand.x + dx * c + dz * s), z: r2(cand.z - dx * s + dz * c), rot: normRot((kid.rot || 0) + d) };
    return withY(moved, r2((kid.y || 0) + (cand.y || 0) - (base.y || 0)));
  }
  // 위에 선 것이 갈 자리가 서버에서 안 되면 그 까닭. 받침이 오르내린 만큼 함께 가므로 높이도 서버의 범위(0..layoutItemYMax)를 본다
  const kidsWhy = (m, cand) => {
    for (const k of m.kidsBase) {
      const c = kidAt(k, m.base, cand);
      if ((c.y || 0) > Y_MAX) return `위에 올린 ${labelOf(k)}이(가) 너무 높아져요`;
      const w = opts.placementError(c, room, tableAt); if (w) return `위에 올린 ${labelOf(k)}: ${w}`;
    }
    return null;
  };

  // ---------- 그리는 도우미: 발판, 격자 ----------
  const tileMat = new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
  const tile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tileMat);
  tile.rotation.x = -Math.PI / 2; tile.renderOrder = 2; tile.visible = false;
  const wallTile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tileMat);
  wallTile.renderOrder = 2; wallTile.visible = false;
  const gridPts = [];
  for (let x = -RX; x <= RX + 1e-6; x += 0.5) gridPts.push(x, 0.014, -RZ, x, 0.014, RZ);
  for (let z = -RZ; z <= RZ + 1e-6; z += 0.5) gridPts.push(-RX, 0.014, z, RX, 0.014, z);
  const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
  const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: '#F3EADB', transparent: true, opacity: 0.35, depthWrite: false }));
  grid.visible = false;
  scene.add(tile, wallTile, grid); // dispose 는 scene.js 가 장면째 한다

  // 발판의 점선 테두리: 깊이를 보지 않고 늘 맨 위에 그린다 (가구 뒤로 들어간 발판도 자리가 보인다). 끄는 동안만 보인다.
  const corner = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => new THREE.Vector3(x, y, 0.002));
  const edgeGeo = new THREE.BufferGeometry().setFromPoints(corner.flatMap((p, n) => [p, corner[(n + 1) % 4]]));
  const edgeMat = new THREE.LineDashedMaterial({ color: '#F3EADB', dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
  const edges = [tile, wallTile].map(t => { const l = new THREE.LineSegments(edgeGeo, edgeMat); l.computeLineDistances(); l.renderOrder = 12; l.visible = false; t.add(l); return l; });
  // ---------- 비워 둘 바닥 그리기 ----------
  // 바닥 가구를 들거나 끄는 동안 ZONES 를 바닥에 옅은 빗금과 짧은 이름으로 그린다 (위에서 보기에서도 같다). 받침 위에 얹히는 작은 가구,
  // 러그, 벽·천장 가구를 들 때는 그리지 않는다 (그것들은 이 자리와 상관없다: why). 들고 있는 가구가 그 자리 때문에 빨간 동안은 그 자리만 짙게 그린다.
  // 이름은 가구에 가려도 보이도록 깊이를 보지 않는다 (renderOrder 로 맨 위).
  const hatch = makeCanvas(64, 64), hg = hatch.getContext('2d');
  hg.strokeStyle = '#F3EADB'; hg.lineWidth = 9;
  for (const o of [-64, 0, 64]) { hg.beginPath(); hg.moveTo(o, 64); hg.lineTo(o + 64, 0); hg.stroke(); }
  const hatchTex = canvasTexture(hatch);
  const zoneEdge = new THREE.LineDashedMaterial({ color: '#F3EADB', dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.8, depthWrite: false });
  ctx.onDispose(() => { hatchTex.dispose(); zoneEdge.dispose(); });
  const zoneViews = ZONES.map(q => {
    const map = hatchTex.clone(); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(2 * q.hx / 0.3, 2 * q.hz / 0.3); map.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', map, transparent: true, opacity: 0.4, depthWrite: false });
    const area = new THREE.Mesh(new THREE.PlaneGeometry(2 * q.hx, 2 * q.hz), mat);
    area.rotation.x = -Math.PI / 2; area.position.set(q.x, 0.018, q.z); area.renderOrder = 1; area.visible = false;
    // 테두리: 발판과 같은 점선 (깊이는 본다: 가구 밑으로 들어간 곳은 가린다)
    const rim = new THREE.LineSegments(edgeGeo, zoneEdge); rim.computeLineDistances(); rim.scale.set(2 * q.hx, 2 * q.hz, 1); area.add(rim);
    const lc = makeCanvas(256, 64), lg = lc.getContext('2d');
    lg.font = '600 30px "IBM Plex Sans KR", system-ui, sans-serif'; lg.textAlign = 'center'; lg.textBaseline = 'middle';
    const w = Math.min(248, lg.measureText(q.name).width + 36);
    lg.fillStyle = 'rgba(47, 44, 36, 0.62)'; lg.beginPath(); lg.roundRect(128 - w / 2, 8, w, 48, 24); lg.fill();
    lg.fillStyle = '#F3EADB'; lg.fillText(q.name, 128, 33);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(lc), transparent: true, depthTest: false, depthWrite: false }));
    label.scale.set(1.12, 0.28, 1); label.position.set(q.x, q.labelY ?? 0.12, q.z); label.renderOrder = 13; label.visible = false;
    scene.add(area, label);
    return { q, area, label, mat };
  });
  function showZones(m) {
    const c = m?.cand, on = !!c && !onWallType(c) && !isHung(c) && !isRug(c) && !(c.y > 0);
    for (const v of zoneViews) {
      v.area.visible = v.label.visible = on;
      if (on) { const hit = m.why === v.q.why; v.mat.opacity = hit ? 0.75 : 0.4; v.mat.color.set(hit ? BAD : '#ffffff'); }
    }
  }
  // ---------- 그림자: 가려진 가구를 비쳐 그리기 ----------
  // 들고 있는 가구(와 그 위의 물건)를 두 번 더 그린다. 다른 재질은 건드리지 않는다: 복제한 메시에 이 두 재질만 입힌다.
  //   1) mask: 색은 쓰지 않고, 가구 자신이 맨 앞인 픽셀(깊이가 같거나 앞)에 스텐실 1 을 쓴다.
  //   2) sil : 깊이가 더 먼(GreaterDepth) 픽셀, 곧 다른 것에 가린 부분만, 스텐실이 1 이 아닌 곳에 한 겹 그린다 (그리며 1 을 써서 겹쳐 짙어지지 않는다).
  // 그래서 가구가 조금이라도 보이는 픽셀에는 그림자가 덮이지 않고, 가구가 자기 뒷면을 가리는 곳에도 생기지 않는다.
  // 렌더러는 스텐실 버퍼가 있고(three r160 의 기본값) 매 프레임 지운다(autoClear).
  const maskMat = new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
  });
  const silMat = new THREE.MeshBasicMaterial({
    color: OK, transparent: true, opacity: 0.55, depthWrite: false, depthFunc: THREE.GreaterDepth, // 색은 발판처럼 놓을 수 있는지를 따른다
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
  });
  ctx.onDispose(() => { maskMat.dispose(); silMat.dispose(); }); // 복제는 장면에 없을 때도 있어 재질은 따로 버린다
  // 원본 그룹마다 { src, mask, sil } 복제 한 쌍. 기하는 원본(모델 캐시)과 같이 쓴다
  let ghosts = [];
  function ghostOf(src, mat, order) {
    const c = src.clone(true), drop = [];
    c.traverse(o => {
      if (o.isLight || o.isSprite || o.isPoints || o.isLine) { drop.push(o); return; }
      if (!o.isMesh) return;
      const hidden = [].concat(o.material).every(m => m && m.visible === false);
      o.material = mat; o.castShadow = o.receiveShadow = false; o.renderOrder = order;
      if (hidden) o.visible = false;
    });
    for (const o of drop) o.removeFromParent();
    c.matrixAutoUpdate = false;
    return c;
  }
  function clearGhosts() { for (const g of ghosts) { g.mask.removeFromParent(); g.sil.removeFromParent(); } ghosts = []; }
  // 들고 있는 것의 그룹 목록에 맞춰 복제를 만들고, 원본의 자리를 따라가게 한다 (그룹은 다시 지을 때마다 새것이다)
  function syncGhosts(srcs) {
    if (srcs.length !== ghosts.length || srcs.some((g, n) => g !== ghosts[n].src)) {
      clearGhosts();
      ghosts = srcs.map(src => ({ src, mask: ghostOf(src, maskMat, 10), sil: ghostOf(src, silMat, 11) }));
      for (const g of ghosts) scene.add(g.mask, g.sil);
    }
    for (const g of ghosts) {
      g.src.updateWorldMatrix(true, false);
      for (const c of [g.mask, g.sil]) { c.matrix.copy(g.src.matrixWorld); c.matrixWorldNeedsUpdate = true; c.visible = g.src.visible; }
    }
  }
  function showTile(it, color) {
    tileMat.color.set(color);
    if (it.type === 'frame' && ctx.editCam.plan) { // 위에서는 벽이 보이지 않으니 벽 앞 바닥에 띠로 그린다
      const back = it.rot !== 90, w = 2 * FRAME_M + 0.1;
      tile.position.set(back ? it.x : -RX + 0.25, 0.02, back ? -RZ + 0.25 : it.z); tile.scale.set(back ? w : 0.5, back ? 0.5 : w, 1);
      tile.visible = true; wallTile.visible = false;
      return;
    }
    if (it.type === 'frame') {
      const wall = it.rot === 90 ? 'left' : 'back';
      wallTile.position.copy(WALLS[wall].point(wall === 'back' ? it.x : it.z, it.y ?? FRAME_Y, 0.04)); wallTile.rotation.y = WALLS[wall].rotY;
      wallTile.scale.set(2 * FRAME_M + 0.1, 0.9, 1); wallTile.visible = true; tile.visible = false;
      return;
    }
    const e = ext(it), kind = mountOf(it);
    if (kind === 'wall') {
      const wall = wallOf(it), back = wall === 'back', h = heightOf(it) ?? 0.5, al = back ? e.hx : e.hz;
      if (ctx.editCam.plan) { // 위에서는 액자처럼 벽 앞의 띠로, 가구 윗면 높이에 그린다 (바닥에 그리면 가구에 가린다)
        const deep = Math.max(0.5, 2 * (back ? e.hz : e.hx)), w = 2 * al + 0.1, y = (it.y || 0) + h + 0.02;
        tile.position.set(back ? it.x : -RX + deep / 2, y, back ? -RZ + deep / 2 : it.z); tile.scale.set(back ? w : deep, back ? deep : w, 1);
        tile.visible = true; wallTile.visible = false;
        return;
      }
      // 벽 가구의 앞면 바로 앞에 세운다 (벽에 붙이면 가구 뒤로 숨는다)
      wallTile.position.copy(WALLS[wall].point(back ? it.x : it.z, (it.y || 0) + h / 2, 2 * (back ? e.hz : e.hx) + 0.02)); wallTile.rotation.y = WALLS[wall].rotY;
      wallTile.scale.set(2 * al + 0.1, h + 0.1, 1); wallTile.visible = true; tile.visible = false;
      return;
    }
    // 천장 가구는 매달린 자리 아래 바닥에 발판을 그린다
    tile.position.set(it.x, (kind === 'ceiling' ? 0 : it.y || 0) + 0.02, it.z); tile.scale.set(2 * e.hx, 2 * e.hz, 1); tile.visible = true; wallTile.visible = false;
  }

  // ---------- 상태 알리기, 되돌리기 ----------
  const snap = () => JSON.stringify({ items: ed.items, time: ed.time, palette: ed.palette, shell: ed.shell, name: ed.name, backdrop: ed.backdrop, brand: ed.brand });
  const keyOf = (items, time, palette, shell, name, backdrop, brand) => JSON.stringify({ items, time, palette: palette ?? null, shell, name, backdrop: backdrop ?? null, brand: brand ?? null });
  // 마지막으로 저장한 모습의 비교 문자열 (ctx.original, ctx.baseLayout, ctx.savedName 은 editor-bridge.js 가 저장 뒤에 고친다)
  const savedKey = () => keyOf(ctx.original.items, ctx.original.time, ctx.original.palette, shellOf(ctx.baseLayout), ctx.savedName, ctx.original.backdrop, ctx.original.brand);
  const palKey = p => JSON.stringify(p ?? null);
  function emit() {
    if (ctx.disposed) return;
    root.dispatchEvent(new CustomEvent('heap:editstate', { detail: {
      on: ed.on, items: ed.items.map(it => ({ ...it })), sel: ed.sel, time: ed.time,
      moving: ed.move ? { isNew: ed.move.isNew, label: labelOf(ed.move.base) } : null,
      canUndo: ed.hist.length > 0, canRedo: ed.future.length > 0, dirty: snap() !== ed.saved, notice: ed.notice,
      palette: ed.palette, backdrop: ed.backdrop, brand: ed.brand, look: ctx.look, mount: MOUNT, placed: ed.placed, busy: ed.busy,
      view: { plan: ctx.editCam.plan, fitted: ctx.editCam.fitted() },
      shell: structuredClone(ed.shell), name: ed.name, savedName: ctx.savedName, preview: ed.preview,
    } }));
  }
  // 휠과 끌기는 자주 온다: 구도의 상태(평면도, 맞춘 구도인지)가 바뀔 때만 알린다
  let viewKey = '';
  function emitView() { const k = `${ctx.editCam.plan}|${ctx.editCam.fitted()}`; if (k !== viewKey) { viewKey = k; emit(); } }
  function setPlan(v) { ctx.editCam.setPlan(v); viewKey = ''; }
  function fitView() { ctx.editCam.fit(); viewKey = ''; }
  function notice(text, undo = false) { ed.notice = { text, undo, seq: ++ed.seq }; }
  // 지금 상태를 되돌리기 기록에 넣는다. tag 가 바로 앞과 같으면 넣지 않는다 (글자 하나마다 한 걸음이 되지 않게).
  function pushUndo(tag = null) {
    if (tag && tag === ed.tag) return;
    ed.hist.push(snap()); if (ed.hist.length > UNDO_MAX) ed.hist.shift();
    ed.future = []; ed.tag = tag;
  }
  function setTime(v) { ed.time = v; root.dispatchEvent(new CustomEvent('heap:time', { detail: v })); }
  // 꾸미기가 다루는 배경은 색 배경 아니면 null(시간 따라)뿐이다. 예전에 저장된 { mode: 'time' } 도 null 로 본다 (codex)
  const colourBackdrop = b => (b && b.mode === 'colour' ? b : null);
  function setName(n) { if (typeof n !== 'string' || n === ed.name) return; ed.name = n; ctx.showName(n); }
  // 방의 모습(팔레트, 방의 틀, 배경, 브랜드 색)을 바꾼다. 방의 틀이 바뀌었으면 다시 마운트하고(again 이 false 면 꾸미기 밖으로),
  // 아니면 팔레트와 배경은 그 자리에서 칠하고 가구를 다시 짓는다. look 에 없는(undefined) backdrop, brand 는 그대로 둔다.
  function setLook(look, again = true) {
    const { palette: pal, shell } = look;
    const shellChanged = palKey(shell) !== palKey(ed.shell), palChanged = palKey(pal) !== palKey(ed.palette);
    ed.palette = pal; ed.shell = shell;
    if (look.brand !== undefined) { // 꾸미기에 다시 들어올 때(enter) 이 값에서 시작한다. 팔레트(recolour.js)와 배경(setBackdrop)도 ctx.layout 을 고친다
      ed.brand = look.brand;
      if (ed.brand) ctx.layout.brand = [...ed.brand]; else delete ctx.layout.brand;
    }
    if (look.backdrop !== undefined && palKey(colourBackdrop(look.backdrop)) !== palKey(ed.backdrop)) { ed.backdrop = colourBackdrop(look.backdrop); ctx.setBackdrop(ed.backdrop); }
    if (shellChanged) { remount(again); return; }
    if (palChanged || hovering) { hovering = false; ctx.recolour(pal); }
    rebuild();
  }
  function restore(s) {
    const o = JSON.parse(s);
    ed.items = o.items; ed.sel = null; ed.tag = null;
    if (o.time !== ed.time) setTime(o.time);
    setName(o.name ?? ed.name);
    setLook({ palette: o.palette ?? null, shell: o.shell ?? ed.shell, backdrop: o.backdrop ?? null, brand: o.brand ?? null });
  }

  // ---------- 방의 틀: 다시 마운트 ----------
  // 지금 편집 상태를 heap-room.tsx 에 넘긴다. heap-room.tsx 는 이 방을 버리고 items, time, palette 를 얹은 레이아웃으로 다시 마운트하며,
  // 새 마운트의 edit.js 가 heap:ready 에서 이 상태로 다시 들어온다 (edit 이 false 면 들어오지 않는다: 나가며 버릴 때).
  function remount(edit = true) {
    clearTimeout(ed.fnTimer); ed.fnTimer = 0;
    ed.move = null; ed.press = null; ed.sel = null; grid.visible = false; ed.busy = edit;
    root.dispatchEvent(new CustomEvent('heap:remount', { detail: {
      edit, items: ed.items.map(it => ({ ...it })), time: ed.time, palette: ed.palette, backdrop: ed.backdrop, brand: ed.brand,
      shell: structuredClone(ed.shell), name: ed.name, savedName: ctx.savedName,
      hist: ed.hist.slice(), future: ed.future.slice(), saved: ed.saved, seq: ed.seq,
      original: { items: ctx.original.items.map(it => ({ ...it })), time: ctx.original.time, palette: ctx.original.palette ?? null, backdrop: ctx.original.backdrop ?? null, brand: ctx.original.brand ?? null },
      baseLayout: structuredClone(ctx.baseLayout), plan: ctx.editCam.plan,
    } }));
  }
  // 팔레트 하나를 통째로 칠한다 (프리셋 또는 직접 고른 색). 한 걸음이고, 저장하기 전까지는 팔로워에게 보이지 않는다.
  // 값의 검사는 저장할 때 서버(layout.ts 의 palette)가 한다. 여기서는 모양만 본다: 색 이름 → #RRGGBB, floor 는 그 목록 (1~6개).
  // brand: 내 색 카드로 칠할 때 주인이 넣은 브랜드 색 (1~3개). 주지 않으면(undefined) 지금 것을 둔다.
  const HEXC = /^#[0-9a-fA-F]{6}$/;
  const palOk = p => p === null || (typeof p === 'object' && !Array.isArray(p) && Object.entries(p).every(([k, v]) => (k === 'floor'
    ? Array.isArray(v) && v.length >= 1 && v.length <= 6 && v.every(c => HEXC.test(c))
    : typeof v === 'string' && HEXC.test(v))));
  const brandOk = b => b === null || (Array.isArray(b) && b.length >= 1 && b.length <= 3 && b.every(c => HEXC.test(c)));
  function setPalette(p, brand) {
    if (!palOk(p) || (brand !== undefined && !brandOk(brand))) return;
    const nextBrand = brand === undefined ? ed.brand : brand;
    if (palKey(p) === palKey(ed.palette) && palKey(nextBrand) === palKey(ed.brand)) { previewPalette(null); return; }
    endMove(); pushUndo();
    ed.notice = null;
    setLook({ palette: p ? structuredClone(p) : null, shell: ed.shell, brand: nextBrand ? [...nextBrand] : null });
  }
  // 팔레트 카드 위에 올린 동안: 방에 미리 칠하고, 걸음과 저장 상태는 건드리지 않는다. null 이면 지금 팔레트(ed.palette)로 돌아간다.
  // 가구를 다시 짓지 않는다: 미리보기는 재질의 색만 바꾼다.
  let hovering = false;
  function previewPalette(p) {
    if (p !== null && !palOk(p)) return;
    if (p === null) { if (!hovering) return; hovering = false; ctx.recolour(ed.palette); return; }
    hovering = true; ctx.recolour(p);
  }
  // 배경: 시간 따라(null) 또는 고른 색 { mode: 'colour', top, bottom? }. 한 걸음이다.
  function setBackdrop(b) {
    const ok = b === null || (b && typeof b === 'object' && b.mode === 'colour' && HEXC.test(b.top) && (b.bottom === undefined || HEXC.test(b.bottom)));
    if (!ok) return;
    const next = b ? (b.bottom !== undefined ? { mode: 'colour', top: b.top, bottom: b.bottom } : { mode: 'colour', top: b.top }) : null;
    if (palKey(next) === palKey(ed.backdrop)) return;
    endMove(); pushUndo(); ed.notice = null;
    ed.backdrop = next; ctx.setBackdrop(next);
  }
  function undo() { endMove(); if (!ed.hist.length) return; ed.future.push(snap()); restore(ed.hist.pop()); ed.notice = null; }
  function redo() { endMove(); if (!ed.future.length) return; ed.hist.push(snap()); restore(ed.future.pop()); ed.notice = null; }

  // ---------- 다시 짓기 ----------
  // ed.items (그리고 커서에 붙은 새 가구)로 다시 짓는다. 끄는 중이면 그 가구를 커서 자리에 다시 둔다.
  function rebuild() {
    clearTimeout(ed.fnTimer); ed.fnTimer = 0;
    const list = ed.move?.isNew ? [...ed.items, ed.move.cand ?? ed.move.base] : ed.items;
    ctx.applyItems(list);
    if (ed.move) ed.move.builtY = list[ed.move.i]?.y || 0; // 들고 있는 그룹이 지어진 높이 (끄는 동안 오르내린 만큼만 그룹을 옮긴다: showMove)
    if (ed.move) showMove();
  }
  function flushFn() { if (ed.fnTimer) rebuild(); }

  // ---------- 커서 아래 ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hitV = new THREE.Vector3();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), framePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const backPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), RZ), leftPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), RX);
  function rayFrom(ev) {
    const b = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  const FIXED = new Map([
    ...[tableTop, ...projParts, ...phoneParts].map(m => [m, '사진 탁자는']), ...doorParts.map(m => [m, '문은']),
    ...bookParts.map(m => [m, '방명록은']), [screen, '스크린은'],
  ]);
  // 누른 곳의 가구 번호(item) 또는 고정된 것의 이름(fixed)
  function pick(ev) {
    rayFrom(ev);
    const hits = ray.intersectObjects([ctx.build.group, ...FIXED.keys()], true);
    for (const h of hits) {
      if (FIXED.has(h.object)) return { fixed: FIXED.get(h.object) };
      for (let o = h.object; o; o = o.parent) {
        const i = o.userData.itemIndex;
        if (i != null) { if (i < ed.items.length) return { item: i, point: h.point }; break; }
      }
    }
    return ctx.editCam.plan ? pickPlan() : null;
  }
  // 평면도에서 맞은 메시가 없을 때: 커서 아래 바닥이 어느 가구의 발판 안인지. 벽 액자는 벽 앞 0.5 의 띠, 그다음 높이 놓인 것, 러그는 마지막이다
  function pickPlan() {
    floorPlane.constant = 0;
    if (!ray.ray.intersectPlane(floorPlane, hitV)) return null;
    const { x, z } = hitV;
    let best = null, rank = -Infinity;
    ed.items.forEach((it, i) => {
      let inside, r;
      if (onWallType(it)) { // 액자와 벽 가구: 벽 앞의 띠 (벽 가구는 자기 깊이가 더 깊으면 그만큼)
        const e = ext(it), al = it.type === 'frame' ? FRAME_M : it.rot === 90 ? e.hz : e.hx;
        const deep = it.type === 'frame' ? 0.5 : Math.max(0.5, 2 * (it.rot === 90 ? e.hx : e.hz));
        inside = it.rot === 90 ? Math.abs(z - it.z) <= al && x <= -RX + deep : Math.abs(x - it.x) <= al && z <= -RZ + deep;
        r = 100;
      } else {
        const e = ext(it);
        inside = Math.abs(x - it.x) <= e.hx && Math.abs(z - it.z) <= e.hz;
        r = isRug(it) ? -1 : it.y || 0;
      }
      if (inside && r > rank) { best = i; rank = r; }
    });
    return best == null ? null : { item: best, point: hitV.clone() };
  }
  // 커서가 가리키는 자리에 m 의 가구를 놓으면 어디가 되는지 (스냅과 방 안으로 당기기를 마친 항목)
  // 커서(rayFrom 을 마친 ray)가 가리키는 벽과 벽 위의 자리 { wall, u }, 없으면 null. it 은 벽에 거는 것 (액자, 벽 가구)
  function wallHit(it) {
    if (ctx.editCam.plan) { // 위에서는 액자(벽 가구는 가운데) 높이의 수평면에서 커서가 더 가까운 벽을 따른다
      framePlane.constant = -(it.type === 'frame' ? FRAME_Y : (it.y || 0) + (heightOf(it) ?? 0) / 2);
      if (!ray.ray.intersectPlane(framePlane, hitV)) return null;
      const wall = hitV.z + RZ <= hitV.x + RX ? 'back' : 'left';
      return { wall, u: wall === 'back' ? hitV.x : hitV.z };
    }
    const pb = ray.ray.intersectPlane(backPlane, new THREE.Vector3()), pl = ray.ray.intersectPlane(leftPlane, new THREE.Vector3());
    if (pb && pb.x >= -RX) return { wall: 'back', u: pb.x };
    return pl ? { wall: 'left', u: pl.z } : null;
  }
  function resolve(m, ev) {
    rayFrom(ev);
    const it = { ...m.base, rot: m.rot };
    if (onWallType(it)) { // 벽 액자와 벽 가구: 뒷벽이나 왼쪽 벽을 따라서만 움직인다
      const hit = wallHit(it);
      if (!hit) return m.cand;
      const wall = hit.wall;
      let u = hit.u;
      if (it.type !== 'frame') { // 벽 가구: 누른 자리만큼 비켜 따라오고(같은 벽에서), 이웃에 붙거나 격자, 높이는 그대로
        if (m.grab.wall === wall) u += m.grab.u;
        if (!ed.alt) u = snapAlong(it, wall, u, new Set([m.isNew ? -1 : m.i])) ?? snapGrid(u);
        return hangAt(it, wall, u);
      }
      const half = WALLS[wall].half;
      if (!ed.alt) u = snapGrid(u);
      u = r2(clamp(u, -half + FRAME_M, half - FRAME_M));
      return wall === 'back' ? { ...it, x: u, z: r2(-RZ), rot: 0, y: FRAME_Y } : { ...it, x: r2(-RX), z: u, rot: 90, y: FRAME_Y };
    }
    // 작은 가구는 커서 아래의 받침 윗면을 먼저 본다 (surfaceUnder). 있으면 그 면 위의 점을 따르고, 없으면 바닥을 따른다.
    // 큰 가구는 전처럼 자기 높이의 평면에서 커서를 따른다 (저장된 높이가 있으면 그대로 둔다).
    const small = isSmall(it), on = small ? surfaceUnder(new Set([m.i, ...m.kids])) : null;
    let x, z;
    if (on) { x = on.x + m.grab.x; z = on.z + m.grab.z; }
    else {
      floorPlane.constant = small ? 0 : -(it.y || 0);
      if (!ray.ray.intersectPlane(floorPlane, hitV)) return m.cand;
      x = hitV.x + m.grab.x; z = hitV.z + m.grab.z;
    }
    const x0 = x, z0 = z;
    const e = ext(it), skip = new Set([m.isNew ? -1 : m.i, ...m.kids]);
    if (!ed.alt) {
      x = snapGrid(x); z = snapGrid(z);
      if (!it.y && !on && !isRug(it)) ed.items.forEach((o, j) => { // 이웃의 가장자리에 붙는다 (가구 위에서는 붙지 않는다)
        if (skip.has(j) || o.y || o.type === 'frame' || isRug(o)) return;
        const oe = ext(o);
        if (Math.abs(z - o.z) < e.hz + oe.hz + 0.1) { const r = o.x + oe.hx + e.hx, l = o.x - oe.hx - e.hx; if (Math.abs(x - r) < EDGE_SNAP) x = r; else if (Math.abs(x - l) < EDGE_SNAP) x = l; }
        if (Math.abs(x - o.x) < e.hx + oe.hx + 0.1) { const f = o.z + oe.hz + e.hz, b = o.z - oe.hz - e.hz; if (Math.abs(z - f) < EDGE_SNAP) z = f; else if (Math.abs(z - b) < EDGE_SNAP) z = b; }
      });
      if (x - e.hx < -RX + WALL_SNAP) x = -RX + e.hx; if (x + e.hx > RX - WALL_SNAP) x = RX - e.hx; // 벽에 붙는다
      if (z - e.hz < -RZ + WALL_SNAP) z = -RZ + e.hz; if (z + e.hz > RZ - WALL_SNAP) z = RZ - e.hz;
    }
    it.x = r2(clamp(x, -RX + e.hx, RX - e.hx)); it.z = r2(clamp(z, -RZ + e.hz, RZ - e.hz)); // 방 밖으로는 나가지 않는다
    if (!small) return it;
    // 받침 위의 높이: 가운데가 그 받침의 바닥 크기 안이면 그 윗면, 격자에 맞춘 자리가 좁은 받침(바 테이블)에서 벗어나면 맞추기 전의 자리, 아니면 바닥
    let y = 0;
    if (on) {
      const h = ed.items[on.j];
      if (inRect(it.x, it.z, h)) y = on.y;
      else { const x1 = r2(clamp(x0, -RX + e.hx, RX - e.hx)), z1 = r2(clamp(z0, -RZ + e.hz, RZ - e.hz)); if (inRect(x1, z1, h)) { it.x = x1; it.z = z1; y = on.y; } }
    }
    return withY(it, y);
  }
  // m.cand 대로 그룹(그리고 위의 물건)을 옮긴다. 다시 짓지 않는다.
  function showMove() {
    const m = ed.move, groups = ctx.build.groups, c = m.cand;
    const g = groups[m.i], built = m.builtY ?? (m.base.y || 0);
    // 그룹은 지어진 높이(built)를 이미 안에 지닌다: 끄는 동안 받침에 오르내린 만큼만 그룹을 올리고 내린다
    if (g) { g.visible = !!c; if (c) { g.position.set(c.x, (c.y || 0) - built, c.z); g.rotation.y = THREE.MathUtils.degToRad(c.rot || 0); } }
    if (c) m.kids.forEach((j, n) => {
      const k = kidAt(m.kidsBase[n], m.base, c), kg = groups[j];
      if (kg) { kg.position.set(k.x, (k.y || 0) - (m.kidsBase[n].y || 0), k.z); kg.rotation.y = THREE.MathUtils.degToRad(k.rot || 0); }
    });
  }
  function update(ev) {
    const m = ed.move;
    m.cand = resolve(m, ev);
    m.why = m.cand ? why(m.cand) ?? kidsWhy(m, m.cand) : null;
    showMove();
  }

  // ---------- 동작 ----------
  function select(i) { ed.sel = i; }
  // 새 가구를 커서에 붙인다. template 은 room-editor.tsx 가 만든 항목 (x, z 는 상관없다)
  function arm(template) {
    endMove(); ed.sel = null;
    const base = { ...template, x: 0, z: 0, rot: normRot(template.rot || 0) };
    // 벽·천장 가구는 모델의 키로 높이를 정한다 (복제는 원래 높이를 지닌다). 모델을 아직 못 읽었으면 임시 높이로 커서에 붙이되
    // 내려놓지는 못하게 하고(pending), 읽은 뒤에 진짜 높이로 고친다. 그 사이 PageUp/PageDown 으로 바꾼 만큼은 그대로 더한다.
    const fresh = isHung(base) && base.y == null;
    const pending = fresh && heightOf(base) == null, guess = mountOf(base) === 'ceiling' ? WALL_H - 0.5 : FRAME_Y - 0.4;
    if (fresh) base.y = mountY(base) ?? guess;
    ed.move = { i: ed.items.length, isNew: true, base, rot: base.rot, kids: [], kidsBase: [], grab: { x: 0, z: 0 }, cand: null, why: null, pending };
    grid.visible = true;
    rebuild();
    if (ed.last?.overCanvas) update(ed.last);
    if (pending) ctx.loadModel(base.model).then(() => {
      const m = ed.move;
      if (ctx.disposed || m?.base !== base) return;
      const y0 = mountY(base);
      m.pending = false; // 읽지 못했으면(y0 null) 임시 높이로 놓게 둔다: 그려지지 않는 모델이고 서버는 범위만 본다
      if (y0 != null) {
        const [lo, hi] = yRange(base), y = r2(clamp(y0 + (base.y - guess), lo, hi));
        base.y = y; if (m.cand) m.cand = { ...m.cand, y };
        rebuild();
      }
      emit();
    });
  }
  function startDrag(press, ev) {
    const i = press.item, base = { ...ed.items[i] }, kids = kidsOf(i);
    let grab = { x: 0, z: 0 };
    if (isWallPiece(base)) { // 벽 가구는 벽 위에서 누른 자리와 가운데의 차이를 기억한다 (눌렀을 때 튀지 않게)
      rayFrom(press);
      const hit = wallHit(base), wall = wallOf(base);
      if (hit?.wall === wall) grab = { x: 0, z: 0, wall, u: (wall === 'back' ? base.x : base.z) - hit.u };
    } else if (base.type !== 'frame') {
      rayFrom(press); floorPlane.constant = -(base.y || 0);
      if (ray.ray.intersectPlane(floorPlane, hitV)) grab = { x: base.x - hitV.x, z: base.z - hitV.z };
    }
    ed.move = { i, isNew: false, base, rot: normRot(base.rot || 0), kids, kidsBase: kids.map(j => ({ ...ed.items[j] })), grab, cand: base, why: null };
    grid.visible = true; ed.press = null;
    try { canvas.setPointerCapture?.(ev.pointerId); } catch { /* 이미 떨어진 포인터: 붙잡지 않아도 root 에서 계속 받는다 */ }
    update(ev);
  }
  // 끌던 것을 내려놓지 않고 끝낸다: 새 가구는 사라지고, 옮기던 가구는 제자리로 간다
  function endMove() {
    ed.press = null;
    if (!ed.move) return;
    ed.move = null; grid.visible = false;
    rebuild();
  }
  function cancel() { if (ed.move) endMove(); else ed.sel = null; }
  // 커서에 붙은 새 가구를 내려놓는다. keep(Shift)이면 같은 가구가 커서에 남는다
  function placeNew(ev, keep) {
    const m = ed.move;
    update(ev);
    if (!m.cand) return;
    if (m.pending) { notice('가구를 불러오는 중이에요 · 잠시 뒤에 놓아 주세요'); return; }
    if (m.why) { notice(`거기엔 놓을 수 없어요 · ${m.why}`); return; }
    pushUndo();
    ed.items = [...ed.items, m.cand];
    if (keep) { m.i = ed.items.length; m.base = { ...m.cand }; }
    else { ed.move = null; grid.visible = false; ed.sel = ed.items.length - 1; ed.placed = { index: ed.sel, seq: ++ed.seq }; }
    ed.notice = null; seatNote(ed.items.length - 1);
    rebuild();
  }
  function dropDrag(ev) {
    const m = ed.move;
    if (overDock(ev)) { ed.move = null; grid.visible = false; remove(m.i, m.kids); return; }
    ed.move = null; grid.visible = false;
    const c = m.cand;
    if (m.why || !c) { notice(`제자리로 돌아갔어요 · ${m.why}`); rebuild(); return; }
    if (c.x === m.base.x && c.z === m.base.z && (c.y || 0) === (m.base.y || 0) && c.rot === normRot(m.base.rot || 0)) { rebuild(); return; }
    pushUndo();
    const next = ed.items.slice();
    next[m.i] = c; m.kids.forEach((j, n) => { next[j] = kidAt(m.kidsBase[n], m.base, c); });
    ed.items = next; ed.notice = null; seatNote(m.i);
    rebuild();
  }
  function rotate(dir) {
    if (ed.move) {
      if (onWallType(ed.move.base)) return; // 벽에 거는 것은 벽이 방향을 정한다
      ed.move.rot = normRot(ed.move.rot + 90 * dir);
      if (ed.last) update(ed.last);
      return;
    }
    if (ed.sel == null) return;
    const i = ed.sel, base = ed.items[i];
    if (base.type === 'frame') { notice('액자는 벽을 따라서만 움직여요'); return; }
    if (isWallPiece(base)) { notice('벽에 거는 가구는 벽을 따라서만 움직여요 · 다른 벽으로 끌면 그 벽을 봐요'); return; }
    const c = { ...base, rot: normRot((base.rot || 0) + 90 * dir) }, e = ext(c);
    if (!c.y || mountOf(c) === 'ceiling') { c.x = r2(clamp(c.x, -RX + e.hx, RX - e.hx)); c.z = r2(clamp(c.z, -RZ + e.hz, RZ - e.hz)); }
    const kids = kidsOf(i), m = { base, kidsBase: kids.map(j => ed.items[j]) };
    const w = why(c) ?? kidsWhy(m, c);
    if (w) { notice(`돌릴 자리가 없어요 · ${w}`); return; }
    pushUndo();
    const next = ed.items.slice();
    next[i] = c; kids.forEach((j, n) => { next[j] = kidAt(m.kidsBase[n], base, c); });
    ed.items = next; ed.notice = null;
    rebuild();
  }
  // 가구를 넣는다. 그 위에 선 물건도 함께 간다. 알림의 되돌리기로 돌아온다
  // kids: 끌던 받침을 목록에 떨어뜨릴 때는 끌기를 시작할 때 찾은 것을 준다 (그때는 ed.items 의 자리가 아직 옛 자리라 다시 찾으면 어긋난다)
  function remove(i, kidList = null) {
    if (ed.move?.isNew) { endMove(); return; }
    const it = ed.items[i]; if (!it) return;
    const kids = new Set(kidList ?? kidsOf(i));
    pushUndo();
    ed.items = ed.items.filter((_, j) => j !== i && !kids.has(j)); ed.sel = null;
    notice(`넣어 뒀어요 · ${labelOf(it)}${kids.size ? ` 외 ${kids.size}개` : ''}`, true);
    rebuild();
  }
  // 고른 가구와 같은 것을 커서에 붙인다. 기능은 따라가지 않는다 (달력은 빈 달력이 된다)
  function copy() {
    if (ed.sel == null || ed.move) return;
    const t = { ...ed.items[ed.sel] };
    delete t.fn;
    if (t.type === 'calendar') t.fn = { kind: 'calendar', entries: [] };
    arm(t);
    notice(`${labelOf(t)} 하나 더 · 놓을 곳을 눌러 주세요`);
  }
  function setFn(i, fn) {
    const it = ed.items[i]; if (!it) return;
    pushUndo(`fn:${i}`);
    const next = { ...it }; delete next.fn; if (fn) next.fn = fn;
    ed.items = ed.items.map((o, j) => (j === i ? next : o));
    clearTimeout(ed.fnTimer); ed.fnTimer = setTimeout(rebuild, FN_DELAY); // 글자마다 다시 짓지 않는다
  }
  function toggleLit() {
    const i = ed.sel, it = ed.items[i]; if (!it) return;
    pushUndo();
    const next = { ...it }; if (it.lit === false) delete next.lit; else next.lit = false;
    ed.items = ed.items.map((o, j) => (j === i ? next : o));
    rebuild();
  }
  // 벽 가구의 높이를 NUDGE 만큼 올리거나(dir 1) 내린다. 바닥 위, 천장 아래, 서버 범위 안으로 자른다.
  // 고른 가구는 이어서 누르는 동안 한 걸음으로 묶는다 (tag). 커서에 붙은 새 가구도 올리고 내릴 수 있다. 끌고 있는 가구는 놓은 뒤에 바꾼다.
  function lift(dir) {
    const m = ed.move;
    if (m) {
      if (!m.isNew || !isWallPiece(m.base)) return;
      const [lo, hi] = yRange(m.base), y = r2(clamp((m.base.y || 0) + NUDGE * dir, lo, hi));
      m.base.y = y; if (m.cand) m.cand = { ...m.cand, y };
      rebuild();
      return;
    }
    const i = ed.sel, it = ed.items[i];
    if (!it) return;
    if (!isWallPiece(it)) { if (mountOf(it) === 'ceiling') notice('천장 가구는 천장에 붙어 있어요'); return; }
    const [lo, hi] = yRange(it), y = r2(clamp((it.y || 0) + NUDGE * dir, lo, hi));
    if (y === it.y) { notice(dir > 0 ? '더 올리면 천장에 닿아요' : '더 내리면 바닥에 닿아요'); return; }
    const c = { ...it, y }, w = why(c);
    if (w) { notice(`그 높이엔 걸 수 없어요 · ${w}`); return; }
    pushUndo(`lift:${i}`);
    ed.items = ed.items.map((o, j) => (j === i ? c : o)); ed.notice = null;
    rebuild();
  }
  // 모양 바꾸기: 같은 자리, 같은 방향, 같은 기능으로 모델만 바꾼다 (F5). 고를 수 있는 모델은 room-editor.tsx 가 같은 기능을 달 수 있는 것으로 거른다.
  // 바닥 가구의 높이: 작은 가구는 서 있던 받침의 윗면에 그대로 서고(책상 위의 노트북을 모니터로 바꾸면 책상 위에 남는다), 작은 것이 큰 것으로 바뀌면 바닥에 선다.
  // 받침의 모양이 바뀌면 위의 것은 새 윗면 중 예전 높이(받침 밑면에서)에 가장 가까운 면에 앉고, 새 바닥 크기 밖이면 바닥으로 내려간다.
  // 그 위의 것은 자기 받침이 움직인 만큼 간다. 모두 카탈로그의 윗면 높이로 바꾸기 전에 셈해 한 걸음으로 넣는다 (모델을 기다리지 않는다).
  // 새 크기가 자리에 맞지 않거나 위의 것이 서버의 높이 범위를 넘으면 바꾸지 않는다.
  function swap(i, to) {
    const it = ed.items[i];
    if (!it || !to || (to.type !== 'model' && to.type !== 'shelf') || (to.type === 'model' && typeof to.model !== 'string')) return;
    if (it.type === 'frame' || it.type === 'calendar') return; // 벽 액자와 탁상 달력은 모양이 하나뿐이다
    const next = { ...it, type: to.type };
    if (to.type === 'model') next.model = to.model; else delete next.model;
    if (next.type === it.type && next.model === it.model) return;
    const kind = mountOf(it);
    if (kind !== mountOf(next)) return; // 벽·천장 가구는 같은 자리에 거는 것끼리만 바꾼다
    if (kind === 'wall' || kind === 'ceiling') { // 천장: 새 키로 다시 매단다 · 벽: 높이는 두고(범위 안으로) 새 깊이로 벽에 다시 붙인다
      if (heightOf(next) == null) { notice('모양을 읽는 중이에요. 잠시 뒤에 다시 눌러 주세요'); ctx.loadModel(next.model); return; }
      const [lo, hi] = yRange(next);
      next.y = kind === 'ceiling' ? hi : r2(clamp(it.y || 0, lo, hi));
      if (kind === 'wall') Object.assign(next, hangAt(next, wallOf(it), wallOf(it) === 'back' ? it.x : it.z));
    }
    const { list: kids, parent } = kind ? { list: [], parent: new Map() } : kidsTree(i);
    if (!kind) { // 바닥 가구 (위에 얹는 것 포함)
      const y = isSmall(it) && !isSmall(next) ? 0 : it.y || 0;
      if (y > 0) next.y = y; else delete next.y;
    }
    if (!(next.type === 'lamp' || entryOf(next)?.category === 'lamp')) delete next.lit;
    const e = ext(next);
    if (!next.y || kind === 'ceiling') { next.x = r2(clamp(next.x, -RX + e.hx, RX - e.hx)); next.z = r2(clamp(next.z, -RZ + e.hz, RZ - e.hz)); }
    const w = why(next);
    if (w) { notice(`그 모양은 이 자리에 맞지 않아요 · ${w}`); return; }
    const placed = new Map([[i, next]]), tops = SURF.surfaceTops(next);
    for (const j of kids) { // kidsTree 는 받침을 그 위의 것보다 먼저 준다
      const k = ed.items[j], p = parent.get(j);
      let y;
      if (p === i) {
        const rel = (k.y || 0) - (it.y || 0);
        y = tops && inRect(k.x, k.z, next) ? r2((next.y || 0) + tops.reduce((a, t) => (Math.abs(t - rel) < Math.abs(a - rel) ? t : a))) : 0;
      } else y = r2((k.y || 0) + (placed.get(p).y || 0) - (ed.items[p].y || 0));
      placed.set(j, withY(k, y));
    }
    const high = kids.find(j => (placed.get(j).y || 0) > Y_MAX);
    if (high != null) { notice(`그 모양은 이 자리에 맞지 않아요 · 위에 올린 ${labelOf(ed.items[high])}이(가) 너무 높아져요`); return; }
    endMove(); pushUndo();
    ed.items = ed.items.map((o, j) => placed.get(j) ?? o); ed.sel = i;
    notice(`모양을 바꿨어요 · ${labelOf(it)} → ${labelOf(next)}`, true);
    rebuild();
  }

  // 처음으로: 마지막으로 저장한 모습. 되돌리기로 돌아올 수 있다
  function reset() {
    endMove(); pushUndo();
    ed.items = ctx.original.items.map(it => ({ ...it })); ed.sel = null;
    if (ed.time !== ctx.original.time) setTime(ctx.original.time);
    setName(ctx.savedName);
    notice('마지막으로 저장한 모습으로 돌아왔어요', true);
    setLook({ palette: ctx.original.palette ?? null, shell: shellOf(ctx.baseLayout), backdrop: ctx.original.backdrop ?? null, brand: ctx.original.brand ?? null });
  }
  // 템플릿이나 저장 전 모습을 깐다: 가구, 팔레트, (있으면) 방의 틀과 시간과 이름을 한 걸음으로 바꾼다. 기능을 옮기는 일은 room-editor.tsx 가 미리 한다.
  // 알림은 room-editor.tsx 가 띄운다 (다시 마운트하면 엔진의 알림은 지워진다).
  function load(l, name) {
    if (!l || typeof l !== 'object' || !Array.isArray(l.items)) return;
    endMove(); pushUndo();
    ed.items = l.items.filter(it => it && typeof it === 'object').map(it => ({ ...it })); ed.sel = null; ed.notice = null;
    if (l.time !== undefined && l.time !== ed.time) setTime(l.time);
    setName(name);
    // 템플릿은 배경과 브랜드 색을 갖지 않는다: 그때는 주인이 고른 것을 그대로 둔다. 저장 전 모습은 둘 다 준다 (없으면 null)
    setLook({
      palette: l.palette ? structuredClone(l.palette) : null, shell: l.shell && typeof l.shell === 'object' ? shellOf(l.shell) : ed.shell,
      backdrop: l.backdrop, brand: l.brand,
    });
  }
  // 앉는 가구가 다른 가구와 겹치면 저장은 되지만 그 자리에는 앉을 수 없다 (예전 꾸미기 패널의 안내)
  function seatNote(i) {
    const it = ed.items[i], cat = entryOf(it)?.category;
    if (!it || it.y || (cat !== 'chair' && cat !== 'sofa')) return;
    const e = ext(it);
    const clash = ed.items.some((o, j) => {
      if (j === i || o.y || o.type === 'frame' || isRug(o)) return false;
      const f = ext(o);
      return Math.abs(it.x - o.x) < e.hx + f.hx - 0.01 && Math.abs(it.z - o.z) < e.hz + f.hz - 0.01;
    });
    if (clash) notice('다른 가구와 겹쳐요. 저장은 되지만 이 자리에는 앉을 수 없어요.');
  }
  function discard() {
    endMove();
    ed.items = ctx.original.items.map(it => ({ ...it })); ed.sel = null; ed.hist = []; ed.future = []; ed.tag = null; ed.notice = null;
    if (ed.time !== ctx.original.time) setTime(ctx.original.time);
    setName(ctx.savedName);
    // 팔레트와 배경은 그 자리에서 돌아가고, 방의 틀은 다시 마운트해야 돌아간다
    setLook({ palette: ctx.original.palette ?? null, shell: shellOf(ctx.baseLayout), backdrop: ctx.original.backdrop ?? null, brand: ctx.original.brand ?? null }, false);
  }
  // 팔로워로 보기를 켜고 끈다. 들고 있던 것은 내려놓지 않고 끝내고, 고른 것도 푼다. 되돌리기 기록과 저장 안 된 변경은 그대로다.
  function setPreview(v) {
    if (v === ed.preview) return;
    flushFn(); endMove(); ed.sel = null; ed.press = null; ed.notice = null;
    if (ed.rdown) { ed.rdown = null; ctx.editCam.panEnd(); }
    ed.preview = ctx.editPreview = v;
    canvas.style.cursor = '';
  }
  const overDock = ev => { const d = root.querySelector('.ed-dock')?.getBoundingClientRect(); return !!d && ev.clientX >= d.left && ev.clientX <= d.right && ev.clientY >= d.top && ev.clientY <= d.bottom; };

  // ---------- 들어오기, 나가기 ----------
  // resume: 팔레트를 바꾸며 다시 마운트했을 때 그 전 마운트의 편집 상태 (opts.resume). 가구, 시간, 팔레트는 이미 이 마운트의 레이아웃에 있다.
  function enter(resume = null) {
    if (ed.on || ctx.disposed) return;
    if (ctx.perch) ctx.unperch();
    for (const id of OVERLAYS) $(id).hidden = true;
    ctx.walkTo = null; ctx.arrive = null; ctx.waypoints = [];
    ctx.mode = 'edit';
    if (ctx.doorSpot) me.position.copy(ctx.doorSpot); // 걷는 사람은 문 앞에서 기다린다
    me.position.y = 0;
    ctx.syncUI();
    ed.on = true; ed.items = ctx.build.items.map(it => ({ ...it })); ed.time = ctx.timeChoice; ed.sel = null;
    ed.palette = ctx.layout.palette ?? null; ed.placed = null; ed.busy = false; hovering = false;
    ed.backdrop = colourBackdrop(ctx.layout.backdrop); ed.brand = Array.isArray(ctx.layout.brand) ? [...ctx.layout.brand] : null;
    ed.hist = resume?.hist ?? []; ed.seq = resume?.seq ?? ed.seq; // 알림과 내려놓기의 번호는 마운트를 건너 이어진다 (room-editor.tsx 가 번호로 새것을 가린다)
    ed.future = resume?.future ?? []; ed.tag = null; ed.notice = null; ed.move = null; ed.press = null;
    // 방의 틀은 지금 지은 방(ctx.layout)의 것이다. 이름은 다시 마운트했으면 그 전 마운트의 것, 아니면 저장된 이름이다.
    ed.shell = shellOf(ctx.layout); ed.name = typeof resume?.name === 'string' ? resume.name : ctx.savedName; ctx.showName(ed.name);
    ed.preview = ctx.editPreview = false;
    ed.saved = savedKey();
    ctx.editCam.reset(); if (resume?.plan) ctx.editCam.setPlan(true); // 색을 바꾸며 다시 마운트해도 평면도는 이어 간다
    ed.rdown = null; viewKey = '';
    emit();
    getCatalogue().then(() => { if (ed.on) emit(); }); // 이름과 러그 여부는 카탈로그에서 온다
    ctx.loadModel('kitchenCabinet'); // 상부장, 후드의 기본 높이는 하부장(조리대)의 키에서 잰다 (mountY)
  }
  function exit() {
    if (!ed.on) return;
    const had = !!ed.move || !!ed.fnTimer;
    ed.move = null; ed.press = null; ed.sel = null; ed.on = false; ed.rdown = null; ed.preview = ctx.editPreview = false;
    grid.visible = tile.visible = wallTile.visible = false; clearGhosts(); showZones(null);
    ctx.editCam.reset(); // 방 카메라로는 loop.js 가 데려간다
    canvas.style.cursor = '';
    if (had) rebuild();
    ctx.mode = 'room'; ctx.setHint('room'); ctx.syncUI();
    emit();
  }
  on(root, 'heap:edit', e => { if (e.detail) enter(); else exit(); });
  if (opts.resume?.edit) on(root, 'heap:ready', () => enter(opts.resume), { once: true });
  on(root, 'heap:saved', e => {
    if (e.detail?.roomUuid !== opts.roomUuid) return; // 다른 방에서 늦게 끝난 저장
    const l = e.detail.layout;
    // editor-bridge.js 가 먼저 받아 ctx.original, ctx.baseLayout, ctx.savedName 을 고쳐 두었다
    if (l && Array.isArray(l.items)) { ed.saved = savedKey(); if (ed.on) emit(); }
  });
  on(root, 'heap:editcmd', e => {
    const c = e.detail;
    if (!ed.on || !c || typeof c !== 'object') return;
    if (c.op === 'preview') { setPreview(!!c.value); emit(); return; }
    if (c.op === 'palhover') { if (!ed.preview) previewPalette(c.palette ?? null); return; } // 걸음도 상태 알림도 아니다
    if (ed.preview) return; // 팔로워로 보는 동안에는 고치지 않는다
    if (c.op !== 'fn' && c.op !== 'lift') { ed.tag = null; flushFn(); }
    if (c.op === 'lift') flushFn();
    switch (c.op) {
      case 'arm': if (c.template && typeof c.template === 'object') arm(c.template); break;
      case 'rotate': rotate(c.dir === -1 ? -1 : 1); break;
      case 'copy': copy(); break;
      case 'remove': if (ed.sel != null) remove(ed.sel); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'time': if (c.value !== ed.time) { pushUndo(); setTime(c.value); } break;
      case 'fn': if (Number.isInteger(c.index)) setFn(c.index, c.fn); break;
      case 'lit': toggleLit(); break;
      case 'select': endMove(); select(Number.isInteger(c.index) && c.index < ed.items.length ? c.index : null); break;
      case 'cancel': cancel(); break;
      case 'reset': reset(); break;
      case 'discard': discard(); break;
      case 'palette': setPalette(c.palette ?? null, c.brand); break;
      case 'backdrop': setBackdrop(c.value ?? null); break;
      case 'swap': if (Number.isInteger(c.index)) swap(c.index, c.to); break;
      case 'plan': setPlan(typeof c.value === 'boolean' ? c.value : !ctx.editCam.plan); break;
      case 'fit': fitView(); break;
      case 'lift': lift(c.dir === -1 ? -1 : 1); break;
      case 'name': if (typeof c.value === 'string' && c.value !== ed.name) { pushUndo(); setName(c.value); } break;
      case 'load': load(c.layout, c.name); break;
      default: return;
    }
    emit();
  });

  // ---------- 포인터와 키 ----------
  // 방 루트의 capture 단계에서 받아 캔버스까지 내려보내지 않는다: 편집 중에는 걷기, 앉기, 기능 가구 누르기가 꺼진다 (input.js)
  const remember = ev => { ed.last = { clientX: ev.clientX, clientY: ev.clientY, overCanvas: ev.target === canvas || !!ed.move }; ed.alt = ev.altKey; };
  on(root, 'pointerdown', ev => {
    if (!ed.on || ev.target !== canvas) return;
    ev.stopPropagation();
    if (ed.preview) return; // 팔로워로 보는 동안에는 방을 누르지 않는다 (걷기, 앉기도 꺼져 있다)
    remember(ev); flushFn(); ed.tag = null;
    if (ev.button === 2) { // 오른쪽: 끌면 화면을 옮기고, 움직이지 않고 떼면 취소한다 (pointerup)
      ed.rdown = { clientX: ev.clientX, clientY: ev.clientY, moved: false };
      ed.eatMenu = true; // 캔버스에서 시작한 오른쪽 누르기 뒤의 contextmenu 는 어디서 떼든 먹는다 (끌다가 목록 위에서 떼도)
      ctx.editCam.panStart(ev, canvas);
      try { canvas.setPointerCapture?.(ev.pointerId); } catch { /* 붙잡지 못해도 root 에서 받는다 */ }
      return;
    }
    if (ev.button !== 0) return;
    if (ed.move?.isNew) { placeNew(ev, ev.shiftKey); emit(); return; }
    const hit = pick(ev);
    if (hit?.item != null) { ed.sel = hit.item; ed.press = { item: hit.item, clientX: ev.clientX, clientY: ev.clientY }; ed.notice = null; }
    else { ed.sel = null; ed.notice = null; if (hit?.fixed) notice(`${hit.fixed} 이 화면에서 옮기지 않아요 (고정)`); }
    emit();
  }, { capture: true });
  on(root, 'pointermove', ev => {
    if (!ed.on) return;
    if (ed.preview) { if (ev.target === canvas) ev.stopPropagation(); return; }
    remember(ev);
    if (ed.rdown) {
      if (!ed.rdown.moved && Math.hypot(ev.clientX - ed.rdown.clientX, ev.clientY - ed.rdown.clientY) > 5) ed.rdown.moved = true;
      if (ed.rdown.moved) { ctx.editCam.panMove(ev, canvas); emitView(); }
      if (ev.target === canvas) ev.stopPropagation();
      if (!ed.move) { canvas.style.cursor = ed.rdown.moved ? 'move' : ''; return; } // 들고 있는 가구는 아래에서 계속 커서를 따른다
    }
    if (ed.press && !ed.move && Math.hypot(ev.clientX - ed.press.clientX, ev.clientY - ed.press.clientY) > 5) { startDrag(ed.press, ev); emit(); }
    if (ed.move) {
      if (ev.target === canvas || !ed.move.isNew) update(ev);
      root.querySelector('.ed-dock')?.classList.toggle('drop', !ed.move.isNew && overDock(ev));
      canvas.style.cursor = 'grabbing';
      if (ev.target === canvas) ev.stopPropagation();
      return;
    }
    if (ev.target !== canvas) return;
    ev.stopPropagation();
    if (!ev.buttons) canvas.style.cursor = pick(ev)?.item != null ? 'grab' : '';
  }, { capture: true });
  on(root, 'pointerup', ev => {
    if (!ed.on) return;
    if (ev.target === canvas) ev.stopPropagation();
    if (ed.preview) return;
    if (ed.rdown && ev.button === 2) {
      const moved = ed.rdown.moved;
      ed.rdown = null; ctx.editCam.panEnd(); canvas.style.cursor = ed.move ? 'grabbing' : '';
      if (!moved) cancel();
      emit();
      return;
    }
    ed.press = null;
    root.querySelector('.ed-dock')?.classList.remove('drop');
    if (ed.move && !ed.move.isNew) { dropDrag(ev); canvas.style.cursor = ''; emit(); }
  }, { capture: true });
  on(window, 'contextmenu', ev => {
    if (!ed.on) return;
    if (ev.target === canvas || ed.eatMenu) { ev.preventDefault(); ed.eatMenu = false; }
  }, { capture: true });
  on(root, 'pointercancel', () => { ed.eatMenu = false; if (ed.rdown) { ed.rdown = null; ctx.editCam.panEnd(); } }, { capture: true });
  // 휠: 커서 쪽으로 확대, 축소. 페이지는 굴리지 않는다
  on(canvas, 'wheel', ev => {
    if (!ed.on) return;
    ev.preventDefault();
    if (ed.preview) return;
    const dy = ev.deltaY * (ev.deltaMode === 1 ? 33 : ev.deltaMode === 2 ? 400 : 1);
    ctx.editCam.zoomAt(ev, canvas, dy); emitView();
  }, { passive: false });
  on(window, 'keydown', ev => {
    if (!ed.on || ed.preview) return; // 팔로워로 보는 동안의 키는 room-editor.tsx 가 받는다 (아무 키나 누르면 돌아간다)
    if (ev.key === 'Alt') { ed.alt = true; ev.preventDefault(); if (ed.move && ed.last) { update(ed.last); } return; }
    if (ev.target.closest?.('input, textarea, select, .ed-bubble')) return; // 기능 말풍선의 글자는 말풍선의 것이다
    const k = ev.key.toLowerCase(), mod = ev.ctrlKey || ev.metaKey;
    if (!mod && !ev.altKey && (k === 'pageup' || k === 'pagedown')) { // 높이: 이어 누르는 동안 한 걸음이라 tag 를 지우지 않는다
      ev.preventDefault(); ev.stopPropagation(); flushFn();
      lift(k === 'pageup' ? 1 : -1); emit();
      return;
    }
    let done = true;
    if (mod && k === 'z') { if (ev.shiftKey) redo(); else undo(); }
    else if (mod && k === 'y') redo();
    else if (mod && k === 'd') { flushFn(); copy(); }
    else if (mod || ev.altKey) done = false; // Ctrl+S 는 room-editor.tsx 가 받는다
    else if (k === 'r') rotate(ev.shiftKey ? -1 : 1);
    else if (k === 'delete' || k === 'backspace') { if (ed.move?.isNew) endMove(); else if (ed.sel != null && !ed.move) remove(ed.sel); }
    else if (k === 'escape') cancel();
    else if (k === 't') setPlan(!ctx.editCam.plan);
    else if (k === 'home' || k === '0') fitView();
    else done = false;
    if (!done) return;
    ev.preventDefault(); ev.stopPropagation(); ed.tag = null;
    emit();
  }, { capture: true });
  on(window, 'keyup', ev => { if (ev.key === 'Alt' && ed.on) { ed.alt = false; if (ed.move && ed.last) update(ed.last); } });
  on(window, 'blur', () => { ed.alt = false; ed.eatMenu = false; if (ed.rdown) { ed.rdown = null; ctx.editCam.panEnd(); } });

  // ---------- 프레임마다: 발판, 가구 위 막대, 이유 칩 ----------
  const bb = new THREE.Box3(), top = new THREE.Vector3(), lastCam = new THREE.Matrix4();
  function editFrame() {
    if (ed.preview) { // 팔로워로 보기: 꾸미기의 표시를 모두 숨긴다 (카메라는 loop.js 가 방 카메라로 옮긴다)
      grid.visible = tile.visible = wallTile.visible = false; for (const l of edges) l.visible = false;
      if (ghosts.length) clearGhosts(); showZones(null);
      const chip = root.querySelector('#ed-why'); if (chip && !chip.hidden) chip.hidden = true;
      return;
    }
    // 확대, 이동, 평면도로 카메라가 움직이면 커서는 그대로여도 커서 아래의 바닥이 바뀐다: 들고 있는 가구가 따라간다
    camera.updateMatrixWorld();
    if (!lastCam.equals(camera.matrixWorld)) { lastCam.copy(camera.matrixWorld); if (ed.move && ed.last?.overCanvas) update(ed.last); }
    const m = ed.move, bar = root.querySelector('#ed-bar'), chip = root.querySelector('#ed-why');
    if (m) syncGhosts([ctx.build.groups[m.i], ...m.kids.map(j => ctx.build.groups[j])].filter(Boolean)); else if (ghosts.length) clearGhosts();
    for (const l of edges) l.visible = !!m?.cand;
    showZones(m);
    if (m?.cand) { showTile(m.cand, m.why ? BAD : OK); silMat.color.set(m.why ? BAD : OK); }
    else if (!m && ed.sel != null && ed.items[ed.sel]) showTile(ed.items[ed.sel], PICKED);
    else tile.visible = wallTile.visible = false;
    if (chip) {
      const show = !!(m?.why && ed.last);
      if (show) {
        const rr = root.getBoundingClientRect();
        chip.textContent = m.why; chip.style.left = `${ed.last.clientX - rr.left + 14}px`; chip.style.top = `${ed.last.clientY - rr.top + 14}px`;
      }
      if (chip.hidden === show) chip.hidden = !show;
    }
    const cr = canvas.getBoundingClientRect(), rr = root.getBoundingClientRect();
    const L = cr.left - rr.left, T = cr.top - rr.top, R = cr.right - rr.left, B = cr.bottom - rr.top;
    // 그룹의 윗면(또는 밑면) 가운데가 화면의 어디인지 (방 루트 기준 px)
    const at = (g, bottom) => {
      bb.setFromObject(g);
      if (bb.isEmpty()) top.set(g.position.x, bottom ? 0 : 1, g.position.z);
      else top.set((bb.min.x + bb.max.x) / 2, bottom ? bb.min.y : bb.max.y, (bb.min.z + bb.max.z) / 2);
      top.project(camera);
      return { x: L + (top.x + 1) / 2 * cr.width, y: T + (1 - top.y) / 2 * cr.height };
    };
    const g = !m && ed.sel != null ? ctx.build.groups[ed.sel] : null;
    if (bar && g) {
      const p = at(g, false);
      bar.style.left = `${Math.round(clamp(p.x, L + 120, R - 120))}px`;
      bar.style.top = `${Math.round(clamp(p.y, T + 52, B))}px`;
    }
    // 기능 말풍선 (room-editor.tsx 의 #ed-bubble, data-index): 가구의 밑면 아래에 단다. 캔버스 밖으로 나가지 않게 당긴다
    const bub = root.querySelector('#ed-bubble'), bg = bub && ctx.build.groups[Number(bub.dataset.index)];
    if (bub && bg) {
      const p = at(bg, true), w = bub.offsetWidth, h = bub.offsetHeight;
      bub.style.left = `${Math.round(clamp(p.x, L + w / 2 + 8, R - w / 2 - 8))}px`;
      bub.style.top = `${Math.round(Math.max(T + 8, Math.min(p.y + 14, B - 8 - h)))}px`;
    }
    // 기능 표 (room-editor.tsx 의 .ed-badge, data-badge): 가구의 윗면 위에 단다. 캔버스 밖이면 숨긴다
    for (const el of root.querySelectorAll('.ed-badge')) {
      const bgp = ctx.build.groups[Number(el.dataset.badge)];
      if (!bgp) { el.style.visibility = 'hidden'; continue; }
      const p = at(bgp, false), inside = p.x > L && p.x < R && p.y > T && p.y < B;
      el.style.visibility = inside ? '' : 'hidden';
      el.style.left = `${Math.round(p.x)}px`; el.style.top = `${Math.round(p.y)}px`;
    }
  }

  Object.assign(ctx, { editFrame });
}
