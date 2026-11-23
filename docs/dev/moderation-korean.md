# 한국어 스크리닝 보강 (자모 정규화, 정규식, N-gram)

구현하는 AI(Claude Code 등)가 읽는 작업 지시서다. `docs/planning/12-ai-screening.md`(이하 12 문서)가 AI 스크리닝의 유일한 기준 문서이고, 이 문서는 그 5-1, 5-2, 5-3, 18-1의 **한국어 부분**을 보강하는 작업만 다룬다. 둘이 어긋나면 12 문서가 이긴다.

- 상태: 2026-11-23 작성. 구현 전. 코드 기준은 `main`의 `c3c1e72`. 열린 PR #107(쪽지·방명록 연결)이 머지되면 `openai.ts`, `server.ts`, `repo.ts` 등이 바뀐다.
- 표기: **[사실]** 코드나 자료로 확인한 것, **[제안]** 작성자(Claude)가 정한 것(바꿀 수 있음), **[미정]** 사람이 정할 것(맨 끝 "사람이 결정할 항목").
- 먼저 볼 것: `CLAUDE.md`, `AGENTS.md`, 12 문서 5장·18장·19장.

## 일하는 방법

0. 시작하기 전에 `git fetch origin main`으로 `main`이 `c3c1e72`에서 바뀌었는지 본다. 바뀌었으면 "현재 코드" 표를 실제 파일로 다시 확인하고, 달라진 점을 사용자에게 알린다.
1. 이 문서를 끝까지 읽고, 맨 끝 "사람이 결정할 항목"의 결정 칸을 확인한다.
2. 결정 칸이 `[미정]`이면 그 항목의 "결정 전 AI 동작"을 따른다. 동작이 "시작하지 않음"인 단계는 시작하지 않고 사용자에게 알린다.
3. 단계 순서대로 한다. 각 단계의 "완료 조건"을 통과해야 다음 단계로 간다. 테스트를 먼저 쓴다.
4. 단계가 끝날 때마다 바뀐 파일, 평가 전후 숫자, 남은 `[미정]`을 짧게 보고한다. 평가 문장과 사전 단어는 보고에도 적지 않는다.
5. 이 문서에 없는 판단이 필요하면 가장 보수적인 쪽(경고를 쌓지 않는 쪽, 적게 바꾸는 쪽)으로 하고 보고한다.

## 왜

- 한국어 경로는 보조다. 지금은 정규화한 글에서 공백만 지우고 사전 단어가 그대로 들어 있는지(부분 일치)만 본다. **[사실]**
- 그래서 표기만 조금 바꿔도 비껴간다. 대역어 "나쁜말"로 현재 코드를 실행한 결과는 아래 "테스트 명세"에 있다. **[사실]**
- 한국어 사전과 한국어 평가 문장이 없어서, 고쳐도 좋아졌는지 숫자로 말할 수 없다. 12 문서는 첫 사전을 영어로만 적재했고 한국어 보조 사전을 19-3 "나중"에 두었다. 50문장 평가셋의 "정상 글" 8문장은 영어와 한국어를 합친 수다. **[사실]**

## 목표

- 한국어 표기 변형(구분 기호 하나 끼우기, 쌍자음, 모음 늘임, 받침을 낱자로 쓰기)을 사전 단어와 같은 값으로 접어서 잡는다. (자모 정규화)
- 한국어 문장 틀 중 평가에서 놓친 것만 정규식으로 보완한다. (정규식)
- 철자가 한 글자 정도 다른 3음절 이상 사전 단어를 찾아 **검토 보류**로 보낸다. (N-gram, 선택)
- 한국어 평가 문장으로 고치기 전후를 묶음별 숫자로 비교한다.
- 한국어 사전을 확보해 DB에 적재한다.

## 목표 아님

- 모델 도입(KoELECTRA, KLUE-RoBERTa), ONNX Runtime, 온톨로지 지식그래프, 추상구문트리.
- Aho-Corasick. 사전이 5,000개를 넘고 느려질 때만 따로 검토한다.
- 문장 순화(치환), 영어 경로 변경.
- OpenAI 단계 변경(시간 제한, 사용자당 상한, 장애 차단기, 실패 시 통과).
- DB 스키마 변경.
- 쪽지·방명록 연결. PR #107(`yoon-claude/heap-screening`)이 진행 중이고 판정은 `screen()`을 그대로 부른다. 판정이 `screen()` 한 함수라서, 연결되면 같은 개선이 그대로 적용된다. 다른 사람의 브랜치는 건드리지 않는다. **[사실]**

## 하면 안 되는 것

