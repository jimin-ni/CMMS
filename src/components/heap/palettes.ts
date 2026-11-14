// 꾸미기 색·무늬 탭의 팔레트 (design/palette-presets.md 의 12개, design/editor.md 의 B4).
// 값은 layout.palette 로 저장된다. 키는 layout.ts 의 PALETTE_KEYS 와 floor(널 색 목록)뿐이다.
// 첫째 프리셋 올리브 오후는 engine/data.js 의 DEFAULT_PALETTE 와 같은 값이다: 팔레트가 없는 방의 모습 그대로다.

export type Palette = {
  olive: string;
  accent: string;
  paper: string;
  ink: string;
  wall: string;
  trim: string;
  floor: string[];
  woodB: string;
  woodDark: string;
  leaf: string;
  leaf2: string;
  leafDark: string;
};
export type Preset = { id: string; name: string; palette: Palette };

export const PRESETS: Preset[] = [
  { id: "olive-afternoon", name: "올리브 오후", palette: { olive: "#565344", accent: "#A6613C", paper: "#F3EADB", ink: "#2f2c24", wall: "#EADCC4", trim: "#565344", floor: ["#9a6a43", "#8b5d3a", "#a7774d"], woodB: "#8b5d3a", woodDark: "#6e4a30", leaf: "#6f7d4f", leaf2: "#87925f", leafDark: "#556240" } },
  { id: "clay-evening", name: "점토 저녁", palette: { olive: "#5C4636", accent: "#9A4E2E", paper: "#F2E2D0", ink: "#2E2018", wall: "#D9A98A", trim: "#6B3F2A", floor: ["#6E4B3A", "#624233", "#7A5543"], woodB: "#B58154", woodDark: "#4E3020", leaf: "#7A7A4A", leaf2: "#8F8F5C", leafDark: "#58582F" } },
  { id: "cream-morning", name: "크림 아침", palette: { olive: "#6B6A55", accent: "#D58A5C", paper: "#FBF6EA", ink: "#3A352B", wall: "#FAF3E6", trim: "#B9A98C", floor: ["#C4A272", "#B99767", "#CDAC7C"], woodB: "#8E6B45", woodDark: "#6B4E31", leaf: "#7F9A5E", leaf2: "#98B070", leafDark: "#5F7A45" } },
  { id: "forest-cabin", name: "숲 오두막", palette: { olive: "#3E4A34", accent: "#B5693A", paper: "#EDE6D2", ink: "#26291F", wall: "#8C9A7A", trim: "#3E4A34", floor: ["#6A4B33", "#5E432D", "#755438"], woodB: "#B2865A", woodDark: "#3F2B1B", leaf: "#4F6B3A", leaf2: "#68834A", leafDark: "#37502A" } },
  { id: "night-study", name: "밤 서재", palette: { olive: "#2A3347", accent: "#D69A4A", paper: "#E9E0CC", ink: "#1D2230", wall: "#2F3B52", trim: "#1B2233", floor: ["#7A5A3E", "#6E5037", "#86644A"], woodB: "#C29568", woodDark: "#4A3220", leaf: "#4F6B52", leaf2: "#678568", leafDark: "#38503C" } },
  { id: "cherry-blossom", name: "벚꽃", palette: { olive: "#7B5A55", accent: "#D0708A", paper: "#FFF4F4", ink: "#4A3236", wall: "#F8E4E6", trim: "#A98084", floor: ["#C9A582", "#BF9A78", "#D3B08E"], woodB: "#9A6B52", woodDark: "#75503E", leaf: "#8FAE72", leaf2: "#A9C48C", leafDark: "#5F7E4C" } },
  { id: "lavender-nap", name: "라벤더 낮잠", palette: { olive: "#5A5470", accent: "#C27B8A", paper: "#F6F1F7", ink: "#33304A", wall: "#E8E0F0", trim: "#7C7394", floor: ["#B09878", "#A58D6E", "#BBA384"], woodB: "#8A6A4C", woodDark: "#654C36", leaf: "#7A9A78", leaf2: "#94B093", leafDark: "#587158" } },
  { id: "mint-cafe", name: "민트 카페", palette: { olive: "#3F5E52", accent: "#E0856B", paper: "#FAF6EC", ink: "#2B3A33", wall: "#D8EADF", trim: "#4F6B5C", floor: ["#BCA987", "#A39173", "#BCA987", "#A39173"], woodB: "#8B6B4A", woodDark: "#664D34", leaf: "#6E9A62", leaf2: "#8DB57F", leafDark: "#4B7243" } },
  { id: "snowy-day", name: "눈 오는 날", palette: { olive: "#4A5A66", accent: "#C0504D", paper: "#F5F7F8", ink: "#2B333A", wall: "#E9EEF2", trim: "#6B7B8A", floor: ["#A89684", "#9C8A78", "#B3A18F"], woodB: "#6E5240", woodDark: "#4E382A", leaf: "#5F7F6A", leaf2: "#7A9A84", leafDark: "#42604D" } },
  { id: "seaside-villa", name: "바닷가 별장", palette: { olive: "#3F6B7A", accent: "#E07A5F", paper: "#F7F1E3", ink: "#25363C", wall: "#EDE4D0", trim: "#3F6B7A", floor: ["#B9A58A", "#AD997D", "#C4B197"], woodB: "#7A5F45", woodDark: "#58442F", leaf: "#6F9A7A", leaf2: "#8DB594", leafDark: "#4A7556" } },
  { id: "coffee-cup", name: "커피 한 잔", palette: { olive: "#4A3326", accent: "#C48A4E", paper: "#EFE2CF", ink: "#2A1D15", wall: "#BFA588", trim: "#3E2A1E", floor: ["#4F3829", "#45311F", "#5A4130"], woodB: "#B98B5C", woodDark: "#8A6340", leaf: "#6B7A4A", leaf2: "#85945E", leafDark: "#4E5B33" } },
  { id: "maple-walk", name: "단풍 산책", palette: { olive: "#6A4A2E", accent: "#B8432F", paper: "#F6E9D2", ink: "#33241A", wall: "#E3C29B", trim: "#7A4B2A", floor: ["#8A6240", "#7E5838", "#946D49"], woodB: "#C08850", woodDark: "#5A3A1E", leaf: "#B5702A", leaf2: "#D09A3E", leafDark: "#8A4F1E" } },
];
export const DEFAULT_PALETTE: Palette = PRESETS[0].palette;

