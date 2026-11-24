// 방 주인의 쪽지 도구. 열린 쪽지 아래의 단추 줄(#tree-tools): 답장 쓰기, 숨기기. tree.js 가 setupTree 의 끝에서 setupTreeOwner(ctx, T, W) 로 세운다.
//
// 결정 (DECISIONS.md L10 O4, design/visit-flow.md 방 주인 쪽)
//   - 답장은 공개이고 쪽지 안에 둘째 장으로 접혀 든다. 읽을 때는 팬 종이 오른쪽 옆으로 나와 펼쳐지고 (tree-note.js), 쓸 때도 같은 자리에 선다.
//   - 답장 쓰기 / 답장 고치기를 누르면 열린 쪽지가 답장 종이를 쓰는 모드(replyWriting)로 다시 지어진다: 펼친 빈 종이가 화면 아래에서 올라와 팬 종이 오른쪽에 앉고
//     (팬 종이는 그만큼 왼쪽으로 옮겨 두 종이가 나란히 읽힌다), 그 종이 위에 투명한 <textarea> 가 겹친다. 글씨체와 글자 크기는 아래 조작 줄에서 고른다.
//     종이 색은 늘 같다. 글자 크기와 줄바꿈은 종이에 그릴 때와 같은 fitReply 로 정한다.
//   - 접어서 넣기: 서버(replyNote)가 저장하면 쪽지를 답장이 든 모습으로 끝까지 펼쳐 다시 짓고 접는다: 답장 종이가 접혀 쪽지 안으로 들어간 뒤 쪽지가 접힌다.
//   - 취소: 답장이 없던 쪽지는 종이가 아래로 내려간 뒤 원래 쪽지로 돌아온다. 답장이 있던 쪽지는 바로 원래 모습(옆에 선 답장)으로 돌아온다.
//   - 봉인 중에는 답장이 막힌다 (서버도 막는다). 단추는 흐리게 두고 누르면 이유를 알려 준다.
//   - 숨기기는 확인을 거친다 ("이 쪽지를 숨길까요? 다른 사람에게는 보이지 않아요."). 다시 보이기는 바로 한다. 숨긴 쪽지는 방 주인에게 흐리게 남는다.
//   - 애니메이션이 단추를 막는 동안에는 단추를 숨기지 않고 aria-disabled 로 흐리게 둔다.
//
// 상태: idle revealing writing sending dropping
// opts.replyNote(noteId, { body, font, fontSize }), opts.setHidden(noteId, hidden): 서버 액션의 답 ({ ok, note? } 또는 { ok: false, message }). replyNote 의 note 는 엔진 모양이다.
import * as THREE from 'three';
import { fitReply, replySizeRange, replyTextBox, loadNoteFonts, setReplyRise, REPLY_DIM, REPLY_FONT, SHEET } from './tree-note.js';
import { REPLY_FONT_VALUES } from './tree-ids.js';
import { clampBody, countBody, FONT_LABEL } from './tree-write.js';

const PLACEHOLDER = '​'; // 답장 종이를 펴 두기 위한 빈 글 (글상자가 그 위에 있다)
const SAMPLE = '가나다라마바사아자차';
const DEFAULT_FONT_ID = 'east-sea-dokdo';
const fontIdOf = name => Object.keys(REPLY_FONT_VALUES).find(k => REPLY_FONT_VALUES[k] === name) ?? DEFAULT_FONT_ID;
const RISE_PER_SEC = 2.2; // 종이가 올라오고 내려가는 빠르기 (1초에 2.2 / 1 -> 약 0.45초)

