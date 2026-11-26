# 15. 개발 보조 에이전트 (Render Workflows, Python)

- 상태: [미정] 초안. 2026-11-26 작성. 7장의 선택지를 담당자가 고른 뒤 [결정]으로 바꿉니다.
- 담당: 본인 (Jimin)
- 브랜치: `jimins-claude/feature-agents` (main에서 분기)
- 표기: [사실] 코드나 공식 문서로 확인한 것, [가설] 확인이 필요한 것, [결정] 정한 것, [미정] 아직 정하지 않은 것

## 1. 한눈에 보기

| 항목 | 내용 |
|---|---|
| 무엇 | 개발과 운영을 돕는 에이전트 여러 개를 Render Workflows 위에서 실행 |
| 첫 에이전트 | 코드 점검 에이전트 (이모지가 든 불필요한 주석 제거, 리팩터링 제안) |
| 언어 | Python 3.11 이상 |
| 실행 환경 | Render Workflow 서비스 1개, Singapore 리전 (공유 DB와 같은 리전) |
| 읽는 것 | GitHub 레포 코드, 공유 PostgreSQL(`cmms-db-01`), 웹 서비스 로그 |
| 결과 | 코드 변경은 `jimins-claude/` 브랜치 + PR. 분석 결과는 리포트(마크다운) |

## 2. 왜 main을 따로 맞출 필요가 없는가

- [사실] 브랜치는 main의 복사본이 아니라 커밋을 가리키는 표시입니다. 새 브랜치를 만들어도 비용이 없습니다.
- [결정] 에이전트 코드는 `agents/` 폴더에만 둡니다. Next.js 앱 코드(`src/`)를 import하지 않습니다. 그래서 main이 바뀌어도 에이전트 브랜치를 자주 맞출 필요가 없습니다.
- [결정] 에이전트가 점검할 코드는 배포된 브랜치가 아니라 **실행할 때 GitHub에서 받은 최신 main**입니다. 배포 브랜치와 점검 대상이 분리됩니다.
- [미정] 뼈대가 동작하면 `agents/` 폴더를 main에 머지하고, Workflow 서비스를 main에 연결하는 쪽을 추천합니다. 그러면 브랜치 동기화 문제가 사라집니다. 다만 Workflow 서비스에서 Root Directory, Build Filter 설정이 되는지는 아직 확인하지 못했습니다 [가설]. 안 되면 main의 모든 푸시가 에이전트 재배포를 일으킵니다.
- 기존 `jimins-claude/feature-render-workflows`(TypeScript 뼈대, `workflows/`)와의 관계: [미정] Python으로 가면 이 브랜치는 참고용으로 두고 정리합니다.

## 3. 전체 구조

```
GitHub (jimin-ni/memoamo)
   │  clone (실행 때마다)
   ▼
Render Workflow 서비스 "memoamo-agents"  ── Singapore
   ├─ task: code_review.run          ← 첫 에이전트
   ├─ task: code_review.check_file   ← 파일 단위 하위 task (병렬)
   ├─ task: log_watch.run            ← 이후 에이전트 (예시)
   └─ task: db_report.run            ← 이후 에이전트 (예시)
   │                │                       │
   │ 내부 네트워크  │ Render API             │ GitHub API
   ▼                ▼                       ▼
 cmms-db-01     웹 서비스 로그            브랜치 푸시, PR 생성
```

실행 방법 (트리거)

| 방법 | 쓰는 때 | 비고 |
|---|---|---|
| Render 대시보드 > Run Task | 개발 중 수동 실행 | 입력은 JSON 배열 |
| Render CLI | 로컬, 수동 실행 | `render workflows tasks list` |
| Cron Job 서비스 | 매일 1회 점검 등 정기 실행 | [사실] Workflows 자체에는 스케줄 기능이 없음 |
| 웹 앱 관리자 화면 버튼 | 나중에 필요하면 | 서버 코드에서만 `RENDER_API_KEY` 사용 |

