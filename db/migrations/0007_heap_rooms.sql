-- 힙 미니룸 테이블. (2026-11-12, 번호 안내 이슈 #32)
-- 사용자 테이블은 Better Auth가 만든 "user"를 참조만 한다.
--
-- 방 하나에 크리에이터의 지난 영상이 사진 더미로 쌓이고, 팬이 올린 조각이 그 위에 얹힌다.
-- 팬 조각의 흐름: pending(제출·필터 중) → voting(커뮤니티 투표) → landed(더미 위에 안착)
-- - 필터에서 걸린 조각은 rejected로 남기고 다른 사람에게 보이지 않는다.
-- - 크리에이터는 어느 단계에서든 조각을 걷어낼 수 있다(lifted). 사전 승인 단계는 없다.
-- - 안착 기준은 heap_rooms.vote_threshold다.
-- - 투표 추가와 안착 판정은 같은 트랜잭션에서 조각 행을 잠근 뒤 처리한다.
-- 방명록과 방문 기록은 로그인 사용자만 남긴다.
--
-- 플랫폼: 값 목록은 check로 둔다. 새 플랫폼은 주소 해석과 공식 플레이어 코드가 함께 필요하므로
-- 그때 새 마이그레이션에서 check를 넓힌다.
-- 플랫폼 도메인 허용 목록과 주소 정규화는 앱의 플랫폼 파서가 검사한다.
-- 썸네일은 플랫폼 주소만 저장한다. 이미지 파일과 embed HTML은 저장하지 않는다.
--
-- PoC에서 미룬 것: 팬이 직접 올리는 이미지, 구독(팔로워) 확인, 방 테마

-- 크리에이터가 연결한 공식 채널. 방이 아니라 크리에이터(사용자)에 붙는다.
-- 한 크리에이터가 같은 플랫폼의 채널을 여러 개 연결할 수 있다.
create table heap_creator_channels (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references "user"(id) on delete cascade,
  platform text not null
    check (platform in ('youtube', 'chzzk', 'twitch', 'soop', 'instagram', 'tiktok')),
  -- 플랫폼 안에서 채널을 식별하는 값
  external_id text not null check (char_length(external_id) between 1 and 255),
  -- 정규화한 공식 채널 주소
  channel_url text not null check (
    char_length(channel_url) between 1 and 2048
    and channel_url ~ '^https://[^[:space:]]+$'
  ),
  title text not null default '' check (char_length(title) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, platform, external_id)
);

-- 크리에이터별 방 1개.
create table heap_rooms (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null unique references "user"(id) on delete cascade,
  -- 주소에 쓰는 슬러그 (예: /room/lovesoo)
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 1 and 40),
  blurb text not null default '' check (char_length(blurb) <= 80),
  -- 꾸미기 결과. 방 크기, 창문·문 위치, 가구 목록, 시간대. 형식은 앱이 검사한다.
  layout jsonb not null default '{}'::jsonb,
  -- 조각이 더미에 안착하는 투표 수
  vote_threshold int not null default 3 check (vote_threshold between 1 and 1000),
  -- 크리에이터가 자기 방에 마지막으로 다녀간 시각 ("주인 다녀감")
  creator_visited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 더미에 쌓이는 크리에이터의 영상. 재생은 공식 플레이어로만 한다.
-- 등록할 때 채널이 방 주인의 채널인지 앱에서 확인한다.
-- 채널 연결을 지워도 영상의 출처와 링크는 남긴다.
create table heap_reels (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references heap_rooms(id) on delete cascade,
  channel_id uuid references heap_creator_channels(id) on delete set null,
  platform text not null
    check (platform in ('youtube', 'chzzk', 'twitch', 'soop', 'instagram', 'tiktok')),
  -- 플랫폼 안에서 콘텐츠를 식별하는 값.
  -- 콘텐츠 종류별 ID 공간이 겹칠 수 있으면 video:, clip: 같은 접두사를 붙인다.
  external_id text not null check (char_length(external_id) between 1 and 255),
  -- 정규화한 공식 원문 주소
  source_url text not null check (
    char_length(source_url) between 1 and 2048
    and source_url ~ '^https://[^[:space:]]+$'
  ),
  -- 플랫폼이 제공한 원격 썸네일. 없으면 null이며 앱이 기본 카드를 보여준다.
  thumbnail_url text check (
    thumbnail_url is null
    or (
      char_length(thumbnail_url) between 1 and 2048
      and thumbnail_url ~ '^https://[^[:space:]]+$'
    )
  ),
  title text not null default '' check (char_length(title) <= 300),
  -- 가로면 true, 세로면 false, 알 수 없으면 null
  wide boolean,
  view_count bigint check (view_count >= 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, platform, external_id)
);

create index heap_reels_channel_idx
  on heap_reels (channel_id)
  where channel_id is not null;

create index heap_reels_room_published_idx
  on heap_reels (room_id, published_at desc, created_at desc);

-- 방명록. 이름과 날짜만 남는다.
create table heap_guestbook (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references heap_rooms(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 12),
  created_at timestamptz not null default now()
);

create index heap_guestbook_room_idx
  on heap_guestbook (room_id, created_at desc);

create index heap_guestbook_user_idx
  on heap_guestbook (user_id);

-- 방문 기록. 사용자당 하루 한 줄. TODAY와 TOTAL은 이 표를 세어 구한다.
create table heap_visits (
  room_id uuid not null references heap_rooms(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  -- 한국 시간 기준 날짜. 서버가 기본값을 쓰고 클라이언트 입력은 받지 않는다.
  visit_day date not null default ((now() at time zone 'Asia/Seoul')::date),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id, visit_day)
);

create index heap_visits_day_idx
  on heap_visits (room_id, visit_day);

create index heap_visits_user_idx
  on heap_visits (user_id);

-- 팬이 올린 조각. 공식 플랫폼의 게시물 링크만 받는다.
create table heap_pieces (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references heap_rooms(id) on delete cascade,
  -- 제출 시 로그인 사용자 ID를 넣는다. 계정을 지워도 조각은 남긴다.
  submitter_id text references "user"(id) on delete set null,
  platform text not null
    check (platform in ('youtube', 'x', 'chzzk', 'naver_cafe')),
  -- 플랫폼 안에서 콘텐츠를 식별하는 값.
  -- 치지직은 video:/clip: 접두사, 네이버 카페는 카페 ID와 게시물 ID를 함께 넣는다.
  external_id text not null check (char_length(external_id) between 1 and 255),
  -- 정규화한 공식 원문 주소
  source_url text not null check (
    char_length(source_url) between 1 and 2048
    and source_url ~ '^https://[^[:space:]]+$'
  ),
  -- 플랫폼이 제공한 원격 썸네일. 없으면 null이며 앱이 기본 카드를 보여준다.
  thumbnail_url text check (
    thumbnail_url is null
    or (
      char_length(thumbnail_url) between 1 and 2048
      and thumbnail_url ~ '^https://[^[:space:]]+$'
    )
  ),
  title text not null default '' check (char_length(title) <= 300),
  -- 가로면 true, 세로면 false, 알 수 없으면 null
  wide boolean,
  -- 카드 뒷면에 적히는 한 줄
  note text not null default '' check (char_length(note) <= 60),
  status text not null default 'pending'
    check (status in ('pending', 'rejected', 'voting', 'landed', 'lifted')),
  created_at timestamptz not null default now(),
  landed_at timestamptz,
  lifted_at timestamptz,
  updated_at timestamptz not null default now(),
  -- 같은 방에 같은 출처는 한 번만 등록한다.
  unique (room_id, platform, external_id),
  -- 상태와 시각이 서로 어긋나지 않게 한다.
  check (
    (
      status in ('pending', 'rejected', 'voting')
      and landed_at is null
      and lifted_at is null
    )
    or (
      status = 'landed'
      and landed_at is not null
      and lifted_at is null
    )
    or (
      status = 'lifted'
      and lifted_at is not null
      and (landed_at is null or lifted_at >= landed_at)
    )
  )
);

create index heap_pieces_room_idx
  on heap_pieces (room_id, status, created_at desc);

create index heap_pieces_submitter_idx
  on heap_pieces (submitter_id)
  where submitter_id is not null;

-- 조각 투표. 사용자당 조각 하나에 한 표.
-- voting 상태가 아닌 조각의 투표 차단은 쓰기 트랜잭션에서 검사한다.
create table heap_piece_votes (
  piece_id uuid not null references heap_pieces(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (piece_id, user_id)
);

create index heap_piece_votes_user_idx
  on heap_piece_votes (user_id);
