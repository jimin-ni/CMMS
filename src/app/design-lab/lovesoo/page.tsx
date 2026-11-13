import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HeapRoom, type HeapRoomData } from "@/components/heap/heap-room";

type SourceReel = {
  id: string;
  channel?: string;
  wide?: boolean;
  title?: string;
  views?: string;
  published?: string | null;
};

function readJson<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(process.cwd(), ...parts), "utf8")) as T;
}

export default function LovesooDesignLabPage() {
  const layout = readJson<Record<string, unknown>>("public", "heap", "rooms", "lovesoo", "layout.json");
  const sourceReels = readJson<SourceReel[]>("public", "heap", "rooms", "lovesoo", "reels.json");
  const data: HeapRoomData = {
    roomUuid: "00000000-0000-0000-0000-000000000001",
    name: "Lovesoo — design lab",
    bubbleHref: "/bubble",
    serverTime: new Date().toISOString(),
    rooms: [{ id: "lovesoo", name: "Lovesoo", blurb: "50대 미국살이 · 먹방과 한식", changed: false }],
    layout,
    reels: sourceReels.slice(0, 48).map((reel) => ({
      id: reel.id,
      platform: "youtube",
      url: reel.wide ? `https://www.youtube.com/watch?v=${reel.id}` : `https://www.youtube.com/shorts/${reel.id}`,
      title: reel.title ?? "",
      channel: reel.channel ?? null,
      wide: reel.wide ?? false,
      views: reel.views ?? "",
      published: reel.published ?? null,
    })),
    pieces: [],
    guestbook: [],
    visits: { today: 0, total: 0 },
    creatorVisit: null,
  };

  return <HeapRoom roomId="lovesoo" data={data} viewerName={null} signedIn={false} canEdit />;
}
