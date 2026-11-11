# 미니게임과 순위 보드 개발 메모

- 브랜치: `yoon-claude/feature-minigame`
- 개발 대상은 플랫폼 데이터와 미니게임을 잇는 입력과 출력입니다. 게임 자체는 대상이 아닙니다.
- 현재 게임은 스텁입니다. 인증과 DB 대신 모의 데이터를 사용합니다.

## 계약

정의: `src/lib/minigame/contract.ts`

| 타입 | 방향 | 필드 |
|---|---|---|
| `GameStart` | 플랫폼 → 게임 | `runId`, `seed` |
| `GameResult` | 게임 → 플랫폼 | `runId`, `score` |
| `LeaderboardEntry` | 플랫폼 → 순위 화면 | `rank`, `username`, `score`, `badge` |

게임 컴포넌트는 `GameProps`(`start`, `onEnd`)만 구현합니다.

## API

| 경로 | 내용 |
|---|---|
| `POST /api/minigames/:gameId/runs` | 판을 열고 `GameStart` 반환 |
| `POST /api/minigames/runs/:runId/score` | 판마다 `GameResult` 1회 접수 |
| `GET /api/minigames/:gameId/leaderboard?board=global` | 순위 반환 |

- 판은 열릴 때 `boardId`를 저장합니다. 지금은 `global`만 만듭니다. 크리에이터별, 세션별 보드는 이 값으로 확장합니다.
- 순위는 사용자별 최고 점수 1개만 보여 줍니다. 저장소에는 모든 판의 점수가 남습니다.
- 사용자 이름은 줄이지 않고 그대로 표시합니다. 긴 이름은 줄바꿈됩니다. 가입 시 이름 규칙은 아직 코드에 없습니다.

## 배지

| 역할 | 배지 | 아이콘 |
|---|---|---|
| `admin` | `admin` | 방패 |
| `creator` | `creator` | 별 |
| `public` | `follower` | 하트 |

- `public`을 팔로워로 표시하는 것은 임시 처리입니다. 팔로워 정의는 이슈 #12에서 논의 중입니다.

## 화면

| 경로 | 내용 |
|---|---|
| `/minigame` | 화면 중앙의 게임, 전체 순위 탭, 주요 기능으로 돌아가는 버튼 |
| `/features` | 주요 기능 2 카드를 누르면 `/minigame`으로 이동 |

최종 제품에 들어가지 않는 항목은 오른쪽 `개발 도구` 토글(`src/components/minigame/dev-panel.tsx`)에 모았습니다. 모의 플레이어 선택, 역할 표시, `runId`와 `seed`가 있습니다.

## 확인한 동작

- 게임 시작, 점수 추가, 종료 후 순위에 반영
- 같은 판의 두 번째 제출은 409, 다른 플레이어의 제출은 403
- 음수, 소수, `runId` 불일치는 400, 없는 판은 404, 플레이어 없음은 401
- 다른 `board` 값을 조회하면 전체 순위가 섞이지 않고 빈 목록 반환
- 낮은 점수는 순위를 바꾸지 않고 높은 점수는 기존 기록을 대체
- 탭을 바꿔도 진행 중인 판의 점수 유지
- 로그아웃 상태에서 돌아가기 버튼을 누르면 `/login`으로 이동
- 아직 확인하지 못함: 로그인 상태에서 주요 기능 2 카드를 눌러 이동하는 동작

## 교체 지점

- `resolveMockPlayer`는 `x-mock-player` 헤더로 신원을 정합니다. 누구든 다른 플레이어로 위장할 수 있으므로 배포 전에 `auth.api.getSession`으로 바꿔야 합니다.
- `mock-store.ts`는 메모리 저장소입니다. 서버를 재시작하면 기록이 사라집니다.
- `dev-panel.tsx`는 배포 전에 제거합니다.
- 브라우저가 보낸 점수는 위조할 수 있습니다.

## 아키텍처 전환 (#17, 2026-11-11 확정)

공통 인프라 측(Jimin)이 DB 접근·읽기/쓰기 규칙을 확정해 `docs/planning/04-roadmap-and-team.md`에 기록(`a6c53da`). 미니게임도 이를 따른다. 상세 규칙은 `docs/dev/sicham.md`의 「DB 접근 · 읽기/쓰기 규칙」과 동일.

**해야 할 전환:**

- **점수 제출을 Route Handler → Server Action으로 이전.** 점수 제출은 *쓰기*이고, 확정 규칙상 쓰기는 Server Action이다. 현재 미니게임은 route handler(`POST`)로 제출한다. 이전 시 `resolveMockPlayer`(`x-mock-player`) 교체도 함께: Server Action 안에서 `auth.api.getSession`으로 신원 확인.
- **저장소를 Drizzle `repo` 계층으로.** `mock-store.ts`(메모리) → Drizzle ORM 통한 `repo` 계층. 컴포넌트·액션에서 직접 쿼리 금지. Better Auth 테이블은 조회만.
- **리더보드 실시간 읽기는 GET Route Handler 유지.** 확정 규칙상 실시간 읽기는 Route Handler(폴링→SSE)가 정식 패턴이라 변경 없음. 첫 화면 순위는 Server Component로 읽을 수 있음.

요약: **쓰기(점수 제출) = Server Action, 실시간 읽기(리더보드) = GET Route Handler, 저장 = Drizzle repo 계층.**

## 2048 샘플 확인 결과

[mateuszsokola/2048-in-react](https://github.com/mateuszsokola/2048-in-react) (MIT)를 React 19.3, Next 16.4.6으로 올려 저장소 밖에서 시험했습니다.

- 기존 테스트 35개 통과, 브라우저에서 이동과 점수 동작 확인
- 타입 오류 3곳 수정 필요: `gameReducer`의 기본 인자, `useRef()` 인자, `JSX` 네임스페이스
- `checkGameState`의 게임 종료 판정 버그 재현: 마지막 행이나 열에 합칠 수 있는 타일이 있거나 오른쪽 아래 칸이 비어도 `lost`를 반환합니다. 가져올 때 고쳐야 합니다.
