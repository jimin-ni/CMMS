import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BUBBLE_POLICY, maxCharsFor } from "@/lib/bubble/policy";
import {
  canAccessThread,
  canSendInThread,
  getThread,
  listMessages,
} from "@/lib/bubble/repo";
import { getViewer } from "@/lib/session";
import { Composer } from "@/components/bubble/composer";
import {
  CloseRoomButton,
  DeleteMessageButton,
  RoomRefresher,
} from "@/components/bubble/room-controls";

export default function RoomPage({ params }: { params: Promise<{ threadId: string }> }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Suspense fallback={<p className="text-sm text-key-stone">불러오는 중...</p>}>
        <RoomContent params={params} />
      </Suspense>
    </main>
  );
}

async function RoomContent({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const thread = await getThread(threadId);
  if (!thread || !canAccessThread(thread, viewer)) redirect("/bubble");

  const messages = await listMessages(thread.id, viewer.id, BUBBLE_POLICY.deleteWindowMs);
  const isOpen = thread.status === "open";
  const canSend = isOpen && canSendInThread(thread, viewer);
  const canClose = isOpen && (viewer.role === "admin" || viewer.id === thread.creator_id);
  const otherName =
    viewer.id === thread.creator_id ? thread.subscriber_name : thread.creator_name;

  return (
    <div className="flex flex-col rounded-2xl bg-white">
      {isOpen && <RoomRefresher />}

      <header className="flex items-center justify-between border-b border-key-stone/30 px-5 py-4">
        <div className="flex flex-col">
          <Link href="/bubble" className="text-xs text-key-stone underline">
            버블 목록
          </Link>
          <h1 className="text-lg font-bold text-key-brown">
            {otherName}
            {viewer.role === "admin" && (
              <span className="ml-2 text-xs font-normal text-key-stone">(관리자 보기)</span>
            )}
          </h1>
        </div>
        {canClose && <CloseRoomButton threadId={thread.id} />}
      </header>

      <ul className="flex flex-col gap-3 px-5 py-4">
        {messages.length === 0 && (
          <li className="text-sm text-key-stone">아직 메시지가 없어요.</li>
        )}
        {messages.map((message) => {
          const mine = message.sender_id === viewer.id;
          const deletable = message.can_delete;
          return (
            <li key={message.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <span className="text-xs text-key-stone">{message.sender_name}</span>
              <p
                className={`mt-1 max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-key-blue/30" : "bg-key-mist"
                } ${message.deleted_at ? "italic text-key-stone" : ""}`}
              >
                {message.deleted_at ? "삭제된 메시지입니다." : message.body}
              </p>
              {deletable && (
                <span className="mt-1">
                  <DeleteMessageButton messageId={message.id} />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {canSend ? (
        <Composer threadId={thread.id} maxChars={maxCharsFor(viewer.role)} />
      ) : (
        <p className="border-t border-key-stone/30 px-5 py-4 text-sm text-key-stone">
          {isOpen ? "이 대화방에서는 메시지를 보낼 수 없어요." : "닫힌 대화방입니다."}
        </p>
      )}
    </div>
  );
}
