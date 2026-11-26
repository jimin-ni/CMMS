// inspectComments, sameCode 평가 세트. 사람 이름은 가짜 이름만 쓴다.
import type { CommentIssue } from "../rules";

export const TEST_NAMES = ["홍길동", "Alice"];

export interface InspectCase {
  name: string;
  file: string;
  input: string;
  // 걸려야 하는 묶음의 문제 목록. 빈 배열이면 아무것도 안 걸려야 함
  expected: CommentIssue[][];
}

export const INSPECT_CASES: InspectCase[] = [
  { name: "짧은 설명 주석은 통과", file: "a.ts", input: "// 채팅 규칙 값\nexport const x = 1;\n", expected: [] },
  {
    name: "JSDoc 한 줄은 통과",
    file: "a.ts",
    input: "/** 메시지를 저장한다 */\nexport function save() {}\n",
    expected: [],
  },
  {
    name: "세 줄 넘는 줄글",
    file: "a.ts",
    input: "// 이 함수는 메시지를 저장한다.\n// 저장 전에 길이를 본다.\n// 길면 자른다.\nexport function save() {}\n",
    expected: [["long"]],
  },
  {
    name: "사람 이름",
    file: "a.ts",
    input: "// 홍길동 손질: 그림자 줄임\nconst s = 1;\n",
    expected: [["person", "attribution"]],
  },
  {
    name: "영문 이름과 날짜",
    file: "a.ts",
    input: "const s = 1; // (2026-11-25 alice) 반짝임 수정\n",
    expected: [["person", "date"]],
  },
  { name: "이메일", file: "a.ts", input: "// 문의: someone@example.com\nconst c = 1;\n", expected: [["email"]] },
  {
    name: "요청 경위",
    file: "a.ts",
    input: "// 기획 요청으로 추가한 상수\nconst k = 1;\n",
    expected: [["attribution"]],
  },
  { name: "이모지", file: "a.ts", input: "// ✅ 저장\nsave();\n", expected: [["emoji"]] },
  {
    name: "떨어진 주석은 따로 묶음",
    file: "a.ts",
    input: "// 하나\nconst a = 1;\n// 둘 alice\nconst b = 2;\n",
    expected: [["person"]],
  },
  {
    name: "문자열 안 이름은 주석 아님",
    file: "a.ts",
    input: 'const owner = "홍길동";\n',
    expected: [],
  },
];

export interface SameCodeCase {
  name: string;
  file: string;
  a: string;
  b: string;
  same: boolean;
}

export const SAME_CODE_CASES: SameCodeCase[] = [
  { name: "주석만 다름", file: "a.ts", a: "// 긴 설명\n// 더\nf(1);\n", b: "// 짧게\nf(1);\n", same: true },
  { name: "주석 지움", file: "a.ts", a: "f(1); // 설명\n", b: "f(1);\n", same: true },
  { name: "값이 바뀜", file: "a.ts", a: "f(1);\n", b: "f(2);\n", same: false },
  { name: "문자열이 바뀜", file: "a.ts", a: 'f("a");\n', b: 'f("b");\n', same: false },
  {
    name: "JSX 주석 줄 지움",
    file: "a.tsx",
    a: "const A = () => (\n  <div>\n    {/* 목록 */}\n    <ul />\n  </div>\n);\n",
    b: "const A = () => (\n  <div>\n    <ul />\n  </div>\n);\n",
    same: true,
  },
  {
    name: "JSX 글자가 바뀜",
    file: "a.tsx",
    a: "const A = () => <p>안녕</p>;\n",
    b: "const A = () => <p>잘가</p>;\n",
    same: false,
  },
];
