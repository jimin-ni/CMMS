# 15. 개발 보조 에이전트 (Render Workflows, GitHub Actions, Claude API)

- 상태: 2026-11-26 갱신. 결정 현황은 7-6. 남은 것은 [미정]으로 표시
- 제품 전체 스택과 버전은 03 문서가 기준입니다. 이 문서는 개발 보조 도구만 다룹니다.
- 담당: 본인 (Jimin)
- 브랜치: `jimins-claude/feature-render-workflows`. 개발을 모두 여기서 하고 마지막에 main에 머지 [결정]
- 표기: [사실] 코드나 공식 문서로 확인한 것, [가설] 확인이 필요한 것, [결정] 정한 것, [미정] 아직 정하지 않은 것

## 1. 한눈에 보기

두 가지를 만듭니다 [결정]. 하나는 직접 만드는 에이전트, 하나는 외부 도구를 설정해서 쓰는 것입니다.

| 항목 | ① 코드 점검 에이전트 (직접 개발) | ② PR 리뷰 (open-code-review) |
|---|---|---|
| 하는 일 | main 전체를 점검. 주석 정리(6-2), 리팩터링 제안 | PR이 열리거나 바뀔 때 바뀐 부분을 리뷰하고 줄 단위 댓글 |
| 실행 위치 | Render Workflows (Singapore) | GitHub Actions |
| 실행 시점 | 수동 또는 정기 (Cron) | PR 이벤트마다 자동 |
| 우리가 만드는 것 | 코드 전부 (`workflows/`) | 설정 파일 1개 (`.github/workflows/ocr-review.yml`) + 규칙 파일 |
| 언어 | TypeScript (Node) [결정] | YAML |
| LLM | Claude API `claude-opus-5-5` | Claude API (같은 공급자, 키는 따로) |
| 구조 | 오케스트레이터-워커 (7-1) | open-code-review 내부 구조 |
| 결과 | `jimins-claude/agent-*` 브랜치 + PR, 리포트 | PR 댓글, 요약 댓글 1개 |
| Render 트랙 | 해당 (Workflows 사용) | 해당 안 됨 |

- ①이 "에이전트 여러 개" 구조(4장)의 첫 번째입니다. 이후 에이전트(로그 점검, DB 리포트 등)도 ①과 같은 Render Workflow 서비스에 추가합니다.
- ②는 에이전트 개발이 아니라 도구 도입입니다. ①과 결과를 비교하는 기준으로도 씁니다 (7-5).
- ③ impeccable: Claude Code에 디자인 스킬을 붙여 UI 품질을 점검하고 다듬습니다. API 키가 필요 없습니다 (10장).

## 2. 브랜치와 배포

- [사실] Render Workflow 서비스는 main이 아닌 **어떤 브랜치에도** 연결할 수 있습니다. 서비스를 만들 때 Branch 칸에서 고릅니다.
- [결정] 개발 중에는 `jimins-claude/feature-render-workflows`에 연결합니다. 끝나면 main에 머지하고 서비스의 Branch를 main으로 바꿉니다.
- [결정] ① 코드는 `workflows/` 폴더에만 둡니다. 루트의 `tsconfig.json`, `eslint.config.mjs`는 이미 이 폴더를 검사에서 뺍니다. Next.js 앱 코드(`src/`)는 import하지 않습니다. 예외: AI 스크리닝 재판정 task는 `src/lib/moderation/`의 순수 모듈만 import합니다 (16 문서 6-1).
- [결정] 이 브랜치에 있는 TypeScript 뼈대(`workflows/src/index.ts`의 `hello`, `helloMany`)를 그대로 키워 갑니다.
- [사실] ②의 GitHub Actions 파일은 **PR의 대상 브랜치(main)에 있어야** 모든 PR에서 동작합니다. 이 브랜치에서 만들고 시험한 뒤 main 머지로 켜집니다.
- main 따라가기: 이 브랜치는 `workflows/`, `.github/`, 문서만 바꾸므로 충돌이 적습니다. main에 큰 변경이 들어왔을 때와 머지 직전에만 `git merge origin/main`을 합니다.
- [사실] ①이 점검하는 코드는 배포된 브랜치가 아니라 **실행할 때 GitHub에서 받은 최신 main**입니다.
- [사실] (2026-11-26) Root Directory `workflows`로 두고 `../src`의 앱 코드를 쓸 수 있음. 앱 코드가 쓰는 패키지 때문에 `workflows/build.mjs`(esbuild)로 한 파일로 묶음. Render 설정과 빌드 방식은 16 문서 2장, `workflows/README.md`가 기준

## 3. 전체 구조

```
                 PR 열림/수정
GitHub ──────────────────────────────► GitHub Actions: open-code-review ──► Claude API
(jimin-ni/memoamo)                         └─ PR에 줄 단위 댓글, 요약 댓글
   │  clone (실행 때마다)
   ▼
Render Workflow 서비스 (슬러그 memoamo-agent, 16 문서와 같은 서비스) ── Singapore
   ├─ codeReview.run            오케스트레이터 (계획 → 분배 → 합치기)
   ├─ codeReview.reviewChunk    워커 (파일 묶음 하나 리뷰, 병렬)
   ├─ codeReview.stripEmoji     규칙 기반 수정 (LLM 없음)
   ├─ (다음 에이전트).run
   │                │                       │                 │
   │ 내부 네트워크  │ Render API             │ GitHub API      │ Claude API
   ▼                ▼                       ▼                 ▼
 cmms-db-01     웹 서비스 로그            브랜치, PR        claude-opus-5-5
```

① 실행 방법 (트리거)

| 방법 | 쓰는 때 | 비고 |
|---|---|---|
| Render 대시보드 > Run Task | 개발 중 수동 실행 | 입력은 JSON 배열 |
| Render CLI | 로컬, 수동 실행 | `render workflows dev -- npm start` |
| Cron Job 서비스 | 정기 실행 | [사실] Workflows 자체에는 스케줄 기능이 없음 |
| 웹 앱 관리자 화면 버튼 | 나중에 필요하면 | 서버 코드에서만 `RENDER_API_KEY` 사용 |

## 4. 여러 에이전트를 위한 공통 규칙 (①)

### 4-1. 폴더 구조