// 저장된 layout.palette(빠진 키가 있을 수 있다)를 기본값으로 채운 실제 색.
export function effectivePalette(p: Record<string, unknown> | null | undefined): Palette {
  return { ...DEFAULT_PALETTE, ...(p ?? {}) } as Palette;
}

// 프리셋과 같은 색인지. 대소문자는 가리지 않는다.
const norm = (p: Palette) => JSON.stringify(Object.keys(p).sort().map((k) => [k, String(p[k as keyof Palette]).toLowerCase()]));
export const samePalette = (a: Palette, b: Palette) => norm(a) === norm(b);

// 카드의 여섯 칸: 벽, 바닥, 나무, 포인트, 잎, 종이
export const swatches = (p: Palette) => [p.wall, p.floor[0], p.woodB, p.accent, p.leaf, p.paper];

// 색에 배수를 곱한다 (#RRGGBB, 0..255 로 자른다).
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

// 직접 고르는 네 칸이 바꾸는 키. 한 색에서 나머지를 끌어낸다 (올리브 오후의 비율에서 읽은 배수).
//   벽     → wall
//   바닥   → floor 세 널 [c, c×0.9, c×1.085]   (9a6a43 → 8b5d3a, a7774d 와 거의 같다)
//   포인트 → accent (천, 러그, 화분. 짙은 천 carpetDarker 는 엔진이 accent×0.55 로 만든다)
//   나무   → woodB, woodDark = woodB×0.79    (8b5d3a → 6e4a30)
export type Well = "wall" | "floor" | "accent" | "wood";
export const WELLS: { key: Well; label: string }[] = [
  { key: "wall", label: "벽" },
  { key: "floor", label: "바닥" },
  { key: "accent", label: "포인트" },
  { key: "wood", label: "나무" },
];
export const wellValue = (p: Palette, key: Well) =>
  (key === "floor" ? p.floor[0] : key === "wood" ? p.woodB : p[key]).toLowerCase();
export function withWell(p: Palette, key: Well, c: string): Palette {
  const v = c.toLowerCase();
  if (key === "floor") return { ...p, floor: [v, shade(v, 0.9), shade(v, 1.085)] };
  if (key === "wood") return { ...p, woodB: v, woodDark: shade(v, 0.79) };
  return { ...p, [key]: v };
}
