-- 시참(시청자 참여) 테이블. (2026-11-11, 초안 — 미적용, 번호 Jimin에게 미통보)
-- 사용자 테이블은 Better Auth가 만든 "user"를 참조만 한다.
--
-- 명단 3단계: queue(대기열) → ready(준비) → party(참가자)
-- - ready는 인원 제한 없음 (0명부터 무제한)
-- - party만 sicham_sessions.party_size로 제한. 초과 검사는 쓰기 때 세션 행을 잠그고 앱에서 한다.
-- - 대기 순번은 저장하지 않고 queued_at 순서로 계산한다.
--
-- PoC에서 미룬 것: no-show 쿨다운, 예약 시참, presence 재확인, 팔로워(구독) 확인

-- 게임 카탈로그. 게임은 계속 늘 수 있어 테이블로 둔다.
create table sicham_games (
  -- 주소와 코드에서 쓰는 슬러그 (예: pubz)
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  title text not null check (char_length(title) between 1 and 50),
  join_method text not null
    check (join_method in ('reveal-string', 'search-invite', 'platform-invite')),
  -- 참여 전에 받을 핸들 이름. null이면 핸들 불필요
  handle_label text check (char_length(handle_label) between 1 and 30),
  -- 방을 열 때 party_size 기본값
  default_party_size int not null check (default_party_size > 0),
  created_at timestamptz not null default now()
);

-- 목업의 패러디 게임 4종
insert into sicham_games (id, title, join_method, handle_label, default_party_size) values
  ('pubz', '펍지 (PUBZ)', 'search-invite', 'PUBG 이름', 4),
  ('minecroft', '마인크라프트 (MineCroft)', 'reveal-string', '마인크래프트 유저네임', 8),
  ('overwitch', '오버와치 (OverWitch)', 'search-invite', '배틀태그', 6),
  ('godfielder', '갓필더 (GodFielder)', 'reveal-string', null, 8);

-- 게임별 핸들. 첫 참여 때 입력하고, 오래 비운 뒤 돌아오면 재확인한다.
-- 크리에이터에게만 보인다.
create table sicham_game_handles (
  user_id text not null references "user"(id) on delete cascade,
  game_id text not null references sicham_games(id) on delete cascade,
  handle text not null check (char_length(handle) between 1 and 100),
  -- 입력·재확인 때마다 갱신
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

-- 시참 방. 방송 중 모집 1회분.
create table sicham_sessions (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references "user"(id) on delete cascade,
  -- 이미 쓰인 게임은 카탈로그에서 지울 수 없다
  game_id text not null references sicham_games(id),
  title text not null check (char_length(title) between 1 and 50),
  -- frozen = 모집 멈춤 (방은 열려 있고 신규 신청만 막음)
  status text not null default 'recruiting'
    check (status in ('recruiting', 'frozen', 'closed')),
  party_size int not null check (party_size > 0),
  approval_mode text not null default 'fcfs' check (approval_mode in ('fcfs', 'lottery')),
  -- 입장 질문: 정확 일치 게이트. 둘 다 있거나 둘 다 없다. 라이브 수정 가능
  entry_question text check (char_length(entry_question) between 1 and 200),
  entry_answer text check (char_length(entry_answer) between 1 and 100),
  check ((entry_question is null) = (entry_answer is null)),
  -- reveal-string 게임의 코드. ready·party 본인에게만 노출
  join_code text check (char_length(join_code) between 1 and 200),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- 크리에이터는 닫히지 않은 시참 방을 하나만 가진다. (버블 선례)
create unique index sicham_sessions_one_live_per_creator
  on sicham_sessions (creator_id) where status <> 'closed';

-- 3단계 명단. 단계 전환 = status 변경.
create table sicham_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sicham_sessions(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  status text not null default 'queue'
    check (status in ('queue', 'ready', 'party', 'left', 'kicked')),
  -- 고정 멤버: "전원 대기열로"에서 제외
  locked boolean not null default false,
  -- 대기 순번 기준 (FCFS)
  queued_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 한 방에서 사용자 활성 행은 하나. 나간·킥된 행은 기록으로 남고 재신청은 새 행.
create unique index sicham_members_one_active
  on sicham_members (session_id, user_id) where status in ('queue', 'ready', 'party');

create index sicham_members_session_idx on sicham_members (session_id, status, queued_at);
create index sicham_members_user_idx on sicham_members (user_id);

-- 크리에이터 범위 차단. 방송을 넘어 유지된다.
create table sicham_bans (
  creator_id text not null references "user"(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (creator_id, user_id)
);

-- 크리에이터 범위 비공개 메모. 뷰어에게 보이지 않는다.
create table sicham_notes (
  creator_id text not null references "user"(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  updated_at timestamptz not null default now(),
  primary key (creator_id, user_id)
);
