// Claude Code TUI building blocks, modelled on real 2.1.x captures.
import {BODY_ROWS, CHAT_W, COLS, DIV, K, Line, P0, PW, ROWS, Screen, Seg, Style, rich, seg, textLen, wrap} from './grid';

const TEXT_W = CHAT_W - 3; // wrap width for chat text

/* ---------------- chat blocks ---------------- */

export type Block = {id?: string; lines: Line[]};

const L = (...segs: Seg[]): Line => ({segs});
const blank: Line = {segs: []};

export const header = (): Block => ({
  id: 'header',
  lines: [
    blank,
    L(seg(' ▐', {fg: K.orange}), seg('▛███▜', {fg: K.orange, bg: K.black}), seg('▌   ', {fg: K.orange}), seg('Claude Code ', {b: true}), seg('v2.1.292', {fg: K.grey})),
    L(seg('▝▜', {fg: K.orange}), seg('█████', {fg: K.orange, bg: K.black}), seg('▛▘  ', {fg: K.orange}), seg('Sonnet 5.5 with high effort · Claude Max', {fg: K.grey})),
    L(seg('  ▘▘ ▝▝    ', {fg: K.orange}), seg('~/shop', {fg: K.grey})),
    blank,
  ],
});

/** A user turn: grey ❯, white text, on the #373737 band. */
export const user = (text: string, id?: string): Block => {
  const lines = wrap(rich(text, {fg: K.white}), TEXT_W, 2, [seg('❯ ', {fg: K.grey})]);
  return {id, lines: lines.map((segs) => ({segs, bg: K.userBg}))};
};

/** A prompt submitted by the plugin between turns. */
export const pluginPrompt = (paragraphs: string[], id?: string): Block => {
  const lines: Line[] = [L(seg('› Prompt from the work-panel plugin', {fg: K.grey}))];
  lines.push({segs: [seg('❯ ', {fg: K.grey}), seg('The work-panel plugin sent a message:', {fg: K.white})], bg: K.userBg});
  for (const p of paragraphs) {
    if (!p) {
      lines.push({segs: [], bg: K.userBg});
      continue;
    }
    const lead = p.match(/^ */)![0].length;
    for (const segs of wrap(rich(p.trimStart(), {fg: K.white}), TEXT_W, 2, [seg(' '.repeat(2 + lead))])) {
      lines.push({segs, bg: K.userBg});
    }
  }
  return {id, lines};
};

export const slashResult = (text: string): Line => L(seg('  ⎿  ', {fg: K.grey}), seg(text));

export const tool = (name: string, args: string, dot: string = K.green): Line =>
  L(seg('● ', {fg: dot}), seg(name, {b: true}), seg(`(${args})`));

export const result = (text: string): Line => L(seg('  ⎿  ', {fg: K.grey}), ...rich(text));

/** "Ran 1 shell command" style summary rows: grey, numbers bold. */
export const collapsed = (text: string): Line => L(seg('  '), ...rich(text, {fg: K.grey}));

/** Assistant prose: white ● then wrapped text. */
export const say = (text: string): Line[] => wrap(rich(text), TEXT_W, 2, [seg('● ', {fg: K.white})]).map((segs) => ({segs}));

export const indent = (text: string, st: Style = {}): Line[] => wrap(rich(text, st), TEXT_W, 2, [seg('  ')]).map((segs) => ({segs}));

export const raw = (text: string, st: Style = {}): Line => L(seg(text, st));

export const doneLine = (text: string): Line => L(seg(`✻ ${text}`, {fg: K.grey}));

export const block = (id: string | undefined, ...parts: (Line | Line[])[]): Block => ({id, lines: parts.flat()});

/* ---------------- panel ---------------- */

export type PanelRow = {
  glyph: string;
  id: string;
  title: string;
  dim?: boolean;
  sel?: boolean;
  sub?: string;
  pulse?: number; // 0..1, a live heartbeat dot before the sub-line
};

export type PanelState = {
  focused: boolean;
  roadmaps: number;
  thisSession?: string;
  roadmap?: {open: boolean; focus?: boolean; right: string; teal?: boolean};
  rows?: PanelRow[];
  done?: number;
  button?: {label: string; rev?: boolean};
  status?: string; // teal line in place of the button
  hint?: string;
  empty?: string[];
};

const mix = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