export function setupTreeOwner(ctx, T, W) {
  const { camera, canvas, root, $, on, onDispose, toast, opts } = ctx;
  const isOwner = !!opts.isOwner;
  const maxChars = opts.policy?.noteReplyMaxChars ?? 200;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bar = $('tree-tools'), replyBtn = $('tree-reply'), hideBtn = $('tree-hide');
  // 0013 남의 쪽지: 신고(방 주인·관리자), 차단(방 주인·관리자는 쓰기 막기, 다른 사람은 나에게서 가리기)
  const reportBtn = $('tree-report'), blockBtn = $('tree-block');
  const canModerate = !!opts.data?.canModerate;
  let guardBusy = false;
  const sheetEl = $('tree-rsheet'), ta = $('tr-text'), ctl = $('tr-ctl'), countEl = $('tr-count');
  const fontsEl = $('tr-fonts'), sizeEl = $('tr-size');
  const foldBtn = $('tr-fold'), cancelBtn = $('tr-cancel');
  const setDisabled = (el, off) => { if (el.getAttribute('aria-disabled') !== String(off)) { if (off) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled'); } };
  const isOff = el => el.getAttribute('aria-disabled') === 'true';

  let st = 'idle';
  let cur = null; // { id, orig, font, size } orig: 답장 쓰기를 시작할 때의 쪽지 (엔진 모양). font: 글씨체 id. size: 글자 크기 (null 이면 자동)
  let rise = 0;   // 답장 종이가 올라온 정도 0..1
  let hideBusy = false, measureCtx = null, fontTimer = 0, textFits = true;
  let sizeRange = { min: 62, max: 200 };

  const showCtl = () => st === 'revealing' || st === 'writing' || st === 'sending';
  function ui() {
    sheetEl.hidden = st === 'idle';
    ta.hidden = st !== 'writing' && st !== 'sending';
    ta.readOnly = st === 'sending';
    ctl.hidden = !showCtl();
    ctl.inert = st !== 'writing';
    root.classList.toggle('tree-replying', showCtl());
    setDisabled(foldBtn, st !== 'writing');
    setDisabled(cancelBtn, st !== 'writing' && st !== 'revealing');
  }
  function setSt(next) { st = next; ui(); }
  function paintCount() {
    const { chars } = countBody(ta.value);
    countEl.textContent = `${chars}/${maxChars}자`;
    countEl.classList.toggle('full', chars >= maxChars);
  }

  // ----- 글씨체와 글자 크기 -----
  const fontName = () => REPLY_FONT_VALUES[cur?.font ?? DEFAULT_FONT_ID] ?? REPLY_FONT;
  function ensureChips() {
    if (fontsEl.childElementCount) return;
    for (const key of Object.keys(REPLY_FONT_VALUES)) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.key = key;
      const label = FONT_LABEL[key] ?? key;
      b.style.fontFamily = `"${REPLY_FONT_VALUES[key]}", system-ui, sans-serif`; b.textContent = label; b.title = label;
      fontsEl.append(b);
    }
    loadNoteFonts(Object.keys(REPLY_FONT_VALUES).map(k => ({ font: REPLY_FONT_VALUES[k], text: FONT_LABEL[k] ?? k })));
  }
  function syncChips() { for (const b of fontsEl.children) b.setAttribute('aria-pressed', String(b.dataset.key === cur?.font)); }
  // 글자 크기의 범위는 [하한, 지금 글이 종이에 드는 가장 큰 크기]다. 고른 값(cur.size)은 늘 그 안으로 맞춘다. null 이면 자동 맞춤(가장 큰 크기).
  const sizeNow = () => Math.min(sizeRange.max, Math.max(sizeRange.min, cur?.size ?? sizeRange.max));
  function fitNow() {
    measureCtx ||= document.createElement('canvas').getContext('2d');
    const font = fontName(), text = ta.value || SAMPLE;
    sizeRange = replySizeRange(measureCtx, text, font);
    return fitReply(measureCtx, text, font, cur?.size == null ? null : sizeNow());
  }
  function paintSize() {
    const { min, max } = sizeRange, v = sizeNow();
    sizeEl.min = String(min); sizeEl.max = String(max); sizeEl.value = String(v);
    sizeEl.disabled = max <= min;
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
    const fit = fitNow();
    paintSize();
    // 위쪽 여백: drawBlock 이 남는 높이의 0.4 만큼 글을 내려 그리므로 글상자도 같이 내린다 (접은 뒤의 글 자리와 맞는다).
    const total = fit.lines.length * fit.lh, slack = Math.max(0, (b.boxH - total) * 0.4);
    const s = ta.style;
    s.boxSizing = 'border-box';
    s.left = `${tl.x}px`; s.top = `${tl.y}px`; s.transformOrigin = '0 0';
    s.transform = `rotate(${ang}rad) translate(${b.x * k}px, ${b.top * k}px)`;
    s.width = `${b.boxW * k * 1.03}px`; s.height = `${b.boxH * k}px`; s.paddingTop = `${slack * k}px`;
    s.fontFamily = `"${fontName()}", system-ui, sans-serif`; s.fontSize = `${fit.px * k}px`; s.lineHeight = `${fit.lh * k}px`;
    // 줄여 맞춘 글이 상자에 들면 글상자는 위로 밀리지 않는다 (끝에서 입력할 때 브라우저가 캐럿을 따라 scrollTop 을 올려 첫 줄이 잘리는 일을 막는다)
    textFits = total <= b.boxH + 0.5 && !String(fit.lines[fit.lines.length - 1]).endsWith('…');
    if (textFits && ta.scrollTop) ta.scrollTop = 0;
  }

  // 종이가 올라오기 시작하는 높이: 쪽지 종이 좌표에서 화면 아래 끝보다 낮게 (왼쪽 위 모서리의 y)
  function startYNow() {
    const v = T.view(), half = v.dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return SHEET.H / 2 - half - v.shiftWorld - 0.02;
  }
  function paintRise() {
    const o = T.opened();
    if (o?.pk.reply?.writing) setReplyRise(o.pk, rise, startYNow());
  }

  // ----- 답장 쓰기 -----
  const settled = o => !!o && !T.pending() && o.t >= o.total - 0.02;
  function startReply() {
    const o = T.opened();
    if (!isOwner || st !== 'idle' || !settled(o) || W.active() || W.confirming() || hideBusy) return;
    if (T.sealedNow()) { toast('공개일 이후에 답장할 수 있어요'); return; }
    const orig = T.noteById(o.id);
    if (!orig) return;
    cur = { id: o.id, orig, font: fontIdOf(orig.replyFont), size: Number.isFinite(orig.replySize) ? orig.replySize : null };
    // 답장 종이를 쓰는 모드로 다시 짓는다: 이미 답장이 있으면 그 글은 글상자가 대신 보여 준다
    const blank = { ...orig, reply: PLACEHOLDER, replyWriting: true };
    if (!T.reviseOpened(blank, blank)) { cur = null; return; }
    rise = 0; paintRise();
    ensureChips(); syncChips();
    ta.value = orig.reply ?? ''; paintCount();
    fitNow(); paintSize();
    loadNoteFonts([{ font: fontName(), text: ta.value + SAMPLE }]).then(() => { if (!ctx.disposed) layoutText(); }); // 글상자의 글자 크기를 재기 전에 글씨체를 부른다
    setSt('revealing');
  }
  function showWriting() {
    setSt('writing');
    layoutText(); paintCount();
    ta.focus({ preventScroll: true });
    const end = ta.value.length; ta.setSelectionRange(end, end);
  }
  // 쓰던 것을 놓고 원래 쪽지로 돌아온다 (같은 쪽지가 아직 열려 있을 때만 다시 짓는다)
  function finishLeave(restore) {
    const c = cur; cur = null; rise = 0;
    ta.blur();
    setSt('idle');
    if (restore && c && T.opened()?.id === c.id) T.reviseOpened(c.orig, c.orig, true);
  }
  function leave(restore) {
    const c = cur;
    ta.blur();
    // 답장이 없던 쪽지: 종이가 아래로 내려간 뒤 돌아온다. 답장이 있던 쪽지는 같은 자리에 옛 답장이 다시 그려질 뿐이라 바로 돌아온다.
    if (restore && c && !c.orig.reply && !reduced && T.opened()?.id === c.id) { setSt('dropping'); return; }
    finishLeave(restore);
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
    // 고른 크기가 없으면 null(자동). 있으면 글에 맞게 줄어든 값을 보낸다 (서버도 범위로 맞춘다).
    let fontSize = null;
    if (cur.size != null) {
      measureCtx ||= document.createElement('canvas').getContext('2d');
      const rg = replySizeRange(measureCtx, body, fontName());
      fontSize = Math.min(rg.max, Math.max(rg.min, cur.size));
    }
    setSt('sending'); ta.blur();
    let res;
    try { res = await opts.replyNote(id, { body, font: cur.font, fontSize }); }
    catch { res = { ok: false, message: '답장을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.' }; }
    if (ctx.disposed) return;
    if (res?.ok && res.note) {
      ctx.mergeTreeNotes([res.note], []);
      const c = cur; cur = null; rise = 0;
      setSt('idle');
      // 답장이 든 모습으로 끝까지 펼쳐 다시 짓고 접는다: 답장 종이가 접혀 쪽지 안으로 들어가고 쪽지가 접힌다
      if (c && T.opened()?.id === id) { T.reviseOpened(res.note, res.note, true); T.dismissNote(); }
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
  async function guard(run, okText) {
    guardBusy = true;
    let res;
    try { res = await run(); } catch { res = { ok: false, error: '처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }; }
    guardBusy = false;
    if (ctx.disposed) return null;
    toast(res?.ok ? okText : res?.error ?? '처리하지 못했어요.');
    return res?.ok ? res : null;
  }
  // 내린 쪽지는 자리를 지키고 삭제 문구로 바뀐다 (서버와 같은 모양. 다음 폴링이 같은 값을 다시 준다)
  const asRemoved = d => ({ ...d, screen: 'removed', msg: opts.removedText ?? '', name: null, reply: undefined, replyFont: undefined, replySize: undefined });
  on(reportBtn, 'click', () => {
    const o = T.opened();
    if (isOff(reportBtn) || !o || !opts.reportPost) return;
    const id = o.id;
    W.ask('이 쪽지를 신고할까요? 쪽지가 내려가고 쓴 사람에게 경고가 1회 쌓여요.', '신고', '취소', async () => {
      if (!(await guard(() => opts.reportPost('note', id), '신고했어요. 쪽지를 내렸어요'))) return;
      const d = T.noteById(id);
      if (d) { const next = asRemoved(d); ctx.mergeTreeNotes([next], []); if (T.opened()?.id === id && st === 'idle') T.reviseOpened(next, next); }
    });
  });
  on(blockBtn, 'click', () => {
    const o = T.opened();
    if (isOff(blockBtn) || !o) return;
    const id = o.id;
    if (canModerate) {
      W.ask('이 사람이 글을 쓸 수 없게 차단할까요? 이 사람이 쓴 글도 모두 내려가요.', '차단', '취소', async () => {
        await guard(() => opts.blockAuthor('note', id), '차단했어요');
      });
      return;
    }
    W.ask('이 사람의 쪽지와 방명록, 방 안 모습을 나에게서 가릴까요? 마이페이지에서 다시 풀 수 있어요.', '차단', '취소', async () => {
      const res = await guard(() => opts.hidePerson('note', id), '차단했어요. 이제 보이지 않아요');
      if (!res) return;
      T.dismissNote();
      ctx.mergeTreeNotes([], res.hiddenNoteIds ?? []);
      ctx.hideGuestbookRows?.(res.hiddenGuestbookIds ?? []);
      opts.refreshBlocked?.();
    });
  });
  on(replyBtn, 'click', () => {
    if (!isOff(replyBtn)) { startReply(); return; }
    // 흐린 단추를 눌러도 이유는 알려 준다 (펼쳐지는 중에는 곧 켜지니 말하지 않는다)
    if (settled(T.opened()) && T.sealedNow()) toast('공개일 이후에 답장할 수 있어요');
  });
  on(foldBtn, 'click', () => { if (!isOff(foldBtn)) save(); });
  on(cancelBtn, 'click', () => { if (!isOff(cancelBtn)) cancel(); });
  on(fontsEl, 'click', e => {
    const b = e.target.closest?.('button[data-key]');
    if (!cur || st !== 'writing' || !b || b.dataset.key === cur.font) return;
    cur.font = b.dataset.key; syncChips();
    loadNoteFonts([{ font: fontName(), text: ta.value + SAMPLE }]).then(() => { if (!ctx.disposed) layoutText(); });
    layoutText();
    ta.focus({ preventScroll: true });
  });
  on(sizeEl, 'input', () => { if (!cur) return; cur.size = Number(sizeEl.value); layoutText(); });
  on(sizeEl, 'pointerup', () => { if (st === 'writing') ta.focus({ preventScroll: true }); }); // 끌고 난 뒤에는 글을 계속 쓴다

  // ----- 글상자 -----
  function normalize() {
    const v = ta.value, c = clampBody(v, maxChars, Infinity);
    if (c !== v) { const pos = Math.min(ta.selectionStart, c.length); ta.value = c; ta.setSelectionRange(pos, pos); }
    paintCount(); layoutText();
    clearTimeout(fontTimer);
    fontTimer = setTimeout(() => { if (!ctx.disposed && c) loadNoteFonts([{ font: fontName(), text: c }]).then(() => { if (!ctx.disposed) layoutText(); }); }, 250);
  }
  on(ta, 'input', e => {
    if (e.isComposing) { paintCount(); layoutText(); return; } // 조합 중에는 값을 건드리지 않는다
    normalize();
  });
  on(ta, 'compositionend', normalize);
  on(ta, 'scroll', () => { if (textFits && ta.scrollTop) ta.scrollTop = 0; });
  on(ta, 'keydown', e => {
    if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); if (W.confirming()) return; escape(); }
  });
  if (document.fonts) on(document.fonts, 'loadingdone', () => layoutText());

  // ----- tree.js 가 부른다 -----
  function escape() {
    switch (st) {
      case 'idle': return false;
      case 'revealing': case 'writing': cancel(); return true;
      default: return true; // sending, dropping: 끝날 때까지 기다린다
    }
  }
  // 프레임마다: 답장 종이를 올리고 내리고, 다 올라오면 글상자를 열고, 단추 줄의 보임과 흐림을 맞춘다. W.step 뒤에 부른다 (W 가 지우기 단추를 먼저 맞춘다).
  function step(t, dt) {
    let o = T.opened();
    if (st !== 'idle' && (!o || o.id !== cur?.id)) { finishLeave(false); return; } // 쪽지가 닫혔거나 다른 쪽지가 열렸다
    if (st === 'revealing' || st === 'dropping') {
      rise = THREE.MathUtils.clamp(rise + (st === 'revealing' ? 1 : -1) * (reduced ? 10 : RISE_PER_SEC) * dt, 0, 1);
      paintRise();
      if (st === 'revealing' && rise >= 1) showWriting();
      else if (st === 'dropping' && rise <= 0) { finishLeave(true); o = T.opened(); }
    }
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
    // 남의 쪽지 (로그인한 사람만). 봉인돼 글이 안 보이는 쪽지에는 신고를 내지 않는다.
    const other = !!o && !o.data.mine && !!opts.signedIn && !T.pending() && st === 'idle' && !W.active() && !W.confirming();
    const showReport = other && canModerate && !o.data.sealed && o.data.screen !== 'removed' && !!opts.reportPost;
    const showBlock = other && (canModerate ? !!opts.blockAuthor : !!opts.hidePerson);
    if (reportBtn.hidden === showReport) reportBtn.hidden = !showReport;
    if (blockBtn.hidden === showBlock) blockBtn.hidden = !showBlock;
    if (showReport || showBlock) {
      const off = !settled(o) || guardBusy;
      setDisabled(reportBtn, off); setDisabled(blockBtn, off);
    }
    const anyShown = [...bar.children].some(b => !b.hidden);
    if (bar.hidden === anyShown) bar.hidden = !anyShown;
    if (anyShown) { const top = `${T.view().delTop}px`; if (bar.style.top !== top) bar.style.top = top; }
  }
  function reset() {
    cur = null; hideBusy = false; rise = 0;
    ta.blur();
    if (st !== 'idle') setSt('idle');
  }
  onDispose(() => { clearTimeout(fontTimer); cur = null; root.classList.remove('tree-replying'); });
  ui();

  return {
    step, reset, escape,
    active: () => st !== 'idle',
    /** 포인터를 눌렀다: 답장 중이면 true (tree.js 는 트리 돌리기와 쪽지 접기를 시작하지 않는다) */
    down: () => st !== 'idle',
    relayout: layoutText,
    /** 답장 판의 조작 줄이 보일 때 그 줄 (쪽지를 화면에 맞출 때 아래 끝이 된다). 없으면 null */
    fitEl: () => (showCtl() ? ctl : null),
  };
}
