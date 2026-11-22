-- 0012: 힙 영상을 올린 채널 이름.
-- 방 주인이 연결하지 않은 채널의 영상(영상 하나, 재생목록, 다른 채널에서 고른 영상)은 channel_id가 null이라
-- 카드 뒷면에 업로더 대신 방 주인 이름이 찍혔다. 플랫폼이 알려 준 업로더 채널 이름을 여기에 남긴다.
-- 비워 둘 수 있고 기본값이 없어 예전 코드는 그대로 동작한다. 연결된 채널의 이름(heap_creator_channels.title)이 있으면 그쪽을 먼저 쓴다.

alter table heap_reels
  add column uploader_name text check (uploader_name is null or char_length(uploader_name) between 1 and 100);
