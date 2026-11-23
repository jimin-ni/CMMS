// 쪽지 쓰기와 끌어 걸기, 내 쪽지 지우기. tree.js 의 setupTree 가 끝에서 setupTreeWrite(ctx, T) 로 세운다.
//
// 결정 (DECISIONS.md L5 L6 L7 L11 L12, design/visit-flow.md 5)
//   - 쪽지 쓰기 단추(#tree-write)는 트리 모드의 HUD 에 있다. 로그인하지 않은 사람은 opts.signIn() 으로 보낸다.
//     돌아온 주소의 ?write=1 은 heap-room.tsx 가 읽어 opts.openWrite 로 넘기고, 이 파일이 트리 모드와 쓰기 판을 연다 (L6).
//   - 카메라는 그대로다. 펼친 종이(쪽지 읽기와 같은 3D 종이)가 화면 가운데에 서고, 그 위에 투명한 <textarea> 가 겹친다.
//     글자 크기와 줄바꿈은 읽을 때와 같은 fitText 로 정하므로 접은 뒤의 글과 모양이 거의 같다. 입력(한글 조합 포함)은 브라우저가 받는다.
//   - 200자, 8줄 (policy.ts 의 noteBodyMaxChars, noteBodyMaxLines). 줄은 서버처럼 \n 으로 센다.
//   - L7 초안: 글, 색, 글씨체, 글자 크기, 이름, 장식 종류와 색이 방마다 localStorage 에 남는다 (O1 O2 O3).
//     글자 크기 슬라이더의 범위는 [하한, 지금 글이 종이에 드는 가장 큰 크기]이고, 이름은 종이 끝 서명 줄 자리의 입력(#ts-name, 12자, 비면 익명)이다. 글이 있는 판에서 Esc 나 취소를 누르면 버리기 / 계속 쓰기를 묻는다.
//   - 접어서 달기: 읽기의 거꾸로 네 박자로 접혀 장식 안에 들어간다. 장식은 화면 아래쪽에 놓이고, 집어서 트리에 끌어다 놓는다 (L11).
//     집기 전에는 빈 곳을 끌어 트리를 돌릴 수 있다. 끄는 동안은 돌지 않는다. 장식은 놓일 자리에서 초록(걸림) 또는 빨강(다른 쪽지와 너무 가까움)이다.
//     트리 밖에 놓으면 쪽지함으로 간다. 걸 자리가 트리 어디에도 없으면 L12 대로 쪽지함에 바로 넣는다.
//   - 내 쪽지(mine)를 열면 아래에 지우기가 뜬다. 확인을 거쳐 서버에서 지우고 트리에서 뺀다.
//   - 애니메이션이 단추를 막는 동안에는 단추를 숨기지 않고 aria-disabled 로 흐리게 둔다 (눌러도 아무 일이 없고, 단추가 사라진 것처럼 보이지 않는다).
//   - 확인창은 다른 모듈도 쓴다: 반환값의 ask(text, yes, no, onYes, onClose) (tree-owner.js 의 숨기기와 답장 버리기).
//
// 상태: idle opening sheet folding toHand ready carry sending returning unfolding closing
//
// T 는 tree.js 가 건네는 안쪽 손잡이다 (rig, buildNote, disposeNote, openTarget, view, measure, ...).
// 위쪽의 순수 함수(clampBody, countBody, parseDraft)는 DOM 없이 돈다.
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import {
  applyNote, writeText, eraseText, fitText, fitLine, sizeRangeFor, frontTextBox, loadNoteFonts, NOTE_FONTS, SHEET, N_FLY, ease,
} from './tree-note.js';
import { KINDS, KIND_KO, MAIN_SWATCHES } from './tree-ornament.js';
import { TINT_VALUES, FONT_VALUES, noteDate } from './tree-ids.js';

// ---------- 순수 함수 ----------

/** 서버(notes-repo.ts parseNoteInput)와 같은 센 법으로 글을 자른다: 줄은 \n 으로, 글자는 코드포인트로 */
export function clampBody(text, maxChars, maxLines) {
  let s = String(text ?? '').replace(/\r\n?/g, '\n');
  const lines = s.split('\n');
  if (lines.length > maxLines) s = lines.slice(0, maxLines).join('\n');
  const cps = Array.from(s);
  if (cps.length > maxChars) s = cps.slice(0, maxChars).join('');
  return s;
}
export const countBody = s => ({ chars: Array.from(s).length, lines: s.split('\n').length });

// name: null 이면 손대지 않은 것이라 계정 이름이 미리 들어가고, 문자열(빈 문자열 포함)은 쓴 사람이 적은 것이다 (비면 익명).
// fontSize: null 이면 자동 맞춤. kind, main: null 이면 처음 열 때 무작위로 정해 초안에 남긴다.
export const DRAFT_DEFAULT = { text: '', tint: 'ivory', font: 'nanum-pen', name: null, fontSize: null, kind: null, main: null };
export const NAME_MAX = 12;
/** localStorage 의 문자열 -> 초안. 깨졌거나 모르는 값은 기본값으로 */
export function parseDraft(raw, maxChars, maxLines) {
  let o = null;
  try { o = JSON.parse(raw); } catch { /* 깨진 값 */ }
  if (!o || typeof o !== 'object') return { ...DRAFT_DEFAULT };
  return {
    text: typeof o.text === 'string' ? clampBody(o.text, maxChars, maxLines) : '',
    tint: Object.hasOwn(TINT_VALUES, o.tint) ? o.tint : DRAFT_DEFAULT.tint,
    font: Object.hasOwn(FONT_VALUES, o.font) ? o.font : DRAFT_DEFAULT.font,
    // 예전 초안의 anonymous: true 는 빈 이름(익명)으로 옮긴다
    name: typeof o.name === 'string' ? Array.from(o.name).slice(0, NAME_MAX).join('') : o.anonymous === true ? '' : null,
    fontSize: Number.isFinite(o.fontSize) ? Math.round(o.fontSize) : null,
    kind: KINDS.includes(o.kind) ? o.kind : null,
    main: MAIN_SWATCHES.some(([, hex]) => hex === o.main) ? o.main : null,
  };
}

