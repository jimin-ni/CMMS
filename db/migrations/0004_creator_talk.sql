-- 크리에이터 톡: 크리에이터끼리만 쓰는 1:1 또는 그룹 대화. (2026-11-12)
-- 참여자는 모두 role이 creator여야 한다. 역할 확인은 앱(서버)에서 대화를 만들 때와 읽고 쓸 때마다 한다.

create table creator_chats (
  id uuid primary key default gen_random_uuid(),
  -- 그룹 대화 이름. 1:1 대화는 비워 두고 상대 이름을 보여준다.
  title text check (title is null or char_length(title) between 1 and 50),
  -- 1:1 대화를 한 번만 만들기 위한 키: 두 사용자 id를 정렬해 ':'로 이은 값. 그룹 대화는 null.
  direct_key text unique,
  created_by text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table creator_chat_members (
  chat_id uuid not null references creator_chats(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create index creator_chat_members_user_idx on creator_chat_members (user_id);

create table creator_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references creator_chats(id) on delete cascade,
  sender_id text not null references "user"(id) on delete cascade,
  -- 크리에이터 글자 수 상한(500자)과 같다.
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index creator_chat_messages_chat_idx on creator_chat_messages (chat_id, created_at desc);
create index creator_chat_messages_sender_idx on creator_chat_messages (sender_id, created_at desc);
