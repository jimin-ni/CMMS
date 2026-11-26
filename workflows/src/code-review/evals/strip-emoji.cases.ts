// stripEmojiComments 평가 세트 (15 문서 7-2 "평가 먼저"). 규칙을 바꿀 때마다 npm run eval:strip
export interface StripCase {
  name: string;
  file: string;
  input: string;
  expected: string;
}

export const STRIP_CASES: StripCase[] = [
  {
    name: "한 줄 주석 앞 이모지",
    file: "a.ts",
    input: "// ✅ 저장 끝\nsave();\n",
    expected: "// 저장 끝\nsave();\n",
  },
  {
    name: "이모지만 있는 주석은 줄째 지움",
    file: "a.ts",
    input: "const a = 1;\n  // 🎉\nconst b = 2;\n",
    expected: "const a = 1;\nconst b = 2;\n",
  },
  {
    name: "코드 뒤 주석의 이모지",
    file: "a.ts",
    input: "const limit = 200; // 🔥 구독자 글자 수\n",
    expected: "const limit = 200; // 구독자 글자 수\n",
  },
  {
    name: "코드 뒤 이모지만 있는 주석",
    file: "a.ts",
    input: "run(); // 🚀\nnext();\n",
    expected: "run();\nnext();\n",
  },
  {
    name: "문자열 안 이모지는 그대로",
    file: "a.ts",
    input: 'const msg = "전송 완료 ✅"; // 안내 문구\n',
    expected: 'const msg = "전송 완료 ✅"; // 안내 문구\n',
  },
  {
    name: "템플릿 문자열 안 이모지와 // 는 그대로",
    file: "a.ts",
    input: "const s = `🎉 ${name} // 아님`;\n",
    expected: "const s = `🎉 ${name} // 아님`;\n",
  },
  {
    name: "여러 줄 주석",
    file: "a.ts",
    input: "/**\n * 📌 채팅 규칙\n * 10초 간격 ⏱️\n */\nexport const x = 1;\n",
    expected: "/**\n * 채팅 규칙\n * 10초 간격\n */\nexport const x = 1;\n",
  },
  {
    name: "이모지만 있는 블록 주석",
    file: "a.ts",
    input: "/* ✨ */\nexport const y = 2;\n",
    expected: "export const y = 2;\n",
  },
  {
    name: "JSX 글자의 이모지와 // 는 그대로",
    file: "a.tsx",
    input: "export const A = () => <p>좋아요 💖 // 진짜</p>;\n",
    expected: "export const A = () => <p>좋아요 💖 // 진짜</p>;\n",
  },
  {
    name: "JSX 안 주석",
    file: "a.tsx",
    input: "export const B = () => (\n  <div>\n    {/* 🧩 목록 */}\n    <ul />\n  </div>\n);\n",
    expected: "export const B = () => (\n  <div>\n    {/* 목록 */}\n    <ul />\n  </div>\n);\n",
  },
  {
    name: "JSX 안 이모지만 있는 주석은 중괄호째 지움",
    file: "a.tsx",
    input: "export const C = () => (\n  <div>\n    {/* 🎈 */}\n    <ul />\n  </div>\n);\n",
    expected: "export const C = () => (\n  <div>\n    <ul />\n  </div>\n);\n",
  },
  {
    name: "글자 모양 기호(→ ✔ ©)는 남김",
    file: "a.ts",
    input: "// 입력 → 판정 ✔ © MEMOAMO\nf();\n",
    expected: "// 입력 → 판정 ✔ © MEMOAMO\nf();\n",
  },
  {
    name: "ZWJ, 피부색 묶음",
    file: "a.ts",
    input: "// 👩‍💻👍🏽 담당 확인\ng();\n",
    expected: "// 담당 확인\ng();\n",
  },
  {
    name: "파일 끝 주석",
    file: "a.ts",
    input: "h();\n// 🏁 끝",
    expected: "h();\n// 끝",
  },
  {
    name: "파일 끝 이모지만 있는 주석",
    file: "a.ts",
    input: "h();\n// 🏁",
    expected: "h();\n",
  },
  {
    name: "정규식 안 // 는 주석 아님",
    file: "a.ts",
    input: "const re = /https?:\\/\\/🙂/u;\n",
    expected: "const re = /https?:\\/\\/🙂/u;\n",
  },
];