1. 실제 금칙어, 욕설 후보, 평가 문장 원문을 저장소에 넣지 않는다. 코드, 테스트, 문서, 커밋 메시지, PR 모두 해당한다. 테스트에는 대역어 `나쁜말`(기존 `moderation.test.ts`가 쓰는 값)만 쓴다. 원본과 결과는 `.moderation-private/`(gitignore)에만 둔다. **[사실]**
2. 판정 기록(`reasons`), `trace`, 콘솔 로그에 걸린 단어나 입력 글을 남기지 않는다. 근거 종류만 남긴다.
3. `normalize.ts`의 반환값(`text`, `tokens`, `compact`)을 바꾸지 않는다. `normalize(...).text`가 `normalizedHash`(반복 글 감지)에 쓰이고 기존 사전·테스트가 같은 값에 기댄다.
4. 기존 `matchLexicon`의 동작과 반환형을 바꾸지 않는다. 기존 테스트가 null 여부로 확인한다. 새 기능은 새 함수로 붙인다.
5. OpenAI 단계의 동작을 바꾸지 않는다.
6. DB 스키마를 바꾸지 않는다. 필요해 보이면 멈추고 사용자에게 알린다. (`CLAUDE.md`의 마이그레이션 규칙, 공유 DB)
7. 공유 DB에 쓰기(사전 적재, 허용 목록 추가)는 하기 전에 개수, 출처, version을 사용자에게 알리고 확인받는다. `.env.local` 값과 `DATABASE_URL`을 출력하지 않는다.
8. 정책 숫자는 `policy.ts`에만 둔다. 기준을 바꾸면 `versions`를 올린다.
9. N-gram 일치를 바로 `block`(경고)으로 처리하지 않는다. 항상 `hold_review`다.
10. 2음절 사전 항목에 N-gram을 쓰지 않는다. 변형과 정상 단어가 같은 거리라 구분되지 않는다. **[사실]**
11. 오탐을 막으려고 정상 단어 예외를 코드에 박지 않는다. DB의 `moderation_allowlist`를 쓴다.
12. main에 직접 커밋하거나 푸시하지 않는다. PR은 사용자가 요청할 때만 만든다. 머지는 사용자가 한다. (`CLAUDE.md`)

## 현재 코드 **[사실]**

| 파일 | 지금 하는 일 | 이 작업과의 관계 |
|---|---|---|
| `src/lib/moderation/normalize.ts` | NFKC, 소문자, 글자 사이 구분 기호 붙이기(3글자 이상일 때만), 같은 글자 3번 넘게 반복하면 2번으로, 숫자·기호 치환. `compact`는 공백만 지운 글 | 수정 금지. `compact`를 새 단계의 입력으로 쓴다. |
| `src/lib/moderation/lexicon.ts` | `buildLexicon`: `ko`, `ja`, `zh` 항목은 `substrings`에 공백을 지워 저장. `matchLexicon`: 단어, 구, 마지막에 `compact.includes(term)`. 허용 목록 단어 안의 일치는 제외 | 새 필드와 새 함수를 추가한다. 기존 함수는 그대로 둔다. |
| `src/lib/moderation/screen.ts` | 사전 → DB regex → 연락처 → OpenAI. 사전에 걸리면 OpenAI 없이 바로 `block`. 결과는 `publish`, `block`, `contact`, `hold_self_harm`, `hold_review` | 새 단계를 붙이고 `publish` 반환 두 곳을 고친다. |
| `src/lib/moderation/policy.ts` | 정책 숫자와 `versions`. 문구 `MODERATION_TEXT.holdReview` | 새 설정값을 둔다. |
| `src/lib/moderation/server.ts` | 사전·허용 목록·DB regex를 읽어 `buildLexicon`을 부르고 5분마다 다시 읽는다. `trace` 단계 이름표 `STAGE_LABEL`이 `TraceStep["stage"]` 전체를 키로 요구 | `trace`에 단계를 더하면 이름표도 더해야 한다. |
| `src/lib/moderation/repo.ts` | `block`, `contact`, `hold_self_harm` 외 결과는 모두 숨김 저장 + 종류 `abuse` + 검토 대기 + 경고 없음. 방 주인도 자기 방의 `hold_review` 숨김을 검토한다 | `hold_review`로 보내면 스키마 변경이 필요 없다. |
| `src/lib/moderation/eval.live.test.ts` | `{text, expect, group}` 줄을 읽어 실제 OpenAI로 돌린다. `MODERATION_EVAL=1`일 때만. `MODERATION_EVAL_FILE`로 파일을 바꾼다. `expect`는 결과 이름(`publish` 등)이다 | 규칙 단계만 재는 옵션과 묶음별 집계를 더한다. |
| `src/lib/moderation/moderation.test.ts` | 대역어 사전으로 정규화, 사전, 연락처, 위협, OpenAI 결정 테스트 | 새 테스트를 같은 파일 또는 옆 파일에 더한다. |
| `scripts/moderation-terms.mjs` | `extract`는 언어에 English가 든 줄만 뽑는다. `load`는 `lang='en'`, `source='ProfanityBench'`로 고정해 넣는다 | 한국어용으로 확장한다. 기존 동작은 유지한다. |
| `db/migrations/0011_moderation.sql` | `moderation_terms(term, lang, tag, source, version, enabled)`, `moderation_patterns`, `moderation_allowlist` | 바꾸지 않는다. 한국어는 `lang='ko'`로 넣는다. |

사전 일치가 걸리면 곧바로 경고 1회가 쌓인다(12 문서 5-2 결정). 그래서 새로 잡히는 일치를 어떻게 처리할지가 정책 결정이다(D2).

## 설계 **[제안]**

### 판정 순서 (새로 붙는 곳은 `NEW`)

```
normalize
 → matchLexicon                 (기존. 걸리면 block)
 → matchLexiconKo               NEW  자모 정확 일치, N-gram. 결과는 아래 "결과 처리"
 → DB regex, 코드 regex         (기존. 한국어 패턴만 추가)
 → 연락처                       (기존)
 → OpenAI                       (기존)
 → 마지막에 soft 신호가 남아 있고 결과가 publish면 hold_review
```

### 새 파일과 함수

