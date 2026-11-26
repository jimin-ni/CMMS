// 주석 규칙 검사와 이모지 제거. LLM을 쓰지 않는다.
import ts from "typescript";
import {
  ATTRIBUTION_PATTERNS,
  DATE_PATTERN,
  EMAIL_PATTERN,
  MAX_COMMENT_CHARS,
  MAX_COMMENT_LINES,
} from "./policy";

// 기본 표시가 그림인 이모지와 그 묶음(피부색, ZWJ). →, ✔, ©는 글자로 보고 남긴다.
const EMOJI =
  /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)(?:[\u{1F3FB}-\u{1F3FF}️⃣]|‍(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})️?)*/gu;

export function hasEmoji(text: string): boolean {
  EMOJI.lastIndex = 0;
  return EMOJI.test(text);
}

export interface CommentRange {
  pos: number;
  end: number;
  kind: ts.CommentKind;
  // {/* */}만 있는 JSX 식이면 그 식
  jsx?: ts.JsxExpression;
}

function scriptKind(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function parse(fileName: string, source: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind(fileName));
}

// 파일의 모든 주석 위치. 문자열과 JSX 글자 안의 "//"는 빼고 위치 순으로 돌려준다.
export function collectComments(sf: ts.SourceFile): CommentRange[] {
  const text = sf.getFullText();
  const seen = new Map<number, CommentRange>();
  const jsxTextSpans: [number, number][] = [];

  const add = (ranges: ts.CommentRange[] | undefined, jsx?: ts.JsxExpression) => {
    for (const r of ranges ?? []) {
      const prev = seen.get(r.pos);
      if (!prev) seen.set(r.pos, { pos: r.pos, end: r.end, kind: r.kind, jsx });
      else if (jsx) prev.jsx = jsx;
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      jsxTextSpans.push([node.pos, node.end]);
      return;
    }
    if (ts.isJsxExpression(node) && !node.expression) {
      // 같은 줄 주석은 trailing, 줄바꿈 뒤 주석은 leading으로 잡힌다.
      const at = node.getStart(sf) + 1;
      add([...(ts.getTrailingCommentRanges(text, at) ?? []), ...(ts.getLeadingCommentRanges(text, at) ?? [])], node);
    }
    add(ts.getLeadingCommentRanges(text, node.pos));
    add(ts.getTrailingCommentRanges(text, node.end));
    node.getChildren(sf).forEach(visit);
  };
  visit(sf);
  add(ts.getLeadingCommentRanges(text, sf.endOfFileToken.pos));

  return [...seen.values()]
    .filter((r) => !jsxTextSpans.some(([s, e]) => r.pos >= s && r.end <= e))
    .sort((a, b) => a.pos - b.pos);
}

// 주석 하나를 지울 구간. 그 줄에 다른 코드가 없으면 줄째, 코드 뒤 주석이면 앞 공백까지.
export function removalSpan(source: string, c: CommentRange, sf: ts.SourceFile): [number, number] {
  let start = c.jsx ? c.jsx.getStart(sf) : c.pos;
  let end = c.jsx ? c.jsx.end : c.end;
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const nl = source.indexOf("\n", end);
  const lineEnd = nl === -1 ? source.length : nl;
  const before = source.slice(lineStart, start);
  const after = source.slice(end, lineEnd);
  if (before.trim() === "" && after.trim() === "") {
    start = lineStart;
    end = nl === -1 ? lineEnd : nl + 1;
  } else if (after.trim() === "") {
    start = lineStart + before.trimEnd().length;
  }
  return [start, end];
}

// 이모지를 지우고 공백을 정리한다. 내용이 남지 않으면 null
function cleanComment(raw: string, kind: ts.CommentKind): string | null {
  const stripped = raw.replace(EMOJI, "");
  if (kind === ts.SyntaxKind.SingleLineCommentTrivia) {
    const body = stripped.slice(2).replace(/[ \t]{2,}/g, " ").trimEnd();
    return body.trim() === "" ? null : "//" + body;
  }
  const lines = stripped.split("\n").map((l) => l.replace(/(\S)[ \t]{2,}/g, "$1 ").replace(/[ \t]+$/, ""));
  const content = lines.join("\n").replace(/^\/\*+|\*+\/$/g, "").replace(/^\s*\*/gm, "");
  return content.trim() === "" ? null : lines.join("\n");
}

export interface CommentEdit {
  line: number;
  before: string;
  // null이면 주석을 지움
  after: string | null;
}

