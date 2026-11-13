// 날짜, 유튜브 주소, 조회수 같은 값을 글자로 바꾸는 순수 함수.

// 한국 시간 날짜: seoulDay.format(date) 는 "2026-11-12", fmtDay(iso) 는 "2026.11.12" (읽을 수 없으면 '')
export const seoulDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
export const fmtDay = iso => { const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; const p = Object.fromEntries(seoulDay.formatToParts(d).map(x => [x.type, x.value])); return `${p.year}.${p.month}.${p.day}`; };

// 기념품과 달력의 "2026-11-01" 을 "2026.11.01" 로
export const ksDay = d => (typeof d === 'string' ? d.replace(/-/g, '.') : '');

// 영상 원본 주소와 카드 뒷면에 적는 짧은 주소
export const ytUrl = r => r.wide ? `https://www.youtube.com/watch?v=${r.id}` : `https://www.youtube.com/shorts/${r.id}`;
export const ytShort = r => r.wide ? `youtube.com/watch?v=${r.id}` : `youtube.com/shorts/${r.id}`;

// "1.2만", "3천" 같은 조회수 글자를 수로
export const viewsNum = v => { const n = parseFloat(v); return v?.includes('만') ? n * 1e4 : v?.includes('천') ? n * 1e3 : n || 0; };
