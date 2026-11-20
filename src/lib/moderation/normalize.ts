// 판정용 정규화 (문서 5-1). 원문은 따로 보존하고, 이 결과는 사전·regex 비교에만 쓴다.

// 숫자·기호를 비슷한 글자로 바꾼다. 글자가 섞인 단어 안에서만 바꿔서 날짜·점수 같은 숫자는 그대로 둔다.
const LEET: Record<string, string> = {
  "@": "a",
  "4": "a",
  "1": "i",
  "!": "i",
  "|": "i",
  $: "s",
  "5": "s",
  "3": "e",
  "0": "o",
  "7": "t",
};

const LETTER = /\p{L}/u;

function deLeetToken(token: string): string {
  if (!LETTER.test(token)) return token;
  let out = "";
  for (const ch of token) out += LEET[ch] ?? ch;
  return out;
}

// 글자 하나씩 사이에 기호·공백을 끼운 표기(f.u.c.k, f u c k)를 붙인다. 글자가 3개 이상 이어질 때만.
const SPACED = /(?<![\p{L}\p{N}])(?:[\p{L}\p{N}@$!|][\s._\-*~+]{1,3}){2,}[\p{L}\p{N}@$!|](?![\p{L}\p{N}])/gu;

export type Normalized = {
  // 소문자, 전각→반각, 구분자 제거, 반복 축약(3번 넘으면 2번), 숫자·기호 치환을 거친 글
  text: string;
  // 단어 목록 (공백·문장부호 기준). 사전은 단어 경계로만 비교한다.
  tokens: string[];
  // 같은 글자를 1번으로 줄인 단어 목록. "fuuuck" 같은 늘인 표기를 잡을 때 쓴다.
  squeezedTokens: string[];
  // 공백을 모두 지운 글. 한국어 보조 사전의 부분 일치에 쓴다.
  compact: string;
};

export function normalize(raw: string): Normalized {
  let text = raw.normalize("NFKC").toLowerCase();
  text = text.replace(SPACED, (m) => m.replace(/[\s._\-*~+]/g, ""));
  text = text.replace(/(.)\1{2,}/gu, "$1$1");
  // 문장부호로 나눈 뒤 단어마다 치환한다. @, $, ! 같은 치환 대상 기호는 단어의 일부로 본다.
  const rawTokens = text.split(/[^\p{L}\p{N}@$!|]+/u).filter(Boolean);
  // 단어 끝의 !는 문장부호로 보고 지운다 ("wow!!" → "wow").
  const tokens = rawTokens
    .map((t) => t.replace(/!+$/, ""))
    .map(deLeetToken).map((t) => t.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  const squeezedTokens = tokens.map((t) => t.replace(/(.)\1+/gu, "$1"));
  return {
    text: tokens.join(" "),
    tokens,
    squeezedTokens,
    compact: text.replace(/\s+/g, ""),
  };
}
