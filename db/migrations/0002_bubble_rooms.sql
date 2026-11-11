-- 버블을 1:1 대화방에서 크리에이터 1 : 구독자 다수 대화방으로 바꾼다.
-- 기존 1:1 테이블과 그 안의 테스트 대화는 삭제한다. (2026-11-11 결정)
--
-- 보이는 범위
-- - 크리에이터(방 주인)와 관리자: 방의 모든 메시지
-- - 구독자: 자신이 보낸 메시지와 크리에이터의 메시지만 (다른 구독자 메시지는 안 보임)

drop table if exists bubble_messages;
drop table if exists bubble_threads;

create table bubble_rooms (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references "user"(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 50),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- 크리에이터는 열린 방을 하나만 가질 수 있다. 닫아야 새 방을 연다.
create unique index bubble_rooms_one_open_per_creator
  on bubble_rooms (creator_id) where status = 'open';

create table bubble_members (
  room_id uuid not null references bubble_rooms(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index bubble_members_user_idx on bubble_members (user_id);

create table bubble_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references bubble_rooms(id) on delete cascade,
  sender_id text not null references "user"(id) on delete cascade,
  -- 글자 수 상한은 DB에서 가장 긴 값(크리에이터 500자)으로 막고, 구독자 200자는 앱에서 막는다.
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index bubble_messages_room_idx on bubble_messages (room_id, created_at);
create index bubble_messages_sender_idx on bubble_messages (sender_id, created_at);
