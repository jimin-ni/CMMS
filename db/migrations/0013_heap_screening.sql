-- 쪽지(트리)·방명록 AI 스크리닝 연결과 개인 차단 (2026-11-23, 윤 쪽)
-- 기준 문서: docs/planning/12-ai-screening.md 4장, 8장, 9장. 0011의 bubble_messages 칸과 같은 모양이다.
-- 러너(scripts/db-migrate.mjs)가 파일 하나를 트랜잭션 하나로 실행하므로 begin/commit은 쓰지 않는다.
--
-- 공유 DB라서 기존 테이블에는 기본값이 있는 칸만 더한다. 이 파일을 적용해도 예전 코드는 그대로 동작한다.

-- 1. 쪽지 판정 상태. 상태가 바뀌면 앱이 updated_at도 바꾼다 (쪽지의 변경 읽기 커서는 이미 updated_at이다).
alter table heap_notes
  add column screen_status text not null default 'published'
    check (screen_status in ('published', 'blocked', 'removed', 'held')),
  add column screened_at timestamptz,
  -- 정규화한 글(본문 + 표시 이름)의 sha256. 같은 글 반복 확인용
  add column normalized_hash text;

create index heap_notes_author_hash_idx on heap_notes (author_id, normalized_hash, created_at)
  where normalized_hash is not null;

-- 2. 방명록 판정 상태. 방명록 줄은 상태로만 바뀌므로 status_changed_at이 변경 읽기 커서가 된다.
alter table heap_guestbook
  add column screen_status text not null default 'published'
    check (screen_status in ('published', 'blocked', 'removed', 'held')),
  add column screened_at timestamptz,
  add column status_changed_at timestamptz,
  add column normalized_hash text;

update heap_guestbook set status_changed_at = created_at;
alter table heap_guestbook
  alter column status_changed_at set default now(),
  alter column status_changed_at set not null;

create index heap_guestbook_changed_idx on heap_guestbook (room_id, status_changed_at, id);
create index heap_guestbook_user_hash_idx on heap_guestbook (user_id, normalized_hash, created_at)
  where normalized_hash is not null;

-- 3. 개인 차단. 보는 사람 한 명에게서만 상대의 쪽지·방명록·방 안 캐릭터를 가린다. 상대의 쓰기는 막지 않는다.
-- 크리에이터 차단·전체 차단(쓰기 막기)은 0011의 sanctions이다.
create table heap_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id text not null references "user"(id) on delete cascade,
  blocked_id text not null references "user"(id) on delete cascade,
  -- 차단할 때 화면에 보이던 이름 (익명 쪽지면 '익명'). 차단 목록에 보여 준다. 익명 작성자의 계정 이름은 넣지 않는다.
  label text not null check (char_length(label) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