const TINT_NAME = { ivory: '상아색', cream: '크림색', linen: '리넨', sand: '모래색', snow: '눈색' };
/** 새 쪽지의 id (uuid v4). 장식 모양이 id 로 정해지므로 쓰기 판에서 정한 id 를 서버가 그대로 쓴다. randomUUID 가 없으면 getRandomValues 로 만든다 */
function newNoteId() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export const FONT_LABEL = { 'nanum-pen': '나눔펜', gaegu: '개구', 'hi-melody': '하이멜로디', 'gamja-flower': '감자꽃', 'cute-font': '귀여운', 'single-day': '싱글데이', 'yeon-sung': '연성', 'east-sea-dokdo': '동해독도' }; // 방 주인의 답장 글씨체 칩(tree-owner.js)도 쓴다
const SPEED = { open: 2.0, fold: 1.5, close: 3.5, unfold: 2.0 };
const HAND_D = 1.1, HAND_NDC_Y = -0.42; // 접은 쪽지가 놓이는 곳: 카메라 앞 HAND_D m, 화면 아래쪽
const GREEN = '#6fae6a', RED = '#d23c3c';
const TREE_H_MAX = 1.83; // policy.noteTreeHeight
const MIN_HANG_Y = 0.3; // 목업과 같다: 이 아래는 걸지 않는다

