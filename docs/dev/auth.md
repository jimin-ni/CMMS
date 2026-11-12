# 인증(Better Auth) 개발 메모

- 상태: main에 머지됨 (PR #6, #15). 이슈 #3 닫음 (2026-11-12 갱신)
- 기획 근거: `docs/planning/06-auth.md` (Better Auth 확정)
- 버전: `better-auth` 1.7.19 (전체 버전 표는 `docs/planning/03-tech-stack.md` 1-1절)

## 역할 (role)

| 값 | 표시 이름 | 설명 |
|---|---|---|
| `public` | 구독자 | 가입 시 기본 역할 |
| `creator` | 크리에이터 | 가입 화면에서 "예"를 고르면 가입 후 서버 API로 전환. 프로필 사진 등록, 크리에이터 톡 사용. 인증 승인 기능은 추후 추가 |
| `admin` | 관리자 | 사용자 목록 조회 등 관리 API 허용. 가입 화면이나 API로는 설정할 수 없음 |

- 역할 정의: `src/lib/access.ts`
- 관리자 플러그인 설정: `src/lib/auth.ts`

### 가입 시 역할 설정 주의

- Better Auth admin 플러그인이 `role` 필드를 `input: false`로 잠급니다. 가입 요청이나 `additionalFields`로 `role`을 보내면 `FIELD_NOT_ALLOWED`로 실패합니다 (#13).
- 그래서 가입 요청에는 역할을 넣지 않고, 가입 직후 `POST /api/signup/creator`를 호출합니다. 이 API는 본인 계정만 `public`에서 `creator`로 바꿉니다.

## 로컬 실행

팀은 로컬 DB를 쓰지 않고 Render 공유 DB(`cmms-db-01`)를 함께 씁니다.

1. Render 대시보드에서 Postgres의 External Database URL을 복사
2. `.env.example`을 `.env.local`로 복사하고 `DATABASE_URL`에 위 주소를 넣음 (끝에 `?sslmode=verify-full`)
3. `BETTER_AUTH_SECRET`에 긴 임의 문자열을 넣음
4. 테이블 생성(처음 한 번): `npm run auth:migrate`
5. 개발 서버: `npm run dev` → http://localhost:3000

주의: `.env.local`은 Git에 올리지 않습니다. 공유 DB이므로 테스트 계정이 함께 쌓입니다.

## 화면

| 경로 | 상태 | 내용 |
|---|---|---|
| `/` | 로그아웃 | 로그인 안내 |
| `/` | 로그인 | 닉네임, 역할, 이메일, 기능 화면 링크 |
| `/login`, `/signup` | 공통 | 이메일과 비밀번호 로그인, 가입 |
| `/features` | 로그인 필요 | 주요 기능 3종 임시 카드 (로그아웃 상태면 `/login`으로 이동) |
| `/creator` | 크리에이터 | 대화방 열기, 프로필 사진, 성격 저장 (`docs/dev/bubble.md`) |
| `/bubble`, `/bubble/[roomId]` | 로그인 필요 | 버블 대화방 목록과 대화 화면. 크리에이터에게는 "구독자"/"크리에이터 톡" 탭 |
| `/bubble/talk`, `/bubble/talk/[chatId]` | 크리에이터 | 크리에이터 톡 목록·검색과 대화 화면. 다른 역할은 `/bubble`로 이동 (PR #27) |

## 확인한 동작

- 가입 시 역할은 `public`. 크리에이터로 가입하면 `/creator`로 이동하고 역할이 `creator`가 됨 (2026-11-11 브라우저 테스트)
- `public` 계정은 `/api/auth/admin/list-users` 호출 시 403
- `admin` 계정은 같은 API 호출 시 사용자 목록 반환
- 로그아웃 상태에서 `/features` 접근 시 `/login`으로 리다이렉트

## 디자인 키 컬러 (로고 이미지 기준, HEX는 추정값)

| 이름 | HEX | 용도 |
|---|---|---|
| key-blue | #8fb0cf | 역할 배지 |
| key-mist | #e6eaec | 배경 |
| key-stone | #9ea09e | 보조 텍스트 |
| key-brown | #6b4e37 | 헤더, 주요 버튼 |

- 이미지에는 PANTONE 로고만 있고 색 번호가 없어서 HEX 값은 눈으로 추정했습니다. 정확한 값은 팬톤 번호를 받은 뒤 바꿔야 합니다.

## 다음 단계

- 크리에이터 인증 승인 화면 (관리자 전용)
- 인증 화면 디자인 다듬기
- 배포 시 `BETTER_AUTH_URL`과 `BETTER_AUTH_SECRET`을 Render 환경 변수에 설정
