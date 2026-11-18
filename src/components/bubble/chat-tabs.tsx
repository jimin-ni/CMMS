import Link from "next/link";

// 크리에이터의 채팅 화면 탭: 구독자와의 대화방 / 크리에이터끼리의 대화.
export function ChatTabs({ active }: { active: "subscribers" | "creators" }) {
  const tabs = [
    { key: "subscribers", href: "/bubble", label: "구독자" },
    { key: "creators", href: "/bubble/talk", label: "크리에이터 톡" },
  ] as const;

  return (
    <nav aria-label="채팅 종류" className="flex gap-1 px-5 pb-2">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={`rounded-sm border border-ink px-4 py-1.5 text-sm font-bold uppercase ${
            tab.key === active
              ? "bg-ink text-white"
              : "bg-white text-ink hover:bg-cream"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
