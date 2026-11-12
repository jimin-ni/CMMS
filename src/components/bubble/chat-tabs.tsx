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
          className={`rounded-full px-4 py-1.5 text-sm ${
            tab.key === active
              ? "bg-key-brown text-key-mist"
              : "bg-key-mist text-key-brown hover:bg-key-mist/70"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