## 4. 여러 에이전트를 위한 공통 규칙

### 4-1. 폴더 구조

```
agents/
├─ main.py                 # 진입점. 모든 에이전트를 묶어 app.start()
├─ requirements.txt
├─ README.md               # Render 설정, 로컬 실행 방법
├─ common/                 # 모든 에이전트가 같이 쓰는 도구
│  ├─ config.py            # 환경 변수 읽기. 없으면 바로 실패
│  ├─ db.py                # 읽기 전용 DB 연결
│  ├─ render_api.py        # 로그, 서비스, 배포 조회
│  ├─ github.py            # clone, 브랜치 푸시, PR 생성
│  ├─ llm.py               # LLM 호출 한 곳으로 모음
│  └─ report.py            # 결과 리포트 형식
├─ code_review/            # 첫 에이전트
│  ├─ workflow.py          # Workflows() 객체와 task 정의
│  ├─ rules.py             # 규칙 기반 점검 (LLM 없이)
│  ├─ prompts.py           # LLM 프롬프트
│  └─ tests/               # 고정 입력으로 결과를 확인하는 평가 세트
└─ (다음 에이전트)/
```

### 4-2. 규칙

| 규칙 | 내용 |
|---|---|
| 에이전트 하나 = 폴더 하나 = `Workflows()` 하나 | `main.py`에서 `Workflows.from_workflows(...)`로 묶음 [사실] |
| task 이름 | `에이전트명.동작` (예: `code_review.run`). 서비스 안에서 이름이 겹치면 오류 [사실] |
| 외부 연결은 `common/`으로만 | 에이전트 폴더에서 직접 DB, API를 부르지 않음. 권한과 로그를 한 곳에서 관리 |
| 읽기와 쓰기 분리 | DB는 읽기 전용. 코드 변경은 PR로만. main 직접 푸시 금지 |
| 결과 형식 통일 | 모든 `run` task는 `{agent, status, summary, findings[], links[]}` 형태로 반환 |
| 입력 크기 | task 인자와 결과는 4MB 이하 [사실]. 큰 데이터는 넘기지 말고 task 안에서 다시 읽음 |
| 비밀값 | 환경 변수에만 둠. 로그, 리포트, PR 본문에 출력하지 않음 |

### 4-3. 환경 변수

| 이름 | 용도 | 비고 |
|---|---|---|
| `DATABASE_URL` | 공유 DB 읽기 | Render의 **Internal** URL 사용. 읽기 전용 계정 권장 (5-1) |
| `RENDER_API_KEY` | 로그, 서비스 조회 | Account Settings > API Keys |
| `RENDER_OWNER_ID` | 로그 조회 필수 값 | 워크스페이스 ID |
| `RENDER_WEB_SERVICE_ID` | 로그를 볼 웹 서비스 | `srv-...` |
| `GITHUB_TOKEN` | clone, 푸시, PR | fine-grained 토큰, 이 레포만, Contents + Pull requests 권한 |
| `LLM_API_KEY` 류 | LLM 호출 | 7-3에서 공급자를 정한 뒤 이름 확정 |

## 5. Render 같은 프로젝트의 DB와 웹 서비스 읽기

### 5-1. DB

- [사실] Workflow task는 같은 워크스페이스, 같은 리전의 서비스와 DB에 내부 네트워크로 **연결을 걸 수 있습니다**(받는 것은 불가). DB와 Workflow 서비스를 모두 Singapore에 두면 됩니다.
- [사실] 내부 주소는 DB 화면의 Connect > Internal 탭에 있습니다.
- [가설] 내부 주소는 Render 내부망이라 `sslmode=verify-full`이 필요 없을 수 있습니다. 첫 연결 때 확인합니다.
- [미정] 읽기 전용 계정: 공유 DB에 `CREATE ROLE agent_ro ... ; GRANT SELECT ...`로 만들면 에이전트가 실수로 데이터를 바꿀 수 없습니다. DB 계정 추가는 팀에 알리고 합니다. 만들기 전까지는 코드에서 `SET default_transaction_read_only = on`으로 막습니다.
- 라이브러리: `psycopg[binary]` (동기) 하나로 시작합니다.

