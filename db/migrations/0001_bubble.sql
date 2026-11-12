-- 버블(1:1 대화방) 테이블
-- 사용자 테이블은 Better Auth가 만든 "user"를 참조한다.

create table if not exists bubble_threads (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references "user"(id) on delete cascade,
  subscriber_id text not null references "user"(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (creator_id, subscriber_id)
);

create table if not exists bubble_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references bubble_threads(id) on delete cascade,
  sender_id text not null references "user"(id) on delete cascade,
  -- 글자 수 상한은 DB에서 가장 긴 값(크리에이터 500자)으로 막고, 구독자 200자는 앱에서 막는다.
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists bubble_messages_thread_idx on bubble_messages (thread_id, created_at);
create index if not exists bubble_messages_sender_idx on bubble_messages (sender_id, created_at);
