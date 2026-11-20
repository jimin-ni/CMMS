// 평가셋을 실제 OpenAI로 돌린다 (문서 18-1). 평소 테스트에서는 건너뛴다.
// 실행: npm run moderation:eval
// MODERATION_EVAL_DB=1이면 공유 DB의 사전(moderation_terms, moderation_allowlist)을 붙여 돌린다.
// 평가셋 원문은 공개 저장소에 넣지 않으므로 .moderation-private/eval-50.jsonl(gitignore)에서 읽는다.
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "vitest";
import pg from "pg";
import { buildLexicon, EMPTY_LEXICON, type Lexicon } from "./lexicon";
import { moderateWithOpenAI } from "./openai";
import { screen } from "./screen";

const FILE = process.env.MODERATION_EVAL_FILE ?? ".moderation-private/eval-50.jsonl";
const enabled = process.env.MODERATION_EVAL === "1" && existsSync(FILE);

describe.skipIf(!enabled)("평가셋 (실제 OpenAI)", () => {
  it("결과 표", { timeout: 120_000 }, async () => {
    const rows = readFileSync(FILE, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { text: string; expect: string; group: string });

    let lexicon: Lexicon = EMPTY_LEXICON;
    if (process.env.MODERATION_EVAL_DB === "1") {
      const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      const terms = await client.query("select term, lang, tag from moderation_terms where enabled");
      const allow = await client.query("select term from moderation_allowlist");
      await client.end();
      lexicon = buildLexicon(terms.rows, allow.rows.map((r) => r.term), `db#${terms.rowCount}`);
    }

    const out: { group: string; expect: string; got: string; reasons: string; openai: string; text: string }[] = [];
    for (const [i, row] of rows.entries()) {
      // 사용자당 상한에 걸리지 않게 문장마다 다른 가짜 사용자로 부른다.
      const r = await screen({ text: row.text, surface: "chat", authorId: `eval-${i}` }, {
        lexicon,
        moderate: moderateWithOpenAI,
      });
      const flaggedCats = r.scores
        ? Object.entries(r.scores).filter(([, s]) => s >= 0.3).map(([c, s]) => `${c}=${s.toFixed(2)}`).join(",")
        : "";
      out.push({
        group: row.group,
        expect: row.expect,
        got: r.outcome,
        reasons: r.reasons.join(",") + (flaggedCats ? ` [${flaggedCats}]` : ""),
        openai: r.openai,
        text: process.env.MODERATION_EVAL_SHOW_TEXT === "1" ? row.text : `#${i + 1}`,
      });
    }
    const miss = out.filter((o) => o.expect !== o.got);
    console.table(out);
    console.log(`일치 ${out.length - miss.length}/${out.length}`);
  });
});
