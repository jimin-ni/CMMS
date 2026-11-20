// AI 스크리닝 검토 화면 본문 (문서 11장). 관리자(/admin/moderation)와 방 주인(/creator/moderation)이 같이 쓴다.
// 보이는 범위는 listForReview가 쿼리에서 정한다.
import { listForReview, type ReviewEvent } from "@/lib/moderation/repo";
import type { Viewer } from "@/lib/session";
import { EventDecision, SanctionDecision, UnblockButton } from "./review-controls";

const KIND_LABEL: Record<ReviewEvent["kind"], string> = {
  abuse: "규칙 위반",
  contact: "연락처 공유",
  self_harm: "확인 필요 (자해)",
};

const STATUS_LABEL: Record<string, string> = {
  published: "공개",
  blocked: "숨김",
  held: "숨김 (검토 대기)",
  removed: "내림",
};

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

function eventLabel(e: ReviewEvent): string {
  if (e.ownerPost) return "방 주인 글 사후 확인";
  if (e.source === "report") return "신고";
  if (e.kind === "abuse" && !e.countsAsStrike) return "오탐 위험 숨김 (경고 없음)";
  return KIND_LABEL[e.kind] + (e.countsAsStrike ? " · 경고 1회" : " · 경고 없음");
}

export async function ReviewBoard({ viewer }: { viewer: Viewer }) {
  const data = await listForReview(viewer);
  const isAdmin = viewer.role === "admin";
  const pending = data.events.filter((e) => e.reviewStatus === "pending");
  const history = data.events.filter((e) => e.reviewStatus !== "pending");

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ash">
        이 화면에서 본 원문은 열람 기록으로 남아요. 사전 단어는 보이지 않고 근거 종류만 보여요.
      </p>

      {data.selfHarmPendingCount > 0 && (
        <section className="rounded-sm border border-ink bg-white p-4 text-sm">
          확인 필요(자해 관련) 글 {data.selfHarmPendingCount}건이 검토를 기다려요.
          {isAdmin ? " 3~7일 안에 숨김 해제 또는 유지를 정해 주세요." : " 원문은 관리자만 봐요."}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-ink">검토 대기 {pending.length}건</h2>
        <EventList events={pending} decide />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-ink">차단 {data.sanctions.length}건</h2>
        {data.sanctions.length === 0 && <p className="text-sm text-ash">활성 차단이 없어요.</p>}
        <ul className="flex flex-col gap-2">
          {data.sanctions.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 rounded-sm bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{s.userName}</span>
                <span className="text-xs text-ash">
                  {s.scope === "auto" ? "자동 차단" : s.scope === "owner" ? "크리에이터 차단" : "전체 차단"} · 경고{" "}
                  {s.strikes}회 · {timeFormat.format(new Date(s.createdAt))}
                </span>
                {s.appealed && <span className="text-xs font-bold text-red-700">재검토 요청</span>}
                {s.scope === "auto" && (
                  <span className="text-xs text-ash">{s.reviewStatus === "pending" ? "검토 대기" : "유지"}</span>
                )}
              </div>
              {s.scope === "auto" ? (
                <SanctionDecision sanctionId={s.id} canUphold={s.reviewStatus === "pending"} />
              ) : (
                <UnblockButton sanctionId={s.id} />
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-ink">기록 {history.length}건</h2>
        <EventList events={history} decide={false} />
      </section>
    </div>
  );
}

function EventList({ events, decide }: { events: ReviewEvent[]; decide: boolean }) {
  if (events.length === 0) return <p className="text-sm text-ash">없어요.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {events.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 rounded-sm bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ash">
            <span className="font-medium text-ink">{e.userName}</span>
            <span>{eventLabel(e)}</span>
            <span>{e.messageStatus ? STATUS_LABEL[e.messageStatus] : ""}</span>
            <span>{timeFormat.format(new Date(e.createdAt))}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-ink">{e.body ?? "(원문 없음)"}</p>
          {e.reasons.length > 0 && <p className="text-[11px] text-ash">근거: {e.reasons.join(", ")}</p>}
          {decide && <EventDecision eventId={e.id} ownerPost={e.ownerPost} />}
        </li>
      ))}
    </ul>
  );
}
