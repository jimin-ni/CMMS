# CMMS 프로젝트 작업 규칙

Claude Code가 이 저장소에서 작업할 때 따를 규칙입니다. 답변과 커밋 메시지는 한국어로 씁니다.

## 프로젝트 개요
- 이름: CMMS (Creator Message Management System, 가제). 크리에이터와 구독자(팬)의 1:1 소통 앱.
- 목적: Hack the Audience 해커톤 출품작. 마감 2026-12-05.
- 팀: 2인 이상. 기능 담당은 아래와 같습니다.
  - 주요 기능 1 (버블 1:1 채팅 + AI 반응 미리보기): 사용자
  - 주요 기능 2 (미니게임 + 순위 보드): 팀원 A
  - 주요 기능 3 (시참 도구): 팀원 B
- 기획 문서는 `docs/planning/`에 있습니다. 표기 규칙은 `[사실]`, `[가설]`, `[결정]`, `[미정]`입니다.

## 반드시 먼저 볼 것
- `AGENTS.md`: 이 버전의 Next.js(16.4.6)는 기존 지식과 다른 점이 많습니다. 코드를 쓰기 전에 `node_modules/next/dist/docs/`에서 관련 가이드를 읽으세요.
- `docs/planning/04-roadmap-and-team.md`: 역할 분담과 결정 사항 로그.

## 기술 규칙
- 스택: Next.js App Router, TypeScript, Tailwind CSS 4, Better Auth, PostgreSQL(pg).
- `next.config.ts`에서 `cacheComponents: true`입니다. 세션이나 헤더를 읽는 컴포넌트는 반드시 `<Suspense>` 안에 둡니다.
- 동적 라우트의 `params`는 Promise입니다. `await params`로 읽습니다.
- 역할은 `admin`, `creator`, `public`(구독자) 세 가지입니다. 정의는 `src/lib/access.ts`에 있습니다.
- Better Auth의 admin 플러그인이 `role` 필드를 `input: false`로 잠가 둡니다. `additionalFields`나 가입 요청으로 `role`을 설정하지 마세요. 과거에 이 때문에 가입이 실패했습니다.
- 역할 변경은 서버 전용 API로만 합니다. 현재 허용 범위는 본인 계정의 `public` → `creator` 전환뿐입니다. `admin`은 가입 화면이나 API로 설정할 수 없습니다.
- 실시간 전달 방식(Socket.IO 또는 관리형 서비스)은 아직 정하지 않았습니다. 현재 버블의 5초 새로고침은 임시 방식입니다.
- 채팅 규칙 값은 `src/lib/bubble/policy.ts`에서만 바꿉니다. 구독자 200자, 크리에이터 500자, 본인 메시지 삭제 10분, 10초 간격, 10분에 15건입니다.

## DB 운영 원칙
- 팀은 로컬 DB를 쓰지 않습니다. 모두 Render의 공유 PostgreSQL(`cmms-db-01`, Singapore)을 씁니다.
- 접속 주소는 `.env.local`의 `DATABASE_URL`에만 둡니다. 끝에 `?sslmode=verify-full`을 붙입니다.
- `.env.local`, 비밀번호, 세션 토큰, 계정 해시를 커밋하거나 채팅, 이슈, 문서에 출력하지 마세요.
- `.env.example`은 값 없는 템플릿입니다. 실제 값을 넣지 마세요.
- 스키마 변경은 `db/migrations/000N_이름.sql` 파일로만 합니다. 기존 파일은 고치지 말고 새 번호로 추가합니다.
- DB는 공유되므로 스키마를 바꾸면 팀원에게 알리고, 같은 마이그레이션을 각자 실행하게 합니다.
- Better Auth 테이블은 `npm run auth:migrate`로 관리합니다. 버블 테이블은 `npm run db:bubble`로 만듭니다.
- 테스트 계정은 공유 DB에 쌓입니다. 테스트 후 정리가 필요한지 사용자에게 확인하세요.

## Git 브랜치 규칙
- 모든 브랜치 이름은 `jimins-claude/`로 시작합니다. 예: `jimins-claude/feature-main1-bubble`.
- 기획 문서 변경은 `jimins-claude/plan-docs`에서 합니다.
- 개발 작업은 작업마다 브랜치를 따로 만듭니다. 브랜치는 가능한 한 적게 만들고, 머지된 브랜치는 정리합니다.
- Claude가 커밋과 푸시를 합니다. 머지는 사용자가 직접 합니다.
- PR은 사용자가 요청할 때만 만듭니다.
- main에 직접 커밋하거나 푸시하지 않습니다.
- 다른 사람의 브랜치(예: `yoon-claude/...`)는 건드리지 않습니다.
- 커밋 메시지는 `feat:`, `fix:`, `docs:` 형식을 씁니다. 끝에 다음 두 줄을 붙입니다.
  ```
  Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019RWrzLfuoCywu6ddHkWr2H
  ```
- PR 본문 끝에는 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`를 붙입니다.

## 커밋 전 확인
- 타입 검사: `npx tsc --noEmit`
- 린트: `npx eslint src scripts`
- 빌드: `npm run build` (스키마 경고가 나올 수 있으며, DB 연결 문제가 아니면 무시 가능)
- 현재 CI(GitHub Actions)는 없습니다. 위 검사는 로컬에서 직접 돌립니다.

## 기획 문서 작업
- 결정 사항이 생기면 `docs/planning/04-roadmap-and-team.md`의 결정 로그에 기록합니다.
- 기능 명세는 담당자가 확정한 뒤 `docs/planning/02-features.md`에 추가합니다.
- GitHub 이슈에 답글을 달기 전에는 사용자에게 내용을 먼저 보여 주고 확인받습니다.
