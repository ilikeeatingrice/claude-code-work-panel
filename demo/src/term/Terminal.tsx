import React from 'react';
import {FONT_MONO} from '../theme';
import {CH, CW, COLS, DIV, FONT_PX, K, ROWS, Screen, Style, TH, TW, BODY_ROWS} from './grid';

// Box-drawing glyphs drawn as lines so they join across cells, like a real terminal.
// value = [up, right, down, left]
const BOX: Record<string, [number, number, number, number]> = {
  '│': [1, 0, 1, 0],
  '─': [0, 1, 0, 1],
  '┌': [0, 1, 1, 0],
  '┐': [0, 0, 1, 1],
  '└': [1, 1, 0, 0],
  '┘': [1, 0, 0, 1],
  '├': [1, 1, 1, 0],
  '┤': [1, 0, 1, 1],
  '┬': [0, 1, 1, 1],
  '┴': [1, 1, 0, 1],
  '┼': [1, 1, 1, 1],
  '╭': [0, 1, 1, 0],
  '╮': [0, 0, 1, 1],
  '╰': [1, 1, 0, 0],
  '╯': [1, 0, 0, 1],
};
const ROUND = new Set(['╭', '╮', '╰', '╯']);

// Block elements as quadrants [UL, UR, LL, LR].
const QUAD: Record<string, [number, number, number, number]> = {
  '█': [1, 1, 1, 1],
  '▐': [0, 1, 0, 1],
  '▌': [1, 0, 1, 0],
  '▀': [1, 1, 0, 0],
  '▄': [0, 0, 1, 1],
  '▛': [1, 1, 1, 0],
  '▜': [1, 1, 0, 1],
  '▙': [1, 0, 1, 1],
  '▟': [0, 1, 1, 1],
  '▝': [0, 1, 0, 0],
  '▘': [1, 0, 0, 0],
  '▗': [0, 0, 0, 1],
  '▖': [0, 0, 1, 0],
};

// Characters JetBrains Mono draws at exactly one cell; everything else gets its own cell box.
const SAFE = /^[\x20-\x7e·…—’]$/;

const colours = (st: Style) => {
  let fg = st.fg ?? K.fg;
  let bg = st.bg;
  if (st.r) {
    const f = fg;
    fg = bg ?? K.bg;
    bg = f;
  }
  return {fg, bg};
};

const key = (st: Style) => `${st.fg}|${st.bg}|${st.b ? 1 : 0}|${st.d ? 1 : 0}|${st.r ? 1 : 0}`;

const Cell: React.FC<{ch: string; st: Style; x: number}> = ({ch, st, x}) => {
  const {fg, bg} = colours(st);
  const base: React.CSSProperties = {position: 'absolute', left: x, top: 0, width: CW, height: bg ? CH + 1 : CH, background: bg};
  const box = BOX[ch];
  if (box) {
    const cx = CW / 2;
    const cy = CH / 2;
    const r = ROUND.has(ch) ? 4 : 0;
    const [u, ri, d, l] = box;
    let path = '';
    if (r && ((u && ri) || (u && l) || (d && ri) || (d && l))) {
      // rounded corner
      const sx = ri ? CW : 0;
      const sy = d ? CH : 0;
      path = `M${sx},${cy} L${cx + (ri ? r : -r)},${cy} Q${cx},${cy} ${cx},${cy + (d ? r : -r)} L${cx},${sy}`;
    } else {
      if (u) path += `M${cx},0 L${cx},${cy} `;
      if (d) path += `M${cx},${cy} L${cx},${CH + 1} `;
      if (l) path += `M0,${cy} L${cx},${cy} `;
      if (ri) path += `M${cx},${cy} L${CW},${cy} `;
    }
    return (
      <svg style={{...base, height: CH + 1, overflow: 'visible'}} width={CW} height={CH + 1} opacity={st.d ? 0.5 : 1}>
        <path d={path} stroke={fg} strokeWidth={1.3} fill="none" />
      </svg>
    );
  }
  const q = QUAD[ch];
  if (q) {
    const w = CW / 2;
    const h = CH / 2;
    return (
      <svg style={{...base, overflow: 'visible'}} width={CW} height={CH}>
        {q[0] ? <rect x={-0.4} y={-0.4} width={w + 0.8} height={h + 0.8} fill={fg} /> : null}
        {q[1] ? <rect x={w - 0.4} y={-0.4} width={w + 0.8} height={h + 0.8} fill={fg} /> : null}
        {q[2] ? <rect x={-0.4} y={h - 0.4} width={w + 0.8} height={h + 0.8} fill={fg} /> : null}
        {q[3] ? <rect x={w - 0.4} y={h - 0.4} width={w + 0.8} height={h + 0.8} fill={fg} /> : null}
      </svg>
    );
  }
  return (
    <span
      style={{
        ...base,
        color: fg,
        fontWeight: st.b ? 700 : 400,
        opacity: st.d ? 0.55 : 1,
        textAlign: 'center',
        overflow: 'visible',
      }}
    >
      {ch}
    </span>
  );
};

