// 로그인, 회원가입 뒤에 돌아갈 주소(?next=)를 고른다.
// 이 사이트 안의 경로만 받는다. "//다른곳"이나 "/\다른곳"처럼 다른 사이트로 새는 주소는 버린다 (열린 리다이렉트 막기).
export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

// 지금 주소의 ?next= 를 읽는다. 브라우저에서만 부른다.
export function nextFromLocation(): string | null {
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

// 돌아갈 주소를 붙인 로그인, 회원가입 화면 주소
export function withNext(href: "/login" | "/signup", next: string | null): string {
  return next ? `${href}?next=${encodeURIComponent(next)}` : href;
}
