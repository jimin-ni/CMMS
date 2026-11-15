import { ImageResponse } from "next/og";
import { excludedReelKeys, getRoomBySlug, listReels } from "@/lib/heap/repo";

// 방 링크를 메신저나 SNS에 붙였을 때 뜨는 미리보기 사진 (판정 2026-11-14).
// 방의 최근 유튜브 영상 썸네일로 폴라로이드 더미를 그린다. 글자는 넣지 않는다: 방 이름과 소개는 og:title, og:description 이 맡고,
// 한글 글꼴을 이미지 안에 싣지 않아도 된다. 영상이 없거나 썸네일을 못 받으면 빈 폴라로이드로 그린다.
// 썸네일은 화면과 같은 i.ytimg.com 에서 서버가 직접 받는다 (다운로드해서 저장하지 않고, 그릴 때만 쓴다).

export const alt = "크리에이터의 미니홈";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#efe6d6";
const OLIVE = "#565344";
// 폴라로이드 자리: 가운데에 겹쳐 쌓인 더미. 마지막 것이 맨 위다.
const SLOTS = [
  { left: 150, top: 245, rot: -11 },
  { left: 760, top: 255, rot: 9 },
  { left: 300, top: 125, rot: 5 },
  { left: 610, top: 135, rot: -6 },
  { left: 440, top: 245, rot: -2 },
];
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

// 썸네일 하나를 data URL 로. 실패하면 null (빈 폴라로이드).
async function thumb(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const room = await getRoomBySlug(roomId);
  const reels = room ? await listReels(room.id, 12, excludedReelKeys(room.layout)) : [];
  const ids = reels
    .filter((reel) => reel.platform === "youtube" && YT_ID.test(reel.externalId))
    .slice(0, SLOTS.length)
    .map((reel) => reel.externalId);
  // 최근 영상이 맨 위(마지막 자리)에 오도록 뒤집는다.
  const pics = (await Promise.all(ids.map(thumb))).reverse();

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: PAPER }}>
        {SLOTS.map((slot, i) => {
          const pic = pics[i - (SLOTS.length - pics.length)] ?? null;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: slot.left,
                top: slot.top,
                width: 300,
                height: 230,
                padding: "12px 12px 48px",
                background: "#fbf8f1",
                transform: `rotate(${slot.rot}deg)`,
                boxShadow: "0 10px 24px rgba(47, 44, 36, 0.28)",
                display: "flex",
              }}
            >
              {pic ? (
                // eslint-disable-next-line @next/next/no-img-element -- ImageResponse(Satori)는 img 만 그린다
                <img src={pic} width={276} height={170} style={{ objectFit: "cover" }} alt="" />
              ) : (
                <div style={{ width: 276, height: 170, background: OLIVE, opacity: 0.18, display: "flex" }} />
              )}
            </div>
          );
        })}
      </div>
    ),
    size,
  );
}
