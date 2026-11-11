import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BUBBLE_POLICY, maxCharsFor } from "@/lib/bubble/policy";
import {
  canAccessRoom,
  canSendInRoom,
  getRoom,
  listMessages,
  seesAllMessages,
} from "@/lib/bubble/repo";
import { getViewer } from "@/lib/session";
import { Composer } from "@/components/bubble/composer";
import {
  CloseRoomButton,
  DeleteMessageButton,
  RoomRefresher,
} from "@/components/bubble/room-controls";

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Suspense fallback={<p className="text-sm text-key-stone">불러오는 중...</p>}>
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

  // 구독자에게는 자신과 크리에이터의 메시지만 내려간다.
  const messages = await listMessages(room, viewer, BUBBLE_POLICY.deleteWindowMs);
  const isOpen = room.status === "open";
  const canSend = canSendInRoom(room, viewer);
  const canClose = isOpen && (viewer.role === "admin" || viewer.id === room.creator_id);

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[28rem] flex-col overflow-hidden rounded-2xl bg-talk-bg shadow-sm">
      {isOpen && <RoomRefresher />}

      <header className="flex items-center gap-3 bg-talk-bg px-4 py-3">
        <Link href="/bubble" aria-label="버블 목록으로" className="text-xl text-gray-800">
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-gray-900">
            {room.title}
            {viewer.role === "admin" && (
              <span className="ml-2 text-xs font-normal text-gray-600">(관리자 보기)</span>
            )}
          </h1>
          <p className="truncate text-xs text-gray-700">
            {seesAllMessages(room, viewer)
              ? `참여 ${room.member_count}명 · 모든 구독자의 메시지가 보여요`
              : `${room.creator_name} · 내 메시지는 크리에이터에게만 보여요`}
          </p>
        </div>
        {canClose && <CloseRoomButton roomId={room.id} />}
      </header>

      {/* column-reverse라서 새 메시지가 오면 스크롤이 맨 아래에 머문다. */}
      <div className="flex flex-1 flex-col-reverse overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-1">
          {messages.length === 0 && (
            <li className="py-6 text-center text-sm text-gray-600">아직 메시지가 없어요.</li>
          )}
          {messages.map((message, index) => {
            const mine = message.sender_id === viewer.id;
            // 같은 사람이 이어서 보낸 메시지는 이름과 프로필을 한 번만 보여준다.
            const firstOfRun = index === 0 || messages[index - 1].sender_id !== message.sender_id;
            const bubble = (
              <p
                className={`max-w-[70vw] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm sm:max-w-sm ${
                  mine ? "bg-talk-yellow" : "bg-white"
                } ${message.deleted_at ? "italic text-gray-500" : "text-gray-900"}`}
              >
                {message.deleted_at ? "삭제된 메시지입니다." : message.body}
              </p>
            );
            const time = (
              <time className="shrink-0 text-[10px] text-gray-600">
                {formatTime(message.created_at)}
              </time>
            );

            if (mine) {
              return (
                <li
                  key={message.id}
                  className={`flex flex-col items-end ${firstOfRun ? "mt-2" : ""}`}
                >
                  <div className="flex items-end gap-1">
                    {time}
                    {bubble}
                  </div>
                  {message.can_delete && <DeleteMessageButton messageId={message.id} />}
                </li>
              );
            }

            return (
              <li key={message.id} className={`flex gap-2 ${firstOfRun ? "mt-2" : ""}`}>
                <div className="w-9 shrink-0">
                  {firstOfRun && (
                    <span className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-key-mist text-sm font-semibold text-key-brown">
                      {Array.from(message.sender_name)[0] ?? "?"}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-start">
                  {firstOfRun && (
                    <span className="mb-1 text-xs text-gray-700">{message.sender_name}</span>
                  )}
                  <div className="flex items-end gap-1">
                    {bubble}
                    {time}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {canSend ? (
        <Composer roomId={room.id} maxChars={maxCharsFor(viewer.role)} />
      ) : (
        <p className="bg-white px-4 py-3 text-center text-sm text-gray-500">
          {isOpen ? "이 대화방에서는 메시지를 보낼 수 없어요." : "닫힌 대화방입니다."}
        </p>
      )}
    </div>
  );
}

// 서버 시간대와 관계없이 한국 시간으로 "오후 3:12"처럼 보여준다.
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

function formatTime(date: Date): string {
  return timeFormat.format(date);
}
