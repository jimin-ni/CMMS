// 평가 세트 실행: npm run eval:strip. 하나라도 틀리면 종료 코드 1
import { stripEmojiComments } from "../rules";
import { STRIP_CASES } from "./strip-emoji.cases";

let failed = 0;
for (const c of STRIP_CASES) {
  const { text } = stripEmojiComments(c.file, c.input);
  if (text === c.expected) {
    console.log(`통과  ${c.name}`);
  } else {
    failed++;
    console.log(`실패  ${c.name}\n  기대: ${JSON.stringify(c.expected)}\n  결과: ${JSON.stringify(text)}`);
  }
}
console.log(`\n${STRIP_CASES.length - failed}/${STRIP_CASES.length} 통과`);
process.exit(failed ? 1 : 0);