- `src/lib/moderation/jamo.ts`: 순수 함수만. `toJamo`, `canonJamo`, `bigrams`, `lev`, `windowDistance`. 의존성 없음. 아래 "참고 구현"을 TS로 옮긴다.
- `lexicon.ts`에 추가:
  - `Lexicon`에 자모 키 목록 `koJamo: { term: LexiconTerm; key: string }[]`와 N-gram 역색인을 둔다. `EMPTY_LEXICON`에도 같은 필드를 넣는다.
  - `buildLexicon`에서 `substrings` 항목마다 `key = canonJamo(term)`을 한 번 계산한다. 키 길이가 4 미만(1음절)이면 자모 경로에서 뺀다.
  - `matchLexiconKo(lex, n)`: `{ term, kind: "jamo" | "fuzzy" } | null`을 돌려준다.

### 자모 정확 일치

- 입력은 `canonJamo(n.compact)`다. 구분 기호 제거, 자모 분해와 접기, 모음 늘임 줄이기가 한 번에 들어 있다.
- 사전 키가 그 안에 들어 있으면 일치다. 조사나 어미가 붙은 어절도 부분 일치라서 잡힌다.
- 허용 목록은 기존과 같은 방식으로 **음절 기준** 글(`n.compact`)에서 본다. 허용 단어 `a`가 `a.includes(term.term)`이고 `n.compact.includes(a)`면 제외한다.
- 접기 규칙: 쌍자음은 평자음(ㄲ→ㄱ, ㄸ→ㄷ, ㅃ→ㅂ, ㅆ→ㅅ, ㅉ→ㅈ), ㅐ→ㅔ, ㅒ→ㅖ. 구분 기호는 한글 사이의 `. _ - * ~ ·`. 모음 늘임은 `모음 + ㅇ + 같은 모음`을 모음 하나로.

### N-gram (선택, D4)

- 대상은 키 길이 6자모 이상(3음절 이상) 항목뿐이다.
- 사전 키의 2-gram을 역색인한다. 입력은 **어절 단위**(`n.tokens`)로 본다. 어절 안에서 사전 키 길이 -1, 0, +1 구간을 밀며 비교한다. 조사가 붙은 어절을 잡으려는 것이다. 어절 전체를 비교하면 조사가 붙은 변형을 놓친다. **[사실]**
- 구간과 사전 키가 2-gram을 2개 이상 공유하고 편집 거리가 1(1 이상 1 이하)이면 일치다. 거리 0(정확 일치)은 앞 단계가 처리한다.
- 반드시 정확 일치(`matchLexicon`, 자모 정확 일치) **뒤에서만** 돌린다. 정확 일치 문자열이 든 어절도 구간 비교에서는 거리 1로 나오기 때문이다. **[사실]**
- 결과는 항상 `fuzzy`이고 항상 soft다.

### 결과 처리 (`screen.ts`)

- `kind: "jamo"`
  - D2가 `block`이면 기존 사전과 같이 `early("block", reason)`.
  - D2가 `hold_review`(결정 전 기본)이면 soft 신호로 기록한다.
- `kind: "fuzzy"`: 항상 soft 신호로 기록한다.
- soft 신호가 있어도 **뒤 단계를 계속 돌린다.** 일찍 돌려주면 연락처 검사와 OpenAI(자해 판정 포함)를 건너뛰기 때문이다.
  - 뒤 단계 결과가 `block`, `contact`, `hold_self_harm`이면 그 결과를 따르고, soft 근거는 `reasons`에 덧붙인다.
  - 결과가 `publish`면 `hold_review`로 바꾼다. OpenAI가 실패해서 `publish`가 된 경우도 같다. `publish`를 돌려주는 곳이 두 군데(OpenAI 미호출, `decideOpenAI`)이므로 둘 다 고친다.
- `reasons` 형식: 기존 `lexicon:ko:<tag>`를 유지하고, 새 경로는 `lexicon:ko:<tag>:jamo`, `lexicon:ko:<tag>:fuzzy`. 구현 전에 `grep -rn "lexicon:" src`로 `reasons` 문자열을 해석하는 코드가 있는지 확인한다.
- `TraceStep`에 단계(예: `lexicon-ko`)를 더하면 `server.ts`의 `STAGE_LABEL`도 더한다.
- 사용자 안내문은 기존 `MODERATION_TEXT.holdReview`를 쓴다.

### 정책 값 (`policy.ts`)

```ts
koJamo:  { enabled: true,  mode: "hold_review" as "block" | "hold_review" },
koFuzzy: { enabled: false, minJamo: 6, minSharedBigrams: 2, maxDistance: 1 },
```

값은 모두 시험용이다. 바꾸면 `versions.thresholds`를 올린다. N-gram은 꺼진 채로 시작한다(D4가 정해질 때까지).

## 작업 단계

표기: **[AI]** AI가 한다, **[사람]** 사람이 한다.

### 단계 0. 확인 (코드 변경 없음)

| 번호 | 담당 | 할 일 |
|---|---|---|
| 0-1 | 사람 | 공유 DB의 한국어 항목 수: `select tag, count(*) from moderation_terms where lang='ko' and enabled group by tag;` |
| 0-2 | 사람 | 3음절 이상 항목 수: 위 쿼리에 `and char_length(term) >= 3`을 더한다. 단계 5를 할지 판단하는 자료다. |
| 0-3 | 사람 | ProfanityBench에 한국어 줄이 있는지: `jq -r .language .moderation-private/dataset.jsonl \| sort \| uniq -c \| sort -rn`. 데이터셋 카드만으로는 알 수 없었다. |
| 0-4 | AI | `npm install` 후 `npm test`로 현재 상태를 기록한다. 샌드박스에는 `node_modules`가 없을 수 있다. `.npmrc`에 `legacy-peer-deps=true`가 있다. |

