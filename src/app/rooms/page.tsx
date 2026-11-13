import Link from "next/link";
import { Suspense } from "react";
import { getViewer } from "@/lib/session";
import {
  listChangedRoomSlugs,
  listFeaturedRooms,
  listFollowedRooms,
  searchRooms,
  type HeapRoomCard,
} from "@/lib/heap/repo";
import { HEAP_FUNNEL_POLICY } from "@/lib/heap/policy";
import { normalizeSearchQuery } from "@/lib/heap/search";
import { RoomCard } from "@/components/heap-funnel/room-card";
import { FollowedRooms } from "@/components/heap-funnel/followed-rooms";

// 미니홈 목록. 시참 플랫폼 화면의 틀(제목 아래 가로 줄, 그 아래 카드 격자)을 따른다.
// 위: 따라가는 방(로그인한 사람만). 아래: 추천 방. 맨 위: 검색 상자.
// 검색은 주소의 ?q= 로 한다. 로그인 전에도 추천 방과 검색을 쓸 수 있다.
// searchParams와 세션은 요청 시점 값이라 Suspense 안에서 읽는다 (cacheComponents).
type RoomsPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

function SearchForm({ query }: { query: string }) {
  return (
    <form action="/rooms" method="get" role="search" className="mt-6 flex gap-2">
      <input
        name="q"
        type="search"
        defaultValue={query}
        maxLength={HEAP_FUNNEL_POLICY.roomsSearchQueryMaxChars}
        placeholder="크리에이터 이름이나 방 이름으로 찾기"
        aria-label="미니홈 검색"
        autoComplete="off"
        className="min-w-0 flex-1 rounded-full border border-key-stone/50 bg-white px-4 py-2 text-sm"
      />
      <button type="submit" className="rounded-full bg-key-brown px-5 py-2 text-sm text-key-mist">
        검색
      </button>
    </form>
  );
}

function RoomGrid({ rooms }: { rooms: HeapRoomCard[] }) {
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rooms.map((room) => (
        <RoomCard key={room.slug} room={room} />
      ))}
    </div>
  );
}

async function RoomsContent({ searchParams }: RoomsPageProps) {
  const params = await searchParams;
  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = normalizeSearchQuery(rawQuery);

  const viewer = await getViewer();
  const [followed, changed, featured, results] = await Promise.all([
    viewer ? listFollowedRooms(viewer.id) : null,
    viewer ? listChangedRoomSlugs(viewer.id) : [],
    listFeaturedRooms(HEAP_FUNNEL_POLICY.featuredSlugs),
    query ? searchRooms(query) : null,
  ]);
  const changedSlugs = new Set(changed);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-key-brown">미니홈 · 크리에이터의 방</h1>
          <p className="mt-1 text-key-stone">
            크리에이터가 지난 영상을 쌓아 둔 방입니다. 방에 들어가 둘러보고 방명록을 남겨 보세요.
          </p>
        </div>
        {viewer?.role === "creator" && (
          <Link href="/room/me" className="rounded-full bg-key-brown px-5 py-2 text-sm text-key-mist">
            내 미니홈
          </Link>
        )}
      </div>

      <SearchForm query={query ?? ""} />

      {results && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-key-brown">검색 결과</h2>
          {results.length > 0 ? (
            <RoomGrid rooms={results} />
          ) : (
            <p className="mt-3 text-sm text-key-stone">찾는 방이 없어요. 다른 이름으로 검색해 보세요.</p>
          )}
        </section>
      )}

      {followed && (
        <div className="mt-10">
          <FollowedRooms
            title={followed.source === "joined" ? "따라가는 방" : "다녀간 방"}
            hasDots={followed.rooms.some((room) => changedSlugs.has(room.slug))}
          >
            {followed.rooms.length > 0 ? (
              <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
                {followed.rooms.map((room) => (
                  <RoomCard key={room.slug} room={room} changed={changedSlugs.has(room.slug)} compact />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-key-stone">
                아직 따라가는 방이 없어요. 크리에이터의 버블에 참여하거나 방을 한 번 방문하면 여기에 모여요.
              </p>
            )}
          </FollowedRooms>
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-key-brown">추천 방</h2>
        {featured.length > 0 ? (
          <RoomGrid rooms={featured} />
        ) : (
          <p className="mt-3 text-sm text-key-stone">추천 방이 아직 없어요.</p>
        )}
      </section>
    </>
  );
}

export default function RoomsPage({ searchParams }: RoomsPageProps) {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <Suspense fallback={<div className="h-64" />}>
        <RoomsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