```
workflows/
├─ package.json            # @renderinc/sdk, @anthropic-ai/sdk, pg, zod, typescript, tsx
├─ tsconfig.json
├─ README.md               # Render 설정, 로컬 실행 방법
└─ src/
   ├─ index.ts             # 진입점. 모든 에이전트의 task를 import해서 등록
   ├─ common/              # 모든 에이전트가 같이 쓰는 도구
   │  ├─ config.ts         # 환경 변수 읽기. 없으면 바로 실패
   │  ├─ db.ts             # [사실] 이미 있음: AI 스크리닝 재판정용 쓰기 계정 연결 (16 문서)
   │  ├─ db-readonly.ts    # 에이전트용 읽기 전용 연결 (`agent_ro`, 새로 만듦)
   │  ├─ render-api.ts     # 로그, 서비스, 배포 조회
   │  ├─ github.ts         # clone, 브랜치 푸시, PR 생성
   │  ├─ llm.ts            # Claude 호출 한 곳으로 모음 (모델, effort, 재시도, 비용 기록)
   │  └─ report.ts         # 결과 리포트 형식, 비밀값 가리기
   ├─ code-review/         # 첫 에이전트
   │  ├─ tasks.ts          # task 정의
   │  ├─ rules.ts          # 규칙 기반 점검 (TypeScript 컴파일러 API로 주석 찾기)
   │  ├─ prompts.ts        # 오케스트레이터, 워커 프롬프트
   │  └─ evals/            # 고정 입력과 기대 결과 (7-2)
   └─ (다음 에이전트)/
```

### 4-2. 규칙

| 규칙 | 내용 |
|---|---|
| 에이전트 하나 = 폴더 하나 | 각 폴더의 `tasks.ts`가 task를 export하고 `src/index.ts`가 import해서 등록 |
| task 이름 | `에이전트명.동작` (예: `codeReview.run`). 서비스 안에서 이름이 겹치면 오류 [사실] |
| 외부 연결은 `common/`으로만 | 에이전트 폴더에서 직접 DB, API를 부르지 않음 |
| 읽기와 쓰기 분리 | DB는 읽기 전용 계정. 코드 변경은 PR로만. main 직접 푸시 금지 |
| 결과 형식 통일 | 모든 `run` task는 `{agent, status, summary, findings[], links[], cost}` 형태로 반환 |
| 입력 크기 | task 인자와 결과는 4MB 이하 [사실]. 큰 데이터는 넘기지 말고 task 안에서 다시 읽음 |
| 비밀값 | 환경 변수에만 둠. 로그, 리포트, PR 본문에 출력하지 않음 |
| 검사 | `workflows`에서 `npm run check`(`tsc --noEmit`). 루트 검사와 따로 돌림 |

### 4-3. 환경 변수 (Render Workflow 서비스 > Environment)

| 이름 | 용도 | 비고 |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API | 6-4 참고. SDK가 자동으로 읽음 |
| `AGENT_DATABASE_URL` | 공유 DB 읽기 | **Internal** URL + 읽기 전용 계정 `agent_ro` (5-1). 같은 Workflow 서비스의 `DATABASE_URL`은 재판정용 `moderation_worker`라서 이름을 나눔 |
| `RENDER_API_KEY` | 로그, 서비스 조회 | Account Settings > API Keys |
| `RENDER_OWNER_ID` | 로그 조회 필수 값 | 워크스페이스 ID |
| `RENDER_WEB_SERVICE_ID` | 로그를 볼 웹 서비스 | `srv-...` |
| `GITHUB_TOKEN` | clone, 푸시, PR | fine-grained 토큰. 이 레포만, Contents + Pull requests 권한 |
| `GITHUB_REPO` | 대상 레포 | `jimin-ni/memoamo`. 이름이 바뀌어도 코드는 그대로 |
| `CODE_REVIEW_PERSON_NAMES` | 주석에 있으면 안 되는 이름 | 쉼표 구분. 팀원 이름, 아이디. 코드에 적지 않음 (6-1-1) |

## 5. Render 같은 프로젝트의 DB와 웹 서비스 읽기 (①)

### 5-1. DB (읽기 전용 계정) [결정]

- [사실] Workflow task는 같은 워크스페이스, 같은 리전의 서비스와 DB에 내부 네트워크로 **연결을 걸 수 있습니다**(받는 것은 불가). 둘 다 Singapore에 둡니다.
- [사실] 내부 주소는 DB 화면의 Connect > Internal 탭에 있습니다.
- [가설] 내부 주소에서는 `sslmode=verify-full`이 필요 없을 수 있습니다. 첫 연결 때 확인합니다.

읽기 전용 계정 만들기 (8장 2단계에서 함)

1. 팀에 먼저 알립니다 (공유 DB이므로).
2. 비밀번호는 로컬에서 만들고 어디에도 적지 않습니다. Render Environment에만 넣습니다.
3. 기본 계정으로 접속해 아래를 실행합니다. 이 SQL은 비밀번호가 들어가므로 마이그레이션 파일로 커밋하지 않습니다.
   ```sql
   CREATE ROLE agent_ro LOGIN PASSWORD '<로컬에서 만든 값>';
   GRANT CONNECT ON DATABASE <db이름> TO agent_ro;
   GRANT USAGE ON SCHEMA public TO agent_ro;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent_ro;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO agent_ro;
   ALTER ROLE agent_ro SET default_transaction_read_only = on;
   ```
4. [결정] (2026-11-26) 인증 정보는 에이전트가 읽지 못하게 막습니다. 3번 바로 뒤에 실행합니다.
   ```sql
   -- 비밀번호 해시, 세션 토큰, 인증 코드가 있는 테이블은 전부 막음
   REVOKE ALL ON "account", "session", "verification" FROM agent_ro;
   -- user 테이블은 이메일과 이름을 막고, 통계에 필요한 열만 허용
   REVOKE ALL ON "user" FROM agent_ro;
   GRANT SELECT (id, role) ON "user" TO agent_ro;
   ```
   - 확인: `agent_ro`로 접속해 `SELECT * FROM "session" LIMIT 1;`이 `permission denied`로 실패해야 합니다.
   - 주의: 3번의 `ALTER DEFAULT PRIVILEGES` 때문에 Better Auth가 나중에 새 인증 테이블(플러그인 추가 등)을 만들면 자동으로 읽힐 수 있습니다. `npm run auth:migrate`로 테이블이 늘면 위 `REVOKE`에 그 테이블을 추가합니다.
   - 코드에서도 한 번 더 막습니다: `common/db.ts`는 위 네 테이블 이름이 들어간 쿼리를 실행 전에 거부합니다.
