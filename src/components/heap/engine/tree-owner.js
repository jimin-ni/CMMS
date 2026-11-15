// 방 주인의 쪽지 도구. 열린 쪽지 아래의 단추 줄(#tree-tools): 답장 쓰기, 숨기기. tree.js 가 setupTree 의 끝에서 setupTreeOwner(ctx, T, W) 로 세운다.
//
// 결정 (DECISIONS.md L10, design/visit-flow.md 방 주인 쪽)
//   - 답장은 공개이고 쪽지 안에 둘째 장으로 접혀 든다. 답장 쓰기를 누르면 열린 쪽지가 답장 종이를 편 채 다시 지어지고,
//     그 종이(tree-note.js 의 답장 종이, 글상자는 replyTextBox) 위에 투명한 <textarea> 가 겹친다. 글자 크기와 줄바꿈은 종이에 그릴 때와 같은 fitReply 로 정한다.
//   - 접어서 넣기: 서버(replyNote)가 저장하면 쪽지를 답장이 든 모습으로 다시 짓고 접어 돌려보낸다.
//   - 봉인 중에는 답장이 막힌다 (서버도 막는다). 단추는 흐리게 두고 누르면 이유를 알려 준다.
//   - 숨기기는 확인을 거친다 ("이 쪽지를 숨길까요? 다른 사람에게는 보이지 않아요."). 다시 보이기는 바로 한다. 숨긴 쪽지는 방 주인에게 흐리게 남는다.
//   - 애니메이션이 단추를 막는 동안에는 단추를 숨기지 않고 aria-disabled 로 흐리게 둔다.
//
// 상태: idle revealing writing sending
// opts.replyNote(noteId, { body, font }), opts.setHidden(noteId, hidden): 서버 액션의 답 ({ ok, note? } 또는 { ok: false, message }). replyNote 의 note 는 엔진 모양이다.
import * as THREE from 'three';
import { fitReply, replyTextBox, loadNoteFonts, REPLY_DIM, REPLY_FONT } from './tree-note.js';
import { REPLY_FONT_VALUES } from './tree-ids.js';
import { clampBody, countBody } from './tree-write.js';

const PLACEHOLDER = '​'; // 답장 종이를 펴 두기 위한 빈 글 (글상자가 그 위에 있다)
const SAMPLE = '가나다라마바사아자차';
const REPLY_FONT_ID = Object.keys(REPLY_FONT_VALUES)[0];