완료 조건: 숫자 3개와 테스트 기준선을 사용자에게 보고했다.

### 단계 1. 한국어 평가 문장 틀과 러너

| 번호 | 담당 | 할 일 |
|---|---|---|
| 1-1 | AI | `eval.live.test.ts`에 `MODERATION_EVAL_RULES_ONLY=1` 옵션을 더한다. `moderate`를 항상 `{ status: "called", flagged: false, categories: {}, scores: {} }`로 돌려주는 함수로 바꿔 OpenAI 키 없이 규칙 단계만 잰다. |
| 1-2 | AI | 결과를 묶음(`group`)별로 집계해 출력한다. 묶음, 문장 수, 기대와 같은 수, 다른 수. 원문은 찍지 않는다. |
| 1-3 | AI | (선택) `MODERATION_EVAL_TERMS_FILE`로 `.moderation-private/`의 사전 CSV를 읽어 공유 DB에 쓰기 전에 평가할 수 있게 한다. |
| 1-4 | 사람 | 한국어 평가 문장을 쓴다. 묶음은 아래 표를 따른다. (D5) |
| 1-5 | AI | 현재 코드로 기준선을 돌려 묶음별 숫자를 12 문서에 "18-1-2 한국어 기준선"으로 남긴다. 문장 원문은 넣지 않는다. |

평가 문장은 `.moderation-private/eval-ko.jsonl`에 둔다. 실행: `MODERATION_EVAL=1 MODERATION_EVAL_RULES_ONLY=1 MODERATION_EVAL_FILE=.moderation-private/eval-ko.jsonl npm run moderation:eval`.

| 묶음 | 목적 | 기대 결과 |
|---|---|---|
| 정상 팬 대화 | 오탐 점검 | `publish` |
| 과장·관용 표현 | 팬이 흔히 쓰는 과장 표현의 오탐 점검 | `publish` |
| 욕설 원형 | 기본 탐지 | `block` |
| 표기 변형 | 구분 기호 하나, 쌍자음, 모음 늘임, 받침 낱자 (단계 3) | `block` 또는 `hold_review` (D2) |
| 초성 약어 | 사전·패턴에 둔 것만 (단계 4) | `block` |
| 철자 변형 | 모음·받침이 한 글자 다름 (단계 5) | `hold_review` |
| 정상 대조 | 사전 단어가 부분으로 들어간 정상 단어와 합성어 | `publish` |
| 연락처, 성적 요구, 위협, 자해 | 한국어 표현 | 기존 기대값 |

변형 문장은 사람이 쓴 것 위주로 둔다. 구현이 쓰는 규칙으로 자동 생성하면 같은 규칙으로 재기 때문에 거의 100%가 나와서 검증이 되지 않는다.

완료 조건: 규칙만 재는 모드가 OpenAI 키 없이 돌고 묶음별 숫자를 출력한다. 기준선이 문서에 있다.

### 단계 2. 한국어 사전 (D1)

| 번호 | 담당 | 할 일 |
|---|---|---|
| 2-1 | 사람 | 출처를 정하고 라이선스를 확인한다. (D1, 아래 후보표) |
| 2-2 | AI | `scripts/moderation-terms.mjs`를 확장한다. CSV의 `lang`, `source` 칸을 읽고(없으면 기존 `en`, `ProfanityBench`), 추출은 언어와 입력 형식을 고를 수 있게 한다. 영어 CSV로 `load`가 이전과 같은 SQL을 내는지 확인하는 `--dry-run`을 둔다. |
| 2-3 | 사람 | 검토 CSV(`.moderation-private/terms-review-ko.csv`)의 `user_review` 칸에 y/n/?를 적는다. 영어 때는 후보 841개에서 703개를 켰고 2차 검토 뒤 604개를 켰다. 이 정도 규모를 가늠한다. |
| 2-4 | AI | 적재 전에 개수, 출처, version을 사용자에게 알리고 확인받는다. 확인 뒤 `npm run moderation:terms -- load <csv>`. 서버는 5분 안에 다시 읽는다. |

완료 조건: DB에 `lang='ko'` 항목이 켬/끔 개수와 함께 들어갔다. 영어 항목 수는 그대로다.

한국어 데이터 후보. 모델 학습용이 아니라 사전 후보를 모으는 용도다. 모두 팬 채팅이 아니라 뉴스·영상 댓글이라 평가 문장의 기준으로는 쓰지 않는다. 확인일 2026-11-23.