5. [가설] Render 기본 계정에 `CREATEROLE` 권한이 있는지 확인이 필요합니다. 없으면 Render 지원 문서를 따릅니다.
6. 이후 새 테이블이 생기면 3번의 `ALTER DEFAULT PRIVILEGES` 덕분에 자동으로 읽을 수 있습니다. 단, 테이블을 만든 계정이 3번을 실행한 계정과 같아야 합니다.

### 5-2. 웹 서비스 로그

- [사실] `GET https://api.render.com/v1/logs`, 헤더 `Authorization: Bearer <RENDER_API_KEY>`
- 필수 값: `ownerId`(워크스페이스 ID), `resource`(웹 서비스 ID)
- 자주 쓸 값: `startTime`/`endTime`(기본은 최근 1시간), `type`(`app`, `request`, `build`), `level`, `text`(문자열 검색), `limit`(최대 100)
- 페이지 넘기기: 응답의 `hasMore`가 true인 동안 `nextStartTime`/`nextEndTime`을 다음 요청에 넣습니다.
- 서비스 목록 `GET /v1/services`, 배포 목록 `GET /v1/services/{serviceId}/deploys`도 같은 키로 읽습니다.
- 주의: 로그에 사용자 메시지나 토큰이 있을 수 있습니다. Claude에 보내기 전에 이메일, 토큰 모양 문자열을 가립니다.

## 6. ① 코드 점검 에이전트

### 6-1. 하는 일

| 단계 | 누가 | 하는 일 | LLM |
|---|---|---|---|
| 1. 받기 | 오케스트레이터 | main을 얕게 clone (`--depth 1`) | 아니오 |
| 2. 주석 정리 | `cleanComments` | 주석 기준(6-1-1)에 맞게 주석만 고침 | 이모지는 아니오, 줄글과 개인정보는 예 |
| 3. 계획 | 오케스트레이터 | 파일 목록과 크기를 보고 리뷰할 파일, 묶음, 볼 관점을 정함 | 예 |
| 4. 리뷰 | 워커 N개 (병렬) | 묶음별로 리팩터링 후보와 이유, 위치를 JSON으로 반환 | 예 |
| 5. 합치기 | 오케스트레이터 | 중복 제거, 우선순위 정리, 리포트 작성 | 예 |
| 6. 검증 | 오케스트레이터 | 2번 변경 뒤 `tsc --noEmit`, `eslint` 실행 | 아니오 |
| 7. 결과 | 오케스트레이터 | 2번 변경은 브랜치 + PR, 3~5번은 리포트 | 아니오 |

- [결정] 리팩터링은 처음에는 **제안만** 합니다. 주석 정리는 코드가 바뀌지 않았음을 확인할 수 있어 바로 고칩니다 (아래 6-1-1).

#### 6-1-1. 주석 기준 [결정] (2026-11-27)

코드 주석은 아래를 따릅니다. 에이전트 규칙(`workflows/src/code-review/policy.ts`)과 CLAUDE.md에 같은 내용이 있습니다.

| 구분 | 내용 |
|---|---|
| 남김 | 함수, 메서드, 모듈, 상수가 무엇인지 설명하는 한 문장. 코드만 보고 알기 어려운 이유가 있으면 한 문장 더 |
| 지움 | 이모지, 여러 줄 줄글 설명, 코드를 그대로 다시 읽어 주는 설명 |
| 코드에 넣지 않음 | 사람 이름, 아이디, 이메일, 누가 시켰거나 고쳤다는 작성 경위, 날짜별 변경 이력. 이 내용은 docs와 git 기록에 둡니다 |

처리 방법
1. 이모지: 규칙으로 지웁니다 (LLM 없음). 주석 안 이모지 글자만 지우고 설명은 남깁니다. 이모지만 있던 주석은 줄째(JSX면 `{/* */}`째) 지웁니다. 문자열, JSX 글자(화면 문구) 안 이모지와 `→`, `✔`, `©` 같은 글자 기호는 남깁니다.
2. 검사: 규칙으로 기준에 어긋난 주석 묶음을 찾습니다. 붙은 한 줄 주석들은 한 묶음입니다.
   - 줄글: 묶음이 3줄 이상이거나 한 줄이 120자를 넘음
   - 이름: 환경 변수 `CODE_REVIEW_PERSON_NAMES`(쉼표 구분)의 이름이 들어감. 이름 목록은 코드에 두지 않습니다
   - 이메일, 날짜(`2026-11-25` 꼴), 작성 경위(`요청으로`, `지시로`, `손질`, `@author` 등)
3. 다시 쓰기: 걸린 묶음만 Claude에 보내 `keep`, `rewrite`(최대 2줄), `delete` 중 하나를 받습니다.
4. 확인: 주석을 뺀 코드 토큰이 고치기 전과 같은지 봅니다. 다르면 그 파일 결과를 버립니다.

2026-11-27 저장소 전체 검사 결과 (`src`, `scripts`, `workers`, `workflows`): 122개 파일에서 줄글 227, 날짜 13, 이름 3, 작성 경위 2. `workflows/`는 직접 정리해 0건. 나머지는 에이전트가 `jimins-claude/agent-*` 브랜치 PR로 고칩니다. 팀원 코드도 바뀌므로 PR을 올릴 때 알립니다.
- [결정] 리팩터링은 처음에는 **제안만** 합니다. 자동 수정은 평가 세트에서 충분히 맞는 것을 본 뒤 D(생성-평가 반복)로 켭니다.
- [결정] 브랜치 이름 `jimins-claude/agent-code-review-YYYYMMDD`. PR 생성 여부는 입력값 `openPr`(기본 false)로 정합니다. 머지는 사람이 합니다.
- ①이 PR을 열면 ②가 그 PR을 다시 리뷰합니다. 자동으로 두 번 점검되는 셈입니다.

### 6-2. task 설계

