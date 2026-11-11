# 03. 기술 설계 초안

- 상태: 일부 확정, 개발 상태 기준 갱신 (2026-11-12)
- 기준: 확정된 항목은 [결정], 나머지는 [가설] 또는 [미정]

## 1. 기본 스택

| 영역 | 제안 | 상태 | 이유 |
|---|---|---|---|
| 프레임워크 | Next.js (App Router, TypeScript) | [결정] | 프론트엔드와 API를 한 저장소에서 관리 |
| 스타일 | Tailwind CSS 4 | [결정] | 빠른 UI 작업, 모바일 대응이 쉬움. 지금 코드에서 사용 중 |
| 인증 | Better Auth (MIT) + admin 플러그인 | [결정] | 사용자 정보를 우리 DB에 두고 추가 서비스 없이 운영. 비교는 06 문서 |
| ORM | Drizzle | [결정] (#17, 2026-11-11) | 타입 검사로 공유 DB 실수 방지, SQL에 가까움, Prisma보다 가벼움. Better Auth 테이블은 `pg`로 Better Auth가 직접 관리 |
| DB | PostgreSQL 16 (Render 공유 DB `cmms-db-01`, Singapore) | [결정] | 정형 데이터(사용자, 구독)와 비정형 데이터(메시지 본문, 페르소나 문서)를 한 DB에서 처리. 선택 이유는 07 문서 |
| 캐시·요청 제한 | Redis (Render Key Value) | [가설] | 요청 제한, 반응 예측 캐시. 지금은 메시지 전송 제한만 DB 조회로 처리 |
| AI | TypeSafe AI Jev (`jev-latest`), 서버 라우트에서만 호출 | [결정] (2026-11-11) | 반응 목록에서 하나를 고르는 선택형 응답, 짧은 지연. API 키 노출 방지 |
| 테스트 | Vitest (단위), Playwright (E2E) | [가설] | 핵심 흐름 자동 검증. 지금은 저장소 밖의 Playwright 스크립트로 수동 검증만 함 |
| 배포 | Render (웹 서비스 + PostgreSQL), GitHub 연동 자동 배포 | [결정] | 기존 팀 결정 사항. 웹 서비스 배포는 아직 안 함 |
| 도메인 | .xyz | [결정] | 기존 팀 결정 사항 |

## 1-1. 사용 버전 (2026-11-12, main 기준)

`package.json`과 실제 설치된 버전입니다. 버전을 올리면 이 표도 함께 고칩니다.

| 구분 | 이름 | 버전 | 비고 |
|---|---|---|---|
| 런타임 | Node.js | 24.6.0 | 개발 PC 기준. npm 11.5.1 |
| 프레임워크 | `next` | 16.4.6 (고정) | `cacheComponents`, `partialPrefetching` 사용. 코드를 쓰기 전에 `node_modules/next/dist/docs/` 확인 |
| UI | `react`, `react-dom` | 19.3.0 (고정) | |
| 인증 | `better-auth` | 1.7.19 | admin 플러그인으로 역할 3종 관리 |
| DB 접근 | `drizzle-orm` | 0.45.4 | 버블, 크리에이터 프로필 테이블 조회와 쓰기 |
| DB 드라이버 | `pg` | 8.23.1 | Better Auth와 Drizzle이 함께 사용 |
| DB 서버 | PostgreSQL | 16.15 | Render 공유 DB |
| 스타일 | `tailwindcss`, `@tailwindcss/turbopack` | 4.3.3 (고정) | |
| 언어 | `typescript` | 5.9.3 | |
| 린트 | `eslint`, `eslint-config-next` | 9.39.5, 16.4.6 | |
| 타입 | `@types/node`, `@types/react`, `@types/pg` | 20.19.43, 19.3.0, 8.23.1 | |
| AI | TypeSafe AI Jev | `jev-latest` (2026-11-11 응답 기준 `jev-1.14.0`) | 엔드포인트 `https://api.typesafe.ai/v1/systemone`. 모델은 `BUBBLE_PREVIEW_MODEL`로 바꿀 수 있음 |
| 검증 도구 | `playwright-core` + Microsoft Edge | 1.48.2 | 프로젝트 의존성이 아님. 3인 브라우저 테스트에만 사용 |

## 2. 실시간 통신 방식 (미정, 비교)

Next.js의 기본 서버는 WebSocket 연결을 직접 다루지 않으므로, 실시간 방식을 먼저 정해야 합니다.

| 방식 | 구성 | 장점 | 단점 |
|---|---|---|---|
| A. 관리형 실시간 서비스 | Next.js + Ably, Pusher, PubNub 등 | 서버 구현이 적음, 확장과 재연결을 서비스가 처리 | 메시지 수에 따른 비용, 외부 의존성 |
| B. 커스텀 서버 | Next.js 커스텀 서버 + Socket.IO (한 프로세스) | 비용이 낮음, 구조가 단순함 | 배포 설정이 복잡함, 서버리스 환경과 맞지 않음 |
| C. 분리 서버 | Next.js (프론트·API) + 별도 Node 실시간 서버 | 역할이 명확함 | 배포와 운영 부담 증가, 2명 팀에 부담 |

- [사실] 현재 구현 (2026-11-12): 실시간 방식을 정하기 전까지 임시로 `GET /api/bubble/rooms/[roomId]/messages?since=`를 5초마다 폴링합니다. 나중에 같은 주소를 SSE 등으로 바꿀 수 있게 만들었습니다. 결정은 #19에서 진행합니다.
- [가설] 추천: 1일 PoC로 A와 B를 비교한 뒤 결정합니다. C는 MVP에서 제외합니다.
- [미정] 비교 기준: 비용, Render 배포 난이도, 재연결 처리, 팀원 학습 비용
- 확인 필요: Render에서 WebSocket 연결이 안정적으로 유지되는지 PoC에서 검증

## 3. 데이터 모델 초안 [가설]

| 테이블 | 주요 필드 | 비고 |
|---|---|---|
| users | id, email, nickname, role, created_at | 최소 정보만 저장. role: subscriber, creator, admin |
| creator_profiles | user_id, verified, persona (JSON), persona_version | 크리에이터 인증 여부는 verified 플래그. 페르소나는 비정형 데이터 |
| subscriptions | id, subscriber_id, creator_id, status, started_at, expires_at | 기념일 표시에 started_at 사용 |
| rooms | id, type (1:1, creator_pair, broadcast) | 방 구조를 여러 기능이 공유 |
| room_members | room_id, user_id | |
| messages | id, room_id, sender_id, body (JSON), created_at, read_at | |
| reaction_logs | id, message_draft_hash, persona_version, emojis, latency_ms | 비용 추적과 캐시 기준 |

현재 구현된 테이블 [사실] (2026-11-12)

| 테이블 | 만든 곳 | 비고 |
|---|---|---|
| `user`, `session`, `account`, `verification` | `npm run auth:migrate` (Better Auth) | 역할은 `user.role`. 값은 `public`, `creator`, `admin` |
| `bubble_rooms`, `bubble_members`, `bubble_messages` | `db/migrations/0002_bubble_rooms.sql` | 크리에이터 1 : 구독자 다수 대화방. 위 초안의 rooms, room_members, messages에 해당 |
| `creator_profiles` | `db/migrations/0003_creator_profiles.sql` | `persona`는 JSON이 아닌 1000자 이내 문자열. `verified`, `persona_version`은 아직 없음 |
| `bubble_migrations` | `scripts/db-migrate.mjs` | 적용한 마이그레이션 기록 |

- 테이블 정의는 SQL 마이그레이션이 기준이고, `src/lib/schema.ts`의 Drizzle 정의를 같이 맞춥니다.
- subscriptions, reaction_logs는 아직 만들지 않았습니다.

## 4. 주요 API와 이벤트 [가설]

현재 구현 [사실] (2026-11-12)
- 쓰기는 Server Actions: 방 열기, 참여, 메시지 전송, 메시지 삭제, 방 닫기(`src/lib/bubble/actions.ts`), 성격 저장(`src/lib/creator/actions.ts`)
- 실시간 읽기: `GET /api/bubble/rooms/[roomId]/messages?since=`
- AI 미리보기: `POST /api/bubble/preview` (구독자만)
- 역할 전환: `POST /api/signup/creator` (본인 계정 `public` → `creator`만)
- 인증: `/api/auth/*` (Better Auth)

초안

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
