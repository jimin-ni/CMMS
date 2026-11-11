# 05. GitHub 운영 방식

- 상태: 브랜치·커밋 규칙은 사용 중. GitHub Actions는 아직 없음 (2026-11-12). 세부 규칙은 저장소 루트의 `CLAUDE.md`가 기준입니다.

## 1. 브랜치 규칙

- 작업 브랜치는 `작업자이름-claude/` 접두사를 사용합니다. 본인은 `jimins-claude/`, 팀원은 `yoon-claude/`입니다.
  - 예: `jimins-claude/plan-docs`, `jimins-claude/feature-main1-bubble`, `jimins-claude/fix-bubble-member-count`
- Git 브랜치명에는 대괄호와 공백을 사용할 수 없으므로 `[Jimin's Claude]` 표기 대신 위 형식을 씁니다.
- 기본 브랜치는 `main`입니다. main에 직접 커밋하지 않습니다.
- 작업은 PR로 main에 머지하고, 머지된 브랜치는 지웁니다. 다른 사람의 브랜치는 건드리지 않습니다.

## 2. 커밋 규칙

- 커밋 메시지는 `feat:`, `fix:`, `docs:` 형식으로 시작하고, 변경 목적이 드러나게 씁니다.
- Claude가 작성한 커밋에는 `Co-Authored-By: Claude 모델명 <noreply@anthropic.com>` 줄을 붙입니다.
- CI가 생기기 전까지는 커밋 전에 `npx tsc --noEmit`, `npx eslint src scripts`, `npm run build`를 로컬에서 돌립니다.

## 3. GitHub Actions 계획 [가설]

| 워크플로 | 실행 시점 | 내용 | 도입 시점 |
|---|---|---|---|
| `ci.yml` | 브랜치 push, PR 생성 | 의존성 설치, 린트, 타입 체크, 테스트, 빌드 | 다음 브랜치 (Next.js 초기 설정 직후) |
| 배포 | main 병합 | Render 자동 배포 (Render GitHub 연동) | 공통 인프라 단계 |
| `dependabot.yml` | 주기적 | 의존성 업데이트 PR 생성 | 선택 |

- CI가 실패하면 머지하지 않습니다.
- 워크플로 파일은 `.github/workflows/`에 둡니다.

## 4. GitHub Projects 계획 [가설]

- 보드 열: Backlog → In progress → Review → Done
- 이슈 라벨 예시: `planning`, `infra`, `feature`, `bug`, `devops`, `2nd-phase`
- 이슈는 기능 단위로 만들고, 관련 브랜치와 PR을 연결합니다.
- 담당자 표기로 역할 분담(본인, 팀원 A, 팀원 B)을 보여줍니다.

## 5. 템플릿 계획 [가설]

- PR 템플릿: 변경 내용, 확인 방법, 관련 이슈, 스크린샷(UI 변경 시)
- 이슈 템플릿: 기능 요청, 버그 리포트

## 6. 도구 역할 분담 [가설]

| 작업 | 도구 |
|---|---|
| 여러 파일에 걸친 기능, 스캐폴딩, 배포 설정, CI 설정 | Claude Code |
| UI 세부 조정, 소규모 수정 | Cursor |
| 설계 토론 | Claude 대화 후 결정을 문서로 기록 |
