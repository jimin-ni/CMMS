// AI 스크리닝 사전 만들기 (docs/planning/12-ai-screening.md 5-2)
// 단어 목록은 공개 저장소에 넣지 않는다. 원본, 검토용 파일, 결과는 모두 .moderation-private/(gitignore)에만 둔다.
//
// 1) 추출: ProfanityBench dataset.jsonl에서 첫 버전 후보(영어, severity 5 또는 혐오 표시)를 검토용 CSV로 뽑는다.
//    npm run moderation:terms -- extract .moderation-private/dataset.jsonl
//    → .moderation-private/terms-review.csv  (첫 칸 approve를 사람이 y로 채운다)
// 2) 적재: approve=y인 줄만 moderation_terms에 넣는다. 같은 (lang, term)은 덮어쓴다.
//    npm run moderation:terms -- load .moderation-private/terms-review.csv
//
// 출처: ProfanityBench (https://huggingface.co/datasets/BibbyResearch/ProfanityBench), MIT 라이선스.
// 라벨은 전문가 검증이 아니고 가볍거나 되찾아 쓰는 말이 섞여 있어 사람 검토 없이 적재하지 않는다.
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import pg from "pg";

const [mode, file] = process.argv.slice(2);
const OUT = ".moderation-private/terms-review.csv";
const SOURCE = "ProfanityBench";

const csvCell = (v) => `"${String(v ?? "").replaceAll('"', '""').replace(/\r?\n/g, " ")}"`;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

async function extract(path) {
  const lines = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  const seen = new Set();
  const out = [["approve", "term", "tag", "severity", "hate_speech", "tone", "category", "safe_for_work", "notes"]];
  let total = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    total++;
    const r = JSON.parse(line);
    // 영어는 방언 라벨로 나뉠 수 있다 ("English - ..."). 라벨에 English가 들어간 줄을 모두 본다.
    if (!/english/i.test(String(r.language ?? ""))) continue;
    const hate = r.hate_speech === true;
    if (!(Number(r.severity) === 5 || hate)) continue;
    const term = String(r.word ?? "").normalize("NFKC").toLowerCase().trim();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    out.push(["", term, hate ? "hate" : "sev5", r.severity, hate, r.tone, r.category, r.safe_for_work, r.notes]);
  }
  writeFileSync(OUT, "﻿" + out.map((row) => row.map(csvCell).join(",")).join("\n"), "utf8");
  console.log(`전체 ${total}줄 중 후보 ${out.length - 1}개 → ${OUT}`);
  console.log("approve 칸에 y를 넣은 줄만 적재합니다. 가볍거나 되찾아 쓰는 말, 정상 단어와 겹치는 말은 비워 두세요.");
}

async function load(path) {
  const rows = parseCsv(readFileSync(path, "utf8").replace(/^﻿/, ""));
  const [header, ...body] = rows;
  const col = (name) => header.indexOf(name);
  const approved = body.filter((r) => /^y(es)?$/i.test(r[col("approve")]?.trim() ?? ""));
  if (!approved.length) {
    console.log("approve=y인 줄이 없어 적재하지 않습니다.");
    return;
  }
  const version = new Date().toISOString().slice(0, 10);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    for (const r of approved) {
      await client.query(
        `insert into moderation_terms (term, lang, tag, source, version)
         values ($1, 'en', $2, $3, $4)
         on conflict (lang, term) do update set tag = excluded.tag, version = excluded.version, enabled = true`,
        [r[col("term")].trim(), r[col("tag")].trim() || "sev5", SOURCE, version],
      );
    }
    await client.query("commit");
    console.log(`moderation_terms에 ${approved.length}개 적재 (version ${version}). 서버는 5분 안에 다시 읽습니다.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

if (mode === "extract" && file) await extract(file);
else if (mode === "load" && file) await load(file);
else {
  console.log("사용법: npm run moderation:terms -- extract <dataset.jsonl> | load <terms-review.csv>");
  process.exitCode = 1;
}
