import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { listRoomsFor } from "@/lib/bubble/repo";
import { getViewer } from "@/lib/session";
import { OpenRoomForm } from "@/components/bubble/room-forms";
import { CloseRoomButton } from "@/components/bubble/room-controls";

export default function CreatorPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Suspense fallback={<p className="text-sm text-key-stone">불러오는 중...</p>}>
        <CreatorContent />
      </Suspense>
    </main>
  );
}

async function CreatorContent() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "creator") redirect("/");

  const rooms = await listRoomsFor(viewer);
  // 크리에이터는 열린 방을 하나만 가질 수 있다.
  const openRoom = rooms.find((room) => room.status === "open");
  const closedRooms = rooms.filter((room) => room.status === "closed");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 rounded-2xl bg-white p-6">
        <h1 className="text-xl font-bold text-key-brown">크리에이터 페이지</h1>
        {openRoom ? (
          <>
            <p className="text-sm text-key-stone">
              지금 열린 대화방입니다. 새 대화방은 이 방을 닫은 뒤에 열 수 있어요.
            </p>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-key-mist/60 px-4 py-3 text-sm">
              <Link href={`/bubble/${openRoom.id}`} className="min-w-0 flex-1">
                <span className="block truncate font-medium text-key-brown underline">
                  {openRoom.title}
                </span>
                <span className="text-xs text-key-stone">참여 {openRoom.member_count}명</span>
              </Link>
              <CloseRoomButton roomId={openRoom.id} />
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-key-stone">
              {viewer.name}님의 대화방을 엽니다. 구독자가 직접 참여하고, 내 메시지는 참여한 모든
              구독자에게 보여요.
            </p>
            <OpenRoomForm />
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-6">
        <h2 className="text-lg font-medium text-key-brown">닫힌 대화방</h2>
        {closedRooms.length === 0 && (
          <p className="text-sm text-key-stone">아직 닫은 대화방이 없어요.</p>
        )}
        <ul className="flex flex-col divide-y divide-key-stone/20">
          {closedRooms.map((room) => (
            <li key={room.id} className="flex items-center justify-between py-3 text-sm">
              <Link href={`/bubble/${room.id}`} className="font-medium text-key-brown underline">
                {room.title}
              </Link>
              <span className="text-xs text-key-stone">참여 {room.member_count}명</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
