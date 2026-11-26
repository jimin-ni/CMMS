// 주석 기준. 규칙 검사와 LLM 프롬프트가 함께 쓴다.

export const COMMENT_POLICY = `주석 기준
1. 남긴다: 함수, 메서드, 모듈, 상수가 무엇인지 설명하는 한 문장. 코드만 보고 알기 어려운 이유가 있으면 한 문장 더.
2. 지운다: 이모지, 여러 줄로 늘어진 줄글 설명, 코드를 그대로 다시 읽어 주는 설명.
3. 넣지 않는다: 사람 이름, 아이디, 이메일, 누가 시켰거나 누가 고쳤다는 작성 경위, 날짜별 변경 이력. 이런 내용은 git 기록과 docs에 둔다.
4. 문장은 짧고 쉬운 한국어로 쓴다. 끝에 마침표를 붙이지 않아도 된다.
5. 코드는 한 글자도 바꾸지 않는다. 주석만 고친다.`;

// 한 주석 묶음이 이 줄 수를 넘으면 줄글로 본다.
export const MAX_COMMENT_LINES = 2;
// 한 줄 주석이 이 글자 수를 넘으면 줄글로 본다.
export const MAX_COMMENT_CHARS = 120;

// 작성 경위로 보는 표현
export const ATTRIBUTION_PATTERNS: RegExp[] = [
  /요청(으로|에 따라|하신|함)/,
  /지시(로|에 따라)/,
  /님[이의께]?\s/,
  /손질|손봄/,
  /작성자\s*[:：]/,
  /@author\b/i,
  /\b(requested|asked|suggested) by\b/i,
];

// 주석 안 날짜 (변경 이력으로 봄)
export const DATE_PATTERN = /\b20\d\d-\d\d-\d\d\b/;
export const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

// 코드에 넣으면 안 되는 사람 이름 목록. 환경 변수 CODE_REVIEW_PERSON_NAMES(쉼표 구분)에서 읽는다.
export function personNamesFromEnv(): string[] {
  return (process.env.CODE_REVIEW_PERSON_NAMES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