export function setupTreeOwner(ctx, T, W) {
  const { camera, canvas, root, $, on, onDispose, toast, opts } = ctx;
  const isOwner = !!opts.isOwner;
  const maxChars = opts.policy?.noteReplyMaxChars ?? 200;

  const bar = $('tree-tools'), replyBtn = $('tree-reply'), hideBtn = $('tree-hide');
  const sheetEl = $('tree-rsheet'), ta = $('tr-text'), ctl = $('tr-ctl'), countEl = $('tr-count');
  const foldBtn = $('tr-fold'), cancelBtn = $('tr-cancel');
  const setDisabled = (el, off) => { if (el.getAttribute('aria-disabled') !== String(off)) { if (off) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled'); } };
  const isOff = el => el.getAttribute('aria-disabled') === 'true';

  let st = 'idle';
  let cur = null; // { id, orig } orig: 답장 쓰기를 시작할 때의 쪽지 (엔진 모양)
  let hideBusy = false, measureCtx = null, fontTimer = 0;

  function ui() {
    sheetEl.hidden = st === 'idle';
    ta.hidden = st !== 'writing' && st !== 'sending';
    ta.readOnly = st === 'sending';
    ctl.hidden = st === 'idle';
    setDisabled(foldBtn, st !== 'writing');
    setDisabled(cancelBtn, st !== 'writing' && st !== 'revealing');
  }
  function setSt(next) { st = next; ui(); }
  function paintCount() {
    const { chars } = countBody(ta.value);
    countEl.textContent = `${chars}/${maxChars}자`;
    countEl.classList.toggle('full', chars >= maxChars);
  }

  // ----- 답장 종이 위의 글상자 -----
  // 펼친 답장 종이(아코디언)는 평평하다: 왼쪽 위가 원점이고 x 가 오른쪽, y 가 아래(음수)다. 네 귀퉁이를 화면으로 옮겨 글상자의 자리, 기울기, 글자 크기를 정한다.
  const _v = new THREE.Vector3();
  function layoutText() {
    if (st !== 'writing' && st !== 'sending') return;
    const o = T.opened(), sheet = o?.pk.reply?.sheet;
    if (!sheet) return;
    camera.updateMatrixWorld(true);
    o.root.updateMatrixWorld(true);
    const m = sheet.root.matrixWorld, cr = canvas.getBoundingClientRect(), rr = root.getBoundingClientRect();
    const px = (x, y) => {
      _v.set(x, y, 0).applyMatrix4(m).project(camera);
      return { x: cr.left - rr.left + (_v.x * 0.5 + 0.5) * cr.width, y: cr.top - rr.top + (-_v.y * 0.5 + 0.5) * cr.height };
    };
    const tl = px(0, 0), tr = px(REPLY_DIM.W, 0);
    const b = replyTextBox(), k = Math.hypot(tr.x - tl.x, tr.y - tl.y) / b.cw, ang = Math.atan2(tr.y - tl.y, tr.x - tl.x);
    measureCtx ||= document.createElement('canvas').getContext('2d');
    const fit = fitReply(measureCtx, ta.value || SAMPLE);
    const s = ta.style;
    s.left = `${tl.x}px`; s.top = `${tl.y}px`; s.transformOrigin = '0 0';
    s.transform = `rotate(${ang}rad) translate(${b.x * k}px, ${b.top * k}px)`;
    s.width = `${b.boxW * k}px`; s.height = `${b.boxH * k}px`;
    s.fontFamily = `"${REPLY_FONT_VALUES[REPLY_FONT_ID]}", system-ui, sans-serif`; s.fontSize = `${fit.px * k}px`; s.lineHeight = `${fit.lh * k}px`;
  }

  // ----- 답장 쓰기 -----
  const settled = o => !!o && !T.pending() && o.t >= o.total - 0.02;
  function startReply() {
    const o = T.opened();
    if (!isOwner || st !== 'idle' || !settled(o) || W.active() || W.confirming() || hideBusy) return;
    if (T.sealedNow()) { toast('공개일 이후에 답장할 수 있어요'); return; }
    const orig = T.noteById(o.id);
    if (!orig) return;
    cur = { id: o.id, orig };
    // 답장 종이를 편 채로 다시 짓는다: 이미 답장이 있으면 그 글은 글상자가 대신 보여 준다
    const blank = { ...orig, reply: PLACEHOLDER };
    if (!T.reviseOpened(blank, blank)) { cur = null; return; }
    ta.value = orig.reply ?? ''; paintCount();
    loadNoteFonts([{ font: REPLY_FONT, text: ta.value + SAMPLE }]).then(() => { if (!ctx.disposed) layoutText(); }); // 글상자의 글자 크기를 재기 전에 글씨체를 부른다
    setSt('revealing');
  }
  function showWriting() {
    setSt('writing');
    layoutText(); paintCount();
    ta.focus({ preventScroll: true });
    const end = ta.value.length; ta.setSelectionRange(end, end);
  }
  // 쓰던 것을 놓고 원래 쪽지로 돌아온다 (같은 쪽지가 아직 열려 있을 때만 다시 짓는다)
  function leave(restore) {
    const c = cur; cur = null;
    ta.blur();
    setSt('idle');
    if (restore && c && T.opened()?.id === c.id) T.reviseOpened(c.orig, c.orig);
  }
  function cancel() {
    if (st === 'revealing') { leave(true); return; }
    if (st !== 'writing') return;
    const changed = ta.value.trim() !== (cur.orig.reply ?? '').trim();
    if (!changed) { leave(true); return; }
    ta.blur();
    W.ask('쓰던 답장을 버릴까요?', '버리기', '계속 쓰기', () => leave(true), () => { if (st === 'writing') ta.focus({ preventScroll: true }); });
  }
  async function save() {
    if (st !== 'writing') return;
    const body = ta.value.trim();
    if (!body) { toast('답장을 써 주세요'); ta.focus(); return; }
    const id = cur.id;
    setSt('sending'); ta.blur();
    let res;
    try { res = await opts.replyNote(id, { body, font: REPLY_FONT_ID }); }
    catch { res = { ok: false, message: '답장을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.' }; }
    if (ctx.disposed) return;
    if (res?.ok && res.note) {
      ctx.mergeTreeNotes([res.note], []);
      const c = cur; cur = null;
      setSt('idle');
      // 답장이 든 모습으로 다시 짓고 접어 돌려보낸다
      if (c && T.opened()?.id === id) { T.reviseOpened(res.note, res.note); T.dismissNote(); }
      toast('답장을 달았어요');
      return;
    }
    toast(res?.message ?? '답장을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    if (st === 'sending') { setSt('writing'); ta.focus({ preventScroll: true }); }
  }

  // ----- 숨기기 -----
  async function doHide(id, hide) {
    if (hideBusy) return;
    hideBusy = true;
    let res;
    try { res = await opts.setHidden(id, hide); }
    catch { res = { ok: false, message: '지금은 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.' }; }
    hideBusy = false;
    if (ctx.disposed) return;
    if (!res?.ok) { toast(res?.message ?? '지금은 바꾸지 못했어요.'); return; }
    const was = T.noteById(id);
    if (was) {
      const next = { ...was, hidden: hide };
      ctx.mergeTreeNotes([next], []);
      // 열려 있으면 같은 자리에서 숨김 딱지를 달거나 뗀다
      if (T.opened()?.id === id && st === 'idle') T.reviseOpened(next, next);
    }
    toast(hide ? '쪽지를 숨겼어요' : '쪽지를 다시 보이게 했어요');
  }
  on(hideBtn, 'click', () => {
    if (isOff(hideBtn)) return;
    const o = T.opened();
    if (!isOwner || !o || st !== 'idle') return;
    if (o.data.hidden) { doHide(o.id, false); return; }
    const id = o.id;
    W.ask('이 쪽지를 숨길까요? 다른 사람에게는 보이지 않아요.', '숨기기', '취소', () => doHide(id, true));
  });
  on(replyBtn, 'click', () => {
    if (!isOff(replyBtn)) { startReply(); return; }
    // 흐린 단추를 눌러도 이유는 알려 준다 (펼쳐지는 중에는 곧 켜지니 말하지 않는다)
    if (settled(T.opened()) && T.sealedNow()) toast('공개일 이후에 답장할 수 있어요');
  });
  on(foldBtn, 'click', () => { if (!isOff(foldBtn)) save(); });
  on(cancelBtn, 'click', () => { if (!isOff(cancelBtn)) cancel(); });

  // ----- 글상자 -----
  function normalize() {
    const v = ta.value, c = clampBody(v, maxChars, Infinity);
    if (c !== v) { const pos = Math.min(ta.selectionStart, c.length); ta.value = c; ta.setSelectionRange(pos, pos); }
    paintCount(); layoutText();
    clearTimeout(fontTimer);
    fontTimer = setTimeout(() => { if (!ctx.disposed && c) loadNoteFonts([{ font: REPLY_FONT, text: c }]).then(() => { if (!ctx.disposed) layoutText(); }); }, 250);
  }
  on(ta, 'input', e => {
    if (e.isComposing) { paintCount(); layoutText(); return; } // 조합 중에는 값을 건드리지 않는다
    normalize();
  });
  on(ta, 'compositionend', normalize);
  on(ta, 'keydown', e => {
    if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); if (W.confirming()) return; escape(); }
  });
  if (document.fonts) on(document.fonts, 'loadingdone', () => layoutText());

  // ----- tree.js 가 부른다 -----
  function escape() {
    switch (st) {
      case 'idle': return false;
      case 'revealing': case 'writing': cancel(); return true;
      default: return true; // sending: 끝날 때까지 기다린다
    }
  }
  // 프레임마다: 답장 종이가 다 펴지면 글상자를 열고, 단추 줄의 보임과 흐림을 맞춘다. W.step 뒤에 부른다 (W 가 지우기 단추를 먼저 맞춘다).
  function step() {
    const o = T.opened();
    if (st !== 'idle' && (!o || o.id !== cur?.id)) { leave(false); return; } // 쪽지가 닫혔거나 다른 쪽지가 열렸다
    if (st === 'revealing' && o.t >= o.total - 0.02) showWriting();
    const showTools = isOwner && !!o && !T.pending() && st === 'idle' && !W.active() && !W.confirming();
    const ok = showTools && settled(o) && !hideBusy;
    if (replyBtn.hidden === showTools) replyBtn.hidden = !showTools;
    if (hideBtn.hidden === showTools) hideBtn.hidden = !showTools;
    if (showTools) {
      const label = o.data.reply ? '답장 고치기' : '답장 쓰기';
      if (replyBtn.textContent !== label) replyBtn.textContent = label;
      const hl = o.data.hidden ? '다시 보이기' : '숨기기';
      if (hideBtn.textContent !== hl) hideBtn.textContent = hl;
      const sealed = T.sealedNow();
      setDisabled(replyBtn, !ok || sealed);
      replyBtn.title = sealed ? '공개일 이후에 답장할 수 있어요' : '';
      setDisabled(hideBtn, !ok);
    }
    const anyShown = [...bar.children].some(b => !b.hidden);
    if (bar.hidden === anyShown) bar.hidden = !anyShown;
    if (anyShown) { const top = `${T.view().delTop}px`; if (bar.style.top !== top) bar.style.top = top; }
    if (st !== 'idle') { const top = `${T.view().delTop}px`; if (ctl.style.top !== top) ctl.style.top = top; }
  }
  function reset() {
    cur = null; hideBusy = false;
    ta.blur();
    if (st !== 'idle') setSt('idle');
  }
  onDispose(() => { clearTimeout(fontTimer); cur = null; });
  ui();

  return {
    step, reset, escape,
    active: () => st !== 'idle',
    /** 포인터를 눌렀다: 답장 중이면 true (tree.js 는 트리 돌리기와 쪽지 접기를 시작하지 않는다) */
    down: () => st !== 'idle',
    relayout: layoutText,
  };
}