| 출처 | 규모와 내용 | 라이선스 | 링크 |
|---|---|---|---|
| ProfanityBench (이미 사용) | 약 82,208행, 24개 필드(`language`, `word`, `severity`, `hate_speech` 등). 한국어 포함 여부는 카드로 확인 불가 | MIT | https://huggingface.co/datasets/BibbyResearch/ProfanityBench |
| K-HATERS | 약 19만 2천 개 뉴스 댓글, 대상별 공격성 점수 | cc-by-4.0 (출처 표기 필요) | https://huggingface.co/datasets/humane-lab/K-HATERS , https://github.com/ssu-humane/K-HATERS , https://aclanthology.org/2023.findings-emnlp.952 |
| KOLD | 뉴스·영상 댓글 40,429개, 공격 표현 구간(span) 표시 | 확인하지 못함 | https://aclanthology.org/2022.emnlp-main.744 , https://arxiv.org/abs/2205.11315 |
| Korean UnSmile | 혐오 표현 다중 라벨 | 제3자 요약 페이지 기준 데이터셋 CC-BY-NC-ND 4.0, 상업적 사용은 Smilegate AI 문의 필요. 원본 저장소 확인 필요 | https://www.sourcepulse.org/projects/1844924 |
| K-MHaS | 뉴스 댓글 109,692개, 8개 세부 혐오 유형 | HF 미러 README 기준 cc-by-sa-4.0 (같은 조건으로 공유) | https://github.com/adlnlp/K-MHaS , https://huggingface.co/datasets/jeanlee/kmhas_korean_hate_speech |

KOLD와 UnSmile은 라이선스를 확인하기 전에는 쓰지 않는다. 라이선스 해석은 팀이 최종 확인한다.

### 단계 3. 자모 정규화

| 번호 | 담당 | 할 일 |
|---|---|---|
| 3-1 | AI | "테스트 명세"의 표를 테스트로 먼저 쓴다. 처음에는 새 경로 케이스가 실패해야 한다. |
| 3-2 | AI | `jamo.ts`를 만든다. |
| 3-3 | AI | `lexicon.ts`에 자모 키와 `matchLexiconKo`(정확 일치만)를 더한다. |
| 3-4 | AI | `screen.ts`에 새 단계와 soft 신호 처리를 붙인다. D2 값에 따라 `policy.ts`의 `koJamo.mode`를 정한다. |
| 3-5 | AI | 1단계 러너로 전후를 비교한다. 정상 대조 묶음에서 새로 걸린 문장은 원문 없이 개수만 보고하고, 허용 목록에 넣을 후보는 사용자에게 보여 확인받는다. |
| 3-6 | AI | 성능 회귀 테스트를 하나 둔다. 메시지 60자, 사전 5,000개에서 `matchLexiconKo`가 느슨한 상한(10ms 미만) 안에 끝난다. |

완료 조건: 명세의 모든 케이스 통과, 기존 테스트 통과, `tsc`·`eslint` 통과, 평가 전후 숫자 보고.

### 단계 4. 정규식

| 번호 | 담당 | 할 일 |
|---|---|---|
| 4-1 | AI | 구분 기호, 쌍자음, 모음 늘임은 단계 3이 처리하므로 단어별 우회 패턴은 만들지 않는다. |
| 4-2 | AI | 1단계 평가에서 놓친 한국어 문장 틀(위협, 성적 요구, 연락처 표현)만 패턴으로 만든다. |
| 4-3 | AI | 패턴마다 "걸려야 할 문장"과 "걸리면 안 되는 문장"을 테스트로 둔다. (12 문서 5-3 규칙) |
| 4-4 | AI | 반복은 `.{0,30}`처럼 상한이 있는 것만 쓴다. 긴 입력(10,000자)의 처리 시간 테스트를 하나 둔다. |
| 4-5 | AI | `versions.patterns`를 올린다. |

패턴을 어디에 둘지:

- 욕설 단어가 들어가는 패턴은 DB(`moderation_patterns`)에 둔다. 공개 저장소에 올려도 되는 단어만 든 문장 틀은 `patterns.ts`에 둘 수 있다.
- DB 패턴은 정규화한 글과 원문 **양쪽**에 돌고, 코드 패턴(`findPattern`)은 정규화한 글에만 돈다. **[사실]**
- 정규화를 거치면 초성 낱자가 U+1100 블록으로 바뀐다. 그래서 정규화한 글에 돌리는 패턴은 `[ᄀ-ᄒ]`, 원문에 돌리는 패턴은 `[ㄱ-ㅎ]`로 쓴다.
- `ㅂㅂ` 같은 흔한 초성 약어는 일상 표현과 겹칠 수 있으니, 사람이 검토한 것만 넣는다.

완료 조건: 패턴별 테스트 통과, 긴 입력 테스트 통과, 평가 숫자 보고.

### 단계 5. N-gram (D4가 "진행"이고 0-2에서 3음절 이상 항목이 충분할 때만)

| 번호 | 담당 | 할 일 |
|---|---|---|
| 5-1 | AI | "테스트 명세"의 N-gram 표를 테스트로 먼저 쓴다. |
| 5-2 | AI | `jamo.ts`에 `bigrams`, `lev`, 구간 비교 함수를 둔다. |
| 5-3 | AI | `buildLexicon`에서 대상 항목(키 6자모 이상)의 2-gram 역색인을 한 번 만든다. |
| 5-4 | AI | `matchLexiconKo`에 fuzzy 단계를 더한다. 정확 일치가 실패한 어절에서만 돌린다. |
| 5-5 | AI | `koFuzzy.enabled`가 켜져 있을 때만 동작하게 한다. |
| 5-6 | AI | 속도를 잰다. 사전 500개와 5,000개, 어절 길이별로 메시지당 시간. 구간 비교 방식은 아직 재지 않았다. 결과를 12 문서에 남긴다. |
| 5-7 | AI | 평가 전후를 비교한다. 철자 변형 묶음의 미탐이 줄었는지, 정상 대조 묶음의 오탐이 늘었는지를 본다. |

