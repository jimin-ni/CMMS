# CMMS 기획 문서

CMMS(Creator Message Management System, 가제)의 기획 문서 모음입니다. 공모전 제출 마감은 2026-12-05입니다.

| 문서 | 내용 |
|---|---|
| [01-overview.md](./01-overview.md) | 서비스 개요, 공모전 요건 대조, 시장과 경쟁 |
| [02-features.md](./02-features.md) | 기능 범위, MVP, 기능별 상세 |
| [03-tech-stack.md](./03-tech-stack.md) | Next.js 기반 기술 설계 초안, 실시간 구조 비교 |
| [04-roadmap-and-team.md](./04-roadmap-and-team.md) | 역할 분담, 진행 순서, 리스크, 결정 사항 |
| [05-github-workflow.md](./05-github-workflow.md) | 브랜치 규칙, GitHub Actions, GitHub Projects 운영 |
| [06-auth.md](./06-auth.md) | 인증 방식 비교 (Better Auth, Supabase Auth, Clerk) |
| [07-database.md](./07-database.md) | 데이터베이스 선택 이유 (관계형, PostgreSQL) |
| [08-design.md](./08-design.md) | 현재 화면의 디자인 토큰, 컴포넌트, 사용자 흐름, Figma 파일 구조 |

## 표기 규칙

- **[사실]**: 출처가 확인된 내용
- **[가설]**: 검증이 필요한 내용
- **[결정]**: 팀 합의가 끝난 내용
- **[미정]**: 아직 정하지 않은 내용

개발 메모는 `docs/dev/`에 있습니다: [auth.md](../dev/auth.md) (인증), [bubble.md](../dev/bubble.md) (버블과 AI 미리보기).

## 현재 상태 (2026-11-12)

- [결정] 팀 2명, Next.js 16 사용. 사용 버전은 03 문서 1-1절
- [결정] 인증: Better Auth (MIT)
- [결정] 데이터베이스: 관계형 DB, PostgreSQL (07 문서). Render 공유 DB를 팀이 함께 씀
- [결정] DB 접근: Drizzle ORM (#17)
- [결정] AI 반응 미리보기: TypeSafe AI Jev가 얼굴 이모지 1개를 고름
- [결정] 크리에이터 톡: 크리에이터끼리 1:1·그룹 대화, 참여자는 반드시 `creator`. 다른 크리에이터는 사진과 닉네임만 보임 (02 문서 3-3절)
- [결정] 프로필 사진은 크리에이터만 등록. 성격은 다른 사람에게 보이지 않음
- [결정] 실시간 전달: 지금은 5초 폴링, 브랜치를 합칠 때 SSE + PostgreSQL LISTEN/NOTIFY로 바꿈 (03 문서 2절, #19)
- [사실] main에 인증·역할, 버블 다수 대화방, AI 반응 미리보기가 들어감. 크리에이터 톡과 프로필 사진은 PR #27 머지 전. 진행 상황과 남은 작업은 04 문서 2절
- [결정] 사용자 역할 3종: 구독자, 크리에이터, 관리자
- [결정] 브랜치 운영: 기획 변경은 `jimins-claude/plan-docs`, 개발 작업은 개발용 브랜치를 따로 만든다
- [결정] 혼합형 수익 모델로 잠정 결정
- [결정] 함께 방송할 때 시청자를 포함하는 단톡방은 추가 아이디어로 둠
- [미정] 대상 크리에이터 (후보 5명 중 미정)
- [미정] 실시간 전달의 배포 환경 확인 (프록시 버퍼링, 연결 유지, 연결 수 한도). 배포 뒤 진행 (#19)
