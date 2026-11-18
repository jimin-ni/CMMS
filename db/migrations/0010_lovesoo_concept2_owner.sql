-- 러브쑤 방(lovesoo)을 시안 2 배치로 바꾸고, 방 주인을 MainCreator01 계정으로 옮긴다. (2026-11-18)
-- 러너(scripts/db-migrate.mjs)가 파일 하나를 트랜잭션 하나로 실행하므로 begin/commit은 쓰지 않는다.
--
-- 먼저 할 일: MainCreator01 계정(testmail01@g.com)이 크리에이터로 있어야 한다. 가입 화면으로 만들고 크리에이터로 전환한다.
-- 계정이 없거나 크리에이터가 아니면 이 파일은 실패하고 아무것도 바뀌지 않는다.
-- 그 계정이 이미 다른 방의 주인이면 heap_rooms.creator_id 유니크 제약으로 실패한다.
--
-- 1. 방 주인을 바꾼다. 영상, 쪽지, 방명록은 방에 붙어 있어 그대로 따라온다.
-- 2. 이 방 영상의 출처 채널(LOVE SOO, 러브쑤의 작은 하루)도 새 주인에게 옮긴다.
--    채널은 크리에이터에 붙고, 앱은 영상의 채널이 방 주인의 것인지 확인하기 때문이다.
-- 3. 배치는 public/heap/rooms/lovesoo/proto-concept2.json(시안 2, _note 제외)의 필드로 덮는다.
--    /room/lovesoo?proto=concept2 와 같은 방법(최상위 필드 덮기)이라 결과가 같다. 시안에 없는 필드(palette 등)는 그대로 둔다.
do $$
declare
  new_owner text;
  old_owner text;
begin
  select id into new_owner from "user" where email = 'testmail01@g.com' and role = 'creator';
  if new_owner is null then
    raise exception 'testmail01@g.com 크리에이터 계정이 없습니다. 먼저 가입하고 크리에이터로 전환하세요.';
  end if;

  select creator_id into old_owner from heap_rooms where slug = 'lovesoo' for update;
  if old_owner is null then
    raise exception 'lovesoo 방이 없습니다. npm run heap:seed 로 먼저 넣으세요.';
  end if;

  if old_owner <> new_owner then
    update heap_creator_channels
      set creator_id = new_owner, updated_at = now()
      where creator_id = old_owner
        and id in (
          select r.channel_id from heap_reels r
          join heap_rooms h on h.id = r.room_id
          where h.slug = 'lovesoo' and r.channel_id is not null
        );
  end if;

  update heap_rooms
    set creator_id = new_owner,
        layout = layout || $c2${"room":{"w":8,"d":6.3,"h":2.5},"window":{"wall":"back","at":0.32,"w":1.3,"h":1.2,"y":1.71},"door":{"wall":"left","at":2.31},"screen":{"wall":"back","at":2.9,"y":1.85},"posters":{"wall":"left","at":[-1.85,-1,-0.15],"y":1.8},"table":{"x":1.24,"z":0.82,"projector":"left","rug":{"w":3,"d":2.3},"phone":"seat"},"items":[{"type":"model","model":"kitchenFridgeLarge","x":-1.92,"z":-2.68,"rot":0},{"type":"model","model":"kitchenStove","x":-0.97,"z":-2.64,"rot":0},{"type":"model","model":"kitchenSink","x":-0.11,"z":-2.64,"rot":0},{"type":"model","model":"kitchenCabinet","x":0.75,"z":-2.64,"rot":0},{"type":"model","model":"kitchenCabinetDrawer","x":1.61,"z":-2.64,"rot":0},{"type":"model","model":"hoodModern","x":-0.97,"z":-2.86,"rot":0,"y":1.55},{"type":"model","model":"kitchenCabinetUpperDouble","x":1.61,"z":-2.93,"rot":0,"y":1.5},{"type":"model","model":"kitchenCoffeeMachine","x":0.56,"z":-2.75,"rot":0,"y":0.9},{"type":"model","model":"toaster","x":1,"z":-2.75,"rot":0,"y":0.9},{"type":"model","model":"kitchenMicrowave","x":1.68,"z":-2.77,"rot":0,"y":0.9},{"type":"model","model":"pottedPlant","x":2.45,"z":-2.8,"rot":0},{"type":"model","model":"kitchenBar","x":-0.7,"z":-1,"rot":0},{"type":"model","model":"kitchenBar","x":0.16,"z":-1,"rot":0},{"type":"model","model":"chairCushion","x":-0.7,"z":-0.55,"rot":180},{"type":"model","model":"chairCushion","x":0.16,"z":-0.55,"rot":180},{"type":"model","model":"lampRoundTable","x":-3.7,"z":0.6,"rot":0,"y":0.92},{"type":"model","model":"laptop","x":-0.2,"z":-1.04,"rot":0,"y":0.84,"fn":{"kind":"pc","links":[{"email":"contact.lovesoo@gmail.com","title":"BUSINESS INQUIRIES"},{"url":"https://www.tiktok.com/@mommytang","title":"TikTok"},{"url":"https://www.youtube.com/@lovesoostrong","title":"@lovesoostrong"},{"url":"https://www.youtube.com/@%EB%9F%AC%EB%B8%8C%EC%91%A4%EC%9D%98%EC%9E%91%EC%9D%80%ED%95%98%EB%A3%A8","title":"러브쑤의 작은 하루"},{"url":"https://www.instagram.com/_love_soo__","title":"INSTAGRAM"},{"url":"https://linktr.ee/lovesoo","title":"Linktree"}]}},{"type":"model","model":"plantSmall1","x":0.4,"z":-1,"rot":0,"y":0.84},{"type":"model","model":"lampRoundFloor","x":3.85,"z":-2.8,"rot":0},{"type":"shelf","x":-3.7,"z":0.06,"rot":90,"style":"low"},{"type":"plant","x":2.2,"z":0.4,"y":0.56,"size":0.7},{"type":"model","model":"tableCoffeeSquare","x":-3.58,"z":1.34,"rot":0},{"type":"model","model":"holidayTreeDecorated","x":-3.47,"z":-2.62,"rot":0,"fn":{"kind":"tree"}}],"guestbook":{"wall":"left","at":1.34,"stand":false,"y":0.46},"ground":{"colour":"#CDBFA6"}}$c2$::jsonb,
        updated_at = now()
    where slug = 'lovesoo';
end
$$;
