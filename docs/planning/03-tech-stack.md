# 03. 기술 설계 초안

- 상태: 초안, 팀 검토 전
- 기준: Next.js 사용 (확정), 나머지는 [가설]

## 1. 기본 스택

| 영역 | 제안 | 상태 | 이유 |
|---|---|---|---|
| 프레임워크 | Next.js (App Router, TypeScript) | [결정] | 프론트엔드와 API를 한 저장소에서 관리 |
| 스타일 | Tailwind CSS | [가설] | 빠른 UI 작업, 모바일 대응이 쉬움 |
| 인증 | Auth.js (NextAuth) + DB 기반 역할 관리 | [가설] | Next.js와 통합이 쉬움. 역할(팬, 크리에이터, 관리자)은 DB에서 관리 |
| ORM | Prisma 또는 Drizzle | [미정] | 타입 안정성, 마이그레이션 관리 |
| DB | PostgreSQL (Render) | [가설] | 정형 데이터(사용자, 구독)와 비정형 데이터(메시지 본문, 페르소나 문서)를 한 DB에서 처리 |
| 캐시·요청 제한 | Redis (Render Key Value) | [가설] | 요청 제한, 반응 예측 캐시 |
| AI | 소형 LLM API, 서버 라우트에서만 호출 | [가설] | API 키 노출 방지, 비용 통제 |
| 테스트 | Vitest (단위), Playwright (E2E) | [가설] | 핵심 흐름 자동 검증 |
| 배포 | Render (웹 서비스 + PostgreSQL), GitHub 연동 자동 배포 | [결정] | 기존 팀 결정 사항 |
| 도메인 | .xyz | [결정] | 기존 팀 결정 사항 |

## 2. 실시간 통신 방식 (미정, 비교)

Next.js의 기본 서버는 WebSocket 연결을 직접 다루지 않으므로, 실시간 방식을 먼저 정해야 합니다.

| 방식 | 구성 | 장점 | 단점 |
|---|---|---|---|
| A. 관리형 실시간 서비스 | Next.js + Ably, Pusher, PubNub 등 | 서버 구현이 적음, 확장과 재연결을 서비스가 처리 | 메시지 수에 따른 비용, 외부 의존성 |
| B. 커스텀 서버 | Next.js 커스텀 서버 + Socket.IO (한 프로세스) | 비용이 낮음, 구조가 단순함 | 배포 설정이 복잡함, 서버리스 환경과 맞지 않음 |
| C. 분리 서버 | Next.js (프론트·API) + 별도 Node 실시간 서버 | 역할이 명확함 | 배포와 운영 부담 증가, 2명 팀에 부담 |

- [가설] 추천: 1일 PoC로 A와 B를 비교한 뒤 결정합니다. C는 MVP에서 제외합니다.
- [미정] 비교 기준: 비용, Render 배포 난이도, 재연결 처리, 팀원 학습 비용
- 확인 필요: Render에서 WebSocket 연결이 안정적으로 유지되는지 PoC에서 검증

## 3. 데이터 모델 초안 [가설]

| 테이블 | 주요 필드 | 비고 |
|---|---|---|
| users | id, role, nickname, created_at | 역할: fan, creator, admin |
| creator_profiles | user_id, verified, persona (JSON), persona_version | 페르소나는 비정형 데이터 |
| subscriptions | id, fan_id, creator_id, status, started_at, expires_at | 기념일 표시에 started_at 사용 |
| rooms | id, type (1:1, creator_pair, broadcast) | 방 구조를 여러 기능이 공유 |
| room_members | room_id, user_id | |
| messages | id, room_id, sender_id, body (JSON), created_at, read_at | |
| reaction_logs | id, message_draft_hash, persona_version, emojis, latency_ms | 비용 추적과 캐시 기준 |

## 4. 주요 API와 이벤트 [가설]

- REST: `/api/auth/*`, `/api/creators/*`, `/api/subscriptions/*`, `/api/rooms/*`
- 실시간 이벤트 명명 규칙: `domain:action` (예: `message:send`, `message:read`, `reaction:preview`)
- AI 미리보기 요청: 서버 라우트에서 처리하고, 실패 시 빈 결과를 반환합니다.

## 5. Render 트랙 대응 (Render Workflows 사용 필수) [가설]

Render 트랙은 Render Workflows를 사용해야 대상이 됩니다. 다음 비동기 작업에 사용합니다.

- 구독 만료 처리
- 일일 메시지 요약과 우선순위 집계
- 2번 기능을 도입하면 리더보드 정산

## 6. 운영과 DevOps (보너스 +10 대응) [가설]

| 항목 | 구현 계획 |
|---|---|
| CI/CD | GitHub Actions에서 린트, 타입 체크, 테스트, 빌드 실행. main 병합 시 Render 자동 배포 (05 문서) |
| 모니터링 | 헬스 체크 엔드포인트, 에러 추적 도구 (무료 플랜 확인 필요), 업타임 체크 |
| 부하 대응 | k6로 동시 접속 시나리오를 테스트하고 결과를 기술 문서에 기록 |
| 복원력 | 요청 제한, AI 장애 시 미리보기만 생략, 롤백 절차 문서화 (이전 배포로 복구) |
| 보안·안전 | 욕설 필터, 신고와 차단, 닉네임 중심의 최소 개인정보 수집 |

## 7. 확인이 필요한 사항

- Render 무료 플랜의 유휴 시 중지 여부와 WebSocket 지원 조건
- AI API 1회 호출의 지연 시간과 원가 (PoC로 측정)
- 에러 추적 도구의 무료 플랜 범위
