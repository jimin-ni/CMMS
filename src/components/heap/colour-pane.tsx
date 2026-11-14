"use client";

// 꾸미기 색·무늬 탭 (design/editor.md 의 B10, 색 묶음 C1).
//   팔레트 카드: 내 색(브랜드 색으로 만든 팔레트)과 프리셋. 카드 위에 올리면(또는 초점) 방에 미리 칠하고, 떠나면 되돌린다. 누르면 한 걸음으로 칠한다.
//   내 색: 브랜드 색 1~3개 (색 고르기 + #RRGGBB 입력). 고친 색은 내 색 카드를 누를 때 팔레트와 함께 저장된다 (layout.brand).
//   직접: 벽, 바닥, 포인트, 나무 네 칸.
//   배경: 시간 따라(기본) 또는 고른 색 한 가지나 위아래 두 가지 (layout.backdrop). 브랜드 색은 칩으로 바로 고른다.
// 팔레트와 배경은 엔진이 그 자리에서 다시 칠한다 (engine/recolour.js, time.js). 다시 마운트하지 않는다.
import { useEffect, useRef, useState } from "react";
import { brandPalette, cleanBrand, BRAND_MAX } from "./brand-palette";
import { PRESETS, WELLS, effectivePalette, samePalette, swatches, wellValue, withWell, type Palette, type Well } from "./palettes";

const HEX = /^#[0-9a-fA-F]{6}$/;
export type Backdrop = { mode: "colour"; top: string; bottom?: string } | null;

// 직접 고르는 색 한 칸. 고르는 동안은 칸만 바뀌고, 고르기를 마치면(change) onCommit 한다.
function ColorWell({ label, value, onCommit, disabled }: { label: string; value: string; onCommit: (v: string) => void; disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = () => onCommit(el.value);
    el.addEventListener("change", h);
    return () => el.removeEventListener("change", h);
  }, [onCommit]);
  return (
    <label className="ed-well">
      <span>{label}</span>
      <input ref={ref} type="color" value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} aria-label={`${label} 색`} />
    </label>
  );
}

// 브랜드 색 한 줄: 색 고르기와 #RRGGBB 글자. 둘 중 어느 쪽을 고쳐도 같은 값이다.
function BrandRow({ value, index, onChange, onRemove, disabled }: { value: string; index: number; onChange: (v: string) => void; onRemove: (() => void) | null; disabled: boolean }) {
  // 바깥 값이 바뀌면(다른 칸, 되돌리기) 글자를 맞춘다. 렌더 중에 맞추는 React 의 방식 (effect 로 맞추지 않는다)
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }
  return (
    <div className="ed-brandrow">
      <input type="color" value={HEX.test(value) ? value.toLowerCase() : "#000000"} disabled={disabled} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`브랜드 색 ${index + 1}`} />
      <input
        type="text"
        value={text}
        maxLength={7}
        spellCheck={false}
        disabled={disabled}
        aria-label={`브랜드 색 ${index + 1} 값`}
        onChange={(e) => {
          const t = e.target.value.trim();
          const v = t.startsWith("#") ? t : `#${t}`;
          setText(t);
          if (HEX.test(v)) onChange(v.toUpperCase());
        }}
        onBlur={() => setText(value)}
      />
      {onRemove && (
        <button type="button" className="ed-x" onClick={onRemove} disabled={disabled} aria-label={`브랜드 색 ${index + 1} 빼기`}>
          ×
        </button>
      )}
    </div>
  );
}

