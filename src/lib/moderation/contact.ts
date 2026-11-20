// 연락처 공유 패턴 (문서 5-3). 패턴은 단순하게 유지해 ReDoS를 피한다.
// 원문을 NFKC로 바꾼 글에 돌린다(전각 숫자·문자 처리).

export type ContactKind = "phone" | "email" | "messenger";

// 한국 휴대폰(010-1234-5678, 010 1234 5678, 010.1234.5678, +82 10-1234-5678, 01012345678)
const KR_MOBILE = /(?<!\d)(?:\+?82[\s.-]?|0)1[016789][\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)/;
// 북미식 (555) 123-4567, 555-123-4567, +1 555 123 4567. 구분자가 있어야 해서 주문 번호와 덜 겹친다.
const NANP = /(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/;

const EMAIL = /[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})*\.[a-z]{2,10}/i;
// a at b dot com, a[at]b[dot]com, a (at) b (dot) com
const EMAIL_SPELLED =
  /[a-z0-9._-]{2,64}\s*(?:\[at\]|\(at\)|\sat\s)\s*[a-z0-9-]{2,63}\s*(?:\[dot\]|\(dot\)|\sdot\s|\.)\s*(?:com|net|org|io|me|co|kr)\b/i;

const MESSENGER =
  /\b(?:open\.kakao\.com|qr\.kakao\.com|line\.me|instagram\.com|instagr\.am|t\.me|telegram\.me|discord\.gg|discord(?:app)?\.com\/invite|wa\.me|snapchat\.com|x\.com|twitter\.com|tiktok\.com|facebook\.com|fb\.me|m\.me)\b/i;

export function findContact(raw: string): ContactKind | null {
  const text = raw.normalize("NFKC");
  if (KR_MOBILE.test(text) || NANP.test(text)) return "phone";
  if (EMAIL.test(text) || EMAIL_SPELLED.test(text)) return "email";
  if (MESSENGER.test(text)) return "messenger";
  return null;
}

const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,63}\.(?:com|net|org|io|me|gg|kr|co|ly|tv|app)(?:\/\S*)?/gi;

export function countLinks(raw: string): number {
  return raw.normalize("NFKC").match(LINK)?.length ?? 0;
}
