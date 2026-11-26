# 16. Render Workflows 적용 계획

- 상태: 2026-11-26 작성. 이 문서는 **Render Workflows를 어디에, 어떻게 쓰는지**를 모으는 기준 문서입니다.
- 담당: 본인 (Jimin). 쪽지·방명록 쪽 적용은 힙 담당과 합의 뒤 [논의]
- 브랜치: `jimins-claude/feature-render-workflows`
- 관련 문서: 03(스택), 12(AI 스크리닝, 판정 규칙의 기준), 15(개발 보조 에이전트), 04(결정 로그 2026-11-26)
- 단계별 작업 목록과 확인 방법: `docs/dev/render-workflows.md`
- 표기: [사실] 코드나 공식 문서로 확인한 것, [가설] 확인이 필요한 것, [결정] 정한 것, [논의] 팀 합의가 필요한 것, [미정] 아직 정하지 않은 것

## 1. 한눈에 보기

Render 트랙은 Render Workflows를 써야 대상이 됩니다. 이 프로젝트는 Workflow 서비스 **하나**에 두 종류의 task를 둡니다.

| 종류 | task | 목적 | 문서 | 상태 |
|---|---|---|---|---|
| 서비스 기능 | `moderation.recheck`, `moderation.sweep` | AI 스크리닝이 판정에 실패해 공개된 글을 뒤에서 다시 판정 | 이 문서 3~9장 | [결정] 버블부터 개발 |
| 서비스 기능 (나중) | `moderation.rescan`, `moderation.eval`, `moderation.dailyReport` | 사전 변경 뒤 재판정, 평가셋 실행, 관리자 요약 | 12 문서 21-2 | 마감 뒤 |
| 개발 보조 | `codeReview.*`, `designReview.*` | 코드 점검, 디자인 점검 | 15 문서 | 계획 |

- [결정] 마감(12-05) 전 목표는 **버블 채팅의 `moderation.recheck` 동작과 시연**입니다. 서비스 기능에 Workflows를 쓰는 것이 트랙 설명에 가장 분명합니다.

## 2. 공통 구성

| 항목 | 값 |
|---|---|
| Render 서비스 | Workflow 서비스 1개, 슬러그 `memoamo-agent`, Singapore (공유 DB, 웹 서비스와 같은 리전) [사실: 2026-11-26 생성] |
| 언어 | TypeScript, `@renderinc/sdk` [결정] |
| 코드 위치 | `workflows/` (자기 `package.json`, `tsconfig.json`). 진입점 `workflows/src/index.ts` |
| 연결 브랜치 | 개발 중 `jimins-claude/feature-render-workflows`, 끝나면 main |
| 정기 실행 | Render Cron Job 서비스 1개가 Workflow task를 실행 요청 [사실: Workflows 자체에는 스케줄 기능이 없음] |
| 웹 서비스에서 실행 | 서버 코드에서 `@renderinc/sdk`의 `startTask` |

```
작성자 ─ Server Action (동기 판정, 지금과 같음) ─ 저장 ─┐
                                                      │ 판정 실패면 after()로 startTask (기다리지 않음)
Cron Job (10분마다) ─ moderation.sweep ────────────────┤
                                                      ▼
                       Workflow: moderation.recheck(글) ── OpenAI Moderation
                                                      │
                                                      ▼ 위반이면 숨김 + 판정 기록 + 경고 (한 트랜잭션)
                                         공유 DB (moderation_worker 계정)
                                                      │
                       버블 폴링(?since=)이 status_changed_at 변경을 읽어 화면에서 내림
```

## 3. `moderation.recheck`가 메우는 빈틈

- [사실] 판정은 Server Action 안에서 동기로 합니다. 사전·regex를 통과하고 OpenAI 호출이 실패하면 **통과로 공개**합니다 (12 문서 6-4).
- [사실] OpenAI 단계를 건너뛰는 경우 (`src/lib/moderation/openai.ts`, `screen.ts`)

| `openai` 값 | 뜻 | 재판정 |
|---|---|---|
| `called` | 정상 판정 | 안 함 |
| `skipped_earlier_hit` | 사전·regex에서 이미 걸림 | 안 함 |
| `skipped_surface` | 그 표면은 OpenAI를 부르지 않음 | 안 함 |
| `skipped_no_key` | 키가 없음 (로컬 개발 등) | 안 함 |
| `error`, `timeout` | 호출 실패 | **함** |
| `skipped_rate` | 사용자당 호출 상한 초과 | **함** |
| `skipped_breaker` | 연속 실패로 차단기 열림 | **함** |

