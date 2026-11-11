import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { listThreadsFor } from "@/lib/bubble/repo";
import { getViewer } from "@/lib/session";

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

  const threads = await listThreadsFor(viewer);

  return (
    <section className="flex flex-col rounded-2xl bg-white">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <h1 className="text-xl font-bold text-gray-900">채팅</h1>
        {viewer.role === "creator" && (
          <Link href="/creator" className="text-sm text-key-brown underline">
            새 대화방 열기
          </Link>
        )}
      </header>
      {threads.length === 0 && (
        <p className="px-5 pb-6 text-sm text-key-stone">아직 대화방이 없어요.</p>
      )}
      <ul className="flex flex-col pb-2">
        {threads.map((thread) => {
          const other =
            viewer.id === thread.creator_id ? thread.subscriber_name : thread.creator_name;
          return (
            <li key={thread.id}>
              <Link
                href={`/bubble/${thread.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-key-mist/60"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-key-blue/40 font-semibold text-key-brown">
                  {Array.from(other)[0] ?? "?"}
                </span>
                <span className="flex-1 truncate font-medium text-gray-900">{other}</span>
                <span className="text-xs text-key-stone">
                  {thread.status === "open" ? "열림" : "닫힘"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
