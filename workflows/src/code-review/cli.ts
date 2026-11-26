// 로컬에서 주석 정리 실행: npm run comments -- <파일...> [--write]
// --write가 없으면 바뀔 내용만 보여 준다. 키와 이름 목록은 workflows/.env에서 읽는다.
import { readFileSync, writeFileSync } from "node:fs";
import { sumUsage, type LlmUsage } from "../common/llm";
import { cleanComments } from "./comments";
import { personNamesFromEnv } from "./policy";

const args = process.argv.slice(2);
const write = args.includes("--write");
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.log("사용법: npm run comments -- <파일...> [--write]");
  process.exit(1);
}

const usages: LlmUsage[] = [];
for (const file of files) {
  const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const { text, changes, usage } = await cleanComments(file, source, personNamesFromEnv());
  if (usage) usages.push(usage);
  if (changes.length === 0) continue;
  console.log(`\n${file}`);
  for (const c of changes) {
    console.log(`  ${c.line}줄 (${c.reason})\n    전: ${c.before.replace(/\n/g, "\n        ")}\n    후: ${c.after ?? "(지움)"}`);
  }
  if (write) writeFileSync(file, text);
}
const total = sumUsage(usages);
console.log(`\nLLM ${total.calls}회, $${total.costUsd.toFixed(4)}${write ? "" : " (미리보기, --write로 적용)"}`);