- [사실] 차단기와 사용자 상한은 서버 프로세스 메모리에 있어, OpenAI 장애가 길면 그동안의 글은 모두 사전·regex만 거치고 공개됩니다.

## 4. 데이터 변경 (마이그레이션 `0014`) [결정: A안]

12 문서 21-3의 A안(글 테이블에 표시 열 추가)으로 합니다.

- 파일: `db/migrations/0014_bubble_recheck.sql`
- [사실] 다른 브랜치에 `0012_heap_reel_uploader.sql`이 있고 main에는 `0013`까지 있습니다. 다음 빈 번호는 `0014`입니다. 쓰기 전에 #25에 통보합니다.
- 버블만 바꿉니다. 쪽지(`heap_notes`), 방명록(`heap_guestbook`)은 합의 뒤 다음 번호로 더합니다 [논의].

```sql
-- 판정 실패로 공개된 버블 메시지를 뒤에서 다시 판정하기 위한 표시 (docs/planning/16-render-workflows.md 4장)
-- 공유 DB라 기본값이 있는 칸만 더한다. 적용해도 예전 코드는 그대로 동작한다.
alter table bubble_messages
  -- 저장할 때의 OpenAI 단계 결과 (screen()의 openai 값). 예전 글은 null
  add column openai_status text,
  -- none: 재판정 대상 아님, pending: 대기, done: 끝남, failed: 여러 번 실패
  add column recheck_status text not null default 'none'
    check (recheck_status in ('none', 'pending', 'done', 'failed')),
  add column recheck_attempts integer not null default 0,
  add column rechecked_at timestamptz;

create index bubble_messages_recheck_idx on bubble_messages (created_at)
  where recheck_status = 'pending';
```

- `src/lib/schema.ts`의 `bubbleMessages` 정의에 같은 열을 더합니다.
- 저장할 때(`saveChatMessage`) `openai_status`를 넣고, 3장 표에서 "함"인 값이면서 공개(`published`)로 저장한 글만 `recheck_status = 'pending'`으로 둡니다.

## 5. DB 쓰기 계정 `moderation_worker` [결정]

15 문서의 `agent_ro`(읽기 전용)로는 글을 숨길 수 없으므로 쓰기 계정을 따로 만듭니다. 필요한 만큼만 줍니다.

| 테이블 | 권한 | 이유 |
|---|---|---|
| `bubble_messages` | SELECT, UPDATE(`screen_status`, `screened_at`, `status_changed_at`, `openai_status`, `recheck_status`, `recheck_attempts`, `rechecked_at`) | 글 읽기, 숨김, 재판정 표시 |
| `bubble_rooms` | SELECT | 방 주인 확인 |
| `moderation_terms`, `moderation_allowlist`, `moderation_patterns` | SELECT | 사전·regex 읽기 |
| `moderation_events` | SELECT, INSERT | 판정 기록, 경고 수 세기 |
| `sanctions` | SELECT, INSERT | 경고 3회 자동 차단 |
| `"user"` | SELECT(`id`, `role`) | 방 주인·관리자 여부. 이메일, 이름은 못 읽음 |
| `heap_rooms`, `heap_notes`, `heap_guestbook` | SELECT | 아래 참고. UPDATE의 WHERE 조건(작성자, 방, 상태)을 읽으려면 SELECT 권한도 필요 [사실: PostgreSQL 규칙] |
| `heap_notes` | UPDATE(`screen_status`, `updated_at`) | 아래 참고 [사실: `takeDownPosts`가 이 두 열을 바꿈] |
| `heap_guestbook` | UPDATE(`screen_status`, `status_changed_at`) | 아래 참고 [사실] |
| `account`, `session`, `verification` | 없음 | 인증 정보 |

- [사실] 경고 3회 자동 차단(`applyAutoBlock` → `takeDownPosts`)은 그 사용자의 쪽지·방명록 공개 글도 함께 내립니다 (12 문서 9-2). 버블 재판정이 자동 차단으로 이어지면 힙 테이블도 바뀌므로 이 권한이 필요합니다. 이것은 지금 웹 서비스에서도 같은 동작이며, 힙 담당에게 공유합니다.
- [사실] 경고 수 세기는 `pg_advisory_xact_lock`을 씁니다. 별도 테이블 권한이 필요 없습니다.

