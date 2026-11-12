import type { Badge } from "@/lib/minigame/contract";

const BADGES: Record<Badge, { label: string; color: string; path: string }> = {
  admin: {
    label: "관리자",
    color: "text-key-stone",
    path: "M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z",
  },
  creator: {
    label: "크리에이터",
    color: "text-key-brown",
    path: "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1L12 2Z",
  },
  follower: {
    label: "팔로워",
    color: "text-key-blue",
    path: "M12 21s-8.5-5.2-8.5-11.5A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.5 2.9C20.5 15.8 12 21 12 21Z",
  },
};

export function PlayerBadge({ badge }: { badge: Badge }) {
  const { label, color, path } = BADGES[badge];

  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      data-badge={badge}
      className={`h-4 w-4 shrink-0 fill-current ${color}`}
    >
      <title>{label}</title>
      <path d={path} />
    </svg>
  );
}
