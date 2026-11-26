# memoamo Render Workflows

Render Workflows로 돌리는 백그라운드·에이전트 작업입니다. Next.js 앱과 의존성을 나누려고 폴더를 따로 둡니다.

## task 목록

| 이름 | 입력 | 하는 일 |
|---|---|---|
| `hello` | `name`(선택) | 인사 문자열을 돌려줌. 연결 확인용 |
| `helloMany` | `names: string[]` | 이름마다 `hello`를 병렬로 실행하고 결과를 모음 |
| `moderation.recheck` | `surface`, `messageId` | AI 스크리닝 사후 재판정 1건 (16 문서) |
| `moderation.sweep` | 없음 | 재판정이 밀린 글을 모아 다시 판정 (16 문서) |
| `agentCheck.db` | 없음 | `agent_ro`로 테이블 수, 큰 테이블 5개 행 수. 인증 테이블이 막히는지 (`authBlocked: true`) |
| `agentCheck.logs` | 없음 | 웹 서비스 최근 로그 20줄 (비밀값 가림) |
| `agentCheck.llm` | 없음 | Claude 1회 호출, 구조화 출력과 토큰 사용량, 비용 |

## Environment (Render Workflow 서비스)

값은 저장소, 채팅, 문서에 적지 않습니다. 자세한 설명은 `docs/planning/15-agents.md` 4-3.

| 이름 | 쓰는 task |
|---|---|
| `DATABASE_URL` | `moderation.*` (Internal URL + `moderation_worker`) |
| `OPENAI_API_KEY` | `moderation.*` |
| `AGENT_DATABASE_URL` | `agentCheck.db`, 이후 에이전트 (Internal URL + `agent_ro`) |
| `ANTHROPIC_API_KEY` | `agentCheck.llm`, 이후 에이전트 |
| `RENDER_API_KEY`, `RENDER_OWNER_ID`, `RENDER_WEB_SERVICE_ID` | `agentCheck.logs`, 이후 에이전트 |
| `CODE_REVIEW_PERSON_NAMES` | 주석 정리. 주석에 있으면 안 되는 이름 (쉼표 구분) |

## 검사

```bash
cd workflows
npm run check        # tsc --noEmit
npm run eval         # 주석 규칙 평가 세트
npm run comments -- <파일...> [--write]   # 주석 정리 (Claude 사용, 기본은 미리보기)
npm run build        # dist/index.js 묶음
```

## Render 서비스 설정 (New > Workflow > My own workflow)

| 칸 | 값 |
|---|---|
| Repo / Branch | `jimin-ni/CMMS` / 이 폴더가 들어 있는 브랜치 |
| Language | Node |
| Region | Singapore (공유 DB와 같은 리전) |
| Root Directory | `workflows` |
| Build Command | `npm ci` (설치 뒤 `postinstall`이 `build.mjs`로 `dist/index.js`를 만듦) |
| Start Command | `npm start` (`node dist/index.js`) |
- 묶음 빌드를 하는 이유: 재판정 task가 `../src/lib/moderation/`의 앱 코드를 쓰는데, Render는 이 폴더의 `node_modules`만 설치합니다. `build.mjs`가 앱 코드와 의존성을 한 파일로 묶습니다.

배포가 끝나면 대시보드에 `hello`, `helloMany`가 보여야 합니다. 대시보드에서 직접 실행하거나 아래처럼 코드에서 실행합니다.

## 웹 서비스에서 실행하기

1. Render Account Settings > API Keys에서 키를 만들고, 웹 서비스 Environment에 `RENDER_API_KEY`로 넣습니다. 값은 저장소에 쓰지 않습니다.
2. 루트 앱에 `@renderinc/sdk`를 설치한 뒤 서버 코드(Server Action, Route Handler)에서만 부릅니다.

```ts
import { Render } from "@renderinc/sdk";

const render = new Render(); // RENDER_API_KEY를 환경 변수에서 읽음
const run = await render.workflows.startTask("<workflow 슬러그>/helloMany", [["러브쑤", "팬"]]);
const result = await run.get(); // 끝날 때까지 기다림
```

슬러그는 대시보드의 task 화면 위쪽에 `{workflow 슬러그}/{task 이름}` 형태로 나옵니다.

## 로컬 확인

Render CLI가 있으면:

```bash
cd workflows
npm install
render workflows dev -- npm run dev
# 다른 터미널
render workflows tasks list --local
```