만드는 순서 (DB에 한 번만, 팀 공지 후)
1. 비밀번호는 로컬에서 만들고 Render Workflow 서비스 Environment에만 넣습니다. 이 SQL은 커밋하지 않습니다.
2. 기본 계정으로 실행합니다.
   ```sql
   CREATE ROLE moderation_worker LOGIN PASSWORD '<로컬에서 만든 값>';
   GRANT CONNECT ON DATABASE <db이름> TO moderation_worker;
   GRANT USAGE ON SCHEMA public TO moderation_worker;
   GRANT SELECT ON bubble_messages, bubble_rooms, moderation_terms, moderation_allowlist,
     moderation_patterns, moderation_events, sanctions, heap_rooms, heap_notes, heap_guestbook TO moderation_worker;
   GRANT UPDATE (screen_status, screened_at, status_changed_at, openai_status,
     recheck_status, recheck_attempts, rechecked_at) ON bubble_messages TO moderation_worker;
   GRANT INSERT ON moderation_events, sanctions TO moderation_worker;
   GRANT SELECT (id, role) ON "user" TO moderation_worker;
   GRANT UPDATE (screen_status, updated_at) ON heap_notes TO moderation_worker;
   GRANT UPDATE (screen_status, status_changed_at) ON heap_guestbook TO moderation_worker;
   ```
3. 확인: `moderation_worker`로 접속해 `SELECT email FROM "user" LIMIT 1;`과 `DELETE FROM bubble_messages ...`가 거부되는지 봅니다.
4. 새 테이블을 다룰 일이 생기면 권한을 명시적으로 더합니다. 기본 권한(`ALTER DEFAULT PRIVILEGES`)은 주지 않습니다.

## 6. 코드 구조

### 6-1. 판정 코드는 하나만 [결정]

| 파일 | 지금 | 바꿀 것 |
|---|---|---|
| `src/lib/moderation/screen.ts`, `normalize.ts`, `lexicon.ts`, `patterns.ts`, `contact.ts`, `policy.ts` | 순수 모듈. DB, `server-only` 안 씀 [사실] | 그대로. Workflow가 상대 경로로 import |
| `src/lib/moderation/repo.ts`의 `planScreen`, `recordScreenEvent`, `applyAutoBlock`, `takeDownPosts`, `lockUser`, `countStrikes` | `tx`를 받지만 같은 파일이 `@/lib/db`를 import | 새 파일 `src/lib/moderation/persist.ts`로 옮김. `@/` 별칭과 `db` import 없이 `tx`만 받음. `repo.ts`는 이 파일을 다시 export (동작 변경 없음) |
| `src/lib/moderation/server.ts`의 `load()` | 웹 서비스의 `db`로 사전을 읽음 | 사전 읽기를 `loadLists(exec)`로 빼서 `persist.ts` 쪽에 둠 |
| `src/lib/moderation/openai.ts` | 사용자 상한, 차단기가 메모리에 있음 | 그대로. Workflow는 `screen()`의 `deps.moderate`에 **상한 없는 재시도용 호출**을 넣음 |
| `src/lib/schema.ts` | Drizzle 정의. `./heap/platform`만 상대 경로로 import [사실] | 4장 열 추가. Workflow에서도 그대로 import 가능 |

- 15 문서의 "`workflows/`는 `src/`를 import하지 않음" 규칙의 **유일한 예외**입니다. 판정 규칙이 두 곳에 생기면 결과가 달라지는 것이 더 위험합니다.
- [가설] Render에서 Root Directory를 `workflows`로 두어도 레포 전체를 받으므로 `../src`를 읽을 수 있습니다. 1단계에서 확인합니다. 안 되면 Root Directory를 비우고 명령에 `cd workflows`를 붙입니다.
- `workflows/package.json`에 `drizzle-orm`, `pg`를 루트와 **같은 버전**으로 넣습니다.

### 6-2. Workflow 쪽 파일

```
workflows/src/
├─ index.ts                 # 모든 task import
├─ common/
│  ├─ config.ts             # 환경 변수 확인
│  └─ db.ts                 # moderation_worker 계정 연결 (Drizzle + pg)
└─ moderation/
   ├─ tasks.ts              # recheck, sweep
   └─ moderate.ts           # OpenAI 호출 (재시도 포함, 사용자 상한 없음)
```

### 6-3. task 동작

