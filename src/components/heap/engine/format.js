// 날짜, 원본 주소, 조회수 같은 값을 글자로 바꾸는 순수 함수.

// 한국 시간 날짜: seoulDay.format(date) 는 "2026-11-12", fmtDay(iso) 는 "2026.11.12" (읽을 수 없으면 '')
export const seoulDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
export const fmtDay = iso => { const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; const p = Object.fromEntries(seoulDay.formatToParts(d).map(x => [x.type, x.value])); return `${p.year}.${p.month}.${p.day}`; };

// 기념품과 달력의 "2026-11-01" 을 "2026.11.01" 로
export const ksDay = d => (typeof d === 'string' ? d.replace(/-/g, '.') : '');

// 영상 원본 주소와 카드 뒷면에 적는 짧은 주소 (옛 데이터와 유튜브 전용 자리에서 쓴다)
export const ytUrl = r => r.wide ? `https://www.youtube.com/watch?v=${r.id}` : `https://www.youtube.com/shorts/${r.id}`;

// 화면에 쓰는 플랫폼 이름. src/lib/heap/messages.ts 의 HEAP_PLATFORM_NAME 과 같아야 한다.
export const PLATFORM_NAME = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', x: 'X', chzzk: '치지직', twitch: 'Twitch', soop: 'SOOP' };
// 카드의 플랫폼. 플랫폼을 적지 않은 줄(팬 작품, 옛 데이터)은 유튜브로 본다.
export const platformOf = r => (r && PLATFORM_NAME[r.platform] ? r.platform : 'youtube');
// 카드가 가리키는 공식 원본 주소. 서버가 준 정규 주소를 쓰고, 없으면 유튜브 주소로 만든다.
export const srcUrl = r => r.url || ytUrl(r);
// 카드 뒷면에 적는 짧은 주소 ("youtube.com/shorts/…")
export const srcShort = r => srcUrl(r).replace(/^https?:\/\/(?:www\.)?/, '');
// 썸네일 그림을 가진 카드인지. 지금 썸네일이 있는 곳은 유튜브뿐이다
// (틱톡 oEmbed 는 thumbnail_url 을 주지 않고, 인스타그램은 2025-11-03 에 뺐다. 다른 길은 스크래핑이라 쓰지 않는다).
export const hasThumb = r => r && r.kind !== 'fan' && platformOf(r) === 'youtube';
// 방 안에서 영상 한 줄을 가리키는 열쇠. 플랫폼마다 ID 공간이 달라서 플랫폼 이름을 앞에 붙인다.
export const reelKey = r => (r && r.platform ? `${r.platform}:${r.id}` : r.id);

// "1.2만", "3천" 같은 조회수 글자를 수로
export const viewsNum = v => { const n = parseFloat(v); return v?.includes('만') ? n * 1e4 : v?.includes('천') ? n * 1e3 : n || 0; };
