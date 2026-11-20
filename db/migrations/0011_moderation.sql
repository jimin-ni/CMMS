-- AI 스크리닝(모더레이션) 1단계: 버블 채팅 + 판정·경고·차단 테이블 (2026-11-20)
-- 기준 문서: docs/planning/12-ai-screening.md 15장. 변경 기록: GitHub 이슈 "[AI 스크리닝] 마이그레이션 변경 기록"
-- 러너(scripts/db-migrate.mjs)가 파일 하나를 트랜잭션 하나로 실행하므로 begin/commit은 쓰지 않는다.
--
-- 공유 DB라서 기존 테이블에는 기본값이 있는 칸만 더한다. 이 파일을 적용해도 예전 코드는 그대로 동작한다.
-- 쪽지(heap_notes)·방명록(heap_guestbook)의 같은 칸은 연결할 때 다음 번호로 더한다.

-- 1. 버블 메시지에 판정 상태
alter table bubble_messages
  add column screen_status text not null default 'published'
    check (screen_status in ('published', 'blocked', 'removed', 'held')),
  add column screened_at timestamptz,
  -- 상태가 바뀐 시각. 폴링(?since=)의 기준점. 앱 서버 시각이 아니라 DB now()로만 넣는다.
  add column status_changed_at timestamptz,
  -- 정규화한 글의 sha256. 같은 글 반복 확인용
  add column normalized_hash text;

update bubble_messages set status_changed_at = coalesce(deleted_at, created_at);
alter table bubble_messages
  alter column status_changed_at set default now(),
  alter column status_changed_at set not null;

create index bubble_messages_room_changed_idx on bubble_messages (room_id, status_changed_at);
create index bubble_messages_sender_hash_idx on bubble_messages (sender_id, normalized_hash, created_at)
  where normalized_hash is not null;

-- 2. 판정·신고 기록. 글 하나에 기록 하나.
create table moderation_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  -- 글이 쓰인 방의 주인. 방 주인 검토 범위를 정한다.
  room_owner_id text references "user"(id) on delete set null,
  surface text not null check (surface in ('chat', 'note', 'guestbook')),
  target_id uuid not null,
  source text not null check (source in ('auto', 'report')),
  kind text not null check (kind in ('abuse', 'contact', 'self_harm')),
  counts_as_strike boolean not null,
  -- 근거 종류만. 사전 단어 자체는 남기지 않는다.
  reasons text[] not null default '{}',
  scores jsonb,
  openai_status text,
  versions jsonb,
  reported_by text references "user"(id) on delete set null,
  -- 사람 검토가 필요한 기록(hold_review, 자해, 방 주인 글 사후 확인)은 pending으로 시작한다.
  review_status text not null default 'none'
    check (review_status in ('none', 'pending', 'upheld', 'dismissed')),
  reviewed_by text references "user"(id) on delete set null,
  reviewed_at timestamptz,
  -- "오탐 인정"으로 경고를 무효로 할 때를 위한 칸. 지금은 항상 비어 있다 (#82 1번).
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (surface, target_id)
);

create index moderation_events_user_idx on moderation_events (user_id, created_at);
create index moderation_events_owner_idx on moderation_events (room_owner_id, created_at);
create index moderation_events_pending_idx on moderation_events (created_at) where review_status = 'pending';

-- 3. 쓰기 차단. owner = 크리에이터 차단(그 크리에이터의 모든 방), auto = 경고 3회 자동 차단, global = 관리자 전체 차단
create table sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  scope text not null check (scope in ('owner', 'auto', 'global')),
  room_owner_id text references "user"(id) on delete cascade,
  -- 건 사람. 자동 차단은 null(시스템)
  created_by text references "user"(id) on delete set null,
  reason text,
  review_status text not null default 'none' check (review_status in ('none', 'pending', 'upheld')),
  reviewed_by text references "user"(id) on delete set null,
  reviewed_at timestamptz,
  revoked_at timestamptz,
  revoked_by text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((scope = 'owner') = (room_owner_id is not null))
);

-- 활성 차단은 종류마다 하나만. 위반 글 두 건이 동시에 들어와도 자동 차단은 하나만 생긴다.
create unique index sanctions_active_auto_uq on sanctions (user_id) where scope = 'auto' and revoked_at is null;
create unique index sanctions_active_global_uq on sanctions (user_id) where scope = 'global' and revoked_at is null;
create unique index sanctions_active_owner_uq on sanctions (user_id, room_owner_id)
  where scope = 'owner' and revoked_at is null;

-- 4. 재검토 요청. 차단 하나당 한 번.
create table sanction_appeals (
  id uuid primary key default gen_random_uuid(),
  sanction_id uuid not null unique references sanctions(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'reviewed')),
  created_at timestamptz not null default now()
);

-- 5. 14세 확인 (회원가입 때만 묻는다). Better Auth user 테이블에는 칸을 더하지 않는다.
create table user_age_checks (
  user_id text primary key references "user"(id) on delete cascade,
  is_14_or_older boolean not null,
  answered_at timestamptz not null default now(),
  reset_by text references "user"(id) on delete set null,
  reset_at timestamptz
);

-- 6. 원문 열람 기록. 관리자만 본다.
create table moderation_access_log (
  id uuid primary key default gen_random_uuid(),
  viewer_id text references "user"(id) on delete set null,
  event_id uuid references moderation_events(id) on delete set null,
  surface text not null check (surface in ('chat', 'note', 'guestbook')),
  target_id uuid not null,
  viewed_at timestamptz not null default now()
);

create index moderation_access_log_viewed_idx on moderation_access_log (viewed_at);

-- 7. 사전, DB에 두는 regex, 허용 목록. 공개 저장소에는 넣지 않고 이 테이블에만 둔다.
create table moderation_terms (
  id serial primary key,
  term text not null,
  lang text not null,
  -- 근거 종류. 판정 기록에 단어 대신 남긴다. 예: sev5, hate
  tag text not null,
  source text not null,
  version text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (lang, term)
);

create table moderation_patterns (
  id serial primary key,
  name text not null unique,
  pattern text not null,
  version text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table moderation_allowlist (
  id serial primary key,
  term text not null unique,
  note text,
  created_at timestamptz not null default now()
);
