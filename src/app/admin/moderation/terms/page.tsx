import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { readDictionary, summarize, type Dictionary } from "@/lib/moderation/dictionary-repo";
import { AddAllowForm, RemoveAllowButton } from "@/components/moderation/dictionary-controls";

// 판정 사전 관리 화면 (관리자 전용). 사전, 허용 목록, DB regex를 보고 허용 목록을 고친다.
// 단어는 서버에서 관리자 확인 뒤에만 그린다. 관리자가 아니면 데이터를 읽지 않는다.
type Tab = "terms" | "allow" | "patterns";
type Search = { tab?: string; q?: string; status?: string };

export default function AdminDictionaryPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Suspense fallback={<p className="text-sm text-ash">불러오는 중...</p>}>
        <Content searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "admin") redirect("/");
  const dict = await readDictionary(viewer);
  if (!dict) redirect("/");

  const sp = await searchParams;
  const tab: Tab = sp.tab === "allow" || sp.tab === "patterns" ? sp.tab : "terms";
  const q = (sp.q ?? "").normalize("NFKC").toLowerCase().trim();
  const status = sp.status === "on" || sp.status === "off" ? sp.status : "all";
  const s = summarize(dict);

  const tabs: { key: Tab; label: string }[] = [
    { key: "terms", label: `사전 ${s.terms} (켬 ${s.termsOn})` },
    { key: "allow", label: `허용 목록 ${s.allow}` },
    { key: "patterns", label: `DB regex ${s.patterns} (켬 ${s.patternsOn})` },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-medium text-ink">판정 사전 (관리자)</h1>
        <Link href="/admin/moderation" className="text-xs text-ash underline">
          메시지 검토로
        </Link>
      </div>
      <p className="text-xs text-ash">판정 서버는 켜진 단어와 regex, 허용 목록 전체를 5분마다 다시 읽어요.</p>

      <nav className="flex gap-1 border-b border-hairline text-sm">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/moderation/terms?tab=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-1.5 ${t.key === tab ? "border-ink font-medium text-ink" : "border-transparent text-ash"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <form className="flex flex-wrap items-center gap-2 text-sm" action="/admin/moderation/terms">
        <input type="hidden" name="tab" value={tab} />
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="찾기"
          aria-label="찾기"
          className="w-48 rounded-sm border border-hairline bg-white px-2 py-1"
        />
        {tab !== "allow" && (
          <select name="status" defaultValue={status} aria-label="상태" className="rounded-sm border border-hairline bg-white px-2 py-1">
            <option value="all">전체</option>
            <option value="on">켬</option>
            <option value="off">끔</option>
          </select>
        )}
        <button type="submit" className="rounded-sm border border-ink px-2 py-0.5 text-xs font-bold hover:bg-cream">
          적용
        </button>
      </form>

      {tab === "terms" && <TermsTable dict={dict} q={q} status={status} />}
      {tab === "allow" && <AllowTable dict={dict} q={q} />}
      {tab === "patterns" && <PatternsTable dict={dict} q={q} status={status} />}
    </div>
  );
}

const TH = "border-b border-hairline px-2 py-1 text-left text-xs font-medium text-ash";
const TD = "border-b border-hairline px-2 py-1 align-top";

function matchStatus(enabled: boolean, status: string) {
  return status === "all" || (status === "on") === enabled;
}

function Count({ shown, total }: { shown: number; total: number }) {
  return <p className="text-xs text-ash">{shown === total ? `${total}개` : `${total}개 중 ${shown}개`}</p>;
}

function TermsTable({ dict, q, status }: { dict: Dictionary; q: string; status: string }) {
  const rows = dict.terms.filter(
    (t) => matchStatus(t.enabled, status) && (!q || t.term.toLowerCase().includes(q) || t.tag.includes(q) || t.source.toLowerCase().includes(q)),
  );
  return (
    <section className="flex flex-col gap-2">
      <Count shown={rows.length} total={dict.terms.length} />
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={TH}>단어</th>
            <th className={TH}>언어</th>
            <th className={TH}>근거</th>
            <th className={TH}>출처</th>
            <th className={TH}>버전</th>
            <th className={TH}>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className={t.enabled ? "" : "text-ash"}>
              <td className={`${TD} break-all`}>{t.term}</td>
              <td className={TD}>{t.lang}</td>
              <td className={TD}>{t.tag}</td>
              <td className={TD}>{t.source}</td>
              <td className={TD}>{t.version}</td>
              <td className={TD}>{t.enabled ? "켬" : "끔"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const dateFormat = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric", timeZone: "Asia/Seoul" });

function AllowTable({ dict, q }: { dict: Dictionary; q: string }) {
  const rows = dict.allowlist.filter((a) => !q || a.term.toLowerCase().includes(q) || (a.note ?? "").toLowerCase().includes(q));
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs text-ash">허용 목록에 든 단어 안에서 걸린 일치는 판정에서 빠져요. 정상 단어가 잘못 걸릴 때 넣어요.</p>
      <AddAllowForm />
      <Count shown={rows.length} total={dict.allowlist.length} />
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={TH}>단어</th>
            <th className={TH}>메모</th>
            <th className={TH}>추가일</th>
            <th className={TH} />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td className={`${TD} break-all`}>{a.term}</td>
              <td className={`${TD} text-ash`}>{a.note}</td>
              <td className={`${TD} whitespace-nowrap text-ash`}>{dateFormat.format(a.createdAt)}</td>
              <td className={`${TD} text-right`}>
                <RemoveAllowButton id={a.id} term={a.term} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PatternsTable({ dict, q, status }: { dict: Dictionary; q: string; status: string }) {
  const rows = dict.patterns.filter(
    (p) => matchStatus(p.enabled, status) && (!q || p.name.toLowerCase().includes(q) || p.pattern.toLowerCase().includes(q)),
  );
  if (dict.patterns.length === 0) return <p className="text-sm text-ash">DB에 둔 regex가 아직 없어요.</p>;
  return (
    <section className="flex flex-col gap-2">
      <Count shown={rows.length} total={dict.patterns.length} />
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={TH}>이름</th>
            <th className={TH}>regex</th>
            <th className={TH}>버전</th>
            <th className={TH}>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className={p.enabled ? "" : "text-ash"}>
              <td className={TD}>{p.name}</td>
              <td className={`${TD} break-all font-mono text-xs`}>{p.pattern}</td>
              <td className={TD}>{p.version}</td>
              <td className={TD}>{p.enabled ? "켬" : "끔"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
