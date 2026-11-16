-- 힙 쪽지 글 스타일: 글자 크기, 장식, 장식 색, 작성자가 적은 이름. (2026-11-15)
-- 러너(scripts/db-migrate.mjs)가 파일 하나를 트랜잭션 하나로 실행하므로 begin/commit은 쓰지 않는다.
-- 모든 컬럼은 null을 허용한다. 기존 행은 그대로 유효하고 null은 이전 동작을 뜻한다.

-- 쪽지 글자 크기. 종이 캔버스 픽셀 기준이며 null이면 자동 맞춤이다.
alter table heap_notes
  add column font_size smallint check (font_size between 20 and 400);

-- 장식 종류. 목록은 앱이 가지고 있다. null이면 예전처럼 id에서 정한다.
alter table heap_notes
  add column ornament text check (ornament ~ '^[a-z-]{1,24}$');

-- 장식 주색. 소문자 6자리 hex만 받는다. 앱이 저장 전에 소문자로 바꿔야 한다.
alter table heap_notes
  add column ornament_color text check (ornament_color ~ '^#[0-9a-f]{6}$');

-- 작성자가 종이 끝에 적은 이름.
-- null이면서 anonymous가 true면 익명이다. null이면서 anonymous가 false인 옛 행은 계정 이름을 쓴다.
alter table heap_notes
  add column display_name text check (char_length(display_name) between 1 and 12);

-- 답장 글자 크기. 쪽지와 같은 뜻과 범위다.
alter table heap_note_replies
  add column font_size smallint check (font_size between 20 and 400);