```ts
// workflows/src/code-review/tasks.ts (모양만. 실제 코드는 8장 순서대로 만듦)
import { task } from "@renderinc/sdk/workflows";

export const reviewChunk = task(
  { name: "codeReview.reviewChunk", timeoutSeconds: 600,
    retry: { maxRetries: 2, waitDurationMs: 2000, backoffScaling: 2 } },
  async function reviewChunk(_ctx, repoSha: string, paths: string[], focus: string) {
    // clone(sha 고정) → 파일 읽기 → Claude 리뷰 → findings 반환
  },
);

export const run = task(
  { name: "codeReview.run", timeoutSeconds: 1800 },
  async function run(ctx, target = "src", openPr = false) {
    // clone → stripEmoji → Claude로 계획 → 묶음마다 reviewChunk 병렬 → 합치기 → 검증
    const results = await Promise.all(plan.chunks.map((c) => ctx.run(reviewChunk, sha, c.paths, c.focus)));
  },
);
```

- [결정] 워커에는 파일 내용 대신 **커밋 SHA와 경로**만 넘깁니다. 4MB 제한을 피하고, 모든 워커가 같은 시점의 코드를 봅니다.
- [사실] `ctx.run`은 하위 task를 따로 실행하고 실패한 것만 재시도합니다.
- [결정] 묶음 크기는 오케스트레이터가 정하되 상한을 둡니다 (묶음당 파일 10개, 워커 수 최대 8개).
- [결정] 검증(`tsc`, `eslint`)은 같은 Node 런타임에서 에이전트가 직접 돌립니다. 이를 위해 clone 뒤 `npm ci`가 필요하므로 시간과 메모리를 첫 실행에서 측정합니다 [가설].

### 6-3. Render 비용과 한도

- [사실] 기본 plan은 flex(최대 1 CPU / 4GB), CPU 시간당 $0.20 + GB 시간당 $0.05, 초 단위 과금.
- [사실] 기본 timeout은 시도당 2시간. 이 에이전트는 오케스트레이터 30분, 워커 10분으로 줄입니다.

### 6-4. Claude API 사용 [결정]

**Pro 플랜과 API는 따로입니다.** [사실]
- claude.ai Pro 구독은 웹, 앱, Claude Code용입니다. API 사용량은 포함되지 않습니다.
- API는 Claude Console(platform.claude.com)에서 따로 가입하고 크레딧을 충전해 씁니다. 쓴 토큰만큼 냅니다.

키 만들고 쓰는 순서
1. platform.claude.com에 로그인 → Billing에서 크레딧 충전 (처음엔 $5~10)
2. Settings > Limits에서 월 사용 한도를 낮게 설정 (예: $20)
3. Console에서 Workspace를 둘 만들고(`agents`, `ci-review`) 각각 월 한도를 겁니다. 각 Workspace에서 키를 하나씩 만듭니다. ①용 `memoamo-agents`, ②용 `memoamo-ocr`. 키를 나누는 이유는 6-5.
4. ① 키는 Render Workflow 서비스 > Environment의 `ANTHROPIC_API_KEY`, ② 키는 GitHub 레포 Settings > Secrets and variables > Actions의 `ANTHROPIC_API_KEY`에 넣습니다. 저장소, 채팅, 문서에 적지 않습니다.
5. 로컬 테스트용은 `workflows/.env`(커밋 안 함)에만 둡니다.
6. 코드: `npm install @anthropic-ai/sdk` → `import Anthropic from "@anthropic-ai/sdk"` → `new Anthropic()`이 환경 변수를 자동으로 읽습니다.

모델 선택 (2026-11 기준 가격, 100만 토큰당 입력/출력)

| 모델 | ID | 가격 | 성격 | 쓰임 |
|---|---|---|---|---|
| Claude Opus 5.5 | `claude-opus-5-5` | $4 / $20 | 코딩, 에이전트 작업의 기본 추천 모델 | **오케스트레이터 [결정], 워커 기본값, ②** |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 / $10 | 빠르고 저렴, 일상 코딩에 충분 | 워커나 ② 비용을 줄일 때 후보 |
| Claude Haiku 5.5 | `claude-haiku-5-5` | $0.10 / $0.50 | 매우 저렴, 단순 분류 | 파일 분류 같은 잔일 |
| Claude Fable 5.2 | `claude-fable-5-2` | $8 / $40 | 가장 강한 모델 | 이 용도엔 과함 |

- [결정] 오케스트레이터와 워커 모두 `claude-opus-5-5`로 시작합니다. [미정] 평가 세트에서 Sonnet 5.5 워커가 같은 품질을 내면 워커만 바꿉니다.
- [결정] `output_config.effort`는 오케스트레이터 `high`, 워커 `high`로 시작합니다. Opus 5.5의 기본값은 `medium`이라 꼭 적습니다. thinking은 이 모델에서 끌 수 없습니다.
- [결정] 워커 결과는 구조화 출력(`output_config.format`, Zod 스키마)으로 받습니다. 문자열 파싱을 하지 않습니다.
- [결정] 보안 관련 코드를 리뷰하면 안전 분류기가 응답을 거절할 수 있습니다(`stop_reason: "refusal"`). `common/llm.ts`에서 이를 확인하고, 서버 측 대체 모델 설정(`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`)을 켭니다.
- [결정] 같은 시스템 프롬프트를 워커 모두가 쓰므로 프롬프트 캐싱을 켭니다.
- [가설] ① 1회 비용: 파일 50개(입력 약 15만, 출력과 thinking 약 5~10만 토큰) 기준 Opus 5.5로 $2~3. 첫 실행에서 `usage`를 기록해 확인합니다.

### 6-5. 키를 둘로 나누는 이유 [결정]

| 이유 | ① 키 (Render) | ② 키 (GitHub Secrets) |
|---|---|---|
| 노출 범위 | Render 대시보드 접근자만 봄 | 레포에 쓰기 권한이 있는 사람은 누구나 워크플로 파일을 바꿔 Secret을 꺼낼 수 있음 |
| 키를 만지는 코드 | 우리가 쓴 코드만 | 외부 도구(open-code-review)가 실행 때 내려받는 바이너리가 키를 직접 씀 |
| 사고가 나면 | ②를 끊어도 ①은 계속 동작 | ①을 끊어도 PR 리뷰는 계속 동작 |
| 비용 확인 | Workspace별로 사용량이 따로 보임 | PR이 많은 날 ②만 늘어도 바로 보임 |
| 한도 | ① 한도를 다 써도 ②는 영향 없음 | ②가 폭주해도 ①은 영향 없음 |