const Row: React.FC<{cells: Screen['cells'][number]; c0: number; c1: number}> = ({cells, c0, c1}) => {
  const out: React.ReactNode[] = [];
  let c = c0;
  while (c < c1) {
    const {ch, st} = cells[c];
    if (!SAFE.test(ch)) {
      out.push(<Cell key={c} ch={ch} st={st} x={(c - c0) * CW} />);
      c++;
      continue;
    }
    const k = key(st);
    let e = c + 1;
    while (e < c1 && SAFE.test(cells[e].ch) && key(cells[e].st) === k) e++;
    const text = cells
      .slice(c, e)
      .map((x) => x.ch)
      .join('');
    const {fg, bg} = colours(st);
    const blank = text.trim() === '';
    if (!(blank && !bg)) {
      out.push(
        <span
          key={c}
          style={{
            position: 'absolute',
            left: (c - c0) * CW,
            top: 0,
            width: (e - c) * CW,
            height: bg ? CH + 1 : CH,
            background: bg,
            color: fg,
            fontWeight: st.b ? 700 : 400,
            opacity: st.d ? 0.55 : 1,
            whiteSpace: 'pre',
          }}
        >
          {blank ? '' : text}
        </span>,
      );
    }
    c = e;
  }
  return <>{out}</>;
};

/** Region renderer: rows r0..r1, cols c0..c1. */
const Region: React.FC<{
  screen: Screen;
  r0: number;
  r1: number;
  c0: number;
  c1: number;
  rowShift?: Record<number, number>;
  style?: React.CSSProperties;
}> = ({screen, r0, r1, c0, c1, rowShift, style}) => (
  <div style={{position: 'absolute', left: c0 * CW, top: r0 * CH, width: (c1 - c0) * CW, height: (r1 - r0) * CH, ...style}}>
    {Array.from({length: r1 - r0}, (_, i) => r0 + i).map((r) => (
      <div
        key={r}
        style={{
          position: 'absolute',
          left: 0,
          top: (r - r0) * CH,
          width: (c1 - c0) * CW,
          height: CH,
          transform: rowShift?.[r] ? `translateX(${rowShift[r]}px)` : undefined,
        }}
      >
        <Row cells={screen.cells[r]} c0={c0} c1={c1} />
      </div>
    ))}
  </div>
);

export type Sweep = {p: number; old: Screen};

export const Terminal: React.FC<{screen: Screen; sweep?: Sweep; panelShift?: Record<number, number>}> = ({
  screen,
  sweep,
  panelShift,
}) => (
  <div
    style={{
      position: 'relative',
      width: TW,
      height: TH,
      background: K.bg,
      fontFamily: FONT_MONO,
      fontSize: FONT_PX,
      lineHeight: `${CH}px`,
      overflow: 'hidden',
      fontVariantLigatures: 'none',
    }}
  >
    <div style={{position: 'absolute', left: DIV * CW, top: 0, width: (COLS - DIV) * CW, height: BODY_ROWS * CH, background: K.panelBg}} />
    <Region screen={screen} r0={0} r1={BODY_ROWS} c0={0} c1={DIV} />
    <Region screen={screen} r0={0} r1={BODY_ROWS} c0={DIV} c1={COLS} rowShift={panelShift} />
    <Region screen={screen} r0={BODY_ROWS} r1={ROWS} c0={0} c1={COLS} />
    {sweep && sweep.p < 1 ? (
      <>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: DIV * CW,
            height: BODY_ROWS * CH,
            background: K.bg,
            clipPath: `inset(0 0 0 ${sweep.p * 100}%)`,
          }}
        >
          <Region screen={sweep.old} r0={0} r1={BODY_ROWS} c0={0} c1={DIV} />
        </div>
        {sweep.p > 0 ? (
          <div
            style={{
              position: 'absolute',
              left: sweep.p * DIV * CW - 1,
              top: 0,
              width: 2,
              height: BODY_ROWS * CH,
              background: K.lavender,
              opacity: 0.8,
            }}
          />
        ) : null}
      </>
    ) : null}
  </div>
);
