-- 힙 보안 감사 1 후속, 실패 시도 제한, X 플랫폼, 방문 통계, 쪽지. (2026-11-15)
-- 러너(scripts/db-migrate.mjs)가 파일 하나를 트랜잭션 하나로 실행하므로 begin/commit은 쓰지 않는다.
-- 어느 문장이든 실패하면 파일 전체가 적용되지 않는다.

-- 1. 감사 인덱스.
-- changes?since= 와 첫 스냅샷이 (시각, id) 커서로 페이지를 나눌 수 있게 한다.
create index heap_guestbook_cursor_idx
  on heap_guestbook (room_id, created_at, id);

create index heap_pieces_cursor_idx
  on heap_pieces (room_id, updated_at, id);

-- 사용자별 방문 조회용. 기본키(room_id, user_id, visit_day)는 방이 앞이라 사용자 기준 조회에 쓰이지 않는다.
create index heap_visits_user_room_day_idx
  on heap_visits (user_id, room_id, visit_day);

-- 2. 실패 시도 제한(DB 기반).
-- key는 앱이 정한다(예: 용도와 대상 조합). 창이 지나면 앱이 window_start를 새로 잡고 count를 1로 되돌린다.
-- 증가와 창 갱신은 앱이 한 문장(upsert)으로 처리한다. 만료 행은 앱이 가끔 지운다.
create table heap_attempts (
  key text primary key check (char_length(key) between 1 and 255),
  window_start timestamptz not null default now(),
  count int not null default 1 check (count >= 0)
);

create index heap_attempts_window_idx
  on heap_attempts (window_start);

-- 3. X 플랫폼. 영상 카드(heap_reels)에만 'x'를 더한다.
-- heap_pieces는 0007에서 이미 'x'를 허용한다. heap_creator_channels는 넓히지 않는다.
-- 이름은 Postgres 기본 규칙(테이블_컬럼_check)이다. 없는 이름이면 이 문장이 실패해 전체가 취소된다.
alter table heap_reels drop constraint heap_reels_platform_check;
alter table heap_reels add constraint heap_reels_platform_check
  check (platform in ('youtube', 'chzzk', 'twitch', 'soop', 'instagram', 'tiktok', 'x'));

-- 4. 콘텐츠 열람 통계. 하루 단위 카운터만 두고 사람별 기록은 남기지 않는다.
create table heap_open_counts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references heap_rooms(id) on delete cascade,
  -- 한국 시간 기준 날짜
  day date not null,
  kind text not null check (kind in ('link', 'reel')),
  -- link는 링크 주소, reel은 <platform>:<externalId>
  target text not null check (char_length(target) between 1 and 2048),
  opens int not null default 0 check (opens >= 0),
  unique (room_id, day, kind, target)
);

-- 5. 쪽지.
-- 방마다 쪽지 공개 시각. null이면 모두에게 열려 있고, 값이 있으면 그 시각까지 봉인된다.
alter table heap_rooms add column note_reveal_at timestamptz;

-- 방문자가 트리에 걸어 두는 쪽지. 글꼴과 색 값 목록은 앱이 가지고 있다.
-- 위치는 트리 좌표계의 높이(pos_y)와 줄기 둘레 각도(pos_angle, 라디안)이며 둘 다 null이면 트리 아래 쪽지함에 있다.
create table heap_notes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references heap_rooms(id) on delete cascade,
  author_id text not null references "user"(id) on delete cascade,
  -- 최대 200자, 최대 8줄(줄바꿈 7개 이하)
  body text not null check (
    char_length(body) between 1 and 200
    and char_length(body) - char_length(replace(body, E'\n', '')) <= 7
  ),
  tint text not null check (tint ~ '^[a-z0-9-]{1,24}$'),
  font text not null check (font ~ '^[a-z0-9-]{1,24}$'),
  anonymous boolean not null default false,
  pos_y real check (pos_y between 0 and 3),
  pos_angle real check (pos_angle between -3.1416 and 3.1416),
  -- 위치는 둘 다 있거나 둘 다 없어야 한다.
  check ((pos_y is null) = (pos_angle is null)),
  -- 방 주인이 숨긴 시각. 숨긴 쪽지는 작성자 말고는 보이지 않는다.
  hidden_at timestamptz,
  -- 방 주인이 처음 읽은 시각
  owner_read_at timestamptz,
  created_at timestamptz not null default now(),
  -- 숨김, 답장, 쪽지함 이동은 생성 뒤에 행을 바꾸므로 changes 커서용으로 둔다. 앱이 갱신한다.
  updated_at timestamptz not null default now()
);

create index heap_notes_room_idx
  on heap_notes (room_id, created_at, id);

create index heap_notes_author_idx
  on heap_notes (author_id, created_at);

create index heap_notes_room_updated_idx
  on heap_notes (room_id, updated_at, id);

-- 방 주인의 답장. 쪽지 하나에 답장 하나.
create table heap_note_replies (
  note_id uuid primary key references heap_notes(id) on delete cascade,
  author_id text not null references "user"(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  font text not null check (font ~ '^[a-z0-9-]{1,24}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
