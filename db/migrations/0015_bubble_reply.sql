-- 버블 인용 답장 (2026-11-27): 크리에이터가 팬 메시지를 눌러 "mention"으로 답할 때 그 메시지를 가리킨다.
-- 러너(scripts/db-migrate.mjs)가 파일 하나를 트랜잭션 하나로 실행하므로 begin/commit은 쓰지 않는다.
--
-- 공유 DB라서 비어 있어도 되는 칸만 더한다. 이 파일을 적용해도 예전 코드는 그대로 동작한다.
-- 메시지는 지우지 않고 deleted_at만 채우므로, 행이 지워지는 일은 방이 통째로 지워질 때뿐이다. 그때는 칸만 비운다.

alter table bubble_messages
  add column reply_to_id uuid references bubble_messages(id) on delete set null;
