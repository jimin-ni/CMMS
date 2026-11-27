"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { MessageRow } from "@/lib/bubble/repo";
import { Composer, type SendAction } from "./composer";
import { DeleteMessageButton, type DeleteAction } from "./room-controls";
import { Avatar } from "@/components/avatar";
import { ModeratorTools, RemovedText, WriteBlockedPanel } from "@/components/moderation/chat-moderation";
import type { WriteBlock } from "@/lib/moderation/repo";
import { useMessageSync, type SyncMeta } from "./use-message-sync";

// 버블 대화방과 크리에이터 톡이 함께 쓰는 대화 화면. 읽기 주소와 쓰기 동작만 다르다.
type Props = {
  // 실시간 읽기 주소. ?since=<cursor>를 붙여 폴링한다.
  pollUrl: string;
  sendAction: SendAction;
  deleteAction: DeleteAction;
  // 보내기 폼에 함께 넣을 대상 id (예: roomId, chatId)
  target: { name: string; value: string };
  viewerId: string;
  initialMessages: MessageRow[];
  initialCursor: string;
  isOpen: boolean;
  // 머리글에 보이는 참여 인원. 머리글이 없는 구독자 화면에서는 null.
  memberCount: number | null;
  canSend: boolean;
  maxChars: number;
  // 크리에이터 예상 반응 미리보기를 쓸 버블 방. 구독자에게만 넘긴다.
  previewRoomId: string | null;
  closedNotice: string;
  // AI 스크리닝. 버블 대화방에만 넘긴다(크리에이터 톡은 없음).
  // moderator: 방 주인·관리자. 구독자 글을 신고·차단하고 내린 글의 원문을 볼 수 있다.
  // writeBlock: 구독자가 지금 이 방에 쓸 수 없는 이유. null이면 쓸 수 있다.
  moderation?: { roomOwnerId: string; moderator: boolean; writeBlock: WriteBlock | null };
};

export function RoomChat(props: Props) {
  const { pollUrl, viewerId, isOpen, memberCount, moderation } = props;
  const writeBlockKey = JSON.stringify(moderation?.writeBlock ?? null);
  const router = useRouter();
  // 방이 닫히거나 참여 인원이 바뀌면 머리글과 입력창을 서버에서 다시 그린다.
  // 쓰기 차단 상태가 바뀌어도 입력창을 다시 그린다.
  const onMeta = useCallback(
    (data: SyncMeta) => {
      const blockChanged =
        data.writeBlock !== undefined && JSON.stringify(data.writeBlock) !== writeBlockKey;
      if (data.status === "closed" || data.memberCount !== memberCount || blockChanged) router.refresh();
    },
    [router, memberCount, writeBlockKey],
  );
  const { messages, sync } = useMessageSync({
    pollUrl,
    initialMessages: props.initialMessages,
    initialCursor: props.initialCursor,
    enabled: isOpen,
    onMeta,
  });

  return (
    <>
      {/* column-reverse라서 새 메시지가 오면 스크롤이 맨 아래에 머문다. */}
      <div className="flex flex-1 flex-col-reverse overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-1">
          {messages.length === 0 && (
            <li className="py-6 text-center text-sm text-ash">아직 메시지가 없어요.</li>
          )}
          {messages.map((message, index) => {
            const mine = message.sender_id === viewerId;
            // 같은 사람이 이어서 보낸 메시지는 이름과 프로필을 한 번만 보여준다.
            const firstOfRun = index === 0 || messages[index - 1].sender_id !== message.sender_id;
            const bubble = (
              <p
                className={`max-w-[70vw] whitespace-pre-wrap break-words rounded-sm border px-3 py-2 text-sm sm:max-w-sm ${
                  mine ? "border-ink bg-ink" : "border-hairline bg-white"
                } ${message.deleted_at ? (mine ? "italic text-white/70" : "italic text-ash") : mine ? "text-white" : "text-ink"}`}
              >
                {message.deleted_at ? (
                  "삭제된 메시지입니다."
                ) : message.removed ? (
                  <RemovedText messageId={message.id} canReveal={Boolean(moderation?.moderator)} />
                ) : (
                  message.body
                )}
              </p>
            );
            const time = (
              <time className="shrink-0 text-[10px] text-ash">
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
                  {message.can_delete && (
                    <DeleteMessageButton
                      messageId={message.id}
                      deleteAction={props.deleteAction}
                      onDeleted={sync}
                    />
                  )}
                </li>
              );
            }

            return (
              <li key={message.id} className={`flex gap-2 ${firstOfRun ? "mt-2" : ""}`}>
                <div className="w-9 shrink-0">
                  {firstOfRun && (
                    <Avatar name={message.sender_name} url={message.sender_avatar_url} size={36} />
                  )}
                </div>
                <div className="flex flex-col items-start">
                  {firstOfRun && (
                    <span className="mb-1 text-xs text-ink">{message.sender_name}</span>
                  )}
                  <div className="flex items-end gap-1">
                    {bubble}
                    {time}
                  </div>
                  {moderation?.moderator &&
                    message.sender_id !== moderation.roomOwnerId &&
                    !message.removed &&
                    !message.deleted_at && (
                      <ModeratorTools
                        messageId={message.id}
                        senderId={message.sender_id}
                        senderName={message.sender_name}
                        onDone={sync}
                      />
                    )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {props.canSend && moderation?.writeBlock ? (
        <WriteBlockedPanel block={moderation.writeBlock} />
      ) : props.canSend ? (
        <Composer
          sendAction={props.sendAction}
          target={props.target}
          maxChars={props.maxChars}
          previewRoomId={props.previewRoomId}
          onSent={sync}
        />
      ) : (
        <p className="bg-white px-4 py-3 text-center text-sm text-ash">
          {props.closedNotice}
        </p>
      )}
    </>
  );
}

// 서버 시간대와 관계없이 한국 시간으로 "오후 3:12"처럼 보여준다.
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}
