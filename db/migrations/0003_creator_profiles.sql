-- 크리에이터 프로필. AI 반응 미리보기가 크리에이터의 성격(페르소나)을 참고한다. (2026-11-11)
-- 크리에이터마다 성격이 달라서 사용자 단위로 저장한다.

create table creator_profiles (
  user_id text primary key references "user"(id) on delete cascade,
  persona text not null default '' check (char_length(persona) <= 1000),
  updated_at timestamptz not null default now()
);