// 위치별 바꾸기를 뒤에서부터 적용한다.
export function applyReplacements(source: string, reps: { start: number; end: number; to: string }[]): string {
  let text = source;
  for (const r of [...reps].sort((a, b) => b.start - a.start)) text = text.slice(0, r.start) + r.to + text.slice(r.end);
  return text;
}

// 주석 안 이모지만 지운다. 이모지만 있던 주석은 주석째 지운다.
export function stripEmojiComments(fileName: string, source: string): { text: string; edits: CommentEdit[] } {
  const sf = parse(fileName, source);
  const edits: CommentEdit[] = [];
  const reps: { start: number; end: number; to: string }[] = [];

  for (const c of collectComments(sf)) {
    const raw = source.slice(c.pos, c.end);
    if (!hasEmoji(raw)) continue;
    const after = cleanComment(raw, c.kind);
    edits.push({ line: sf.getLineAndCharacterOfPosition(c.pos).line + 1, before: raw, after });
    if (after !== null) reps.push({ start: c.pos, end: c.end, to: after });
    else {
      const [start, end] = removalSpan(source, c, sf);
      reps.push({ start, end, to: "" });
    }
  }
  return { text: applyReplacements(source, reps), edits };
}

export type CommentIssue = "emoji" | "long" | "person" | "email" | "attribution" | "date";

export interface CommentGroup {
  // 파일 안 순번. Claude 답과 맞출 때 쓴다.
  id: number;
  line: number;
  text: string;
  ranges: CommentRange[];
  issues: CommentIssue[];
}

function contentLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(\/\/+|\/\*+|\*+\/|\*)?/, "").replace(/\*+\/\s*$/, "").trim())
    .filter(Boolean);
}

// 바로 붙은 한 줄 주석들을 한 묶음으로 보고, 기준에 어긋나는 묶음만 돌려준다.
export function inspectComments(fileName: string, source: string, personNames: string[] = []): CommentGroup[] {
  const sf = parse(fileName, source);
  const groups: CommentGroup[] = [];
  let cur: CommentRange[] = [];

  const flush = () => {
    if (cur.length === 0) return;
    const text = cur.map((r) => source.slice(r.pos, r.end)).join("\n");
    const lines = contentLines(text);
    const issues: CommentIssue[] = [];
    if (hasEmoji(text)) issues.push("emoji");
    if (lines.length > MAX_COMMENT_LINES || lines.some((l) => l.length > MAX_COMMENT_CHARS)) issues.push("long");
    if (personNames.some((n) => text.toLowerCase().includes(n.toLowerCase()))) issues.push("person");
    if (EMAIL_PATTERN.test(text)) issues.push("email");
    if (ATTRIBUTION_PATTERNS.some((re) => re.test(text))) issues.push("attribution");
    if (DATE_PATTERN.test(text)) issues.push("date");
    if (issues.length) {
      groups.push({ id: groups.length + 1, line: sf.getLineAndCharacterOfPosition(cur[0].pos).line + 1, text, ranges: cur, issues });
    }
    cur = [];
  };

  for (const c of collectComments(sf)) {
    const prev = cur[cur.length - 1];
    const adjacent =
      prev &&
      prev.kind === ts.SyntaxKind.SingleLineCommentTrivia &&
      c.kind === ts.SyntaxKind.SingleLineCommentTrivia &&
      /^[ \t]*\r?\n[ \t]*$/.test(source.slice(prev.end, c.pos));
    if (!adjacent) flush();
    cur.push(c);
  }
  flush();
  return groups;
}

// 주석을 빼고 코드 토큰이 같은지 본다. 주석만 고쳤는지 확인할 때 쓴다.
export function sameCode(fileName: string, a: string, b: string): boolean {
  const tokens = (src: string) => {
    const sf = parse(fileName, src);
    const out: string[] = [];
    const visit = (n: ts.Node) => {
      // 주석만 있던 {/* */}와 JSX 글자 앞뒤 공백은 주석을 지우면 바뀌므로 비교에서 뺀다.
      if (ts.isJsxExpression(n) && !n.expression) return;
      if (ts.isJsxText(n)) {
        const t = n.getText(sf).trim();
        if (t) out.push(`jsx:${t}`);
        return;
      }
      if (n.getChildCount(sf) === 0) out.push(`${n.kind}:${n.getText(sf)}`);
      else n.getChildren(sf).forEach(visit);
    };
    visit(sf);
    return out;
  };
  const ta = tokens(a);
  const tb = tokens(b);
  return ta.length === tb.length && ta.every((t, i) => t === tb[i]);
}
