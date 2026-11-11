import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BUBBLE_POLICY } from "@/lib/bubble/policy";
import { dbNowMs } from "@/lib/bubble/repo";
import { chatDisplayName, getChatFor, listChatMessages } from "@/lib/bubble/talk-repo";
import { deleteChatMessageAction, sendChatMessageAction } from "@/lib/bubble/talk-actions";
import { getViewer } from "@/lib/session";
import { RoomChat } from "@/components/bubble/room-chat";

export default function CreatorChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Suspense fallback={<p className="text-sm text-key-stone">불러오는 중...</p>}>
        <CreatorChatContent params={params} />
      </Suspense>
    </main>
  );
}

async function CreatorChatContent({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  // 크리에이터이고 이 대화에 참여한 사람만 들어올 수 있다.
  const chat = await getChatFor(chatId, viewer);
  if (!chat) redirect(viewer.role === "creator" ? "/bubble/talk" : "/bubble");

  const nowMs = await dbNowMs();
  const messages = await listChatMessages(chat.id, viewer, BUBBLE_POLICY.deleteWindowMs);

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[28rem] flex-col overflow-hidden rounded-2xl bg-talk-bg shadow-sm">
      <header className="flex items-center gap-3 bg-talk-bg px-4 py-3">
        <Link href="/bubble/talk" aria-label="크리에이터 톡 목록으로" className="text-xl text-gray-800">
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-gray-900">{chatDisplayName(chat)}</h1>
          <p className="truncate text-xs text-gray-700">
            크리에이터 톡 · {chat.member_count > 2 ? `${chat.member_count}명` : "1:1"} · 크리에이터만 볼 수 있어요
          </p>
        </div>
      </header>

      <RoomChat
        pollUrl={`/api/bubble/talk/${chat.id}/messages`}
        sendAction={sendChatMessageAction}
        deleteAction={deleteChatMessageAction}
        target={{ name: "chatId", value: chat.id }}
        viewerId={viewer.id}
        initialMessages={messages}
        initialCursor={new Date(nowMs).toISOString()}
        isOpen
        memberCount={null}
        canSend
        maxChars={BUBBLE_POLICY.creatorMaxChars}
        previewRoomId={null}
        closedNotice=""
      />
    </div>
  );
}
