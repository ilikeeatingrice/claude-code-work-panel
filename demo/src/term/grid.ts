// A fixed monospace cell grid that mimics the Claude Code fullscreen TUI.
// Colours are the 24-bit values Claude Code 2.1.x prints (taken from real captures).

export const COLS = 168;
export const ROWS = 45;
export const DIV = 108; // the panel's │ divider column
export const P0 = DIV + 1; // first panel content column
export const PW = COLS - P0; // panel content width (59)
export const CHAT_W = DIV; // chat columns 0..107
export const BODY_ROWS = ROWS - 4; // rows above the prompt box rules (0..40)

export const CW = 11; // cell width in px
export const CH = 21; // cell height in px
export const FONT_PX = 18.3;
export const TW = COLS * CW; // 1848
export const TH = ROWS * CH; // 945

export const K = {
  bg: '#0e0e0e', // terminal default background
  fg: '#e4e4e4', // terminal default foreground
  white: '#ffffff',
  grey: '#999999',
  rule: '#888888',
  orange: '#d77757', // Claude orange: logo, spinner
  orangeLight: '#eb9f7f',
  lavender: '#b1b9f9', // panel divider, button, code spans
  panelBg: '#262626',
  userBg: '#373737',
  amber: '#e0a85a', // THIS SESSION
  teal: '#6fb7b9', // "this roadmap", panel status line
  green: '#4eba65', // successful tool dot
  pink: '#ff6b80', // bypass permissions
  black: '#000000',
};

export type Style = {fg?: string; bg?: string; b?: boolean; d?: boolean; r?: boolean};
export type Seg = {t: string; st?: Style};
export type Line = {segs: Seg[]; bg?: string};

export const seg = (t: string, st?: Style): Seg => ({t, st});

/** Parse tiny inline markup: `code` -> lavender, **bold** -> bold. */
export const rich = (text: string, base: Style = {}): Seg[] => {
  const out: Seg[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({t: text.slice(last, m.index), st: base});
    const tok = m[0];
    if (tok.startsWith('`')) out.push({t: tok.slice(1, -1), st: {...base, fg: K.lavender}});
    else out.push({t: tok.slice(2, -2), st: {...base, b: true}});
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push({t: text.slice(last), st: base});
  return out;
};

const len = (segs: Seg[]) => segs.reduce((n, s) => n + [...s.t].length, 0);

/** Word-wrap segments to `width` columns. Continuation lines start with `indent` spaces. */
export const wrap = (segs: Seg[], width: number, indent = 0, prefix: Seg[] = []): Seg[][] => {
  // explode into words that keep their style
  const words: Seg[] = [];
  for (const s of segs) {
    for (const part of s.t.split(/( )/)) if (part) words.push({t: part, st: s.st});
  }
  const lines: Seg[][] = [];
  let cur: Seg[] = [...prefix];
  let n = len(cur);
  for (const w of words) {
    const wl = [...w.t].length;
    if (n + wl > width && w.t !== ' ' && n > indent) {
      lines.push(cur);
      cur = indent ? [{t: ' '.repeat(indent)}] : [];
      n = indent;
    }
    if (w.t === ' ' && n === indent && lines.length) continue;
    cur.push(w);
    n += wl;
  }
  lines.push(cur);
  return lines;
};

/** The whole screen as rows of styled cells. */
export class Screen {
  cells: {ch: string; st: Style}[][];
  constructor() {
    this.cells = Array.from({length: ROWS}, () => Array.from({length: COLS}, () => ({ch: ' ', st: {}})));
  }
  fillBg(row: number, c0: number, c1: number, bg: string) {
    if (row < 0 || row >= ROWS) return;
    for (let c = Math.max(0, c0); c < Math.min(COLS, c1); c++) this.cells[row][c] = {ch: ' ', st: {bg}};
  }
  put(row: number, col: number, segs: Seg[], base: Style = {}, maxCol = COLS) {
    if (row < 0 || row >= ROWS) return col;
    let c = col;
    for (const s of segs) {
      for (const ch of s.t) {
        if (c >= maxCol) return c;
        const under = this.cells[row][c].st;
        this.cells[row][c] = {ch, st: {bg: under.bg, ...base, ...(s.st ?? {})}};
        c++;
      }
    }
    return c;
  }
  /** Put text right-aligned so it ends at column `endCol` (exclusive). */
  putRight(row: number, endCol: number, segs: Seg[], base: Style = {}) {
    return this.put(row, endCol - len(segs), segs, base);
  }
}

export const textLen = len;
