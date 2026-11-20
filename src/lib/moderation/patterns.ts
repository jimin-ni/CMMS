// 위협·성적 요구 문장 틀 (문서 5-3). 정규화한 글(normalize().text)에 돌린다.
// 평가셋(18-1)에서 OpenAI가 놓친 성적 요구 문장을 보완한다.
// "kill me, this is so good" 같은 자기 지칭 관용 표현은 상대(you)가 없어서 걸리지 않는다.

const PATTERNS: { name: string; pattern: RegExp }[] = [
  {
    name: "threat:harm_you",
    pattern:
      /\b(?:i ?will|i ?ll|ill|im gonna|i m gonna|im going to|i m going to|gonna|going to)\s+(?:find|hurt|kill|stab|shoot|murder|beat|rape|end)\s+(?:you|u|ya|your family|ur family)\b/,
  },
  {
    name: "threat:kys",
    pattern: /\b(?:kys|kill your ?self|kill urself|go die|unalive your ?self)\b/,
  },
  {
    name: "threat:know_where",
    pattern: /\bi know where (?:you|u) (?:live|are|work)\b/,
  },
  {
    name: "sexual:solicit_pics",
    pattern:
      /\bsend (?:me )?(?:nudes|nude pics)\b|\bsend (?:me )?(?:your )?(?:pics|pictures|photos|selfies)\b.{0,30}\b(?:body|naked|nude|underwear|bed|shower)\b/,
  },
  {
    name: "sexual:underwear",
    pattern: /\b(?:what|which) (?:color|colour|kind|type) (?:is|are) (?:your|ur) (?:underwear|bra|panties)\b/,
  },
];

export function findPattern(normalizedText: string): string | null {
  for (const t of PATTERNS) if (t.pattern.test(normalizedText)) return t.name;
  return null;
}
