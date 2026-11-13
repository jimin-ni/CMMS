// 날짜, 유튜브 주소, 조회수 같은 값을 글자로 바꾸는 순수 함수.

// Fan pieces (landed ones, from the database) lie on the heap from the start; one that lands while the visitor is here drops onto it (poll below). There is no reception box any more.
// TODAY/TOTAL, 다녀감 and the guestbook list are database values too, refreshed by the poll below.
export const seoulDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
export const fmtDay = iso => { const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; const p = Object.fromEntries(seoulDay.formatToParts(d).map(x => [x.type, x.value])); return `${p.year}.${p.month}.${p.day}`; };

export const ytUrl = r => r.wide ? `https://www.youtube.com/watch?v=${r.id}` : `https://www.youtube.com/shorts/${r.id}`;
export const ytShort = r => r.wide ? `youtube.com/watch?v=${r.id}` : `youtube.com/shorts/${r.id}`;

export const ksDay = d => (typeof d === 'string' ? d.replace(/-/g, '.') : '');

export const viewsNum = v => { const n = parseFloat(v); return v?.includes('만') ? n * 1e4 : v?.includes('천') ? n * 1e3 : n || 0; };