방 주인도 자기 방의 `hold_review` 숨김을 검토한다. **[사실]** N-gram 보류 건이 많으면 크리에이터의 검토 부담이 늘어난다. 켜기 전에 평가셋에서 보류 건수를 보고한다.

완료 조건: 표의 모든 케이스 통과, 속도와 평가 숫자 보고.

### 단계 6. 마무리

| 번호 | 담당 | 할 일 |
|---|---|---|
| 6-1 | AI | "커밋 전 확인"을 모두 돌린다. |
| 6-2 | AI | "끝나면 고칠 문서"를 고친다. |
| 6-3 | AI | `jimins-claude/` 접두사 브랜치에 커밋하고 푸시한다. PR은 사용자가 요청할 때만 만든다. |
| 6-4 | AI | 배포 순서를 알린다. 코드를 먼저 올려도 안전하다(사전에 한국어 항목이 없으면 새 경로는 아무것도 잡지 않는다). 사전 적재는 그다음이다. |
| 6-5 | AI | 되돌리는 방법을 알린다. 항목은 `enabled=false`로 바꾸면 5분 안에 꺼진다. 자모 경로와 N-gram은 `policy.ts` 스위치로 끈다. |

## 테스트 명세

### 단계 3: 자모 정규화 (대역어 `나쁜말`을 `lang: "ko"` 항목으로 둔다)

"현재 코드" 열은 2026-11-23에 `normalize.ts`, `lexicon.ts`를 그대로 실행해 확인했다. **[사실]**

| 입력 | 현재 코드 | 새 경로 기대 |
|---|---|---|
| `나쁜말` | 걸림 | 걸림 |
| `나 쁜 말` | 걸림 | 걸림 |
| `나.쁜.말`, `나-쁜-말` (구분 기호 둘 이상) | 걸림 | 걸림 |
| `나.쁜말`, `나쁜.말` (구분 기호 하나) | 안 걸림 | 걸림 |
| `나아쁜말` (모음 늘임) | 안 걸림 | 걸림 |
| `나븐말` (쌍자음 접기) | 안 걸림 | 걸림 |
| `나쁜마알` (모음 늘임) | 안 걸림 | 걸림 |
| `ㄴㅏㅃㅡㄴㅁㅏㄹ` (받침을 낱자로) | 안 걸림 | 걸림 |
| `나쁜말이`, `나쁜말투` (조사·접미 붙음) | 걸림 | 걸림 |
| `나쁜맠`, `나쁘말`, `나뿐말` (철자 변형) | 안 걸림 | 안 걸림 (단계 5 몫) |
| 허용 목록에 `나쁜말투`를 넣고 `나쁜말투` 입력 | 안 걸림 | 안 걸림 |

- 입력은 반드시 `normalize`를 거친 값으로 테스트한다. 받침 낱자는 NFKC가 초성 자모(U+1100 블록)로 바꿔서 음절에 합쳐지지 않는다. 예를 들어 `ㄴㅏㅃㅡㄴㅁㅏㄹ`의 `compact`는 `나쁘ᄂ마ᄅ`다. 그래서 현재 코드는 놓치고 `canonJamo`는 잡는다. **[사실]**
- 회귀 테스트: 기존 `moderation.test.ts`가 전부 통과해야 한다. 기존 한국어 테스트 `나 쁜 말 하지마`도 그대로 걸려야 한다.

알려진 부작용 **[사실]**. 테스트로 고정하지 말고 평가의 정상 대조 묶음으로 관찰한다.

- 모음 늘임 줄이기가 정상 단어도 합친다. `canonJamo("나아가다")`와 `canonJamo("나가다")`가 같다.
- 공백을 먼저 지우고 구분 기호를 지우므로 문장 끝 글자와 다음 문장 첫 글자가 이어져 일치할 수 있다(예: `나. 쁜말`). 기존 공백 제거가 이미 가진 성질과 같다.
- 구분 기호 제거 때문에 사전 단어 사이에 기호가 낀 정상 문장이 새로 걸릴 수 있다.

### 단계 3: 결과 처리 (`screen` 테스트, 가짜 OpenAI)

| 상황 | 기대 |
|---|---|
| 자모 일치, D2=`hold_review`, OpenAI 정상(걸린 것 없음) | `hold_review`, `reasons`에 `lexicon:ko:*:jamo` |
| 자모 일치, D2=`hold_review`, OpenAI가 `hate` | `block`, `reasons`에 OpenAI 근거와 soft 근거 모두 |
| 자모 일치, D2=`hold_review`, OpenAI가 `self-harm` | `hold_self_harm` |
| 자모 일치, D2=`hold_review`, OpenAI 시간 초과 | `hold_review` |
| 자모 일치, D2=`block` | `block`, OpenAI는 부르지 않음(`skipped_earlier_hit`) |
| 자모 일치 + 연락처 | `contact` |

### 단계 5: N-gram (`koFuzzy.enabled` 켬, 어절 단위, 거리 1, 6자모 이상)

2026-11-23 프로토타입으로 확인했다. **[사실]**

| 입력 | 기대 |
|---|---|
| `나쁜맠`, `나쁘말`, `나뿐말` | `fuzzy` 일치 (거리 1) |
| `나쁜맠이`, `나뿐말이` (조사 붙음) | `fuzzy` 일치 (구간 비교일 때). 어절 전체를 비교하면 놓친다 |
| `나쁜소리` | 일치 없음 |
| `나쁜말이`, `나쁜말투` | N-gram에 도달하지 않음. 앞 단계(정확 일치)에서 이미 걸림 |
| 2음절 대역어 `바보`가 사전에 있을 때 `바부`, `바비` | 둘 다 일치 없음 (6자모 미만이라 대상 아님) |
| 일치 결과의 처리 | 항상 `hold_review`, 경고 없음 |

