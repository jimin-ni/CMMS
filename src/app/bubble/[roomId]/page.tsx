import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BUBBLE_POLICY, maxCharsFor } from "@/lib/bubble/policy";
import { FEATURE_ON } from "@/lib/features";
import {
  canAccessRoom,
  canSendInRoom,
  dbNowMs,
  getRoom,
  listMessages,
  seesAllMessages,
} from "@/lib/bubble/repo";
import { getViewer } from "@/lib/session";
import { RoomChat } from "@/components/bubble/room-chat";
import { CloseRoomButton } from "@/components/bubble/room-controls";
import { deleteMessageAction, sendMessageAction } from "@/lib/bubble/actions";
import { getWriteBlock } from "@/lib/moderation/repo";

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Suspense fallback={<p className="text-sm text-ash">불러오는 중...</p>}>
        <RoomContent params={params} />
      </Suspense>
    </main>
  );
}

async function RoomContent({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  // 참여하지 않은 구독자는 목록에서 참여 버튼을 먼저 눌러야 한다.
  const room = await getRoom(roomId, viewer.id);
  if (!room || !canAccessRoom(room, viewer)) redirect("/bubble");

  // 실시간 읽기 기준점은 조회보다 먼저 잡는다. 이후 바뀐 메시지는 RoomChat이 가져온다.
  const nowMs = await dbNowMs();
  // 구독자에게는 자신과 크리에이터의 메시지만 내려간다.
  const messages = await listMessages(room, viewer, BUBBLE_POLICY.deleteWindowMs);
  const isOpen = room.status === "open";
  const canClose = isOpen && (viewer.role === "admin" || viewer.id === room.creator_id);
  // 방 주인·관리자는 쓰기 차단을 받지 않고, 구독자 글을 신고·차단할 수 있다.
  const moderator = seesAllMessages(room, viewer);
  const writeBlock = moderator ? null : await getWriteBlock(viewer.id, room.creator_id);

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[28rem] flex-col overflow-hidden rounded-sm border border-ink bg-cream">
      <header className="flex items-center gap-3 border-b border-ink bg-white px-4 py-3">
        <Link href="/bubble" aria-label="버블 목록으로" className="text-xl text-ink">
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-medium text-ink">
            {room.title}
            {viewer.role === "admin" && (
              <span className="ml-2 text-xs font-normal text-ash">(관리자 보기)</span>
            )}
          </h1>
          <p className="truncate text-xs text-ink">
            {seesAllMessages(room, viewer)
              ? `참여 ${room.member_count}명 · 모든 구독자의 메시지가 보여요`
              : `${room.creator_name} · 내 메시지는 크리에이터에게만 보여요`}
          </p>
        </div>
        {canClose && <CloseRoomButton roomId={room.id} />}
      </header>

      {/* key: 방이 닫히는 등 서버에서 다시 그리면 메시지 상태도 새로 시작한다. */}
      <RoomChat
        key={`${room.id}:${room.status}`}
        pollUrl={`/api/bubble/rooms/${room.id}/messages`}
        sendAction={sendMessageAction}
        deleteAction={deleteMessageAction}
        target={{ name: "roomId", value: room.id }}
        viewerId={viewer.id}
        initialMessages={messages}
        initialCursor={new Date(nowMs).toISOString()}
        isOpen={isOpen}
        memberCount={seesAllMessages(room, viewer) ? room.member_count : null}
        canSend={canSendInRoom(room, viewer)}
        moderation={{ roomOwnerId: room.creator_id, moderator, writeBlock }}
        maxChars={maxCharsFor(viewer.role)}
        previewRoomId={
          FEATURE_ON.aiPreview && viewer.role === "public" && viewer.id !== room.creator_id
            ? room.id
            : null
        }
        closedNotice={isOpen ? "이 대화방에서는 메시지를 보낼 수 없어요." : "닫힌 대화방입니다."}
      />
    </div>
  );
}
