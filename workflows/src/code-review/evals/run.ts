// 규칙 평가 세트 실행. 하나라도 틀리면 종료 코드 1
import { inspectComments, sameCode, stripEmojiComments } from "../rules";
import { INSPECT_CASES, SAME_CODE_CASES, TEST_NAMES } from "./inspect.cases";
import { STRIP_CASES } from "./strip-emoji.cases";

let total = 0;
let failed = 0;

function check(name: string, ok: boolean, detail: () => string) {
  total++;
  if (ok) return console.log(`통과  ${name}`);
  failed++;
  console.log(`실패  ${name}\n${detail()}`);
}

for (const c of STRIP_CASES) {
  const { text } = stripEmojiComments(c.file, c.input);
  check(`[이모지] ${c.name}`, text === c.expected, () => `  기대: ${JSON.stringify(c.expected)}\n  결과: ${JSON.stringify(text)}`);
}

for (const c of INSPECT_CASES) {
  const got = inspectComments(c.file, c.input, TEST_NAMES).map((g) => [...g.issues].sort());
  const want = c.expected.map((i) => [...i].sort());
  check(`[검사] ${c.name}`, JSON.stringify(got) === JSON.stringify(want), () => `  기대: ${JSON.stringify(want)}\n  결과: ${JSON.stringify(got)}`);
}

for (const c of SAME_CODE_CASES) {
  const got = sameCode(c.file, c.a, c.b);
  check(`[코드 비교] ${c.name}`, got === c.same, () => `  기대: ${c.same}\n  결과: ${got}`);
}

console.log(`\n${total - failed}/${total} 통과`);
process.exit(failed ? 1 : 0);