export const drawPanel = (s: Screen, p: PanelState): Record<string, number> => {
  const rowsOf: Record<string, number> = {};
  for (let r = 0; r < BODY_ROWS; r++) s.fillBg(r, DIV, COLS, K.panelBg);
  for (let r = 0; r < BODY_ROWS; r++) s.put(r, DIV, [seg('│', p.focused ? {fg: K.lavender} : {d: true})]);
  s.put(0, COLS - 2, [seg('✕', {fg: K.grey})]);
  s.put(1, P0, [seg('WORK', {b: true})]);
  if (!p.empty) s.putRight(1, COLS, [seg(`${p.roadmaps} ${p.roadmaps === 1 ? 'roadmap' : 'roadmaps'} · /work hides`, {fg: K.grey})]);
  let r = 3;
  if (p.thisSession) {
    s.put(r++, P0, [seg('▲ THIS SESSION', {fg: K.amber})]);
    rowsOf.thisSession = r;
    s.put(r++, P0, [seg(p.thisSession)]);
    r++;
  }
  if (p.empty) {
    // [dim line, normal line], separated by a blank row, wrapped to the panel width
    s.put(r++, P0, [seg(p.empty[0], {d: true})]);
    r++;
    for (const ln of wrap([seg(p.empty[1])], PW - 1)) s.put(r++, P0, ln);
  }
  if (p.roadmap) {
    rowsOf.roadmap = r;
    s.put(r, P0, [seg(`${p.roadmap.open ? '▾' : '▸'} 001 cart`, p.roadmap.focus ? {r: true} : {})]);
    s.putRight(r, COLS, [seg(p.roadmap.right, {fg: p.roadmap.teal ? K.teal : K.grey})]);
    r++;
    if (p.roadmap.open) {
      for (const t of p.rows ?? []) {
        rowsOf[t.id] = r;
        const text = `  ${t.sel ? '▶' : t.glyph} ${t.id}  ${t.title}`;
        const st: Style = t.sel ? {r: true} : t.dim ? {fg: K.grey} : {};
        s.put(r, P0, [seg(text, st)]);
        r++;
        if (t.sub) {
          const segs: Seg[] = [seg('         ')];
          if (t.pulse !== undefined) segs.push(seg('● ', {fg: mix('#55605f', '#7aa3a4', t.pulse)}));
          segs.push(seg(t.sub, {fg: K.grey}));
          s.put(r++, P0, segs);
        }
      }
      if (p.done) s.put(r++, P0, [seg(`  ✓ ${p.done} done`, {fg: K.grey})]);
    }
    r++;
  }
  if (p.button) {
    rowsOf.button = r;
    s.put(r++, P0, [seg(`[ ${p.button.label} ]`, {fg: K.lavender, b: true, r: p.button.rev})]);
  } else if (p.status) {
    rowsOf.button = r;
    s.put(r++, P0, [seg(p.status, {fg: K.teal})]);
  }
  if (p.hint) {
    rowsOf.hint = r;
    s.put(r++, P0, [seg(p.hint, {fg: K.grey})]);
  }
  rowsOf.end = r;
  return rowsOf;
};

/* ---------------- prompt box + footer ---------------- */

export const drawPrompt = (s: Screen, input: string, cursor = true) => {
  const rule = '─'.repeat(COLS);
  s.put(ROWS - 4, 0, [seg(rule, {fg: K.rule})]);
  s.put(ROWS - 2, 0, [seg(rule, {fg: K.rule})]);
  if (input) {
    const c = s.put(ROWS - 3, 0, [seg('❯ '), seg(input)]);
    if (cursor) s.put(ROWS - 3, c, [seg(' ', {r: true})]);
  } else {
    s.put(ROWS - 3, 0, [seg('❯ '), seg(' ', {r: cursor}), seg('Try "fix typecheck errors"', {d: true})]);
  }
  s.put(ROWS - 1, 2, [
    seg('-- INSERT -- ', {fg: K.grey}),
    seg('⏵⏵ bypass permissions on', {fg: K.pink}),
    seg(' (shift+tab to cycle)', {fg: K.grey}),
  ]);
};

const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];

export const spinnerLine = (frame: number, verb: string, detail: string): Line => {
  const g = SPIN[Math.floor(frame / 3) % SPIN.length];
  // a soft shimmer moves across the verb, like the real spinner
  const w = [...verb].length;
  const hot = Math.floor(frame / 2) % (w + 6);
  const verbSegs: Seg[] = [...verb].map((ch, i) => seg(ch, {fg: Math.abs(i - hot) <= 1 ? K.orangeLight : K.orange}));
  return {segs: [seg(`${g} `, {fg: K.orange}), ...verbSegs, seg(' '), seg(`(${detail})`, {fg: K.grey})]};
};

/* ---------------- chat layout ---------------- */

/** Lay the chat out like the fullscreen TUI: top-aligned, scrolled to the bottom when full. */
export const drawChat = (s: Screen, blocks: Block[], spinner?: Line): Record<string, [number, number]> => {
  const lines: Line[] = [];
  const spans: Record<string, [number, number]> = {};
  blocks.forEach((b, i) => {
    const start = lines.length;
    lines.push(...b.lines);
    if (b.id) spans[b.id] = [start, lines.length - 1];
    if (i < blocks.length - 1 && b.id !== 'header') lines.push(blank);
  });
  const avail = spinner ? BODY_ROWS - 3 : BODY_ROWS;
  const off = Math.max(0, lines.length - avail);
  lines.slice(off).forEach((ln, i) => {
    if (ln.bg) s.fillBg(i, 0, DIV, ln.bg);
    s.put(i, 0, ln.segs, {}, DIV - 1);
  });
  if (spinner) s.put(BODY_ROWS - 2, 0, spinner.segs, {}, DIV - 1);
  const out: Record<string, [number, number]> = {};
  for (const [k, [a, b]] of Object.entries(spans)) out[k] = [a - off, b - off];
  return out;
};

export {textLen};