- 핵심: ②는 **남이 만든 코드에 키를 주는 것**이고 GitHub Secrets는 Render보다 노출 범위가 넓습니다. 같은 키를 쓰면 ②에서 새는 순간 ①도 같이 멈추고, 어디서 돈이 나갔는지도 구분이 안 됩니다.

### 6-6. 예상 비용 [가설]

- [사실] claude.ai의 Pro, Max 구독은 API 사용량을 포함하지 않습니다. Max로 올려도 ①, ②의 API 비용은 그대로입니다. Max는 Claude Code를 더 많이 쓰는 데만 도움이 됩니다 (11장 impeccable처럼 Claude Code 안에서 쓰는 도구).
- 계산 기준: 이 레포의 PR은 2026-11-10~25에 90건(하루 약 5~6건). 같은 PR에 커밋을 더 올리면 ②가 다시 돕니다.

| 항목 | 가정 | Opus 5.5 | Sonnet 5.5 |
|---|---|---|---|
| ② PR 1건 | 입력 5~15만, 출력 1~2만 토큰 | $0.4~1.0 | $0.2~0.5 |
| ② 한 달 (PR 170건 + 재리뷰) | 리뷰 약 250회 | $100~250 | $50~125 |
| ① 1회 | 파일 50개 | $2~3 | $1~1.5 |
| ① 한 달 | 주 1회 / 매일 | $10 / $60~90 | $5 / $30~45 |
| **마감(12-05)까지 9일** | PR 약 50건, ① 몇 번 | **$30~60** | **$15~30** |

- 추천: ②는 `incremental: 'true'`로 겹치는 댓글을 줄이고, 첫 PR 몇 건을 보고 비싸면 Sonnet 5.5로 바꿉니다. ①은 주 1회 또는 수동 실행.
- 첫 주에 Console의 Usage 화면으로 실제 값을 확인하고 이 표를 고칩니다.

참고: 다른 선택지
- Anthropic **Managed Agents**(beta): Anthropic이 에이전트 루프와 실행 환경을 대신 운영합니다. 이 프로젝트는 Render Workflows가 그 역할을 하므로 쓰지 않습니다.
- **Claude Agent SDK**: Claude Code를 라이브러리로 쓴 것. 파일 읽기, 수정 도구가 들어 있어 B(도구 호출 루프) 단계에서 후보입니다.

## 7. 개발 방법과 결정

### 7-1. ① 구조 [결정]

**A 파이프라인으로 시작 → 오케스트레이터-워커(C) 적용 → 자동 수정 단계에서 D 추가 → 필요할 때만 B**

| 방식 | 설명 | 이 에이전트에서 |
|---|---|---|
| A. 정해진 파이프라인 | 코드가 순서를 정하고 LLM은 정해진 칸에서만 답함 | 전체 뼈대 (6-1의 단계 순서는 코드가 고정) |
| C. 오케스트레이터-워커 | 지휘 LLM이 일을 나누고 워커 LLM들이 병렬 처리 | 3~5단계. Render `ctx.run`으로 워커 실행 |
| D. 생성-평가 반복 | 한 LLM이 고치고 다른 LLM이나 도구가 평가해 다시 고침 | 리팩터링 자동 수정을 켤 때 |
| B. 도구 호출 루프 | LLM이 도구를 직접 골라 반복 호출 | 필요할 때만 (다른 파일을 찾아 읽어야 하는 리뷰 등) |

오케스트레이터가 할 일과 하지 않을 일
- 하는 일: 어떤 파일을 볼지, 어떻게 묶을지, 묶음마다 무엇을 볼지(중복, 긴 함수, 이름, 죽은 코드), 결과 합치기
- 하지 않는 일: 단계 순서 바꾸기, 쓰기 동작 결정. 이것은 코드(A)가 정합니다.

### 7-2. 개발 방식 [결정]

| 방식 | 내용 |
|---|---|
| 평가 먼저 | `code-review/evals/`에 예제 파일 10~20개와 기대 결과를 먼저 만들고, 프롬프트나 모델을 바꿀 때마다 점수를 봄 |
| 사람 확인 | PR 생성은 `openPr=true`일 때만. 머지는 사람이 함 |
| 기록 | 실행마다 입력, 계획, 워커별 토큰 사용량, 결과를 리포트에 남김 |

### 7-3. 만드는 도구 [결정]

- **Anthropic TypeScript SDK(`@anthropic-ai/sdk`) 직접 사용.** Render Workflows가 재시도, 병렬, 실행 기록을 해 주므로 LangGraph 같은 프레임워크는 쓰지 않습니다.
- AI 스크리닝(`src/lib/moderation/`)은 OpenAI를 그대로 씁니다. 개발 보조 도구만 Claude를 씁니다.

### 7-4. 언어: TypeScript [결정] (2026-11-26)

LLM 호출 자체는 Python과 TypeScript가 같습니다. 차이는 주변 환경에서 나며, 아래 이유로 TypeScript로 정했습니다.

| 항목 | Python | TypeScript |
|---|---|---|
| Claude SDK | `anthropic`. 공식, 기능 같음 | `@anthropic-ai/sdk`. 공식, 기능 같음 |
| Render Workflows SDK | `render` (3.11+) | `@renderinc/sdk`. 이 브랜치에 뼈대가 이미 있음 |
| 구조화 출력 | Pydantic 모델 | Zod 스키마 |
| AI 생태계 | 가장 넓음. 평가, 데이터 분석, 노트북, 예제가 많음 | 충분함. 웹 서비스와 붙이기 쉬움 |
| 점검 대상 코드(TS) 다루기 | 정규식이나 tree-sitter로 주석을 찾음 | TypeScript 컴파일러 API로 주석과 구조를 정확히 찾음 |
| 검증(`tsc`, `eslint`) | Node를 따로 설치해야 함 (Docker 런타임) | 같은 런타임에서 바로 실행 |
| DB 읽기 | 스키마를 따로 작성 | `src/lib/schema.ts`의 Drizzle 정의를 참고 가능 |
| 팀 | 레포에 Python 코드가 없음 | 레포 전체가 TS. 같은 린트, 같은 규칙 |

- 나중에 데이터 분석 위주의 에이전트가 필요하면, 그 에이전트만 Python Workflow 서비스로 따로 만들 수 있습니다.

