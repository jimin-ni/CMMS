-- 차단을 건 자리와 그때의 글 (마이페이지 BLOCKED 의 CHAT / LETTER / GUEST BOOK 목록).
-- 기존 행은 자리를 모르므로 null 이다. 화면은 null 을 sanctions 는 chat, heap_blocks 는 note 로 보여 준다.
-- excerpt 는 차단할 때 보이던 글의 앞부분 (최대 200자). 익명 쪽지라도 글 내용만 넣고 계정 이름은 넣지 않는다.

-- 개인 가림 (0013): 쪽지·방명록에서만 건다
alter table heap_blocks
  add column surface text check (surface in ('note', 'guestbook')),
  add column excerpt text check (char_length(excerpt) <= 200);

-- 크리에이터 차단·전체 차단 (0011): 대화방, 쪽지, 방명록에서 건다. 자동 차단은 자리가 없다(null)
alter table sanctions
  add column surface text check (surface in ('chat', 'note', 'guestbook')),
  add column excerpt text check (char_length(excerpt) <= 200);
