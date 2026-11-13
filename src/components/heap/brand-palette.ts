// 내 색: 주인이 넣은 브랜드 색 1~3개로 방 팔레트 한 벌(layout.palette 의 모든 키)을 만든다.
// 색은 주인이 넣은 값에서만 온다 (아바타나 채널 그림에서 색을 뽑지 않는다).
// 같은 입력은 늘 같은 팔레트를 낸다 (난수가 없다).
//
// 역할
//   가장 밝은 색 → 벽. 밝은 색은 옅은 파스텔 벽, 모두 아주 어두우면(밝기 < 0.3) 짙은 벽(밤 서재처럼).
//   나머지 가운데 색이 가장 진한 색 → 포인트(천, 러그, 문). 그 색이 검정·흰색·회색이면 벽의 색. 천에 보이도록 밝기를 0.2~0.7 로 당긴다.
//   셋을 넣으면 남는 색 → 나무(가구). 아니면 따뜻한 나무색을 고른다.
//   테두리(trim, olive)는 가장 어두운 브랜드 색의 색조로 짙게, 종이(paper)는 벽의 색조로 아주 옅게, 잉크는 테두리의 색조로 아주 짙게.
//   바닥은 따뜻한 나무 널 세 장 [c, c×0.9, c×1.085] (palettes.ts 의 withWell 과 같은 비율). 잎은 자연스러운 초록이다.
// 대비 (design/palette-presets.md 의 WCAG 휘도 비, 바닥은 가장 나쁜 널로 잰다)
//   벽:바닥 ≥ 1.3, 나무:바닥 ≥ 1.3, 잉크:종이 ≥ 10. 바닥의 밝기를 먼저 고르고, 그것으로 모자라면 나무, 그다음 벽의 밝기를 옮긴다.
//   옮긴 것은 adjusted 에 적는다 (화면의 짧은 안내).
import { shade, type Palette } from "./palettes";

export const BRAND_MAX = 3;
export const MIN_SURFACE = 1.3;
export const MIN_TEXT = 10;
const HEX = /^#[0-9a-fA-F]{6}$/;