### 7-5. ② open-code-review (GitHub Actions) [결정] (2026-11-26)

[사실] 2026-11-26 레포 README와 `action.yml` 기준
- 오픈소스(Apache-2.0) AI 코드 리뷰 도구(`ocr`). 본체는 Go, npm으로 배포. 매우 활발히 개발 중
- 정해진 파이프라인 + LLM 에이전트 구조. 줄 단위 지적. 자체 벤치마크에서 Claude Code보다 정밀도가 높고 토큰은 약 1/9이라고 주장 (검증 안 됨)
- GitHub Action을 제공합니다. PR에 줄 단위 댓글(`createReview`)과 요약 댓글 1개(갱신형)를 답니다.
- 자동 수정 기능은 확인되지 않았습니다. 주석 정리는 ①이 맡습니다.

Action 설정 (입력 이름은 `action.yml`에서 확인, 값은 [가설])

| 입력 | 값 | 비고 |
|---|---|---|
| `llm_protocol` | `anthropic` | Anthropic 방식으로 호출 |
| `llm_use_anthropic` | `'true'` | 필수 입력. 위와 같은 뜻이지만 명시 |
| `llm_url` | `https://api.anthropic.com` | [가설] 기본 주소 형식은 첫 실행에서 확인 |
| `llm_auth_token` | `${{ secrets.ANTHROPIC_API_KEY }}` | ② 전용 키 |
| `llm_model` | `claude-opus-5-5` | |
| `llm_extra_body` | `'{}'` | **꼭 바꿈.** 기본값이 `{"thinking": {"type": "disabled"}}`인데 Opus 5.5는 thinking을 끄면 400 오류 |
| `effort` | `high` | OCR v1.10.0 이상 |
| `language` | `Korean` | 댓글 언어 [가설] |
| `max_tokens_budget` | 정해서 넣음 | PR 1건당 토큰 상한. 비용 보호 |
| `ocr_version` | 특정 버전으로 고정 | 기본 `latest`는 갑자기 바뀔 수 있음 |

- 권한: `contents: read`, `pull-requests: write`
- 트리거: `pull_request` (opened, synchronize, reopened). **`pull_request_target`은 쓰지 않습니다.** 외부 포크 PR이 비밀키에 닿을 수 있습니다.
- 규칙 파일: `.opencodereview/rule.json`을 레포에서 자동으로 읽습니다. 형식은 문서를 못 읽어 [가설]. CLAUDE.md의 규칙(역할, `cacheComponents`, 채팅 규칙 값 위치 등)을 옮겨 넣는 것을 목표로 합니다.
- `uses:` 경로와 고정할 버전 태그는 첫 설정 때 확인합니다 [가설].
- 저장소의 **첫 GitHub Actions**입니다. CLAUDE.md의 "CI 없음" 문구는 main 머지 때 함께 고칩니다.

①과 ②의 관계
- 역할이 다릅니다. ①은 주기적인 전체 점검과 자동 수정, ②는 PR마다 바뀐 부분 리뷰입니다.
- ②의 결과는 ①의 평가 기준으로 씁니다. 같은 PR에 대해 ①의 워커 결과와 ②의 댓글을 비교하면 발표 자료가 됩니다.

### 7-6. 결정 현황

| 번호 | 질문 | 결과 |
|---|---|---|
| Q1 | ① 구조 | [결정] A → C(오케스트레이터) → D → 필요 시 B |
| Q2 | 개발 방식 | [결정] 평가 먼저 + 사람 확인 |
| Q3 | 만드는 도구 | [결정] Anthropic TypeScript SDK 직접 |
| Q4 | LLM 공급자, 모델 | [결정] Claude API, `claude-opus-5-5`. 워커 모델은 평가 후 [미정] |
| Q5 | 검증(`tsc`, `eslint`)을 에이전트 안에서 | [결정] 에이전트가 직접 실행 (TS를 골라서 가능) |
| Q6 | DB 읽기 전용 계정 | [결정] 만듦. 인증 테이블과 `user`의 이메일, 이름은 읽기 금지 (5-1) |
| Q7 | 브랜치 | [결정] `jimins-claude/feature-render-workflows`에서 개발, 마지막에 main 머지 |
| Q8 | 언어 | [결정] TypeScript (7-4) |
| Q9 | open-code-review | [결정] GitHub Actions로 PR 리뷰 도입 (7-5) |

## 8. 진행 순서

| 단계 | 대상 | 할 일 | 끝났다는 기준 |
|---|---|---|---|
| 0 | 공통 | Console 가입, 크레딧, 월 한도, 키 2개 발급 | 키가 Render와 GitHub Secrets에 들어감 |
| 1 | ① | 기존 TS 뼈대로 Render Workflow 서비스 생성 | 대시보드에서 `hello` 실행 성공 |
| 2 | ② | `.github/workflows/ocr-review.yml` 작성, 이 브랜치로 테스트 PR | 테스트 PR에 리뷰 댓글이 달림 |
| 3 | ① | `agent_ro` 계정 생성, `common/db-readonly.ts`, `common/render-api.ts` | task에서 테이블 수, 최근 로그 20줄 읽기 성공 |
| 4 | ① | `common/llm.ts` | task에서 Claude 응답 1건과 토큰 사용량 기록 |
| 5 | ① | 평가 세트 (`code-review/evals/`) | 주석 기준 예제, 리팩터링 예제와 기대 결과 준비 |
| 6 | ① | 주석 정리 (`cleanComments`) | 평가 세트 전부 통과 |
| 7 | ① | 오케스트레이터 + 워커 리뷰 + 검증 | 리포트가 평가 세트의 기대 항목을 찾음 |
| 8 | ① | `common/github.ts`, 브랜치 + PR | 테스트 PR 1건 생성, ②가 그 PR을 리뷰함 |
| 9 | 공통 | main 머지, 서비스 Branch를 main으로, CLAUDE.md의 CI 문구 수정 | 운영 1주 후 다음 에이전트 결정 |

진행 상태 (2026-11-27)