### 5-2. 웹 서비스 로그

- [사실] `GET https://api.render.com/v1/logs`, 헤더 `Authorization: Bearer <RENDER_API_KEY>`
- 필수 값: `ownerId`(워크스페이스 ID), `resource`(웹 서비스 ID)
- 자주 쓸 값: `startTime`/`endTime`(기본은 최근 1시간), `type`(`app`, `request`, `build`), `level`, `text`(문자열 검색), `limit`(최대 100)
- 페이지 넘기기: 응답의 `hasMore`가 true인 동안 `nextStartTime`/`nextEndTime`을 다음 요청에 넣습니다.
- 서비스 목록 `GET /v1/services`, 배포 목록 `GET /v1/services/{serviceId}/deploys`도 같은 키로 읽습니다.
- 주의: 로그에 사용자 메시지나 토큰이 들어 있을 수 있습니다. LLM에 보내기 전에 이메일, 토큰 모양 문자열을 가립니다 (`common/report.py`의 마스킹 함수).

## 6. 첫 에이전트: 코드 점검 에이전트

### 6-1. 하는 일

| 단계 | 하는 일 | LLM 사용 |
|---|---|---|
| 1. 받기 | `GITHUB_TOKEN`으로 main을 얕게 clone (`--depth 1`) | 아니오 |
| 2. 대상 고르기 | `src/`, `scripts/`의 `.ts`, `.tsx` 중 변경된 파일 또는 지정 경로 | 아니오 |
| 3. 규칙 점검 | 이모지가 든 주석 찾기, 빈 주석, 주석 처리된 코드 덩어리 | 아니오 (정규식, 파서) |
| 4. 판단 점검 | 리팩터링 후보 (중복, 너무 긴 함수, 이름) 찾기와 이유 설명 | 예 |
| 5. 검증 | 고친 코드에 `npx tsc --noEmit`, `npx eslint src scripts` 실행 | 아니오 |
| 6. 결과 | 자동 수정(이모지 주석)은 브랜치 + PR, 리팩터링은 제안 리포트 | 아니오 |

- [결정] 이모지 주석 제거는 **규칙으로** 합니다. 정답이 명확한 일에 LLM을 쓰면 느리고 비싸고 가끔 틀립니다.
- [결정] 리팩터링은 처음에는 **제안만** 합니다. 자동 수정은 평가 세트에서 충분히 맞는 것을 본 뒤 켭니다.
- [결정] 브랜치 이름 `jimins-claude/agent-code-review-YYYYMMDD`, 커밋은 `fix:`/`refactor:` 형식. PR 생성 여부는 입력값 `open_pr`(기본 false)로 정합니다. 머지는 사람이 합니다.

### 6-2. task 설계

```python
# agents/code_review/workflow.py (모양만. 실제 코드는 8장 순서대로 만듦)
import asyncio
from render import Workflows, TaskContext, Retry

app = Workflows()

@app.task(name="code_review.check_file", timeout_seconds=300,
          retry=Retry(max_retries=2, wait_duration_ms=1000))
def check_file(ctx: TaskContext, path: str, source: str) -> dict:
    ...  # 규칙 점검 + LLM 판단, 결과 dict 반환

@app.task(name="code_review.run", timeout_seconds=1800)
async def run(ctx: TaskContext, target: str = "src", open_pr: bool = False) -> dict:
    ...  # clone → 파일 목록 → 파일마다 check_file 병렬 → 모으기 → 검증 → 리포트
    results = await asyncio.gather(*(ctx.run(check_file, p, s) for p, s in files))
```

