"use client";

// 가구 하나만 따로 칠하기 (색 묶음 C2). 고른 가구 위 막대(#ed-bar)의 「색」이 여는 작은 창이다.
// 그 가구의 부분(나무, 천, 금속 …: 카탈로그의 parts)마다 한 줄: 방 팔레트의 색, 주인의 브랜드 색(내 색), 직접 고르기, 팔레트 색으로 되돌리기.
// 칸 위에 올리거나 직접 고르는 동안은 방에 미리 칠하고(parthover, 걸음이 아니다), 누르거나 고르기를 마치면 한 걸음으로 칠한다(part).
// 칠하지 않은 부분은 방 팔레트를 따른다. Kenney 모델만 부분을 갖는다: 손으로 만드는 가구와 크리스마스 키트는 이 단추가 없다.
import { useEffect, useRef } from "react";
import { PART_KEYS, PART_LABEL, type PartKey } from "@/lib/heap/parts";
import { effectivePalette, swatches } from "./palettes";

const HEX = /^#[0-9a-fA-F]{6}$/;
const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

// 방 팔레트에서 고를 색: 카드의 여섯 칸 + 올리브, 테두리, 짙은 나무 (겹치는 것은 한 번)
function paletteChoices(palette: Record<string, unknown> | null): string[] {
  const p = effectivePalette(palette);
  const out: string[] = [];
  for (const c of [...swatches(p), p.olive, p.trim, p.woodDark, p.ink]) if (!out.some((o) => same(o, c))) out.push(c);
  return out;
}

// 직접 고르기: 고르는 동안(input)은 미리 칠하고, 마치면(change) 칠한다
function Picker({ value, label, onPreview, onCommit }: { value: string; label: string; onPreview: (v: string) => void; onCommit: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const cb = useRef({ onPreview, onCommit });
  useEffect(() => {
    cb.current = { onPreview, onCommit };
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const input = () => cb.current.onPreview(el.value);
    const change = () => cb.current.onCommit(el.value);
    el.addEventListener("input", input);
    el.addEventListener("change", change);
    return () => {
      el.removeEventListener("input", input);
      el.removeEventListener("change", change);
    };
  }, []);
  // 값은 바깥(지금 보이는 색)을 따른다. 고르는 동안 브라우저가 바꾸는 값은 그대로 둔다 (defaultValue + key)
  return <input ref={ref} key={value} type="color" defaultValue={HEX.test(value) ? value.toLowerCase() : "#888888"} aria-label={label} title="직접 고르기" />;
}

export function PieceColour({
  index,
  parts,
  colors,
  shown,
  palette,
  brand,
  cmd,
}: {
  index: number;
  // 이 모델이 가진 부분 (카탈로그의 parts) · 칠한 색 (item.colors) · 지금 보이는 색 (엔진의 partColours)
  parts: string[];
  colors: Record<string, string> | undefined;
  shown: Record<string, string> | null;
  palette: Record<string, unknown> | null;
  brand: string[] | null;
  cmd: (detail: Record<string, unknown>) => void;
}) {
  const keys = PART_KEYS.filter((k) => parts.includes(k));
  const pal = paletteChoices(palette);
  const mine = (brand ?? []).filter((c) => HEX.test(c) && !pal.some((p) => same(p, c)));
  // 창이 닫히면(가구를 바꾸거나 끌기 시작) 미리 칠한 것을 거둔다
  useEffect(() => () => cmd({ op: "parthover", index, colour: null }), [cmd, index]);
  // 막대 위에 자리가 없으면(막대가 위 막대에 가깝다) 막대 아래로 연다. 막대의 자리는 엔진이 프레임마다 바꾸므로 프레임마다 본다
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = box.current, bar = el?.parentElement, top = el?.closest(".heap-room")?.querySelector(".ed-top");
      if (el && bar) {
        const below = bar.getBoundingClientRect().top - el.offsetHeight - 6 < (top?.getBoundingClientRect().bottom ?? 0);
        if (below !== (el.dataset.below === "1")) el.dataset.below = below ? "1" : "";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const preview = (part: PartKey, colour: string | null) => cmd({ op: "parthover", index, part, colour });
  const commit = (part: PartKey, colour: string | null) => cmd({ op: "part", index, part, colour });
  const dot = (part: PartKey, c: string, own: string | undefined) => (
    <button
      key={c}
      type="button"
      className="ed-pdot"
      style={{ background: c }}
      aria-pressed={same(own, c)}
      title={c.toUpperCase()}
      aria-label={`${PART_LABEL[part]}을(를) ${c.toUpperCase()}(으)로`}
      onPointerEnter={() => preview(part, c.toUpperCase())}
      onPointerLeave={() => preview(part, null)}
      onFocus={() => preview(part, c.toUpperCase())}
      onBlur={() => preview(part, null)}
      onClick={() => commit(part, c.toUpperCase())}
    />
  );

  return (
    <div ref={box} className="ed-paint" role="dialog" aria-label="이 가구의 색">
      {keys.map((part) => {
        const own = colors?.[part];
        const now = own ?? shown?.[part] ?? "";
        return (
          <div key={part} className="ed-prow">
            <span className="ed-plbl">
              <i style={{ background: now || "transparent" }} aria-hidden="true" />
              {PART_LABEL[part]}
            </span>
            <span className="ed-pdots" role="group" aria-label={`${PART_LABEL[part]}: 방 팔레트의 색`}>
              {pal.map((c) => dot(part, c, own))}
            </span>
            {mine.length > 0 && (
              <span className="ed-pdots mine" role="group" aria-label={`${PART_LABEL[part]}: 내 색`}>
                {mine.map((c) => dot(part, c, own))}
              </span>
            )}
            <Picker value={now} label={`${PART_LABEL[part]} 직접 고르기`} onPreview={(v) => preview(part, v.toUpperCase())} onCommit={(v) => commit(part, v.toUpperCase())} />
            {own ? (
              <button type="button" className="ed-preset" onClick={() => commit(part, null)} title="이 부분을 방 팔레트의 색으로 되돌려요">
                팔레트 색
              </button>
            ) : (
              <span className="ed-pnote">팔레트</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