## 참고 구현 (시험한 JS 프로토타입)

대역어 `나쁜말`, `바보`, `멍청이`로만 시험했다. 정확도는 실제 사전과 평가셋으로 다시 잰다. TS로 옮길 때 `strict` 타입을 맞추고 동작(접기 규칙, 정규식, 임계값)은 바꾸지 않는다. 속도는 샌드박스(Xeon 2.1GHz, 1스레드) 기준 60자 메시지 한 건당이다. Render CPU는 더 느릴 수 있다.

| 항목 | 시간 |
|---|---|
| 지금 `normalize` | 28.5µs |
| `canonJamo` 추가 | +5.4µs |
| 자모 정확 일치 반복 (사전 500개 / 5,000개) | 95µs / 996µs |
| N-gram 색인 + 편집 거리, 어절 전체 비교 (500개 / 5,000개) | 30µs / 268µs |
| 구간 비교 방식의 N-gram | 재지 않음 |

배포 환경은 Render 무료 플랜(0.1 CPU, 512 MB RAM)이다. 근거는 `jimins-claude/plan-docs` 브랜치의 `docs/planning/03-tech-stack.md` 1-2절이고 아직 `main`에 병합되지 않았다(커밋 `cc427e8`). **[사실]** 위 시간은 이 환경에서 잰 값이 아니다. 단계 3-6의 상한(10ms)과 5-6의 속도 측정은 Render 무료 플랜에서도 확인한다. 사전 키와 N-gram 역색인이 차지하는 메모리도 함께 잰다.

```js
const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
const JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
// 쌍자음은 평자음으로, ㅐ/ㅔ와 ㅒ/ㅖ는 같은 것으로 본다.
const FOLD = { "ㄲ":"ㄱ","ㄸ":"ㄷ","ㅃ":"ㅂ","ㅆ":"ㅅ","ㅉ":"ㅈ","ㅐ":"ㅔ","ㅒ":"ㅖ" };
const fold = (c) => FOLD[c] ?? c;

// 음절 하나를 초성+중성+종성으로 쪼갠다. NFKC를 거친 글에 남는 낱자(U+1100 블록)도 같은 자모로 바꾼다.
export function toJamo(s) {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 0xac00 && cp <= 0xd7a3) {
      const c = cp - 0xac00;
      out += fold(CHO[Math.floor(c / 588)]) + fold(JUNG[Math.floor((c % 588) / 28)]) + fold(JONG[c % 28]);
    } else if (cp >= 0x1100 && cp <= 0x1112) out += fold(CHO[cp - 0x1100]);
    else if (cp >= 0x1161 && cp <= 0x1175) out += fold(JUNG[cp - 0x1161]);
    else if (cp >= 0x11a8 && cp <= 0x11c2) out += fold(JONG[cp - 0x11a7]);
    else out += ch;
  }
  return out;
}

const HANGUL = "\\uAC00-\\uD7A3\\u1100-\\u11FF";
const SEP_BETWEEN = new RegExp(`(?<=[${HANGUL}])[._\\-*~·]+(?=[${HANGUL}])`, "gu");

// 판정용 자모열: 구분 기호 제거 → 자모 분해·접기 → 모음 늘임(바아보) 줄이기
export function canon(compact) {
  let s = compact.replace(SEP_BETWEEN, "");
  s = toJamo(s);
  return s.replace(/([ㅏ-ㅣ])ㅇ\1+/g, "$1");
}

export function bigrams(s) {
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

// 편집 거리(글자 하나 바꾸기·넣기·빼기를 1로 셈). maxD를 넘으면 바로 포기한다.
export function lev(a, b, maxD) {
  if (Math.abs(a.length - b.length) > maxD) return maxD + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > maxD) return maxD + 1;
    prev = cur;
  }
  return prev[b.length];
}

// 사전의 2-gram을 미리 색인해 두고, 입력 단어와 겹치는 항목만 후보로 뽑는다. (어절 전체 비교용)
export function buildIndex(terms, minJamo = 6) {
  const items = terms.map((t) => ({ term: t, key: canon(t) })).filter((x) => x.key.length >= minJamo);
  const inv = new Map();
  items.forEach((it, i) => {
    for (const g of bigrams(it.key)) {
      let arr = inv.get(g);
      if (!arr) inv.set(g, (arr = []));
      arr.push(i);
    }
  });
  return { items, inv, minJamo };
}

// 어절 안에서 사전 키 길이 -1 ~ +1 구간을 밀며 비교한다 (조사가 붙은 어절용). 시험함, 속도는 안 잼.
// 정확 일치 뒤에서만 부른다. 정확 일치 문자열이 든 어절도 거리 1로 나온다.
// 구현할 때는 키와 키의 bigrams를 buildLexicon에서 한 번만 계산하고, 색인으로 후보 항목을 먼저 줄인다.
export function windowFind(token, term, maxD = 1) {
  const tk = canon(token), key = canon(term);
  if (key.length < 6) return null;
  let best = null;
  for (let len = key.length - 1; len <= key.length + 1; len++) {
    for (let s = 0; s + len <= tk.length; s++) {
      const w = tk.slice(s, s + len);
      let inter = 0;
      const A = bigrams(w), B = bigrams(key);
      for (const g of A) if (B.has(g)) inter++;
      if (inter < 2) continue;
      const d = lev(w, key, maxD);
      if (d >= 1 && d <= maxD && (!best || d < best.dist)) best = { dist: d, win: s };
    }
  }
  return best;
}
```