`moderation.recheck(surface: "chat", messageId: string)`
1. 트랜잭션 시작, 글을 `FOR UPDATE` 없이 읽음 (상태 확인은 6번에서 조건부 UPDATE로)
2. `recheck_status`가 `pending`이 아니면 끝 (이미 처리됨, 중복 실행 안전)
3. `screen_status`가 `published`가 아니면 `done`으로 두고 끝 (이미 신고·삭제됨)
4. 사전·regex를 읽고 `screen()` 실행. OpenAI는 재시도 포함 호출
5. OpenAI가 또 실패하면 `recheck_attempts + 1`. 5회 이상이면 `failed`로 두고 끝 (관리자 요약에 표시). 그 외에는 `pending`을 유지하고 task를 실패로 끝내 Render 재시도에 맡김
6. 결과가 `publish`면 `openai_status`, `recheck_status = 'done'`, `rechecked_at`만 갱신
7. 위반이면 `planScreen` → `UPDATE ... SET screen_status = plan.status, status_changed_at = now() WHERE id = $1 AND screen_status = 'published'` → 바뀐 줄이 있을 때만 `recordScreenEvent` (경고, 자동 차단 포함). 모두 한 트랜잭션
8. 반환: `{messageId, before, after, reasons, strikes}`

`moderation.sweep()`
1. `recheck_status = 'pending'`이고 1분 넘게 지난 글을 오래된 순으로 최대 50개 읽음
2. 각 글에 `ctx.run(recheck, "chat", id)`를 병렬로 (동시 최대 10)
3. 반환: 처리 수, 숨긴 수, 실패 수

- [결정] task 옵션: `recheck`는 timeout 60초, 재시도 3회(1초 시작, 2배씩). `sweep`은 timeout 600초, 재시도 1회.
- [결정] `moderation_events`는 글 하나에 기록 하나(`unique (surface, target_id)`)입니다 [사실]. 이미 신고 기록이 있으면 7번에서 `screen_status`가 `published`가 아니므로 3번에서 끝납니다. 그래도 충돌하면 기록을 건너뛰고 로그만 남깁니다.

### 6-4. 웹 서비스 쪽 변경

| 파일 | 변경 |
|---|---|
| `src/lib/moderation/repo.ts` `saveChatMessage` | `openai_status`, `recheck_status` 저장 |
| `src/lib/bubble/actions.ts` (전송) | 저장 결과가 `pending`이면 `after()` 안에서 `startTask("<slug>/moderation.recheck", ["chat", id], { idempotencyKey: "chat:<id>" })`. 실패해도 무시 (sweep이 다시 찾음) |
| 새 파일 `src/lib/workflows.ts` | `server-only`. `RENDER_API_KEY`, `RENDER_WORKFLOW_SLUG`가 없으면 아무것도 안 함 (로컬 개발 기본값) |
| 루트 `package.json` | `@renderinc/sdk` 추가 |
| `.env.example` | `RENDER_API_KEY`, `RENDER_WORKFLOW_SLUG` 추가 (값 없이) |

