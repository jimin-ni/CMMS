import { HEAP_FUNNEL_POLICY } from "@/lib/heap/policy";
import type { HeapChannelPlatform, HeapLinkPlatform } from "@/lib/heap/platform";

// 방에 둘 수 있는 영상 수의 나눔 계산. 순수 함수만 둔다 (DB·네트워크 접근 없음).
// 세 갈래(쇼츠, 롱폼, 인스타그램)에 각자 상한이 있고, 합계 상한이 따로 있다. 안 쓴 몫은 아직 더 넣고 싶은 갈래로 넘어간다 (DECISIONS E2).

export const REEL_CLASSES = ["shorts", "long", "instagram"] as const;
export type ReelClass = (typeof REEL_CLASSES)[number];
export type ReelCounts = Record<ReelClass, number>;

// 영상이 어느 갈래에 세어지는지. 쇼츠는 모든 채널(틱톡 포함), 인스타그램은 따로, 나머지는 롱폼이다.
// 가로 여부를 모르는 유튜브 영상(wide = null)은 롱폼으로 센다.
// X 게시물은 쇼츠 갈래에 넣는다 (E2는 "X may be included"까지만 정했다). 세로 카드이고 틱톡과 같은 짧은 게시물이라 같은 몫을 쓴다.
export function classifyReel(reel: { platform: HeapChannelPlatform | HeapLinkPlatform; wide: boolean | null }): ReelClass {
  if (reel.platform === "instagram") return "instagram";
  if (reel.platform === "tiktok" || reel.platform === "x") return "shorts";
  if (reel.platform === "youtube" && reel.wide === false) return "shorts";
  return "long";
}

// 갈래별로 가져올 수 있는 영상 수(available: 이미 방에 있는 것 + 새로 가져올 후보)를 받아, 갈래별로 방에 둘 수 있는 수를 돌려준다.
// 1) 갈래마다 min(available, 상한)을 먼저 준다. 2) 합계 상한이 남으면 더 원하는 갈래에 한 개씩 번갈아 나눈다 (쇼츠, 롱폼, 인스타그램 순).
// 결과는 갈래별로 available을 넘지 않고, 합계는 total을 넘지 않는다. 기본 몫(1단계)은 합계 상한이 허락하는 만큼 지킨다.
export function allocateCaps(
  available: ReelCounts,
  caps: ReelCounts = HEAP_FUNNEL_POLICY.importCaps,
  total: number = HEAP_FUNNEL_POLICY.importTotalMax,
): ReelCounts {
  const alloc: ReelCounts = { shorts: 0, long: 0, instagram: 0 };
  let used = 0;
  for (const cls of REEL_CLASSES) {
    const base = Math.max(0, Math.min(Math.floor(available[cls]), caps[cls]));
    // 갈래 상한의 합이 합계 상한보다 크면 앞 갈래가 먼저 채운다.
    alloc[cls] = Math.min(base, Math.max(0, total - used));
    used += alloc[cls];
  }
  let spare = total - used;
  while (spare > 0) {
    let gave = false;
    for (const cls of REEL_CLASSES) {
      if (spare > 0 && alloc[cls] < Math.floor(available[cls])) {
        alloc[cls] += 1;
        spare -= 1;
        gave = true;
      }
    }
    if (!gave) break;
  }
  return alloc;
}
