// 쪽지 트리: DB 의 쪽지 id 를 엔진 값으로 바꾸는 곳. 이 파일이 id -> 화면 값 표의 엔진 쪽 한 벌이다.
// 서버의 policy.ts 의 NOTE_TINT_IDS, NOTE_FONT_IDS, NOTE_REPLY_FONT_IDS 와 키와 값이 같아야 한다 (값을 더하려면 두 곳을 같이 고친다).
// 쪽지 서버 모양(notes-repo.ts 의 HeapNote, 날짜는 ISO 문자열)을 tree.js 가 읽는 모양으로 바꾸는 toEngineNote 도 여기 하나다:
// 첫 화면(heap-room.tsx)과 폴링(live.js)이 같은 함수를 쓴다.
//
// 이 파일은 three 를 읽지 않는다.

export const TINT_VALUES = {
  ivory: '#f4e8c8',
  cream: '#f7dca0',
  linen: '#e6dcc6',
  sand: '#dcc19a',
  snow: '#f6f6f2',
};
export const FONT_VALUES = {
  'nanum-pen': 'Nanum Pen Script',
  gaegu: 'Gaegu',
  'hi-melody': 'Hi Melody',
  'gamja-flower': 'Gamja Flower',
  'cute-font': 'Cute Font',
  'single-day': 'Single Day',
  'yeon-sung': 'Yeon Sung',
};
// 방 주인의 답장 글꼴: 동해독도(기본, 첫째)와 쪽지 글꼴 전부. policy.ts 의 NOTE_REPLY_FONT_IDS 와 같다.
export const REPLY_FONT_VALUES = { 'east-sea-dokdo': 'East Sea Dokdo', ...FONT_VALUES };

const seoulDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const seoulMonthDay = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });

/** ISO 시각 -> 한국 날짜 "2026-12-01" (목업 더미와 같은 꼴). 읽을 수 없으면 '' */
export function noteDate(iso) {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? '' : seoulDay.format(t);
}
/** ISO 시각 -> "12월 25일" (한국 시간). 읽을 수 없으면 '' */
export function revealDay(iso) {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? '' : seoulMonthDay.format(t);
}

/** 서버 쪽지 -> 엔진 쪽지. 모르는 tint, font id 는 비워 두어 tree-note.js 가 글에서 정하게 한다. 봉인된 쪽지는 글이 없다 (msg ''). */
export function toEngineNote(n) {
  const out = {
    id: n.id,
    name: typeof n.name === 'string' ? n.name : null,
    date: noteDate(n.createdAt),
    msg: n.sealed || typeof n.body !== 'string' ? '' : n.body,
    createdAt: n.createdAt,
    y: Number.isFinite(n.y) ? n.y : null,
    angle: Number.isFinite(n.angle) ? n.angle : null,
    sealed: !!n.sealed,
    mine: !!n.mine,
    hidden: !!n.hidden,
    unread: !!n.unread,
  };
  if (Object.hasOwn(TINT_VALUES, n.tint)) out.tint = TINT_VALUES[n.tint];
  if (Object.hasOwn(FONT_VALUES, n.font)) out.font = FONT_VALUES[n.font];
  if (n.reply && typeof n.reply.body === 'string') {
    out.reply = n.reply.body;
    // 모르는 답장 글꼴은 비워 두어 tree-note.js 의 기본(동해독도)을 쓴다
    if (Object.hasOwn(REPLY_FONT_VALUES, n.reply.font)) out.replyFont = REPLY_FONT_VALUES[n.reply.font];
    if (Number.isFinite(n.reply.fontSize)) out.replySize = n.reply.fontSize;
  }
  // 0009: 글자 크기, 장식 종류, 장식 주색. null 이면 비워 두어 예전처럼 자동 맞춤과 id 해시가 정한다.
  if (Number.isFinite(n.fontSize)) out.fontSize = n.fontSize;
  if (typeof n.ornament === 'string') out.kind = n.ornament;
  if (typeof n.ornamentColor === 'string') out.main = n.ornamentColor;
  return out;
}
