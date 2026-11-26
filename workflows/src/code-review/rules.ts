// 규칙 기반 점검. LLM을 쓰지 않는다 (15 문서 6-1).
// stripEmojiComments: 주석 안의 이모지만 지운다. 이모지만 있던 주석은 주석째 지운다.
// 문자열, 템플릿 문자열, JSX 글자(화면 문구) 안의 이모지는 건드리지 않는다.
import ts from "typescript";

// 기본이 이모지 모양인 글자, 또는 FE0F가 붙은 그림 글자. 피부색, ZWJ로 이어진 묶음까지 한 덩어리로 본다.
// →, ✔, © 같은 기본이 글자 모양인 기호는 남긴다.
const EMOJI =
  /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)(?:[\u{1F3FB}-\u{1F3FF}️⃣]|‍(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})️?)*/gu;

export function hasEmoji(text: string): boolean {
  EMOJI.lastIndex = 0;
  return EMOJI.test(text);
}

export interface CommentEdit {
  line: number;
  before: string;
  // null이면 주석을 통째로 지움
  after: string | null;
}

interface Range {
  pos: number;
  end: number;
  kind: ts.CommentKind;
}

function scriptKind(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

// 파일의 모든 주석 위치를 모은다. 토큰마다 앞뒤 trivia를 보고 위치로 중복을 없앤다.
function collectComments(sf: ts.SourceFile): { comments: Range[]; jsxOnlyComment: Map<number, ts.JsxExpression> } {
  const text = sf.getFullText();
  const seen = new Map<number, Range>();
  // 주석이 아닌데 주석처럼 보일 수 있는 구간 (JSX 글자 안의 "// ...")
  const literalSpans: [number, number][] = [];
  const jsxOnlyComment = new Map<number, ts.JsxExpression>();

  const add = (ranges: ts.CommentRange[] | undefined) => {
    for (const r of ranges ?? []) if (!seen.has(r.pos)) seen.set(r.pos, { pos: r.pos, end: r.end, kind: r.kind });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      literalSpans.push([node.pos, node.end]);
      return;
    }
    // {/* 주석 */}처럼 주석만 있는 JSX 식은 중괄호까지 함께 지워야 한다.
    if (ts.isJsxExpression(node) && !node.expression) {
      // 같은 줄 주석은 trailing, 줄바꿈 뒤 주석은 leading으로만 잡힌다.
      const at = node.getStart(sf) + 1;
      const inner = [...(ts.getTrailingCommentRanges(text, at) ?? []), ...(ts.getLeadingCommentRanges(text, at) ?? [])];
      for (const r of inner) jsxOnlyComment.set(r.pos, node);
      add(inner);
    }
    add(ts.getLeadingCommentRanges(text, node.pos));
    add(ts.getTrailingCommentRanges(text, node.end));
    node.getChildren(sf).forEach(visit);
  };
  visit(sf);
  add(ts.getLeadingCommentRanges(text, sf.endOfFileToken.pos));

  const inLiteral = (r: Range) => literalSpans.some(([s, e]) => r.pos >= s && r.end <= e);
  const comments = [...seen.values()].filter((r) => !inLiteral(r)).sort((a, b) => a.pos - b.pos);
  return { comments, jsxOnlyComment };
}

// 주석에서 이모지를 지우고 공백을 정리한다. 내용이 남지 않으면 null
function cleanComment(raw: string, kind: ts.CommentKind): string | null {
  const stripped = raw.replace(EMOJI, "");
  if (kind === ts.SyntaxKind.SingleLineCommentTrivia) {
    const body = stripped.slice(2).replace(/[ \t]{2,}/g, " ").trimEnd();
    return body.trim() === "" ? null : "//" + body;
  }
  // 여러 줄 주석: 줄마다 정리하고, 별표와 공백만 남으면 비었다고 본다.
  const lines = stripped.split("\n").map((l) => l.replace(/([^\s])[ \t]{2,}/g, "$1 ").replace(/[ \t]+$/, ""));
  const content = lines.join("\n").replace(/^\/\*+|\*+\/$/g, "").replace(/^\s*\*/gm, "");
  if (content.trim() === "") return null;
  return lines.join("\n");
}

export function stripEmojiComments(fileName: string, source: string): { text: string; edits: CommentEdit[] } {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const { comments, jsxOnlyComment } = collectComments(sf);
  const edits: CommentEdit[] = [];
  // 뒤에서부터 고쳐야 앞 위치가 바뀌지 않는다.
  const replacements: { start: number; end: number; to: string }[] = [];

  for (const c of comments) {
    const raw = source.slice(c.pos, c.end);
    if (!hasEmoji(raw)) continue;
    const after = cleanComment(raw, c.kind);
    const line = sf.getLineAndCharacterOfPosition(c.pos).line + 1;
    edits.push({ line, before: raw, after });

    if (after !== null) {
      replacements.push({ start: c.pos, end: c.end, to: after });
      continue;
    }
    // 통째로 지울 때: JSX 식이면 중괄호까지, 그 줄에 다른 코드가 없으면 줄째로 지운다.
    let start = c.pos;
    let end = c.end;
    const jsx = jsxOnlyComment.get(c.pos);
    if (jsx) {
      start = jsx.getStart(sf);
      end = jsx.end;
    }
    const lineStart = source.lastIndexOf("\n", start - 1) + 1;
    const nl = source.indexOf("\n", end);
    const lineEnd = nl === -1 ? source.length : nl;
    const beforeOnLine = source.slice(lineStart, start);
    const afterOnLine = source.slice(end, lineEnd);
    if (beforeOnLine.trim() === "" && afterOnLine.trim() === "") {
      start = lineStart;
      end = nl === -1 ? lineEnd : nl + 1;
    } else if (afterOnLine.trim() === "") {
      // 코드 뒤에 붙은 주석: 앞 공백까지 지운다.
      start = lineStart + beforeOnLine.trimEnd().length;
    }
    replacements.push({ start, end, to: "" });
  }

  let text = source;
  for (const r of replacements.sort((a, b) => b.start - a.start)) {
    text = text.slice(0, r.start) + r.to + text.slice(r.end);
  }
  return { text, edits };
}