export function ColourPane({
  palette,
  brand,
  backdrop,
  busy,
  cmd,
}: {
  palette: Record<string, unknown> | null;
  brand: string[] | null;
  backdrop: Backdrop;
  busy: boolean;
  cmd: (detail: Record<string, unknown>) => void;
}) {
  const pal = effectivePalette(palette);
  const activePreset = PRESETS.find((p) => samePalette(p.palette, pal))?.id ?? null;

  // 브랜드 색: 저장된 값(되돌리기로 바뀔 수 있다)에서 시작하고, 고치는 동안은 이 화면에만 있다
  const savedBrand = cleanBrand(brand);
  const savedKey = savedBrand.join(",");
  const [draft, setDraft] = useState<string[]>(savedBrand.length ? savedBrand : ["#565344"]);
  const [seenKey, setSeenKey] = useState(savedKey);
  if (seenKey !== savedKey) {
    setSeenKey(savedKey);
    if (savedKey) setDraft(savedKey.split(","));
  }
  const mine = brandPalette(draft);
  const mineActive = !!mine && samePalette(mine.palette, pal) && savedKey === cleanBrand(draft).join(",");

  const hover = (p: Palette | null) => cmd({ op: "palhover", palette: p });
  const apply = (p: Palette, withBrand?: string[]) => {
    if (samePalette(p, pal) && (!withBrand || withBrand.join(",") === savedKey)) return;
    cmd({ op: "palette", palette: p, ...(withBrand ? { brand: withBrand } : {}) });
  };
  const commitWell = (key: Well) => (v: string) => {
    if (HEX.test(v)) apply(effectivePalette(withWell(pal, key, v)));
  };
  // 카드 하나의 미리보기 핸들러: 올리거나 초점을 받으면 칠하고, 떠나면 되돌린다
  const previewProps = (p: Palette) => ({
    onPointerEnter: () => !busy && hover(p),
    onPointerLeave: () => hover(null),
    onFocus: () => !busy && hover(p),
    onBlur: () => hover(null),
  });

  // 배경
  const setBackdrop = (b: Backdrop) => cmd({ op: "backdrop", value: b });
  const bdTop = backdrop?.top ?? "#565344";
  const chips = cleanBrand(draft);

  return (
    <div className="ed-pane ed-palpane">
      <div className="ed-strip">
        <button
          type="button"
          className="ed-palcard mine"
          aria-pressed={mineActive}
          disabled={busy || !mine}
          onClick={() => mine && apply(mine.palette, cleanBrand(draft))}
          {...(mine ? previewProps(mine.palette) : {})}
          title={mine?.adjusted.length ? "바닥과 구분되도록 색을 조금 조정했어요" : "넣은 브랜드 색으로 만든 팔레트"}
        >
          <span className="ed-sw" aria-hidden="true">
            {(mine ? swatches(mine.palette) : []).map((c, i) => (
              <i key={i} style={{ background: c }} />
            ))}
          </span>
          내 색{mine?.adjusted.length ? <small> · 조금 조정함</small> : null}
        </button>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="ed-palcard"
            aria-pressed={activePreset === p.id}
            disabled={busy}
            onClick={() => apply(p.palette)}
            {...previewProps(p.palette)}
          >
            <span className="ed-sw" aria-hidden="true">
              {swatches(p.palette).map((c, i) => (
                <i key={i} style={{ background: c }} />
              ))}
            </span>
            {p.name}
          </button>
        ))}
      </div>
      <div className="ed-brand" aria-label="내 색">
        <span className="ed-wells-h">내 색</span>
        {draft.map((c, i) => (
          <BrandRow
            key={i}
            index={i}
            value={c}
            disabled={busy}
            onChange={(v) => setDraft((d) => d.map((x, j) => (j === i ? v : x)))}
            onRemove={draft.length > 1 ? () => setDraft((d) => d.filter((_, j) => j !== i)) : null}
          />
        ))}
        {draft.length < BRAND_MAX && (
          <button type="button" className="ed-link" disabled={busy} onClick={() => setDraft((d) => [...d, d[d.length - 1]])}>
            + 색 더하기
          </button>
        )}
      </div>
      <div className="ed-wells" aria-label="직접 고르기">
        <span className="ed-wells-h">직접</span>
        {WELLS.map((w) => (
          <ColorWell key={`${w.key}:${wellValue(pal, w.key)}`} label={w.label} value={wellValue(pal, w.key)} disabled={busy} onCommit={commitWell(w.key)} />
        ))}
      </div>
      <div className="ed-backdrop" aria-label="배경">
        <span className="ed-wells-h">배경</span>
        <div className="ed-bdmodes">
          <button type="button" className="ed-chip" aria-pressed={!backdrop} disabled={busy} onClick={() => setBackdrop(null)}>
            시간 따라
          </button>
          <button type="button" className="ed-chip" aria-pressed={!!backdrop} disabled={busy} onClick={() => !backdrop && setBackdrop({ mode: "colour", top: chips[0] ?? pal.olive })}>
            색
          </button>
        </div>
        {backdrop && (
          <>
            <div className="ed-bdrow">
              <ColorWell key={`top:${bdTop}`} label="위" value={bdTop.toLowerCase()} disabled={busy} onCommit={(v) => HEX.test(v) && setBackdrop({ ...backdrop, top: v.toUpperCase() })} />
              {backdrop.bottom ? (
                <ColorWell key={`bottom:${backdrop.bottom}`} label="아래" value={backdrop.bottom.toLowerCase()} disabled={busy} onCommit={(v) => HEX.test(v) && setBackdrop({ ...backdrop, bottom: v.toUpperCase() })} />
              ) : null}
            </div>
            <div className="ed-bdrow">
              {chips.map((c) => (
                <button key={c} type="button" className="ed-dot" style={{ background: c }} disabled={busy} title={`${c} 한 색으로`} aria-label={`배경을 ${c} 한 색으로`} onClick={() => setBackdrop({ mode: "colour", top: c })} />
              ))}
              <button
                type="button"
                className="ed-link"
                disabled={busy}
                onClick={() => setBackdrop(backdrop.bottom ? { mode: "colour", top: backdrop.top } : { mode: "colour", top: backdrop.top, bottom: chips.find((c) => c !== backdrop.top) ?? pal.paper.toUpperCase() })}
              >
                {backdrop.bottom ? "한 색으로" : "두 색으로"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
