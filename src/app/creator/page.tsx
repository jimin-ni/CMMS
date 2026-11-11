import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { listThreadsFor } from "@/lib/bubble/repo";
import { getViewer } from "@/lib/session";
import { OpenRoomForm } from "@/components/bubble/open-room-form";
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

  const threads = await listThreadsFor(viewer);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 rounded-2xl bg-white p-6">
        <h1 className="text-xl font-bold text-key-brown">크리에이터 페이지</h1>
        <p className="text-sm text-key-stone">{viewer.name}님의 대화방을 열고 관리합니다.</p>
        <OpenRoomForm />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-6">
        <h2 className="text-lg font-medium text-key-brown">내 대화방</h2>
        {threads.length === 0 && (
          <p className="text-sm text-key-stone">아직 연 대화방이 없어요.</p>
        )}
        <ul className="flex flex-col divide-y divide-key-stone/20">
          {threads.map((thread) => (
            <li key={thread.id} className="flex items-center justify-between py-3 text-sm">
              <Link href={`/bubble/${thread.id}`} className="font-medium text-key-brown underline">
                {thread.subscriber_name}
              </Link>
              <span className="flex items-center gap-3">
                <span className="text-xs text-key-stone">
                  {thread.status === "open" ? "열림" : "닫힘"}
                </span>
                {thread.status === "open" && <CloseRoomButton threadId={thread.id} />}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
