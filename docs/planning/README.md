# MEMOAMO 기획 문서

MEMOAMO(가제 CMMS, Creator Message Management System)의 기획 문서 모음입니다. 공모전 제출 마감은 2026-12-05입니다.

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
| [09-heap-room.md](./09-heap-room.md) | 크리에이터 방의 오브제별 기능, 디자인 결정과 이유, 쪽지 트리, 팬 작품 |
| [10-audio.md](./10-audio.md) | 배경음악·효과음 출처, 라이선스, 공모전 음원 규정 대조 |
| [11-design-palette-v2.md](./11-design-palette-v2.md) | 디자인 시안 v2: Chipotle 팔레트·글꼴·컴포넌트 규칙 반영, v1 클래스 대응표 |
| [12-ai-screening.md](./12-ai-screening.md) | AI 스크리닝 기준 문서: 판정(사전·regex·OpenAI), 경고·자동 차단·신고·재검토, 검토 화면, 도배 방지, 데이터 모델, 구현 범위 |
| [14-privacy-policy-draft.md](./14-privacy-policy-draft.md) | 개인정보 처리방침 초안 (모더레이션·제재 반영, 법률 검토 전) |
| [15-agents.md](./15-agents.md) | 개발 보조 도구: 코드 점검 에이전트(Render Workflows, Claude API), PR 리뷰(open-code-review), 디자인 점검(impeccable) |
| [16-render-workflows.md](./16-render-workflows.md) | Render Workflows 적용 기준 문서: AI 스크리닝 사후 재판정(버블), DB 쓰기 계정, 개발 순서, 시연 |

## 표기 규칙

- **[사실]**: 출처가 확인된 내용
- **[가설]**: 검증이 필요한 내용
- **[결정]**: 팀 합의가 끝난 내용
- **[미정]**: 아직 정하지 않은 내용

## 개발 문서 (`docs/dev/`)

기획 문서가 "무엇을, 왜"를 정하고, 개발 문서는 "어느 코드에 어떻게, 어떤 순서로"를 적습니다. 둘이 어긋나면 기획 문서가 기준입니다.

| 문서 | 내용 | 기획 문서 |
|---|---|---|
| [auth.md](../dev/auth.md) | 인증, 역할, 가입 흐름 | 06 |
| [bubble.md](../dev/bubble.md) | 버블 채팅, (보류) 크리에이터 톡·AI 미리보기 | 02 |
| [moderation.md](../dev/moderation.md) | AI 스크리닝 코드 구조, 흐름도, 바꿀 때 지킬 것 | 12 |
| [moderation-korean.md](../dev/moderation-korean.md) | 한국어 스크리닝 보강 작업 지시서 (구현 전) | 12 |
| [render-workflows.md](../dev/render-workflows.md) | Render Workflows 단계별 작업과 **현재 상태** | 16 |
| [agents.md](../dev/agents.md) | 개발 보조 에이전트 코드 위치, 확인 결과, **현재 상태** | 15 |
| [onboarding.md](../dev/onboarding.md) | 첫 화면 온보딩 | 08 |
| [heap-notes.md](../dev/heap-notes.md) | 쪽지 트리 | 09 |
| [heap-room-v2.md](../dev/heap-room-v2.md) | 방 v2 (고정 소품을 가구로) | 09 |
| [furniture-ids-table.md](../dev/furniture-ids-table.md) | 가구 id 표 (`.csv` 같은 내용) | 09 |
| [presence.md](../dev/presence.md) | 함께 있기 (Cloudflare Workers) | 03 |
| [room-fx.md](../dev/room-fx.md) | 방 효과(셰이더) 시험 | 09 |
| [minigame.md](../dev/minigame.md), [sicham.md](../dev/sicham.md) | 팀원 기능 2·3번 개발 메모 | 02 |

## 현재 상태

- 진행 상황과 남은 일: **04 문서 2절** (2026-11-26 갱신)
- 결정 이력: 04 문서 4절 결정 로그
- 스택과 버전: 03 문서
- 이 README에는 상태를 따로 적지 않습니다 (예전 "현재 상태 (2026-11-14)" 절은 04 문서와 겹쳐 지웠습니다).