- [사실] `ctx.run`은 각 하위 task를 따로 실행하고 실패 시 그 task만 재시도합니다. 파일이 많아도 하나가 실패해서 전체가 다시 도는 일이 없습니다.
- [가설] 파일마다 task를 나누면 인스턴스 시작 비용이 듭니다. 파일 수가 적으면 10개씩 묶어서 보냅니다. 첫 실행 뒤 시간을 보고 정합니다.
- 검증 단계(`tsc`, `eslint`)에는 Node가 필요합니다. [미정] Python 런타임에 Node가 없으면 Docker 런타임으로 바꾸거나, 검증은 PR을 받은 사람이 로컬에서 합니다.

### 6-3. 비용과 한도

- [사실] 기본 plan은 flex(최대 1 CPU / 4GB), CPU 시간당 $0.20 + GB 시간당 $0.05, 초 단위 과금.
- [사실] 기본 timeout은 시도당 2시간. 이 에이전트는 30분으로 줄입니다.
- LLM 비용이 더 큽니다. 한 번 실행에 보낼 파일 수와 토큰 상한을 입력값으로 둡니다.

## 7. 에이전트 개발 방법 고르기

에이전트를 처음 만든다면 아래 세 가지를 차례로 정하면 됩니다. 각 표의 **추천**은 이 프로젝트 기준입니다.

### 7-1. 구조 (에이전트가 어떻게 생각하고 움직이는가)

| 방식 | 설명 | 장점 | 단점 | 이 에이전트에 |
|---|---|---|---|---|
| A. 정해진 파이프라인 | 코드가 순서를 정하고, LLM은 정해진 칸에서만 한 번씩 답함 | 예측 가능, 디버깅 쉬움, 싸다 | 예상 못 한 상황에 약함 | **추천 (시작점)** |
| B. 도구 호출 루프 (ReAct) | LLM이 "파일 읽기", "검색", "테스트 실행" 같은 도구를 직접 골라 반복 호출 | 유연함, 탐색형 작업에 강함 | 비용과 결과가 들쭉날쭉, 무한 반복 방지 필요 | 2단계에 리팩터링 탐색용으로 |
| C. 지휘자-일꾼 (Orchestrator-Workers) | 지휘 에이전트가 일을 나누고 일꾼 에이전트들이 병렬 처리 | 큰 작업을 빨리 처리, Render `ctx.run`과 잘 맞음 | 설계가 복잡, 결과 합치기 어려움 | 여러 에이전트로 늘릴 때 |
| D. 생성-평가 반복 (Evaluator-Optimizer) | 한 LLM이 고치고, 다른 LLM이나 `tsc`/`eslint`가 평가해 다시 고침 | 결과 품질이 올라감 | 호출 수가 늘어남 | 리팩터링 자동 수정 켤 때 |

추천 순서: **A로 시작 → 파일 병렬은 C 모양 → 자동 수정 단계에서 D 추가 → 필요할 때만 B**.

### 7-2. 개발 방식 (어떻게 만들어 가는가)

| 방식 | 설명 | 추천 |
|---|---|---|
| 평가 먼저 (Eval-driven) | 정답이 있는 예제 파일 10~20개를 먼저 만들고, 프롬프트나 코드를 바꿀 때마다 점수를 봄 | **추천**. 에이전트는 겉으로 잘 되어 보여도 조용히 틀리는 일이 많음 |
| 사람 확인 단계 (Human-in-the-loop) | 쓰기 동작(PR, 파일 수정) 앞에 사람 승인 | **추천**. 6-1의 `open_pr` 기본 false가 이것 |
| 프롬프트 반복 수정 | 실패 사례를 모아 프롬프트를 고침 | 평가 세트와 같이 씀 |
| 관측 (Tracing) | 실행마다 입력, LLM 호출, 도구 호출, 결과를 남김 | Render 로그 + 리포트로 시작, 필요하면 전용 도구 |

### 7-3. 만드는 도구