type HSL = { h: number; s: number; l: number };

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function toHsl(hex: string): HSL {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
function fromHsl({ h, s, l }: HSL): string {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// WCAG 상대 휘도와 대비
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
// 한 색과 바닥 널 가운데 가장 낮은 대비
export const worstAgainst = (c: string, floor: string[]) => Math.min(...floor.map((f) => contrast(c, f)));
const boards = (c: string) => [c, shade(c, 0.9), shade(c, 1.085)].map((v) => v.toUpperCase());

export type BrandResult = { palette: Palette; adjusted: ("wall" | "wood")[] };

// 입력을 #RRGGBB 1~3개로 고른다. 맞지 않는 값은 버린다.
export function cleanBrand(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((c): c is string => typeof c === "string" && HEX.test(c)).slice(0, BRAND_MAX).map((c) => c.toUpperCase());
}

export function brandPalette(input: string[]): BrandResult | null {
  const brand = cleanBrand(input);
  if (!brand.length) return null;
  const hs = brand.map(toHsl);
  // 역할 나누기: 벽은 가장 밝은 색, 포인트는 나머지 가운데 가장 색이 진한 색(채도 × 밝기 폭), 나무는 셋일 때 남는 색
  const chroma = (c: HSL) => c.s * (1 - Math.abs(2 * c.l - 1));
  const wi = hs.reduce((bi, c, i) => (c.l > hs[bi].l + 1e-9 ? i : bi), 0);
  const rest = hs.map((_, i) => i).filter((i) => i !== wi);
  let ai = rest.length ? rest.reduce((bi, i) => (chroma(hs[i]) > chroma(hs[bi]) + 1e-9 ? i : bi), rest[0]) : wi;
  if (chroma(hs[ai]) < 0.12 && chroma(hs[wi]) > chroma(hs[ai])) ai = wi; // 남은 색이 검정·흰색·회색이면 벽 색을 천에도 쓴다
  const woodIdx = hs.length === 3 ? [0, 1, 2].find((i) => i !== wi && i !== ai) : undefined;
  const b1 = hs[wi], b2 = hs[ai], b3 = woodIdx === undefined ? undefined : hs[woodIdx];
  const adjusted: ("wall" | "wood")[] = [];

  // 벽: 밝은 색은 파스텔, 아주 어두운 색은 짙은 벽
  const darkWall = b1.l < 0.3;
  let wallL = darkWall ? clamp(b1.l, 0.16, 0.26) + 0.04 : clamp(b1.l, 0.8, 0.92);
  const wallH: HSL = { h: b1.h, s: darkWall ? Math.min(b1.s, 0.3) : Math.min(b1.s, 0.55) * 0.8, l: wallL };
  let wall = fromHsl(wallH);

  // 포인트: 천에 보이는 밝기
  const accent = fromHsl({ h: b2.h, s: b2.s, l: clamp(b2.l, 0.2, 0.7) });

  // 테두리와 올리브: 가장 어두운 브랜드 색의 색조
  const darkest = brand.map(toHsl).reduce((a, b) => (b.l < a.l ? b : a));
  const trim = fromHsl({ h: darkest.h, s: Math.min(darkest.s, 0.35), l: clamp(darkest.l, 0.14, 0.3) });
  const olive = fromHsl({ h: darkest.h, s: Math.min(darkest.s, 0.3), l: clamp(darkest.l + 0.04, 0.18, 0.34) });

  // 종이와 잉크: 잉크:종이 ≥ 10 이 될 때까지 잉크를 어둡게
  const paper = fromHsl({ h: wallH.h, s: Math.min(wallH.s, 0.4), l: 0.94 });
  let inkL = 0.15, ink = fromHsl({ h: darkest.h, s: Math.min(darkest.s, 0.3), l: inkL });
  while (contrast(ink, paper) < MIN_TEXT && inkL > 0.02) {
    inkL -= 0.01;
    ink = fromHsl({ h: darkest.h, s: Math.min(darkest.s, 0.3), l: inkL });
  }

  // 나무: 셋째 색이 있으면 그 색 (밝기 0.28~0.62), 없으면 따뜻한 나무색 (밝기는 아래에서 고른다)
  const woodFixed = !!b3;
  const woodBase: HSL = b3 ? { h: b3.h, s: b3.s, l: clamp(b3.l, 0.28, 0.62) } : { h: 28, s: 0.42, l: 0.45 };
  const floorH = 30, floorS = 0.4;

  // 바닥(그리고 나무가 자유로우면 나무)의 밝기를 고른다: 두 대비의 작은 쪽을 1.8 까지 키우고, 자연스러운 밝기(바닥 0.5, 나무 0.45)에서 덜 벗어난 것
  const pick = (wallHex: string, woodLs: number[]) => {
    let best: { score: number; floor: string[]; wood: string } | null = null;
    for (let fl = 0.25; fl <= 0.751; fl += 0.01) {
      const floor = boards(fromHsl({ h: floorH, s: floorS, l: fl }));
      const cw = worstAgainst(wallHex, floor);
      for (const wl of woodLs) {
        const wood = fromHsl({ ...woodBase, l: wl });
        const m = Math.min(cw, worstAgainst(wood, floor));
        const score = Math.min(m, 1.8) - Math.abs(fl - 0.5) * 0.3 - Math.abs(wl - woodBase.l) * (woodFixed ? 2 : 0.3);
        if (!best || score > best.score + 1e-9) best = { score, floor, wood };
      }
    }
    return best!;
  };
  const range = (lo: number, hi: number) => Array.from({ length: Math.round((hi - lo) / 0.01) + 1 }, (_, i) => lo + i * 0.01);
  const ok = (r: { floor: string[]; wood: string }, w: string) =>
    worstAgainst(w, r.floor) >= MIN_SURFACE && worstAgainst(r.wood, r.floor) >= MIN_SURFACE;

  let res = pick(wall, woodFixed ? [woodBase.l] : range(0.25, 0.65));
  if (!ok(res, wall) && woodFixed) {
    res = pick(wall, range(0.2, 0.7));
    if (ok(res, wall) || res.wood !== fromHsl(woodBase)) adjusted.push("wood");
  }
  // 그래도 모자라면 벽의 밝기를 바닥에서 멀리 옮긴다
  for (let step = 0; !ok(res, wall) && step < 20; step++) {
    wallL = darkWall ? Math.max(0.06, wallL - 0.01) : Math.min(0.97, wallL + 0.01);
    wall = fromHsl({ ...wallH, l: wallL });
    res = pick(wall, woodFixed ? range(0.2, 0.7) : range(0.25, 0.65));
    if (!adjusted.includes("wall")) adjusted.push("wall");
  }

  const woodB = res.wood;
  const leafH = 92, leafS = 0.24;
  const palette: Palette = {
    olive, accent, paper, ink, wall, trim,
    floor: res.floor,
    woodB, woodDark: shade(woodB, 0.79).toUpperCase(),
    leaf: fromHsl({ h: leafH, s: leafS, l: 0.4 }), leaf2: fromHsl({ h: leafH - 6, s: leafS, l: 0.48 }), leafDark: fromHsl({ h: leafH, s: leafS, l: 0.31 }),
  };
  return { palette, adjusted };
}
