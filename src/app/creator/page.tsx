import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { listRoomsFor } from "@/lib/bubble/repo";
import { getViewer } from "@/lib/session";
import { OpenRoomForm } from "@/components/bubble/room-forms";
import { CloseRoomButton } from "@/components/bubble/room-controls";
import { PersonaForm } from "@/components/creator/persona-form";
import { getPersona, PERSONA_MAX } from "@/lib/creator/profile";
import { AVATAR_MAX_BYTES, getAvatarUrl } from "@/lib/creator/avatar";
import { AvatarForm } from "@/components/creator/avatar-form";
import { FEATURE_ON } from "@/lib/features";

export default function CreatorPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Suspense fallback={<p className="text-sm text-ash">불러오는 중...</p>}>
        <CreatorContent />
      </Suspense>
    </main>
  );
}

async function CreatorContent() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "creator") redirect("/");

  const [rooms, persona, avatarUrl] = await Promise.all([
    listRoomsFor(viewer),
    FEATURE_ON.aiPreview ? getPersona(viewer.id) : "",
    getAvatarUrl(viewer.id),
  ]);
  // 크리에이터는 열린 방을 하나만 가질 수 있다.
  const openRoom = rooms.find((room) => room.status === "open");
  const closedRooms = rooms.filter((room) => room.status === "closed");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 rounded-sm bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-medium text-ink">크리에이터 페이지</h1>
          <Link href="/creator/moderation" className="text-sm text-ink underline">
            메시지 검토
          </Link>
        </div>
        {openRoom ? (
          <>
            <p className="text-sm text-ash">
              지금 열린 대화방입니다. 새 대화방은 이 방을 닫은 뒤에 열 수 있어요.
            </p>
            <div className="flex items-center justify-between gap-3 rounded-sm bg-cream px-4 py-3 text-sm">
              <Link href={`/bubble/${openRoom.id}`} className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink underline">
                  {openRoom.title}
                </span>
                <span className="text-xs text-ash">참여 {openRoom.member_count}명</span>
              </Link>
              <CloseRoomButton roomId={openRoom.id} />
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-ash">
              {viewer.name}님의 대화방을 엽니다. 구독자가 직접 참여하고, 내 메시지는 참여한 모든
              구독자에게 보여요.
            </p>
            <OpenRoomForm />
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-sm bg-white p-6">
        <h2 className="text-lg font-medium text-ink">프로필 사진</h2>
        <AvatarForm name={viewer.name} currentUrl={avatarUrl} maxBytes={AVATAR_MAX_BYTES} />
      </section>

      {FEATURE_ON.aiPreview && (
        <section className="flex flex-col gap-3 rounded-sm bg-white p-6">
          <h2 className="text-lg font-medium text-ink">AI 반응 미리보기 설정</h2>
          <p className="text-sm text-ash">
            구독자가 메시지를 보내기 전에 내 예상 반응을 이모지로 미리 보여줘요. AI가 아래 성격을
            참고합니다. 성격은 다른 사람에게 보이지 않아요.
          </p>
          <PersonaForm initialPersona={persona} maxChars={PERSONA_MAX} />
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-sm bg-white p-6">
        <h2 className="text-lg font-medium text-ink">닫힌 대화방</h2>
        {closedRooms.length === 0 && (
          <p className="text-sm text-ash">아직 닫은 대화방이 없어요.</p>
        )}
        <ul className="flex flex-col divide-y divide-hairline">
          {closedRooms.map((room) => (
            <li key={room.id} className="flex items-center justify-between py-3 text-sm">
              <Link href={`/bubble/${room.id}`} className="font-medium text-ink underline">
                {room.title}
              </Link>
              <span className="text-xs text-ash">참여 {room.member_count}명</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
