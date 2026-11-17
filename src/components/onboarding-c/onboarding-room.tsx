import { notFound } from "next/navigation";
import { getViewer } from "@/lib/session";
import { loadRoomView } from "@/lib/heap/room-view";
import { ConceptB } from "@/components/onboarding-b/concept-b";
import { ConceptC } from "./concept-c";
import { ONBOARDING_ROOM_ID } from "./story";

// 컨셉 B, C가 띄우는 실제 2번 방. /room/dname 과 같은 값을 읽는다 (꾸미기는 열지 않는다).
// 세션과 DB 읽기는 요청 시점 값이라 Suspense 안에서 읽는다 (cacheComponents).
// 컨셉 B는 마지막에 이 방의 책장에 앨범을 꽂고, C는 이 방에 가구를 쌓는다.
// 첫 화면(/)과 /onboarding/[concept] 가 함께 쓴다.
export async function OnboardingRoom({ concept }: { concept: "b" | "c" }) {
  const viewer = await getViewer();
  const view = await loadRoomView(ONBOARDING_ROOM_ID, viewer, { withOwner: false });
  if (!view) {
    notFound();
  }
  const Concept = concept === "b" ? ConceptB : ConceptC;
  return <Concept data={view.data} viewerName={viewer?.name ?? null} signedIn={viewer !== null} />;
}
