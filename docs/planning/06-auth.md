# 06. 인증 방식 비교

- 상태: 확정 (2026-11-10 팀 결정: Better Auth)
- 요구 조건
  - 저장하는 사용자 정보는 최소로 유지 (이메일, 닉네임, 역할)
  - 역할 3종: 구독자, 크리에이터, 관리자
  - Next.js 기반, Render 배포
  - 2명 팀이 운영할 수 있는 수준의 작업량

## 1. 후보 비교

| 항목 | Better Auth | Supabase Auth | Clerk |
|---|---|---|---|
| 형태 | MIT 라이선스 라이브러리. 우리 서버 안에서 실행 | Supabase 플랫폼의 인증 기능 | 호스팅 서비스 (SaaS) |
| 사용자 데이터 위치 | 우리 PostgreSQL (Render) | Supabase 프로젝트 | Clerk 서비스 |
| 무료 범위 | 라이선스 비용 없음. 호스팅 비용만 발생 | 무료 플랜 5만 MAU (2개 프로젝트, 1주 미사용 시 일시 중지) | 무료 플랜 (아래 3절 참고) |
| 역할 관리 | admin 플러그인: 기본 역할은 user, admin. 커스텀 역할 정의 가능 | 직접 구현 필요 (사용자 메타데이터 또는 DB 정책) | 기본 제공. 세부 기능은 상위 플랜에서 사용 |
| UI | 직접 구성 (공식 UI 라이브러리 별도) | 직접 구성 | 사전 제작 UI 제공, 가장 빠름 |
| 우리 스택과의 결합 | 높음 (Next.js, Render PostgreSQL) | DB를 Supabase로 옮길 때 유리 | 외부 서비스 의존 |
| 개발 속도 | 중간 | 중간 | 빠름 |
| 장기 운영 부담 | 직접 관리 (업데이트, 보안 패치) | 플랫폼 종속 | 종속, 사용자 수 증가 시 과금 |

## 2. 추천: Better Auth

- 사용자 정보가 우리 DB에 있으므로 최소 정보만 저장하는 요구에 맞습니다.
- 라이선스 비용이 없어 비용 예측이 쉽습니다.
- admin 플러그인으로 역할 체계를 확장할 수 있습니다. 기본 역할이 user와 admin이므로 구독자와 크리에이터는 커스텀 역할로 정의합니다.
- 단점은 로그인 화면과 세션 관리를 직접 구성해야 한다는 점입니다. 2명 팀에서는 작업량이 늘어납니다. 공식 예제를 기반으로 시작해 줄입니다.

### 역할 설계 (최소안)

| 역할 | 저장 방식 | 비고 |
|---|---|---|
| subscriber | users.role | 기본 역할 |
| creator | users.role + creator_profiles.verified | 역할은 creator, 인증 승인 전에는 기능 제한 |
| admin | users.role | 크리에이터 인증 승인, 신고 처리 |

- 저장 항목: 이메일, 닉네임, 역할, 가입 시각. 실명과 전화번호는 저장하지 않습니다.
- 확인 필요: Better Auth의 기본 역할 이름(user)을 subscriber로 바꿀지, 매핑 계층을 둘지

## 3. 대안별 조건 메모

### Clerk

- 무료 범위에 대한 자료가 엇갈립니다. Clerk 공식 설명 글은 무료 플랜이 월간 유지 사용자 5만 명이라고 설명하고, 2026년 2월 5일 변경이라고 밝힙니다. 다른 비교 자료는 1만 명 기준으로 적혀 있습니다. 제출 전에 Clerk 가격 페이지에서 직접 확인해야 합니다.
- 빠른 UI가 장점입니다. 데모를 빨리 보여줘야 하면 Clerk가 현실적인 선택입니다.

### Supabase Auth

- 무료 플랜은 5만 MAU를 포함하고, 프로젝트가 1주일 동안 사용되지 않으면 일시 중지됩니다. 데모 직전에 중지되면 위험합니다.
- DB를 Supabase로 함께 쓸 때만 장점이 큽니다. 지금 계획은 Render PostgreSQL이므로 결합 이점이 적습니다.

## 4. 근거 (출처별)

- Clerk 가격 설명 글 (clerk.com 아티클): https://clerk.com/articles/clerk-pricing-explained
  - 내용: 2026년 2월 5일 무료 플랜이 5만 MRU로 올랐다고 설명. 1만 명 수치는 예전 기준이라는 설명
- Clerk 플랜 변경 공지: https://clerk.com/changelog/2026-02-05-new-plans-more-value.md (위 글에서 인용된 링크)
- Supabase 공식 가격 페이지: https://supabase.com/pricing
  - 내용: 무료 플랜 5만 MAU, 2개 프로젝트 제한, 1주 미사용 시 일시 중지
- Better Auth admin 플러그인 문서 (v1.8 Beta 표시): https://better-auth.com/docs/beta/plugins/admin
  - 내용: 기본 역할 두 개(user, admin), 커스텀 권한 세트 정의 가능
- Better Auth 라이선스 설명 (2차 자료): https://www.promptstoproduct.com/better-auth-review
  - 내용: MIT 라이선스, 클라우드 요금제 없음

- 주의: 자료마다 Clerk 무료 범위가 다르므로 수치는 공식 가격 페이지에서 다시 확인해야 합니다.