## 커밋 전 확인과 Git

- `npm test`, `npx tsc --noEmit`, `npx eslint src scripts`, `npm run build`. (`CLAUDE.md`)
- 브랜치 이름은 `jimins-claude/`로 시작한다. 예: `jimins-claude/feature-ai-screening-ko`. 기획 문서만 바꿀 때는 `jimins-claude/plan-docs`다.
- 커밋 메시지는 `feat:`, `fix:`, `docs:` 형식이고 `CLAUDE.md`의 끝 두 줄 규칙을 따른다.
- 이 작업은 Next 코드를 건드리지 않지만 `AGENTS.md`의 주의는 그대로다. Next 관련 파일을 고쳐야 하면 `node_modules/next/dist/docs/`를 먼저 읽는다.

## 끝나면 고칠 문서

| 문서 | 고칠 곳 |
|---|---|
| 12 문서 5-1 | "한글 자모 처리는 보조입니다" 줄을 실제 처리(접기 규칙, 구분 기호, 모음 늘임)로 바꾼다. |
| 12 문서 5-2 | "한국어는 보조 목록으로…" 줄과 한국어 사전 출처, 적재 결과(개수, version)를 적는다. |
| 12 문서 5-3 | 한국어 패턴 종류를 표에 더한다. |
| 12 문서 18-1 | 18-1-2 "한국어 기준선과 결과"를 더한다. 묶음별 숫자만, 원문 없이. |
| 12 문서 19-3 | "한국어 보조 사전"을 완료로 옮긴다. |
| `docs/planning/04-roadmap-and-team.md` | 4장 결정 사항 로그에 아래 결정들을 `날짜 \| 항목 \| 결정` 형식으로 기록한다. (`CLAUDE.md`) |
| 이 문서 | 맨 위에 "완료"와 날짜를 적고, 현재 상태 설명은 12 문서로 옮긴다. |

## 확인하지 못한 것

- 공유 DB의 한국어 항목 수 (0-1, 0-2).
- ProfanityBench의 한국어 포함 여부 (0-3).
- KOLD의 라이선스, Korean UnSmile 원본 저장소의 라이선스.
- 구간 비교 방식 N-gram의 처리 시간, Render 무료 플랜(0.1 CPU, 512 MB)에서의 모든 처리 시간과 메모리.
- 이슈 #99(Next 실행 위치)와 #95의 내용. 읽지 못했다.
- 한국어 평가 문장이 아직 없어서 정확도(미탐·오탐 비율)는 측정한 적이 없다. 위 표의 결과는 대역어 동작 확인이다.

## 사람이 결정할 항목

결정이 나면 아래 "결정" 칸을 `[결정]`과 날짜, 내용으로 고치고, 04 문서 결정 로그에도 남긴다. 결정 전에는 "결정 전 AI 동작"을 따른다.

| 번호 | 결정할 것 | 선택지 | 결정 전 AI 동작 | 영향 단계 | 결정 |
|---|---|---|---|---|---|
| D1 | 한국어 사전 출처 | (가) 팀이 직접 작성 (나) ProfanityBench 한국어 행 (0-3에서 있을 때) (다) 공개 댓글 데이터에서 후보 추출 (K-HATERS처럼 출처 표기가 필요한 것, 라이선스 확인 필수) (라) 위 혼합 | 단계 2-2의 스크립트 하위 호환 확장(`lang`, `source`, `--dry-run`)까지만 하고 나머지는 시작하지 않음 | 2, 3 이후의 실제 사전 평가 | [미정] |
| D2 | 자모 정규화로 **새로 잡히는** 일치의 처리 | (가) `hold_review`(숨김, 경고 없음, 검토 목록) (나) `block`(경고 1회) | (가) `hold_review`로 구현하고 `policy.ts`의 `koJamo.mode`로 바꿀 수 있게 둠 | 3 | [미정] |
| D3 | 2음절 사전 항목의 자모 경로 적용 | (가) 자모 정확 일치까지 적용 (D2 처리를 따름) (나) 자모 경로에서 제외하고 기존 부분 일치만 | (가)로 구현 | 3 | [미정] |
| D4 | N-gram 진행 여부 | (가) 마감 전에 (나) 마감 후에 (다) 하지 않음 | 단계 5를 시작하지 않음. `koFuzzy.enabled`는 꺼 둠 | 5 | [미정] |
| D5 | 한국어 평가 문장 작성 | 담당(사용자, 팀원, AI가 `.moderation-private/`에 초안을 만들고 사람이 검수), 시작 규모(제안: 묶음당 10~15문장) | 1-4를 기다림. 1-1~1-3(러너 보완)만 진행. AI는 평가 문장 원문을 쓰지 않음 | 1, 3~5의 평가 | [미정] |
| D6 | 마감 전 범위 (동결 12/3, 제출 12/5) | (가) 단계 0~3까지 (제안) (나) 단계 0~4까지 (다) 단계 0~5까지 (라) 마감 후로 미룸 | 0~3단계까지만 진행하고 보고 | 전체 | [미정] |
