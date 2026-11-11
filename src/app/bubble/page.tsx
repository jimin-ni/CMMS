import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { canAccessRoom, canJoinRoom, listRoomsFor } from "@/lib/bubble/repo";
import { getViewer } from "@/lib/session";
import { JoinRoomButton } from "@/components/bubble/room-forms";

export default function BubbleListPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Suspense fallback={<p className="text-sm text-key-stone">불러오는 중...</p>}>
        <BubbleListContent />
      </Suspense>
    </main>
  );
}

async function BubbleListContent() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const rooms = await listRoomsFor(viewer);

  return (
    <section className="flex flex-col rounded-2xl bg-white">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <h1 className="text-xl font-bold text-gray-900">채팅</h1>
        {viewer.role === "creator" && (
          <Link href="/creator" className="text-sm text-key-brown underline">
            내 대화방 관리
          </Link>
        )}
      </header>
      {rooms.length === 0 && (
        <p className="px-5 pb-6 text-sm text-key-stone">
          {viewer.role === "creator" ? "아직 연 대화방이 없어요." : "열린 대화방이 없어요."}
        </p>
      )}
      <ul className="flex flex-col pb-2">
        {rooms.map((room) => {
          const row = (
            <>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-key-blue/40 font-semibold text-key-brown">
                {Array.from(room.creator_name)[0] ?? "?"}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-gray-900">{room.title}</span>
                <span className="truncate text-xs text-key-stone">
                  {room.creator_name} · 참여 {room.member_count}명
                </span>
              </span>
            </>
          );
          const status = (
            <span className="text-xs text-key-stone">
              {room.status === "open" ? "열림" : "닫힘"}
            </span>
          );

          // 아직 참여하지 않은 구독자는 들어가기 전에 참여 버튼을 눌러야 한다.
          if (!canAccessRoom(room, viewer)) {
            return (
              <li key={room.id} className="flex items-center gap-3 px-5 py-3">
                {row}
                {canJoinRoom(room, viewer) ? <JoinRoomButton roomId={room.id} /> : status}
              </li>
            );
          }
          return (
            <li key={room.id}>
              <Link
                href={`/bubble/${room.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-key-mist/60"
              >
                {row}
                {status}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
