-- AI 스크리닝 사후 재판정 (Render Workflows): 판정 실패로 공개된 버블 메시지 표시 (2026-11-26)
-- 기준 문서: docs/planning/16-render-workflows.md 4장. 번호와 적용은 이슈 #125 동의 후.
-- 러너(scripts/db-migrate.mjs)가 파일 하나를 트랜잭션 하나로 실행하므로 begin/commit은 쓰지 않는다.
--
-- 공유 DB라 기본값이 있는 칸만 더한다. 이 파일을 적용해도 예전 코드는 그대로 동작한다.
-- 쪽지(heap_notes)·방명록(heap_guestbook)은 합의 뒤 다음 번호로 더한다.

alter table bubble_messages
  -- 저장할 때의 OpenAI 단계 결과 (screen()의 openai 값). 이 파일 적용 전 글은 null
  add column openai_status text,
  -- none: 재판정 대상 아님, pending: 대기, done: 끝남, failed: 여러 번 실패해 포기
  add column recheck_status text not null default 'none'
    check (recheck_status in ('none', 'pending', 'done', 'failed')),
  add column recheck_attempts integer not null default 0,
  add column rechecked_at timestamptz;

create index bubble_messages_recheck_idx on bubble_messages (created_at)
  where recheck_status = 'pending';
