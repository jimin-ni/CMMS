# 쪽지 트리 개발 메모

- 상태: `yoon-claude/heap-notes` 브랜치 (2026-11-15). 공유 DB에 `0008` 적용 (#59)
- 기획 근거: `docs/planning/09-heap-room.md` §3 (쪽지 트리)
- 목업: `public/tree-mock/` (단독 HTML). 방 엔진으로 옮긴 코드는 아래 표의 `engine/tree*.js`

크리에이터가 편집기에서 방에 쪽지 트리를 하나 두면, 팬이 쪽지를 써서 트리에 겁니다. 방 주인은 쪽지를 읽고 답장하고 숨깁니다.

## 정해진 규칙

| 항목 | 내용 |
|---|---|
| 트리 | 방에 1개. 편집기 기능 탭의 "쪽지 트리" (`fn.kind = "tree"`) |
| 읽기 | 로그인 없이 됨. 트리를 누르거나 가까이서 E. 고정 시점이고 끌면 트리가 돎 |
| 쓰기 | 로그인 필요 (2026-11-15 확정). 로그인 뒤 방으로 돌아오는 처리는 온보딩이 끝난 뒤로 미룸 |
| 길이 | 쪽지 200자·8줄, 답장 200자 |
| 하루 제한 | 한 사람이 한 방에 하루 5장 (서울 날짜). 지워도 다시 늘지 않음 |
| 걸기 | 접은 쪽지를 트리로 끌어 빈 자리에 놓음. 다른 쪽지와 0.088 m 안이면 거절. 트리 밖에 놓거나 "쪽지함에 넣기"는 쪽지함으로 |
| 자리 | 트리 기준 높이(`pos_y`)와 줄기 둘레 각도(`pos_angle`). 트리를 돌려도 자리가 바뀌지 않음 |
| 개수 | 트리에 120장. 넘으면 답장 없는 가장 오래된 쪽지가 쪽지함으로 |
| 공개일 | 방 주인이 편집기에서 정함 (`heap_rooms.note_reveal_at`). 그 전에는 쓴 사람만 내용을 봄. 방 주인은 "공개일 전에 미리 읽고 숨기기"가 켜져 있으면 미리 읽고 숨길 수 있음 (기본 켬, 답장은 공개일 뒤) |
| 방 주인 | 답장(모두에게 공개), 숨기기/다시 보이기, 쪽지를 열면 그 쪽지만 읽음 처리. 자기가 쓴 쪽지는 새 쪽지로 세지 않음 |
| 내 쪽지 | 연필 표시, 지우기 가능 (고치기는 없음) |

결정 기록: `.claude/session-artifacts/heap-poc/DECISIONS.md` L, N 절 (Yoon 쪽 작업 노트).

## DB (`db/migrations/0008_heap_notes_audit.sql`)

| 테이블/컬럼 | 내용 |
|---|---|
| `heap_notes` | 쪽지. `pos_y`·`pos_angle`이 둘 다 null이면 쪽지함 |
| `heap_note_replies` | 쪽지당 답장 1개 (`note_id`가 PK) |
| `heap_rooms.note_reveal_at` | 공개일. null이면 항상 열림 |
| `heap_attempts` | 하루 쓰기 횟수 (`note-day:<방>:<사람>:<날짜>`) 등 시도 제한 |
| `heap_open_counts` | 링크·카드 열람 일별 집계 (아래) |

같은 마이그레이션에 감사 인덱스 3개와 `heap_reels.platform`의 `x`가 함께 들어 있습니다.

## 코드

| 위치 | 내용 |
|---|---|
| `src/lib/heap/notes-repo.ts` | 쪽지 읽기·쓰기·지우기·답장·숨기기·읽음·공개일. 보는 사람별 규칙(숨김, 봉인, 익명)은 `toNote` 한 곳에서 |
| `src/lib/heap/actions.ts` | 쪽지 Server Action들 |
| `src/app/api/heap/rooms/[roomId]/changes/route.ts` | 폴링. 커서에 쪽지 필드 추가 (예전 4필드 커서도 읽음) |
| `engine/tree.js` | 트리 보기 모드, 쪽지 자리, 열고 닫기, 폴링 반영 |
| `engine/tree-write.js` | 쓰기 종이, 접기, 끌어다 걸기 |
| `engine/tree-owner.js` | 답장, 숨기기, 읽음 |
| `engine/tree-box.js` | 쪽지함 상자와 목록 |
| `engine/tree-note.js`, `tree-ornament.js`, `tree-dress.js` | 목업에서 옮긴 쪽지·장식·트리 꾸미기 |
| `engine/tree-ids.js` | 종이 색·글꼴 id와 실제 값, DB 행을 엔진 모양으로 바꾸는 변환 |

## 열람 집계 (`heap_open_counts`)

- PC 링크·기념품 링크를 열거나 카드를 공식 플레이어로 틀면 `POST /api/heap/rooms/<uuid>/opens`로 한 번 보냄 (`navigator.sendBeacon`).
- 방에 실제로 있는 링크와 카드만 셉니다. 방 주인은 세지 않습니다. IP당 10분 60회. 대략값입니다.
- 방 주인은 편집기의 통계 탭에서 7일·30일 순위를 봅니다 (`GET .../opens?days=7|30`).
- Google Analytics는 팀용으로 따로 둡니다. 방 안 통계는 이 표를 씁니다.

## 알고 둔 한계

- 지운 쪽지는 이미 열려 있는 다른 탭에서 새로고침 전까지 남습니다 (데모에서 감수).
- 테스트는 로그인한 방 주인(creatorTest03)과 로그아웃 요청으로 했습니다. 다른 팬 계정으로 쓴 쪽지의 읽음 처리는 브라우저에서 확인하지 못했습니다.
