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
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-6">
      <h1 className="text-xl font-bold text-key-brown">버블</h1>
      {threads.length === 0 && (
        <p className="text-sm text-key-stone">아직 대화방이 없어요.</p>
      )}
      <ul className="flex flex-col divide-y divide-key-stone/20">
        {threads.map((thread) => {
          const other =
            viewer.id === thread.creator_id ? thread.subscriber_name : thread.creator_name;
          return (
            <li key={thread.id} className="flex items-center justify-between py-3 text-sm">
              <Link href={`/bubble/${thread.id}`} className="font-medium text-key-brown underline">
                {other}
              </Link>
              <span className="text-xs text-key-stone">
                {thread.status === "open" ? "열림" : "닫힘"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