- [사실] Next.js 16의 `after()`는 Server Function에서 쓸 수 있고 응답이 끝난 뒤 실행됩니다 (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`). 작성자의 전송 응답 속도에 영향이 없습니다.
- [미정] 작성자에게 알리는 방법: 사후에 숨겨진 글은 작성자 화면에서 기존 "숨김 상태 본인 글" 표시로 바뀝니다. 경고 안내창(n/3)은 다음 전송 때 보여 줄지 정해야 합니다. 마감 전에는 표시만 바꿉니다.

### 6-5. Cron Job

- Render Cron Job 서비스 `memoamo-moderation-sweep`, 일정 `*/10 * * * *`, 같은 리전
- 명령: `cd workflows && npm ci && npx tsx src/cron/sweep.ts` → `startTask("<slug>/moderation.sweep", [])` 후 끝 (기다리지 않음)
- [가설] Cron Job 서비스 최소 요금과 빌드 시간은 생성 때 확인합니다.

## 7. 환경 변수

| 서비스 | 이름 | 값 |
|---|---|---|
| Workflow | `DATABASE_URL` | Internal URL + `moderation_worker` |
| Workflow | `OPENAI_API_KEY` | Workflow 전용 키 (웹 서비스 키와 분리) |
| Workflow | `ANTHROPIC_API_KEY` 등 | 15 문서의 개발 보조 task용 (나중) |
| 웹 서비스 | `RENDER_API_KEY` | `startTask` 호출용. 서버 코드에서만 읽음 |
| 웹 서비스 | `RENDER_WORKFLOW_SLUG` | 대시보드의 Workflow 슬러그 |
| Cron Job | `RENDER_API_KEY`, `RENDER_WORKFLOW_SLUG` | `sweep` 실행 요청용 |

- [미정] Render API 키는 계정 단위라 권한 범위를 좁힐 수 없습니다 [가설]. 웹 서비스와 Cron에 넣는 키는 같은 계정의 키이므로, 노출되면 즉시 교체합니다.

## 8. 개발 순서

| 단계 | 할 일 | 끝났다는 기준 |
|---|---|---|
| 1 | Workflow 서비스 생성 (기존 `hello` 뼈대), `../src` import 확인용 task | 대시보드에서 `hello`와 `normalize("테스트")` 결과 확인 |
| 2 | #25에 `0014` 통보, 마이그레이션 작성·공유 DB 적용, `schema.ts` 반영 | `bubble_migrations`에 `0014` 기록, 예전 코드 정상 |
| 3 | `moderation_worker` 계정 생성 (팀 공지) | 5장 3번 확인 통과 |
| 4 | `persist.ts` 분리 (동작 변경 없음) | `npm test`, `npx tsc --noEmit`, `npx eslint src scripts`, `npm run build` 통과 |
| 5 | `saveChatMessage`에 `openai_status`, `recheck_status` 저장 | OpenAI 키를 비우지 않고 일부러 시간 초과를 내면 `pending`으로 저장됨 |
| 6 | `moderation.recheck` task | 대시보드에서 `["chat", "<id>"]`로 실행하면 위반 글이 숨겨지고 경고 기록 생김 |
| 7 | 웹 서비스 `after()` + `startTask` | 판정 실패 글이 수 초 안에 자동 재판정됨 |
| 8 | `moderation.sweep` + Cron Job | `startTask`를 끈 상태에서도 10분 안에 처리됨 |
| 9 | 시연 준비 | 아래 9장 시나리오 녹화, 12·03·04 문서 갱신 |

- 4~7단계는 앱 코드(`src/`) 변경입니다. 이 브랜치에서 하되 커밋 전 검사(`tsc`, `eslint`, `build`, `test`)를 모두 돌립니다.
- 테스트 계정과 테스트 메시지는 공유 DB에 쌓입니다. 끝나면 정리할지 확인합니다.

## 9. 검증과 시연 시나리오

1. OpenAI 호출이 실패하도록 만든 상태(예: 웹 서비스의 `OPENAI_API_KEY`를 잘못된 값으로)에서 구독자가 위반 문장을 보냄 → 공개됨 (지금 동작)
2. Render 대시보드에서 `moderation.recheck` 실행 기록이 생김
3. 수 초 뒤 다른 구독자 화면에서 그 메시지가 내려감, 작성자 화면에는 숨김 표시
4. 관리자 검토 화면(12 문서 11장)에 자동 판정 기록이 보임
5. 측정: 전송부터 숨김까지 걸린 시간, Workflow 실행 시간, 재시도 횟수

- 시연용 위반 문장은 평가셋(12 문서 18장)에서 고릅니다.
- [미정] 시연 환경: 배포 환경에서 키를 일부러 바꾸면 실제 사용자에게도 영향이 있으므로, 시연 시간에만 바꾸거나 테스트용 방에서만 실패를 내는 방법을 정합니다.

## 10. 위험과 대응

| 위험 | 대응 |
|---|---|
| 판정 규칙이 두 곳에서 갈라짐 | 순수 모듈을 같은 파일에서 import (6-1) |
| 쓰기 계정 오남용 | 열 단위 최소 권한, 삭제 권한 없음, 인증 테이블 접근 없음 |
| 같은 글을 두 번 처리 | `recheck_status` 확인 + 조건부 UPDATE + `idempotencyKey` |
| OpenAI 장기 장애로 대기 글이 쌓임 | `sweep` 한 번에 50개, 5회 실패 시 `failed`, 관리자 요약에 표시 |
| 힙 테이블까지 바뀜 (자동 차단) | 지금 웹 서비스와 같은 동작. 힙 담당에게 공유 |
| 마감 전 시간 부족 | 6단계(수동 실행)까지만 되어도 시연 가능. 7~8단계는 여유가 있을 때 |

## 11. 변경 기록

- 2026-11-26 작성. A안, 버블 우선, `moderation_worker` 계정 [결정]
