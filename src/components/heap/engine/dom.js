// DOM 노드를 만드는 작은 함수와 겹쳐 뜨는 창의 닫기 연결.

export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// 새 탭에서 열리는 바깥 링크
export const link = (text, href) => { const a = el('a', null, text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; };

// 링크를 눈에 보이게 줄인 글: 앞의 https://, www., mailto: 를 떼고 %인코딩을 푼다
export const shortUrl = u => { const t = u.replace(/^(https?:\/\/(www\.)?|mailto:)/i, ''); try { return decodeURIComponent(t); } catch { return t; } };

// 겹쳐 뜨는 창(#id) 하나의 닫기를 연결한다: 닫기 버튼(#closeId)이 닫고, backdrop 이면 창 바깥 배경을 눌러도 닫는다.
// 여는 쪽은 각 창이 자기 내용을 채운 뒤 hidden 을 직접 푼다.
export function bindOverlay({ $, on }, id, closeId, { backdrop = false } = {}) {
  const hide = () => { $(id).hidden = true; };
  on($(closeId), 'click', hide);
  if (backdrop) on($(id), 'click', e => { if (e.target.id === id) hide(); });
}