| 단계 | 상태 |
|---|---|
| 1 | 끝남 (2026-11-26) |
| 3 | 코드 끝남: `common/db-readonly.ts`, `common/render-api.ts`, 확인 task `agentCheck.db`, `agentCheck.logs`. #125 동의 받음. **`agent_ro` 계정 생성과 Environment 값 입력 남음** |
| 4 | 코드 끝남: `common/llm.ts`, 확인 task `agentCheck.llm`. **`ANTHROPIC_API_KEY` 입력 후 실행 확인 남음** |
| 5 | 규칙 평가 세트 32건 (이모지 16, 검사 10, 코드 비교 6). `npm run eval`. 리팩터링 예제는 7단계 전에 만듦 |
| 6 | 규칙 부분 끝남 (`rules.ts`, `policy.ts`). Claude 다시 쓰기(`comments.ts`)와 로컬 실행(`npm run comments -- <파일>`)은 코드만 있음. **키 입력 후 실제 실행 확인 남음** |
| 0, 2 | 키 발급 대기 (사용자) |

## 9. 위험과 대응

| 위험 | 대응 |
|---|---|
| ①이 잘못된 코드를 푸시 | main 푸시 금지, PR만, 기본은 리포트만 |
| 공유 DB 데이터 변경 | 읽기 전용 계정 + 읽기 전용 트랜잭션 |
| 비밀값이 Claude로 전송 | 마스킹, `.env*` 파일과 인증 테이블은 읽지 않음 |
| API 비용 폭증 | Console 월 한도, 키 분리, ① 파일 수·워커 수 상한, ② `max_tokens_budget` |
| ②가 PR마다 비용 발생 | 처음엔 Opus 5.5로 품질 확인, 비싸면 Sonnet 5.5로 낮춤 |
| 외부 포크 PR로 비밀키 노출 | `pull_request_target` 금지, 기본 `pull_request`만 사용 |
| ② 도구 업데이트로 동작 변경 | `ocr_version`과 Action 버전 고정 |
| 안전 분류기 거절 | ①은 `stop_reason` 확인 + 서버 측 대체 모델 |
| 레포 이름 변경(CMMS → memoamo) | clone 주소를 `GITHUB_REPO` 환경 변수로 둠 |

## 10. ③ impeccable (디자인 품질, Claude Code 스킬) [미정]

### 10-1. 무엇인가 [사실] (2026-11-26 README 기준)

- pbakaus/impeccable. Apache-2.0, 매우 활발함. Anthropic의 frontend-design 스킬에서 시작한 **디자인 스킬 묶음**입니다.
- 두 부분으로 되어 있습니다.
  - **스킬 명령** (`/impeccable critique`, `polish` 등 23개): Claude Code 같은 코딩 에이전트 안에서 실행됩니다. 에이전트의 모델과 구독을 그대로 씁니다. 그래서 따로 API 키가 필요 없습니다.
  - **감지기** (`npx impeccable detect`): LLM 없이 정해진 규칙 62개로 UI 코드를 검사합니다. API 키가 필요 없고 CI에서도 돌아갑니다.
- 명령 종류: 점검(`critique`, `audit`), 마무리(`polish`, `harden`, `clarify`, `adapt`, `optimize`, `onboard`), 방향 조정(`bolder`, `quieter`, `distill`, `colorize`, `typeset`, `layout`, `animate`, `delight`, `overdrive`), 준비(`shape`, `init`, `document`, `extract`), 실시간(`live`, `generate`).

### 10-2. "에이전트를 쓴다"고 할 수 있나

- impeccable 자체는 에이전트가 아닙니다. **에이전트(Claude Code)에게 주는 디자인 지식과 도구**입니다.
- 정확한 표현: "Claude Code 에이전트에 impeccable 디자인 스킬을 붙여 UI 품질을 점검하고 다듬었다."
- ①과 비교: ①은 우리가 루프와 구조를 만든 에이전트, ③은 이미 있는 에이전트에 기술을 더한 것입니다.
- ①의 워커로도 쓸 수 있습니다. 감지기는 LLM이 없으므로 `codeReview.designDetect` task에서 `npx impeccable detect --json src/`를 실행하면 API 비용 없이 디자인 지적을 리포트에 더할 수 있습니다.

### 10-3. 활용 계획

| 단계 | 할 일 | 결과 | API 비용 |
|---|---|---|---|
| 1 | 내 PC에만 설치: `npx impeccable install --providers=claude --scope=global` → Claude Code 재시작 | 레포 파일이 바뀌지 않음 | 없음 |
| 2 | 원격 전송 끄기: `npx impeccable telemetry off` | | 없음 |
| 3 | 기준선 측정: `npx impeccable detect --json src/ > 결과파일` (결과는 커밋 안 함) | 지금 UI의 문제 목록 | 없음 |
| 4 | `/impeccable init`, `document` 실행. 단, 결과는 기존 `docs/planning/08-design.md`, `11-design-palette-v2.md`와 맞춰서 정리 | 에이전트가 우리 디자인 규칙을 앎 | 없음 (Pro 사용량) |
| 5 | 홈 화면부터 `critique`, `audit` (보고만, 수정 안 함) [결정] | 홈 화면 점수와 개선 목록 | 없음 (Pro 사용량) |
| 6 | 고칠 것을 골라 `polish`, `harden`, `adapt`(모바일) 실행. 화면마다 브랜치 1개, `tsc`/`eslint`/`build` 확인 후 PR | 다듬어진 화면, ②가 그 PR을 리뷰 | 없음 (Pro 사용량) |
| 7 | 다시 `detect`로 3단계와 비교 | 전후 비교표 (발표 자료) | 없음 |
| 8 | (선택) ①에 `designDetect` task 추가, 또는 GitHub Actions에서 `detect --sarif` | 자동 디자인 점검 | 없음 |

지킬 것
- 팀원 담당 화면(힙 미니룸 등)은 건드리지 않습니다. 필요하면 결과만 이슈로 공유합니다.
- `live` 모드는 쓰지 않습니다. 에이전트가 없을 때 `claude` CLI를 **권한 확인 없이** 실행합니다. 쓰더라도 `IMPECCABLE_LIVE_COPY_AGENT=chat`으로 둡니다.
- 설치 후 Claude Code에 자동 훅(UI 파일 수정 때 자동 점검)이 생깁니다. 거슬리면 끕니다.
- `.impeccable/` 작업 폴더는 커밋하지 않습니다 (`.gitignore` 추가는 첫 PR에서).
- 마감(12-05)까지 시간이 짧으므로 5~7단계는 홈 화면 하나로 합니다 [결정]. 여유가 생기면 버블, 온보딩 순.
- [가설] Pro 플랜 사용량 한도 안에서 하루 몇 화면까지 가능한지는 써 보며 확인합니다. 부족하면 Max가 여기에 도움이 됩니다.