export function setupTreeWrite(ctx, T) {
  const { scene, camera, canvas, root, $, on, onDispose, toast, opts } = ctx;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const maxChars = opts.policy?.noteBodyMaxChars ?? 200;
  const maxLines = opts.policy?.noteBodyMaxLines ?? 8;
  const draftKey = `heap-note-draft:${opts.roomUuid ?? opts.roomId}`;

  const sheetEl = $('tree-sheet'), ta = $('ts-text'), ctl = $('ts-ctl'), dragEl = $('ts-drag');
  const tintsEl = $('ts-tints'), fontsEl = $('ts-fonts'), countEl = $('ts-count');
  const kindsEl = $('ts-kinds'), swatchEl = $('ts-swatches'), sizeEl = $('ts-size'), sigEl = $('ts-sig'), sigIn = $('ts-name');
  const delBtn = $('tree-del'), confirmEl = $('tree-confirm');
  const writeBtn = $('tree-write'), foldBtn = $('ts-fold'), cancelBtn = $('ts-cancel'), boxBtn = $('ts-box'), reopenBtn = $('ts-reopen');
  const setDisabled = (el, off) => { if (el.getAttribute('aria-disabled') !== String(off)) { if (off) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled'); } };
  const isOff = el => el.getAttribute('aria-disabled') === 'true';

  let st = 'idle';
  let sheet = null; // { n, id } n: 3D 쪽지 (tree.js 의 buildNote)
  let draft = { ...DRAFT_DEFAULT };
  const POP_FROM = 0.9, POP_SEC = 0.2;
  let pop = null; // 빈 판이 나타날 때의 짧은 커지기
  let tween = null, carry = null, confirmState = null, sendId = 0, delBusy = false, wantOpen = false;
  let fontTimer = 0;
  let measureCtx = null;
  let textFits = true; // layoutText 가 정한다: 줄여 맞춘 글이 글상자에 드는가

  // ----- 초안 -----
  function loadDraft() {
    let raw = null;
    try { raw = localStorage.getItem(draftKey); } catch { /* 막힌 저장소 */ }
    return raw ? parseDraft(raw, maxChars, maxLines) : { ...DRAFT_DEFAULT };
  }
  function saveDraft() {
    try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* 가득 찼거나 막힘 */ }
  }

  // ----- 화면 -----
  // 이름: 손대지 않았으면 계정 이름. 비면 익명 (null).
  // 이름 칸은 12자까지다. 계정 이름이 더 길면 앞 12자만 미리 채운다 (input 의 maxlength 는 코드로 넣은 값을 자르지 않는다)
  const nameNow = () => Array.from((draft.name ?? opts.viewerName ?? '').trim()).slice(0, 12).join('');
  const dataOf = final => ({
    id: sheet.id,
    name: nameNow() || null,
    date: final ? noteDate(new Date().toISOString()) : '',
    msg: final ? draft.text.trim() : '',
    tint: TINT_VALUES[draft.tint],
    font: FONT_VALUES[draft.font],
    kind: draft.kind,
    main: draft.main,
    ...(draft.fontSize === null ? {} : { fontSize: draft.fontSize }),
  });
  const showCtl = () => st === 'opening' || st === 'sheet' || st === 'unfolding' || st === 'returning';
  function ui() {
    const writing = st !== 'idle';
    root.classList.toggle('tree-writing', writing);
    sheetEl.hidden = !writing;
    ta.hidden = st !== 'sheet';
    sigEl.hidden = st !== 'sheet';
    ctl.hidden = !showCtl();
    ctl.inert = st !== 'sheet';
    dragEl.hidden = !(st === 'toHand' || st === 'ready' || st === 'carry' || st === 'sending');
    dragEl.inert = st !== 'ready';
    $('ts-drag-text').textContent = st === 'carry' ? '초록색이 보이는 곳에 놓으면 달려요' : st === 'sending' ? '다는 중이에요…' : '접은 쪽지를 집어 트리 위에 끌어다 놓으세요';
    if (!writing) delBtn.hidden = true;
    syncButtons();
  }
  // 막힌 단추는 흐리게 둔다: 쓰기 판이 펼쳐지는 동안의 접어서 달기, 접는 동안의 쪽지 쓰기 ...
  function syncButtons() {
    setDisabled(writeBtn, st !== 'idle' || !!T.otherBusy() || !T.rig()?.settled);
    setDisabled(foldBtn, st !== 'sheet');
    setDisabled(cancelBtn, st !== 'sheet');
    setDisabled(boxBtn, st !== 'ready');
    setDisabled(reopenBtn, st !== 'ready');
  }
  function setSt(next) { st = next; ui(); }

  function ensureChips() {
    if (tintsEl.childElementCount) return;
    for (const key of Object.keys(TINT_VALUES)) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.key = key;
      b.style.background = TINT_VALUES[key]; b.title = `종이 ${TINT_NAME[key] ?? key}`; b.setAttribute('aria-label', `종이 ${TINT_NAME[key] ?? key}`);
      tintsEl.append(b);
    }
    for (const key of Object.keys(FONT_VALUES)) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.key = key;
      b.style.fontFamily = `"${FONT_VALUES[key]}", system-ui, sans-serif`; b.textContent = FONT_LABEL[key] ?? key; b.title = FONT_LABEL[key] ?? key;
      fontsEl.append(b);
    }
    loadNoteFonts(Object.keys(FONT_VALUES).map(k => ({ font: FONT_VALUES[k], text: FONT_LABEL[k] ?? k })));
    for (const kind of KINDS) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.key = kind;
      b.textContent = KIND_KO[kind] ?? kind; b.title = `장식 ${KIND_KO[kind] ?? kind}`; b.setAttribute('aria-label', `장식 ${KIND_KO[kind] ?? kind}`);
      kindsEl.append(b);
    }
    for (const [label, hex] of MAIN_SWATCHES) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.key = hex;
      b.style.background = hex; b.title = `장식 색 ${label}`; b.setAttribute('aria-label', `장식 색 ${label}`);
      swatchEl.append(b);
    }
  }
  function syncChips() {
    for (const b of tintsEl.children) b.setAttribute('aria-pressed', String(b.dataset.key === draft.tint));
    for (const b of fontsEl.children) b.setAttribute('aria-pressed', String(b.dataset.key === draft.font));
    for (const b of kindsEl.children) b.setAttribute('aria-pressed', String(b.dataset.key === draft.kind));
    for (const b of swatchEl.children) b.setAttribute('aria-pressed', String(b.dataset.key === draft.main));
  }
  function paintCount() {
    const { chars, lines } = countBody(ta.value);
    countEl.textContent = `${chars}/${maxChars}자 · ${Math.min(lines, maxLines)}/${maxLines}줄`;
    countEl.classList.toggle('full', chars >= maxChars || lines >= maxLines);
  }

  // ----- 종이 위 글상자의 자리와 글자 -----
  // 종이는 카메라와 나란히 서 있어서 화면 위의 직사각형이다: 네 귀퉁이를 화면으로 옮겨 구한다.
  const _c = new THREE.Vector3(), _d = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();
  function paperRect() {
    camera.updateMatrixWorld(true);
    const tg = T.openTarget();
    camera.getWorldDirection(_d);
    _u.set(0, 1, 0).applyQuaternion(camera.quaternion); _r.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const c = tg.p.clone().addScaledVector(_d, -0.012); // 펼친 종이는 장식 쪽으로 12 mm 나와 있다 (tree-note.js 의 rise)
    const cr = canvas.getBoundingClientRect(), rr = root.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      _c.copy(c).addScaledVector(_r, sx * SHEET.W / 2).addScaledVector(_u, sy * SHEET.H / 2).project(camera);
      const px = cr.left - rr.left + (_c.x * 0.5 + 0.5) * cr.width, py = cr.top - rr.top + (-_c.y * 0.5 + 0.5) * cr.height;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // 글자 크기의 범위는 [하한, 지금 글이 상자에 드는 가장 큰 크기]다. 고른 값(draft.fontSize)은 늘 그 안으로 맞춘다. null 이면 자동 맞춤(가장 큰 크기).
  let sizeRange = { min: 62, max: 290 };
  const sizeNow = () => Math.min(sizeRange.max, Math.max(sizeRange.min, draft.fontSize ?? sizeRange.max));
  function fitFor(text, fontName) {
    const s = NOTE_FONTS.scale[fontName] ?? 1, b = frontTextBox(false);
    measureCtx ||= document.createElement('canvas').getContext('2d');
    sizeRange = sizeRangeFor(measureCtx, text, fontName);
    return fitText(measureCtx, text, fontName, b.boxW, b.boxH, Math.round(290 * s), Math.round(62 * s), draft.fontSize === null ? null : sizeNow());
  }
  // 슬라이더는 글이 바뀔 때마다 범위와 값을 다시 맞춘다. 글이 길어져 최대가 줄면 값도 같이 내려간다.
  function paintSize() {
    const { min, max } = sizeRange, v = sizeNow();
    sizeEl.min = String(min); sizeEl.max = String(max); sizeEl.value = String(v);
    sizeEl.disabled = max <= min;
  }
  // 종이 끝의 서명 줄 ("- 이름"). 접은 뒤 종이에 그려지는 줄(tree-note.js 의 frontTexture)과 같은 자리와 크기다.
  function layoutSig(r, b, k, fontName) {
    const s = NOTE_FONTS.scale[fontName] ?? 1;
    measureCtx ||= document.createElement('canvas').getContext('2d');
    const nm = fitLine(measureCtx, '- ' + (sigIn.value || '익명'), `"${fontName}"`, Math.round(84 * s), Math.round(40 * s), b.boxW);
    const g = sigEl.style;
    g.left = `${r.x + b.x * k}px`; g.width = `${b.boxW * k}px`;
    g.top = `${r.y + (b.ch * 0.875 - nm.px * 0.95) * k}px`; g.height = `${nm.px * 1.2 * k}px`;
    g.fontFamily = `"${fontName}", system-ui, sans-serif`; g.fontSize = `${nm.px * k}px`; g.lineHeight = `${nm.px * 1.2 * k}px`;
  }
  function layoutText() {
    if (st !== 'sheet' && st !== 'opening') return;
    const r = paperRect(), b = frontTextBox(false), k = r.w / b.cw, font = FONT_VALUES[draft.font];
    // 글이 비었을 때는 짧은 글로 크기를 잡는다 (비어 있는데 글자가 거대하면 놀란다)
    const fit = fitFor(ta.value || '가나다라마바사아자차', font);
    paintSize();
    layoutSig(r, b, k, font);
    const s = ta.style;
    // 위쪽 여백: drawBlock 이 남는 높이의 0.4 만큼 글을 내려 그리므로 글상자도 같이 내린다 (접은 뒤의 글 자리와 맞는다).
    // 너비는 조금 넉넉히 준다: 글상자의 줄바꿈이 캔버스보다 한 줄 일찍 일어나 내용이 상자보다 높아지는 일을 막는다.
    const total = fit.lines.length * fit.lh, slack = Math.max(0, (b.boxH - total) * 0.4);
    s.boxSizing = 'border-box';
    s.left = `${r.x + b.x * k}px`; s.top = `${r.y + b.top * k}px`; s.width = `${b.boxW * k * 1.03}px`; s.height = `${b.boxH * k}px`;
    s.paddingTop = `${slack * k}px`;
    s.fontFamily = `"${font}", system-ui, sans-serif`; s.fontSize = `${fit.px * k}px`; s.lineHeight = `${fit.lh * k}px`;
    // 줄여 맞춘 글이 상자에 들면 글상자는 절대 위로 밀리지 않는다 (끝에서 입력할 때 브라우저가 캐럿을 따라 scrollTop 을 올려서 첫 줄이 잘렸다).
    textFits = total <= b.boxH + 0.5 && !String(fit.lines[fit.lines.length - 1]).endsWith('…');
    if (textFits && ta.scrollTop) ta.scrollTop = 0;
  }

  // ----- 3D 종이 -----
  function placeSheet(n, from) {
    const tg = T.openTarget();
    pop = null;
    scene.add(n.root); n.root.scale.setScalar(1);
    n.shellDrop = T.shellDrop();
    n.flight = { from: from ?? { p: tg.p.clone(), q: tg.q.clone() }, to: tg };
  }
  function buildSheet(final, from) {
    const r = T.rig(), old = sheet.n;
    const n = T.buildNote(r, dataOf(final));
    placeSheet(n, from);
    if (final) { n.pk.loadFonts(); writeText(n.pk); }
    sheet.n = n;
    applyNote(n, old ? old.t : n.total, n.flight);
    if (old) T.disposeNote(old);
  }
  const tintChanged = () => { if (st === 'sheet') buildSheet(false); };
  const pick = list => list[Math.floor(Math.random() * list.length)];

  function openSheet() {
    const r = T.syncRig();
    if (!r || !r.settled || ctx.mode !== 'tree' || st !== 'idle') return false;
    draft = loadDraft();
    // 장식은 처음 열 때 무작위로 정하고 초안에 남긴다
    if (!draft.kind) draft.kind = pick(KINDS);
    if (!draft.main) draft.main = pick(MAIN_SWATCHES)[1];
    saveDraft();
    ensureChips(); syncChips();
    sigIn.value = nameNow();
    sheet = { n: null, id: newNoteId() }; // 서버도 이 id 로 쪽지를 만든다: 접힌 장식과 걸린 장식이 같다
    ta.value = draft.text; paintCount();
    setSt('sheet'); // 여는 연출은 없다: 빈 판이 바로 펼쳐진 채로 나타나고 글을 쓸 수 있다 (O5)
    T.measure(ctl, 0);
    const tg = T.openTarget();
    camera.getWorldDirection(_d); _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const n = T.buildNote(r, dataOf(false));
    sheet.n = n;
    // from 은 화면 아래: 닫을 때 장식이 아래로 내려가는 길이다 (t 가 끝에 있으니 지금은 쓰이지 않는다)
    placeSheet(n, { p: tg.p.clone().addScaledVector(_u, -T.view().dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.2), q: tg.q.clone() });
    applyNote(n, n.total, n.flight);
    pop = reduced ? null : { a: 0 };
    if (pop) n.root.scale.setScalar(POP_FROM);
    showSheetReady();
    return true;
  }
  function showSheetReady() {
    setSt('sheet');
    layoutText(); paintCount();
    ta.focus({ preventScroll: true });
    const end = ta.value.length; ta.setSelectionRange(end, end);
  }
  function closeSheet() { // 판을 접어 넣는다
    ta.blur(); saveDraft(); setSt('closing');
  }
  function finishClose() {
    if (sheet) { T.disposeNote(sheet.n); sheet = null; }
    tween = null; carry = null;
    setSt('idle'); T.setCursor();
  }

  // ----- 접기, 집기, 걸기 -----
  function fold() {
    if (st !== 'sheet') return;
    const text = draft.text.trim();
    if (!text) { toast('쪽지에 글을 써 주세요'); ta.focus(); return; }
    if (!T.rig()) return;
    ta.blur(); saveDraft();
    buildSheet(true); // 최종 글, 이름, 날짜로 다시 짓는다: 종이 위에 글이 그려진다
    setSt('folding');
  }
  const handPose = () => {
    const v = new THREE.Vector3(0, HAND_NDC_Y, 0.5).unproject(camera);
    const p = camera.position.clone().add(v.sub(camera.position).normalize().multiplyScalar(HAND_D));
    return { p, q: camera.quaternion.clone() };
  };
  function moveTo(n, p, q, dur, next) {
    tween = { n, p0: n.root.position.clone(), q0: n.root.quaternion.clone(), p1: p, q1: q, a: 0, dur: reduced ? 0.01 : dur, next };
  }
  function setGhost(on) {
    const n = sheet?.n; if (!n) return;
    for (const m of Object.values(n.orn.mats)) { m.transparent = on; m.opacity = on ? 0.62 : 1; m.depthWrite = !on; m.needsUpdate = true; }
    n.orn.setColors({ main: n.colors.main });
  }
  function anyFreeSpot(r) {
    r.surface.sync();
    const hung = T.treeSpot.hung(), rnd = mulberry32(0x5eed);
    for (let i = 0; i < 250; i++) {
      const angle = (rnd() * 2 - 1) * Math.PI, y = 0.42 + rnd() * 1.0;
      const hit = r.surface.hit(angle, y);
      if (!hit || hit.r < 0.12) continue;
      if (T.treeSpot.isFree({ y, angle }, hung)) return true;
    }
    return false;
  }
  function enterReady() {
    setSt('ready');
    const r = T.rig();
    // L12: 걸 자리가 트리 어디에도 없으면 쪽지함에 바로 넣는다
    if (r && !anyFreeSpot(r)) send(null, 'full');
  }
  function backToReady() {
    carry = null; setGhost(false);
    const h = handPose();
    setSt('toHand'); moveTo(sheet.n, h.p, h.q, 0.25, enterReady);
    T.setCursor();
  }
  function returnToSheet() {
    carry = null; setGhost(false);
    const n = sheet.n, tg = T.openTarget();
    setSt('returning');
    moveTo(n, tg.p, tg.q, 0.3, () => {
      n.flight = { from: { p: tg.p.clone(), q: tg.q.clone() }, to: tg };
      setSt('unfolding');
    });
  }

  // 끌기: 포인터 아래의 트리 표면에 장식을 걸어 보고, 걸 수 있는지 본다
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  function rayFrom(e) {
    const b = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); ray.far = 20;
  }
  function probe(e) {
    const r = T.rig(); if (!r) return null;
    rayFrom(e); r.surface.sync();
    const hit = ray.intersectObjects([r.hold, ...[...r.notes.values()].map(x => x.root)], true)[0];
    if (!hit) return null;
    const spot = T.treeSpot.fromWorld(hit.point);
    const plan = spot && spot.y >= MIN_HANG_Y && spot.y < TREE_H_MAX ? T.planFromSpot(r.surface, spot, mulberry32(T.hashId(sheet.id))) : null;
    if (!plan) return { spot: null, plan: null, ok: false };
    return { spot, plan, ok: !hit.object.userData.note && T.treeSpot.isFree(spot) };
  }
  function carryTo(e) {
    const n = sheet.n, r = T.rig();
    const over = probe(e);
    carry.over = over;
    if (over?.plan) {
      const rp = r.pivot, plan = over.plan;
      rp.updateWorldMatrix(true, false);
      const local = plan.centreLocal.clone().applyQuaternion(plan.pivotQuat).add(plan.pivotPos);
      n.root.position.copy(rp.localToWorld(local));
      rp.getWorldQuaternion(_q);
      n.root.quaternion.copy(_q.multiply(plan.pivotQuat).multiply(new THREE.Quaternion().setFromEuler(_e.set(-plan.tilt, plan.yaw, 0))));
    } else {
      rayFrom(e);
      n.root.position.copy(ray.ray.origin).addScaledVector(ray.ray.direction, HAND_D);
      n.root.quaternion.copy(camera.quaternion);
    }
    n.orn.setColors({ main: over ? (over.ok ? GREEN : RED) : n.colors.main });
  }

  // ----- 보내기 -----
  async function send(spot, why) {
    if (!sheet) return;
    const my = ++sendId;
    setSt('sending');
    let res;
    try {
      const text = draft.text.trim(), name = nameNow();
      // 고른 크기가 없으면 null(자동). 있으면 글에 맞게 줄어든 값을 보낸다 (서버도 범위로 맞춘다).
      let fontSize = null;
      if (draft.fontSize !== null) {
        measureCtx ||= document.createElement('canvas').getContext('2d');
        const rg = sizeRangeFor(measureCtx, text, FONT_VALUES[draft.font]);
        fontSize = Math.min(rg.max, Math.max(rg.min, draft.fontSize));
      }
      res = await opts.addNote({ id: sheet.id, body: text, tint: draft.tint, font: draft.font, displayName: name || null, fontSize, ornament: draft.kind, ornamentColor: draft.main, spot });
    } catch {
      res = { ok: false, reason: 'network', message: '쪽지를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
    }
    if (ctx.disposed) return;
    const live = my === sendId && !!sheet;
    if (res?.ok) {
      const note = res.note, evicted = res.evictedId ? T.noteById(res.evictedId) : null;
      // 가득 차서 내려간 쪽지는 쪽지함으로: 자리를 비운 채로 합친다
      ctx.mergeTreeNotes([note, ...(evicted ? [{ ...evicted, y: null, angle: null }] : [])], []);
      const hung = Number.isFinite(note.y) && Number.isFinite(note.angle);
      // 판정 안내(경고, 연락처, 검토, 자해 상담 안내)가 있으면 그것을 오래 보여 준다. 쪽지는 쪽지함에 작성자만 보이게 있다.
      if (res.notice?.text) { toast(res.notice.text); ctx.toastTimer = 8; }
      else toast(hung ? '트리에 달았어요' : spot || why === 'full' ? '트리가 가득 차서 쪽지함에 넣었어요' : '쪽지함에 넣었어요');
      draft.text = ''; saveDraft();
      if (live) finishClose();
      return;
    }
    toast(res?.message ?? '쪽지를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    if (!live) return;
    if (res.reason === 'note-spot-taken') backToReady(); // 끌기로 돌아가 다른 자리를 고른다
    else returnToSheet(); // 쓴 글은 그대로 판에 돌아온다
  }

  // ----- 확인창 -----
  function askConfirm(kind, text, yes, no, id, extra = {}) {
    confirmState = { kind, id, ...extra };
    $('tc-text').textContent = text; $('tc-yes').textContent = yes; $('tc-no').textContent = no;
    confirmEl.hidden = false; $('tc-no').focus();
  }
  function closeConfirm(refocus) {
    const was = confirmState; confirmState = null; confirmEl.hidden = true;
    if (refocus && was?.kind === 'discard' && st === 'sheet') ta.focus({ preventScroll: true });
    if (refocus) was?.onClose?.();
  }
  function discard() {
    draft.text = ''; ta.value = ''; saveDraft(); closeSheet();
  }
  function cancel() {
    if (st !== 'sheet') return;
    if (draft.text.trim()) { ta.blur(); askConfirm('discard', '쓰던 쪽지를 버릴까요?', '버리기', '계속 쓰기'); } else closeSheet();
  }
  async function doDelete(id) {
    if (delBusy) return;
    delBusy = true; delBtn.hidden = true;
    let res;
    try { res = await opts.deleteNote(id); } catch { res = { ok: false, reason: 'network', message: '쪽지를 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.' }; }
    delBusy = false;
    if (ctx.disposed) return;
    if (res?.ok || res?.reason === 'note-not-found') { // 이미 없는 쪽지도 트리에서 뺀다
      ctx.mergeTreeNotes([], [id]);
      T.dismissNote(); // 접혀 돌아간 뒤 트리에서 사라진다 (tree.js 의 finishClose 가 맞춘다)
      toast(res.ok ? '쪽지를 지웠어요' : res.message);
    } else toast(res?.message ?? '쪽지를 지우지 못했어요.');
  }

  // ----- 단추와 글상자 -----
  const request = () => {
    if (st !== 'idle' || ctx.mode !== 'tree') return;
    if (T.busy()) { T.dismissNote(); wantOpen = true; return; }
    openSheet();
  };
  on(writeBtn, 'click', () => {
    if (isOff(writeBtn)) return;
    if (!opts.signedIn) { opts.signIn?.(); return; }
    request();
  });
  on(foldBtn, 'click', () => { if (!isOff(foldBtn)) fold(); });
  on(cancelBtn, 'click', () => { if (!isOff(cancelBtn)) cancel(); });
  on(boxBtn, 'click', () => { if (st === 'ready') send(null); });
  on(reopenBtn, 'click', () => { if (st === 'ready') returnToSheet(); });
  on(tintsEl, 'click', e => {
    const b = e.target.closest?.('button[data-key]'); if (!b || b.dataset.key === draft.tint) return;
    draft.tint = b.dataset.key; saveDraft(); syncChips(); tintChanged();
  });
  on(fontsEl, 'click', e => {
    const b = e.target.closest?.('button[data-key]'); if (!b || b.dataset.key === draft.font) return;
    draft.font = b.dataset.key; saveDraft(); syncChips();
    loadNoteFonts([{ font: FONT_VALUES[draft.font], text: draft.text }]).then(() => { if (!ctx.disposed) layoutText(); });
    layoutText();
  });
  on(kindsEl, 'click', e => {
    const b = e.target.closest?.('button[data-key]'); if (!b || b.dataset.key === draft.kind) return;
    draft.kind = b.dataset.key; saveDraft(); syncChips(); tintChanged();
  });
  on(swatchEl, 'click', e => {
    const b = e.target.closest?.('button[data-key]'); if (!b || b.dataset.key === draft.main) return;
    draft.main = b.dataset.key; saveDraft(); syncChips(); tintChanged();
  });
  on(sizeEl, 'input', () => { draft.fontSize = Number(sizeEl.value); saveDraft(); layoutText(); });
  on(sizeEl, 'pointerup', () => { if (st === 'sheet') ta.focus({ preventScroll: true }); }); // 끌고 난 뒤에는 글을 계속 쓴다
  // 이름: 12자(코드포인트)까지. 한글 조합 중에는 값을 건드리지 않는다.
  const nameChanged = () => {
    let v = sigIn.value.replace(/[\r\n\t]+/g, ' ');
    const cps = Array.from(v);
    if (cps.length > NAME_MAX) v = cps.slice(0, NAME_MAX).join('');
    if (v !== sigIn.value) sigIn.value = v;
    draft.name = v; saveDraft(); layoutText();
  };
  on(sigIn, 'input', e => { if (e.isComposing) { draft.name = sigIn.value; layoutText(); return; } nameChanged(); });
  on(sigIn, 'compositionend', nameChanged);
  on(sigIn, 'keydown', e => {
    if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); escape(); }
    else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ta.focus({ preventScroll: true }); }
  });
  on($('tc-yes'), 'click', () => {
    const c = confirmState; closeConfirm(false);
    if (c?.kind === 'discard') discard(); else if (c?.kind === 'delete') doDelete(c.id); else if (c?.kind === 'ask') c.onYes?.();
  });
  on($('tc-no'), 'click', () => closeConfirm(true));
  on(confirmEl, 'click', e => { if (e.target === confirmEl) closeConfirm(true); });
  on(delBtn, 'click', () => {
    const o = T.opened();
    if (isOff(delBtn)) return;
    if (o?.data.mine && !confirmState) askConfirm('delete', '이 쪽지를 지울까요?', '지우기', '취소', o.id);
  });

  function normalize() {
    const v = ta.value, c = clampBody(v, maxChars, maxLines);
    if (c !== v) { const pos = Math.min(ta.selectionStart, c.length); ta.value = c; ta.setSelectionRange(pos, pos); }
    draft.text = c; saveDraft(); paintCount(); layoutText();
    clearTimeout(fontTimer);
    fontTimer = setTimeout(() => { if (!ctx.disposed && c) loadNoteFonts([{ font: FONT_VALUES[draft.font], text: c }]).then(() => { if (!ctx.disposed) layoutText(); }); }, 250);
  }
  on(ta, 'input', e => {
    if (e.isComposing) { draft.text = ta.value; paintCount(); layoutText(); return; } // 조합 중에는 값을 건드리지 않는다
    normalize();
  });
  on(ta, 'compositionend', normalize);
  on(ta, 'scroll', () => { if (textFits && ta.scrollTop) ta.scrollTop = 0; });
  on(ta, 'beforeinput', e => {
    if (e.inputType === 'insertLineBreak' && ta.value.split('\n').length >= maxLines) e.preventDefault();
  });
  on(ta, 'keydown', e => {
    if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); escape(); }
  });
  if (document.fonts) on(document.fonts, 'loadingdone', () => layoutText());

  // ----- 키, 포인터 (tree.js 가 부른다) -----
  /** Esc: 쓰기와 관련된 것이 있으면 그것을 처리하고 true */
  function escape() {
    if (confirmState) { closeConfirm(true); return true; }
    switch (st) {
      case 'idle': return false;
      case 'opening': case 'unfolding': closeSheet(); return true;
      case 'sheet': cancel(); return true;
      case 'ready': returnToSheet(); return true;
      case 'carry': try { canvas.releasePointerCapture?.(carry.id); } catch { /* 이미 놓았다 */ } backToReady(); return true;
      default: return true; // folding, toHand, returning, closing, sending: 끝날 때까지 기다린다
    }
  }
  function overPacket(e) {
    if (!sheet) return false;
    rayFrom(e);
    return ray.intersectObject(sheet.n.root, true).length > 0;
  }
  /** 포인터를 눌렀다: 쓰기가 가졌으면 true (tree.js 는 트리 돌리기와 쪽지 열기를 시작하지 않는다) */
  function down(e) {
    if (st === 'idle') return false;
    if (st !== 'ready') return true;
    if (e.button > 0 || !overPacket(e)) return false; // 빈 곳이면 트리를 돌린다
    carry = { id: e.pointerId, x: e.clientX, y: e.clientY, over: null };
    setSt('carry'); setGhost(true);
    canvas.setPointerCapture?.(e.pointerId); canvas.style.cursor = 'grabbing';
    carryTo(e);
    return true;
  }
  function move(e) {
    if (st === 'carry' && carry?.id === e.pointerId) { carryTo(e); return true; }
    return st !== 'idle' && st !== 'ready';
  }
  function up(e) {
    if (st !== 'carry' || carry?.id !== e.pointerId) return false;
    try { canvas.releasePointerCapture?.(e.pointerId); } catch { /* 이미 놓았다 */ }
    T.setCursor();
    const moved = Math.hypot(e.clientX - carry.x, e.clientY - carry.y) > 6, over = carry.over;
    if (!moved) backToReady(); // 눌렀다 뗀 것뿐이다
    else if (over?.ok) { carry = null; setGhost(false); send(over.spot); }
    else if (over) { toast(over.plan ? '다른 쪽지와 너무 가까워요. 조금 옆에 걸어 주세요.' : '여기에는 걸 수 없어요'); backToReady(); }
    else { carry = null; setGhost(false); send(null); } // 트리 밖: 쪽지함
    return true;
  }
  function cancelPointer(e) {
    if (st === 'carry' && carry?.id === e.pointerId) backToReady();
  }

  // ----- 프레임 -----
  let auto = opts.openWrite && opts.signedIn ? { phase: 'wait', since: performance.now() } : null;
  function endAuto() { auto = null; opts.consumeWrite?.(); }
  function tickAuto() { // 로그인하고 돌아왔다: 트리 모드로 들어가 쓰기 판을 연다 (L6)
    const a = auto;
    if (performance.now() - a.since > 20000) { endAuto(); return; }
    if (a.phase === 'wait') {
      if (!ctx.slotsLive) return; // 방이 아직 다 뜨지 않았다 (가구를 짓기 전 프레임)
      // 트리 자리(slot)는 트리 모델을 읽은 뒤에야 생기므로, 트리가 있는지는 배치(build.items)로 본다
      if (ctx.mode !== 'room' || !ctx.build.items.some(it => it.fn?.kind === 'tree')) { endAuto(); return; }
      if (!T.syncRig()) return; // 모델을 읽는 중
      ctx.enterTree(); a.phase = 'settle';
    } else {
      if (ctx.mode !== 'tree') { endAuto(); return; }
      if (T.rig()?.settled) { endAuto(); openSheet(); }
    }
  }
  const advance = (n, d, min = 0) => { const t = THREE.MathUtils.clamp(n.t + d, min, n.total); applyNote(n, t, n.flight); return n.t; }; // n.t: 시험 토글이 구간을 건너뛰었을 수 있다
  function step(t, dt) {
    if (auto) tickAuto();
    syncButtons();
    if (wantOpen && st === 'idle' && ctx.mode === 'tree' && !T.busy()) { wantOpen = false; openSheet(); }
    syncDelete();
    if (st === 'idle' || !sheet) return;
    const n = sheet.n, sp = reduced ? 8 : 1;
    if (pop) {
      pop.a += dt / POP_SEC;
      const k = Math.min(1, pop.a), e = 1 - (1 - k) * (1 - k);
      n.root.scale.setScalar(POP_FROM + (1 - POP_FROM) * e);
      if (k >= 1) pop = null;
    }
    if (tween) {
      tween.a += dt / tween.dur;
      const e = ease(Math.min(1, tween.a));
      n.root.position.lerpVectors(tween.p0, tween.p1, e);
      n.root.quaternion.slerpQuaternions(tween.q0, tween.q1, e);
      if (tween.a >= 1) { const next = tween.next; tween = null; next(); }
      return;
    }
    if (st === 'opening') { if (advance(n, SPEED.open * sp * dt) >= n.total) showSheetReady(); }
    else if (st === 'unfolding') {
      if (advance(n, SPEED.unfold * sp * dt) >= n.total) { eraseText(n.pk); showSheetReady(); } // 글은 다시 글상자가 보인다
    } else if (st === 'closing') { if (advance(n, -SPEED.close * sp * dt) <= 0) finishClose(); }
    else if (st === 'folding') {
      if (advance(n, -SPEED.fold * sp * dt, N_FLY) <= N_FLY) { // 장식이 닫히고 제자리(화면 가운데)에 있는 순간까지만 접는다
        n.flight = null;
        const h = handPose();
        setSt('toHand'); moveTo(n, h.p, h.q, 0.35, enterReady);
      }
    }
  }
  // 내 쪽지를 열면 아래에 지우기. 펼쳐지는 동안은 흐리게 두고, 자리는 tree-owner.js 의 단추 줄(#tree-tools)이 정한다.
  function syncDelete() {
    const o = T.opened();
    const show = !!o && o.data.mine && !T.pending() && !confirmState && !delBusy && st === 'idle' && !T.otherBusy();
    if (delBtn.hidden === show) delBtn.hidden = !show;
    setDisabled(delBtn, show && !(o.t >= o.total - 0.02));
  }

  function reset() {
    sendId++; wantOpen = false;
    if (carry) { try { canvas.releasePointerCapture?.(carry.id); } catch { /* 이미 놓았다 */ } }
    carry = null; tween = null;
    if (confirmState) { confirmState = null; confirmEl.hidden = true; }
    if (sheet) { setGhost(false); T.disposeNote(sheet.n); sheet = null; }
    ta.blur();
    setSt('idle'); T.setCursor();
  }

  onDispose(() => {
    clearTimeout(fontTimer);
    carry = null; tween = null;
    if (sheet) { T.disposeNote(sheet.n); sheet = null; }
    root.classList.remove('tree-writing');
  });

  return {
    step, down, move, up, cancelPointer, escape, reset,
    active: () => st !== 'idle',
    /** 확인창 (tc-yes 가 누르면 onYes). 다른 확인창이 떠 있으면 false */
    ask(text, yes, no, onYes, onClose) {
      if (confirmState) return false;
      askConfirm('ask', text, yes, no, null, { onYes, onClose });
      return true;
    },
    confirming: () => !!confirmState,
    /** 쪽지 쓰기 판이 보일 때 그 조작 줄 (쪽지를 화면에 맞출 때 아래 끝이 된다). 없으면 null */
    fitEl: () => (showCtl() ? ctl : null),
    // 창이나 머리글, 조작 줄이 바뀌었다: 판을 새 자리로 옮기고 글상자를 다시 맞춘다
    relayout() {
      const n = sheet?.n;
      if (n?.flight && (st === 'opening' || st === 'sheet' || st === 'unfolding')) {
        n.flight.to = T.openTarget(); n.shellDrop = T.shellDrop(); applyNote(n, n.t, n.flight);
      }
      layoutText();
    },
  };
}
