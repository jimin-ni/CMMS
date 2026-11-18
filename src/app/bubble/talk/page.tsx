import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BUBBLE_POLICY } from "@/lib/bubble/policy";
import { canUseTalk, chatDisplayName, listChatsFor, listCreators } from "@/lib/bubble/talk-repo";
import { getViewer } from "@/lib/session";
import { ChatTabs } from "@/components/bubble/chat-tabs";
import { CreatorPicker } from "@/components/bubble/creator-picker";
import { Avatar } from "@/components/avatar";

// 크리에이터 톡: 크리에이터끼리만 쓰는 1:1 또는 그룹 대화. 크리에이터가 아니면 들어올 수 없다.
export default function CreatorTalkPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Suspense fallback={<p className="text-sm text-ash">불러오는 중...</p>}>
        <CreatorTalkContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function CreatorTalkContent({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!canUseTalk(viewer)) redirect("/bubble");

  const { q } = await searchParams;
  const query = (typeof q === "string" ? q : "").trim().slice(0, 50);

  const [chats, creators] = await Promise.all([
    listChatsFor(viewer),
    listCreators(viewer, query, BUBBLE_POLICY.talkDirectoryLimit),
  ]);

  return (
    <section className="flex flex-col rounded-sm bg-white">
      <header className="px-5 pt-5 pb-3">
        <h1 className="text-xl font-medium text-ink">채팅</h1>
      </header>
      <ChatTabs active="creators" />

      <h2 className="px-5 pt-3 pb-1 text-sm font-medium text-ink">내 대화</h2>
      {chats.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-ash">
          아직 크리에이터 대화가 없어요. 아래에서 크리에이터를 골라 대화를 시작하세요.
        </p>
      ) : (
        <ul className="flex flex-col pb-2">
          {chats.map((chat) => {
            const name = chatDisplayName(chat);
            return (
              <li key={chat.id}>
                <Link
                  href={`/bubble/talk/${chat.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-cream"
                >
                  <Avatar name={name} url={chat.avatar_url} size={44} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-ink">{name}</span>
                    <span className="truncate text-xs text-ash">
                      {chat.member_count > 2 ? `그룹 · ${chat.member_count}명` : "1:1"}
                      {chat.title && ` · ${chat.other_names.join(", ")}`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="border-t border-hairline px-5 pt-4 pb-2 text-sm font-medium text-ink">
        크리에이터 찾기
      </h2>
      <form action="/bubble/talk" className="flex gap-2 px-5 pb-3" role="search">
        <label htmlFor="creator-search" className="sr-only">
          닉네임 검색
        </label>
        <input
          id="creator-search"
          name="q"
          type="search"
          defaultValue={query}
          maxLength={50}
          placeholder="닉네임으로 검색"
          className="flex-1 rounded-sm border border-ash px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-sm bg-cream px-4 py-2 text-sm text-ink">
          검색
        </button>
      </form>
      {/* 검색어가 바뀌면 고른 사람을 비운다. 목록에 없는 사람이 선택된 채 남지 않게 한다. */}
      <CreatorPicker
        key={query}
        creators={creators}
        maxPick={BUBBLE_POLICY.talkMaxMembers - 1}
      />
    </section>
  );
}
