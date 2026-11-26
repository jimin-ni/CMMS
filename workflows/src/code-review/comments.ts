// 파일 하나의 주석을 기준에 맞게 고친다. 이모지는 규칙으로, 줄글과 개인정보는 Claude로 고친다.
import ts from "typescript";
import { z } from "zod";
import { askJson, type LlmUsage } from "../common/llm";
import { COMMENT_POLICY } from "./policy";
import {
  applyReplacements,
  inspectComments,
  parse,
  removalSpan,
  sameCode,
  stripEmojiComments,
  type CommentGroup,
} from "./rules";

const SYSTEM = `너는 TypeScript 코드의 주석만 다듬는 도구다.
${COMMENT_POLICY}

입력으로 파일 전체와 기준에 어긋난 주석 묶음 목록을 받는다. 묶음마다 하나를 고른다.
- keep: 기준에 맞아 그대로 둔다.
- rewrite: 바꿀 주석 내용을 text에 적는다. 주석 기호(//, /* */)는 빼고 내용만, 최대 2줄.
- delete: 코드만 봐도 알 수 있거나 남길 내용이 없으면 지운다.
사람 이름, 이메일, 작성 경위, 날짜는 rewrite 결과에도 남기지 않는다.`;

const Answer = z.object({
  edits: z.array(
    z.object({
      id: z.number().int(),
      action: z.enum(["keep", "rewrite", "delete"]),
      text: z.string(),
      reason: z.string(),
    }),
  ),
});

export interface CommentChange {
  line: number;
  before: string;
  after: string | null;
  reason: string;
}

// 묶음의 새 주석 문자열. 첫 줄 들여쓰기에 맞추고, 원래 모양(//, /** */, JSX)을 따른다.
function render(source: string, g: CommentGroup, text: string): string {
  const first = g.ranges[0];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const lineStart = source.lastIndexOf("\n", first.pos - 1) + 1;
  const indent = source.slice(lineStart, first.pos).match(/^[ \t]*/)?.[0] ?? "";
  if (first.jsx) return `{/* ${lines.join(" ")} */}`;
  if (first.kind === ts.SyntaxKind.MultiLineCommentTrivia) {
    const open = source.startsWith("/**", first.pos) ? "/**" : "/*";
    if (lines.length === 1) return `${open} ${lines[0]} */`;
    return [open, ...lines.map((l) => `${indent} * ${l}`), `${indent} */`].join("\n");
  }
  return lines.map((l, i) => (i === 0 ? `// ${l}` : `${indent}// ${l}`)).join("\n");
}

export async function cleanComments(
  fileName: string,
  source: string,
  personNames: string[],
): Promise<{ text: string; changes: CommentChange[]; usage: LlmUsage | null }> {
  const stripped = stripEmojiComments(fileName, source);
  const changes: CommentChange[] = stripped.edits.map((e) => ({ ...e, reason: "이모지" }));
  let text = stripped.text;

  const groups = inspectComments(fileName, text, personNames);
  if (groups.length === 0) return { text, changes, usage: null };

  const { data, usage } = await askJson({
    system: SYSTEM,
    prompt: JSON.stringify({
      file: fileName,
      source: text,
      groups: groups.map((g) => ({ id: g.id, line: g.line, issues: g.issues, comment: g.text })),
    }),
    schema: Answer,
  });

  const sf = parse(fileName, text);
  const reps: { start: number; end: number; to: string }[] = [];
  for (const g of groups) {
    const edit = data.edits.find((e) => e.id === g.id);
    if (!edit || edit.action === "keep") continue;
    if (edit.action === "delete" || edit.text.trim() === "") {
      for (const r of g.ranges) {
        const [start, end] = removalSpan(text, r, sf);
        reps.push({ start, end, to: "" });
      }
      changes.push({ line: g.line, before: g.text, after: null, reason: edit.reason });
    } else {
      const to = render(text, g, edit.text);
      reps.push({ start: g.ranges[0].pos, end: g.ranges[g.ranges.length - 1].end, to });
      changes.push({ line: g.line, before: g.text, after: to, reason: edit.reason });
    }
  }
  text = applyReplacements(text, reps);

  if (!sameCode(fileName, source, text)) {
    throw new Error(`${fileName}: 주석 말고 코드가 바뀌어 결과를 버립니다`);
  }
  return { text, changes, usage };
}
