// DOM 노드를 만드는 작은 함수.

// phone: the way into 버블. A room with no PC still lists the creator's links here, so nothing disappears until the owner puts a PC in.
export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export const link = (text, href) => { const a = el('a', null, text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; };

export const shortUrl = u => { const t = u.replace(/^(https?:\/\/(www\.)?|mailto:)/i, ''); try { return decodeURIComponent(t); } catch { return t; } };
