# 인증(Better Auth) 개발 메모

- 브랜치: `jimins-claude/dev-auth`
- 기획 근거: `docs/planning/06-auth.md` (Better Auth 확정)

## 역할 (role)

| 값 | 표시 이름 | 설명 |
|---|---|---|
| `public` | 구독자 | 가입 시 기본 역할 |
| `creator` | 크리에이터 | 관리자가 부여. 인증 승인 기능은 추후 추가 |
| `admin` | 관리자 | 사용자 목록 조회 등 관리 API 허용 |

- 역할 정의: `src/lib/access.ts`
- 관리자 플러그인 설정: `src/lib/auth.ts`

## 로컬 실행

1. PostgreSQL 준비 (로컬 DB 이름 예: `cmms`)
2. `.env.example`을 `.env.local`로 복사해 값을 채움
3. 테이블 생성: `npm run auth:migrate`
4. 개발 서버: `npm run dev` → http://localhost:3000

## 화면

| 경로 | 상태 | 내용 |
|---|---|---|
| `/` | 로그아웃 | 로그인 안내 |
| `/` | 로그인 | 닉네임, 역할, 이메일, 기능 화면 링크 |
| `/login`, `/signup` | 공통 | 이메일과 비밀번호 로그인, 가입 |
| `/features` | 로그인 필요 | 주요 기능 3종 임시 카드 (로그아웃 상태면 `/login`으로 이동) |

## 확인한 동작

- 가입 시 역할은 `public`
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