### 10-4. 준비물 [미정]

| 준비물 | 지금 상태 | 할 일 |
|---|---|---|
| Node, Claude Code | 있음 | 없음 |
| 디자인 기준 1개 | [결정] (2026-11-26) v2 Chipotle 팔레트(11 문서)가 지금 적용 중인 기준. v1 토큰(`key-*`, `talk-*`)은 되돌리기용으로만 남음 | `init`, `document` 때 v2를 기준이라고 알려 줌. v1 토큰을 "고칠 대상"으로 보지 않게 함 |
| `PRODUCT.md` | 없음 | `/impeccable init`이 질문하며 만듦. 01 문서(개요, 대상, 분위기)를 답으로 씀 |
| `DESIGN.md` | 없음 | `/impeccable document`가 코드에서 뽑아 만듦. 11 문서(원칙, 색, 모서리, 간격)와 맞춰 고침 |
| 두 파일 위치 | | [가설] impeccable은 레포 루트를 기본으로 봄. 루트에는 짧게 두고 자세한 내용은 08, 11 문서로 링크 |
| 실행 중인 화면 | | `npm run dev` + `.env.local`. URL 검사에는 Chrome 또는 Edge 필요 |
| 로그인 화면용 계정 | | 버블은 로그인해야 보임. 공유 DB에 테스트 계정이 쌓이므로 끝나면 정리할지 확인 |
| 대상 화면 | [결정] 홈 화면 (`src/app/home/`) | |
| `.gitignore` | | `.impeccable/` 추가 |

### 10-5. Render Workflows와 연결하는 단계 [미정]

| 단계 | 무엇 | 방법 | LLM, 비용 |
|---|---|---|---|
| L1 | 코드 디자인 점검 | `designReview.detect` task: clone → `npx impeccable detect --json src/` → 결과를 ① 리포트 형식으로 | 없음 |
| L2 | 배포된 화면 점검 | 같은 task에서 배포 주소의 주요 화면을 URL로 검사. 브라우저가 필요하므로 Workflow를 Docker 런타임(Chromium 포함)으로 [가설] | 없음 |
| L3 | 배포 직후 자동 실행 | Render 배포 완료 → (Cron 또는 배포 알림) → `designReview.run` 실행. 지난 결과와 비교해 새로 생긴 문제만 이슈로 올림 | 없음 |
| L4 | 고치기 제안 | 오케스트레이터가 지적을 파일별로 묶고, Claude 워커가 수정안을 만듦. impeccable의 `skill/reference/` 문서(Apache-2.0, 출처 표기)를 워커 시스템 프롬프트로 씀 | Claude API (①과 같은 키) |
| L5 | 고치고 확인하는 반복 (D) | 수정 → `tsc`/`eslint`/`build` → 다시 `detect` → 지적 수가 줄어야 통과, 아니면 다시 고침 (최대 2회) → 통과분만 PR | Claude API |
| L6 | 사람 확인 | PR에 전후 `detect` 결과와 스크린샷(L2) 첨부. ②가 코드 리뷰, 사람이 머지 | |

- 주의: impeccable의 스킬 명령(`polish` 등)은 Claude Code 안에서 돌게 만들어진 것입니다. Render에서 그대로 쓰려면 Claude Agent SDK나 `claude -p`를 **API 키로** 돌려야 합니다. 구독(Pro, Max) 로그인을 서버 자동화에 쓰는 것은 하지 않습니다.
- 그래서 L4~L5는 "impeccable 지식 + 우리 오케스트레이터"로 만듭니다. 자동화는 Render가, 디자인 판단 기준은 impeccable이 맡습니다.
- 추천 순서: 마감 전에는 L1(+ 가능하면 L2)까지. L4 이후는 마감 뒤.

## 11. Jev를 다시 붙인다면 [결정] 지금은 쓰지 않음 (2026-11-26)

- 버블 미리보기는 `aiPreview: false`로 꺼진 상태를 유지하고, 에이전트에도 붙이지 않습니다. 아래는 나중에 다시 검토할 때를 위한 기록입니다.

[사실] Jev(TypeSafe AI System One)는 글을 쓰는 모델이 아니라, 상태(`state`)와 질문(`questions`)을 주면 **보기 중 하나를 고르고 확신도를 돌려주는** API입니다 (`src/lib/bubble/ai-preview.ts`).

| 붙일 곳 | 방법 | 쓸모 |
|---|---|---|
| A. 버블 미리보기 다시 켜기 | `src/lib/features.ts`의 `aiPreview`를 `true`, Render와 `.env.local`에 `TYPESAFE_API_KEY` | 기획상 보류된 기능 (02 문서) |
| B. 에이전트의 값싼 분류기 | `common/llm.ts`에 `classify(state, choices)`를 두고 Jev로 보냄. 글쓰기, 코드는 Claude | 아래 |

B에서 Jev에 맡길 만한 일
- 로그 점검 에이전트: 에러 로그 한 줄을 `인증 / DB / 외부 API / 사용자 입력 / 기타`로 분류
- 디자인 점검(10-5): `detect` 지적을 `지금 고침 / 나중에 / 무시`로 분류
- 코드 점검(①): 워커에 보내기 전에 파일을 `리뷰 필요 / 생성 파일 / 설정`으로 분류해 Claude 호출 수를 줄임

- [미정] Jev의 가격, 한도, 한국어 분류 정확도. 쓰기 전에 평가 세트로 Claude Haiku 5.5와 비교합니다.
- 키는 Render Workflow 서비스의 Environment에만 넣고, 웹 서비스에는 A를 할 때만 넣습니다.

## 12. 참고

- Render Workflows: https://render.com/docs/workflows (2026-11-26 확인)
- Render 내부 네트워크: https://render.com/docs/private-network
- Render 로그 API: https://api-docs.render.com/reference/list-logs
- Claude API 문서: https://platform.claude.com/docs
- open-code-review: https://github.com/alibaba/open-code-review (`action.yml` 2026-11-26 확인)
- impeccable: https://github.com/pbakaus/impeccable (README 2026-11-26 확인)
