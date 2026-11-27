import { BUBBLE_POLICY, maxCharsFor } from "./policy";
import {
  canAccessRoom,
  canJoinRoom,
  canSendInRoom,
  dbNowMs,
  getRoom,
  listMessages,
  seesAllMessages,
  type MessageRow,
} from "./repo";
import { FEATURE_ON } from "@/lib/features";
import { getRoomBySlug, getOpenBubbleRoomId } from "@/lib/heap/repo";
import { getWriteBlock, type WriteBlock } from "@/lib/moderation/repo";
import type { Viewer } from "@/lib/session";

// 미니룸 오른쪽 아래의 채팅 창(chat-dock.tsx)이 처음 그릴 때 읽는 값.
// 구독자와 로그아웃한 방문자는 지금 들어와 있는 방 주인의 대화방을, 크리에이터는 언제나 자기 대화방을 본다.
export type DockChat = {
  roomId: string;
  ownerId: string;
  viewerId: string;
  messages: MessageRow[];
  cursor: string;
  // 구독자가 아직 참여하지 않은 방. 창을 처음 열 때 참여한다.
  joined: boolean;
  canJoin: boolean;
  canSend: boolean;
  maxChars: number;
  // 방 주인·관리자: 구독자 글을 신고하고 인용 답장한다.
  moderator: boolean;
  writeBlock: WriteBlock | null;
  previewRoomId: string | null;
};

export type DockData = {
  // 접힌 배너의 글: 크리에이터는 "Chat", 그 밖에는 방 주인 이름
  label: string;
  // 펼친 배너와 로그아웃 화면의 이름, 사진
  ownerName: string;
  ownerAvatarUrl: string | null;
  signedIn: boolean;
  // 방 주인이 연 대화방이 있는지 ("Chat Open" / "Chat Close")
  open: boolean;
  // 메시지를 읽을 수 있을 때만 있다
  chat: DockChat | null;
};

export async function loadDock(slug: string, viewer: Viewer | null): Promise<DockData | null> {
  const heapRoom = await getRoomBySlug(slug);
  if (!heapRoom) return null;

  const ownerId = viewer?.role === "creator" ? viewer.id : heapRoom.creatorId;
  const ownerName = viewer?.role === "creator" ? viewer.name : heapRoom.creatorName;
  const label = viewer?.role === "creator" ? "Chat" : ownerName;
  const openId = await getOpenBubbleRoomId(ownerId);
  // 로그아웃한 방문자에게는 열렸는지만 알린다. 사진 주소는 로그인한 사람에게만 열려 있다 (/api/creator/avatar).
  if (!viewer) return { label, ownerName, ownerAvatarUrl: null, signedIn: false, open: openId !== null, chat: null };

  const room = openId ? await getRoom(openId, viewer.id) : null;
  if (!room) return { label, ownerName, ownerAvatarUrl: null, signedIn: true, open: false, chat: null };

  const base = { label, ownerName, ownerAvatarUrl: room.creator_avatar_url, signedIn: true, open: true };
  const joined = canAccessRoom(room, viewer);
  const canJoin = canJoinRoom(room, viewer);
  if (!joined && !canJoin) return { ...base, chat: null };

  // 실시간 읽기 기준점은 조회보다 먼저 잡는다 (bubble/[roomId]/page.tsx 와 같다).
  const nowMs = await dbNowMs();
  const messages = joined ? await listMessages(room, viewer, BUBBLE_POLICY.deleteWindowMs) : [];
  const moderator = seesAllMessages(room, viewer);
  const writeBlock = moderator ? null : await getWriteBlock(viewer.id, room.creator_id);
  return {
    ...base,
    chat: {
      roomId: room.id,
      ownerId: room.creator_id,
      viewerId: viewer.id,
      messages,
      cursor: new Date(nowMs).toISOString(),
      joined,
      canJoin,
      // 참여 전이면 참여한 뒤에 보낼 수 있다 (열린 방만 참여할 수 있다)
      canSend: joined ? canSendInRoom(room, viewer) : canJoin,
      maxChars: maxCharsFor(viewer.role),
      moderator,
      writeBlock,
      previewRoomId:
        FEATURE_ON.aiPreview && viewer.role === "public" && viewer.id !== room.creator_id ? room.id : null,
    },
  };
}
