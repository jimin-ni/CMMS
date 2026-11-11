-- 크리에이터 프로필 사진. 크리에이터만 등록할 수 있고 구독자는 등록하지 않는다. (2026-11-12)
-- 번호: 0005는 시참(0005_sicham.sql, #25)이 쓴다. 처음 0005로 적용했다가 0006으로 바로잡았다.
-- 별도 파일 저장소가 없어서 작은 이미지(512KB 이하)를 DB에 그대로 저장한다.
-- 성격(creator_profiles)과 따로 두어, 성격을 읽을 때 이미지 바이트를 함께 읽지 않게 한다.

create table creator_avatars (
  user_id text primary key references "user"(id) on delete cascade,
  content bytea not null check (octet_length(content) between 1 and 524288),
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  updated_at timestamptz not null default now()
);