| 선택지 | 설명 | 장점 | 단점 |
|---|---|---|---|
| a. LLM SDK 직접 사용 | 공급자 SDK로 직접 호출, 루프와 도구는 직접 작성 | 동작이 다 보여서 배우기 좋음, 의존성 적음 | 루프를 직접 짜야 함 |
| b. 공급자 에이전트 SDK | OpenAI Agents SDK, Claude Agent SDK 등 | 도구 호출 루프, 핸드오프가 준비됨 | 공급자에 묶임 |
| c. LangGraph | 상태 그래프로 단계를 정의 | 복잡한 분기, 재시도 표현 | 배우는 데 시간, Render Workflows와 역할이 겹침 |

- [사실] 레포는 이미 AI 스크리닝에서 OpenAI를 씁니다 (`src/lib/moderation/openai.ts`). 같은 공급자를 쓰면 키 관리가 한 곳입니다.
- 추천: **a (SDK 직접)**. Render Workflows가 이미 재시도, 병렬, 실행 기록을 해 주므로 프레임워크까지 얹을 필요가 적습니다. 공급자는 [미정].

### 7-4. 정할 것 목록

| 번호 | 질문 | 추천 |
|---|---|---|
| Q1 | 구조 | A 파이프라인 |
| Q2 | 개발 방식 | 평가 먼저 + 사람 확인 |
| Q3 | 만드는 도구 | LLM SDK 직접 |
| Q4 | LLM 공급자, 모델 | 기존 키 재사용 여부 확인 후 결정 |
| Q5 | 검증(`tsc`, `eslint`)을 에이전트 안에서 돌릴지 | 처음엔 PR 받은 사람이 로컬에서 |
| Q6 | DB 읽기 전용 계정 만들지 | 만듦 (팀 공지 후) |
| Q7 | Workflow 서비스를 main에 연결할지 | 뼈대 확인 후 main 머지 |

## 8. 진행 순서

| 단계 | 할 일 | 끝났다는 기준 |
|---|---|---|
| 0 | 이 문서에서 7-4 선택 | [미정] → [결정] |
| 1 | `agents/` 뼈대 + `hello` task, Render Workflow 서비스 생성 | 대시보드에서 `hello` 실행 성공 |
| 2 | `common/db.py`, `common/render_api.py` | task에서 테이블 수, 최근 로그 20줄 읽기 성공 |
| 3 | 평가 세트 (`code_review/tests/`) | 이모지 주석 예제와 정답 준비 |
| 4 | 규칙 점검 (이모지 주석) | 평가 세트 전부 통과 |
| 5 | `common/github.py`, 브랜치 + PR | 테스트 브랜치에 PR 1건 생성 |
| 6 | LLM 리팩터링 제안 | 리포트가 평가 세트의 기대 항목을 찾음 |
| 7 | Cron 또는 수동 실행 운영 | 1주 운영 후 다음 에이전트 결정 |

## 9. 위험과 대응

| 위험 | 대응 |
|---|---|
| 에이전트가 잘못된 코드를 푸시 | main 푸시 금지, PR만, 기본은 리포트만 |
| 공유 DB 데이터 변경 | 읽기 전용 계정, 읽기 전용 트랜잭션 |
| 로그, 코드 속 비밀값이 LLM으로 전송 | 마스킹, `.env*` 파일은 clone 후 읽지 않음 |
| 비용 폭증 | 파일 수, 토큰 상한, timeout 30분 |
| 레포 이름 변경(CMMS → memoamo) | clone 주소를 환경 변수 `GITHUB_REPO`로 둠 |

## 10. 참고

- Render Workflows: https://render.com/docs/workflows , Python SDK: https://render.com/docs/workflows-sdk-python (2026-11-26 확인, 패키지 `render`, Python 3.11+)
- Render 내부 네트워크: https://render.com/docs/private-network
- Render 로그 API: https://api-docs.render.com/reference/list-logs
