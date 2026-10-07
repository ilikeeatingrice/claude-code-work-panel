// The story, frame by frame, on the beat grid in beat.ts.
import {at, FPB, SECTIONS as S} from './beat';
import {
  Block,
  PanelRow,
  PanelState,
  block,
  collapsed,
  doneLine,
  drawChat,
  drawPanel,
  drawPrompt,
  header,
  pluginPrompt,
  result,
  say,
  slashResult,
  spinnerLine,
  tool,
  user,
  raw,
  indent,
} from './term/cc';
import {COLS, DIV, K, Line, ROWS, Screen} from './term/grid';

/* ---------------- text from the real /work create run (sanitised) ---------------- */

const DESIGN_USER =
  'I want to rework the cart. Totals are computed in three places, there is no guest checkout, coupons are bolted on, and failed payments just fail.';

const DESIGN_REPLY = [
  'Here is a design in four slices:',
  '  1. Compute cart totals in one function.',
  '  2. Guest checkout without an account.',
  '  3. Apply coupon codes after totals. This builds on 1.',
  '  4. Retry failed payments up to 3 times with backoff. This comes after 2.',
  '  1 and 2 can start now. Want me to turn this into a roadmap?',
];

const CREATE_MSG = [
  'Create a roadmap named "cart" from the design we discussed in this conversation. Follow the "Create a roadmap from a design" steps of the roadmap skill (work-panel:roadmap): write the PLAN.md, cut the slices, show me the dry-run preview, and wait for my OK before anything is written.',
];

const TABLE = [
  '┌─────────────┬──────────────────────────────────────────────────┬────────────────────┐',
  '│    Task     │                      Title                       │      Waits on      │',
  '├─────────────┼──────────────────────────────────────────────────┼────────────────────┤',
  '│ TASK-001    │ Cart (the parent, stands for the whole plan)     │ nothing            │',
  '│ TASK-001.01 │ Compute cart totals in one function              │ nothing, ready now │',
  '│ TASK-001.02 │ Guest checkout without an account                │ nothing, ready now │',
  '│ TASK-001.03 │ Apply coupon codes after totals                  │ TASK-001.01        │',
  '│ TASK-001.04 │ Retry failed payments up to 3 times with backoff │ TASK-001.02        │',
  '└─────────────┴──────────────────────────────────────────────────┴────────────────────┘',
];

const SURFACES = "This is how Claude Code surfaces a prompt a plugin submits between turns — it starts this turn in the user's place. Address the message above.";

const START_01 = [
  'Start TASK-001.01 (Compute cart totals in one function). Roadmap: cart (TASK-001). Use the roadmap skill (work-panel:roadmap).',
  '',
  SURFACES,
];

const START_02_NOTE = [
  'Start TASK-001.02 (Guest checkout without an account). Roadmap: cart (TASK-001). Use the roadmap skill (work-panel:roadmap).',
  '',
  'This continues the same roadmap. The previous session just handed off TASK-001.01; its full note is the latest comment on TASK-001.01. Read it before you start. The note:',
  '',
  'session end',
  '  Changes: Added `shop/cart.py` with `compute_totals(items)` and `Totals(subtotal_cents, discount_cents, total_cents)`. 7 tests in `tests/test_cart.py`, all pass.',
  '  Decisions: Python with only the standard library. Money is in integer cents to avoid float rounding.',
  '  Findings: unittest discovery needs `tests/__init__.py`.',
  '  Residual risk: Coupon types and backoff timing are still open in `docs/programs/cart/PLAN.md`.',
  '  Next action: Start TASK-001.02 or TASK-001.03. For coupons, build on `compute_totals` and `Totals` in `shop/cart.py`.',
  '',
  SURFACES,
];

const T = {
  t01: 'Compute cart totals in one function',
  t02: 'Guest checkout without an account',
  t03: 'Apply coupon codes after totals',
  t04: 'Retry failed payments up to 3 times with backoff',
};

/* ---------------- helpers ---------------- */

export const typedText = (text: string, f: number, f0: number, f1: number) => {
  if (f < f0) return '';
  const n = Math.ceil(((f - f0) / Math.max(1, f1 - f0)) * text.length);
  return text.slice(0, Math.min(text.length, n));
};

export type Built = {
  screen: Screen;
  chat: Record<string, [number, number]>;
  panel: Record<string, number>;
  sweepFrom?: number; // a frame whose screen is being wiped away
  sweepP?: number;
  panelShift?: Record<number, number>;
  session: 'A' | 'B' | 'C';
};

const beatPulse = (f: number) => Math.exp(-((f % FPB) / 4));

const spinnerFor = (f: number, f0: number, f1: number, verb: string, secs0: number, secs1: number, tok0: number, tok1: number) => {
  const t = Math.min(1, Math.max(0, (f - f0) / Math.max(1, f1 - f0)));
  const secs = Math.round(secs0 + (secs1 - secs0) * t);
  const tok = tok0 + (tok1 - tok0) * t;
  const tokStr = tok >= 1000 ? `${(tok / 1000).toFixed(1)}k` : `${Math.round(tok)}`;
  return spinnerLine(f, verb, `${secs}s · ↓ ${tokStr} tokens`);
};

/* ---------------- session A: design, /work create, preview, ok ---------------- */

const sessionA = (f: number): Built => {
  const s = new Screen();
  const blocks: Block[] = [header(), {id: 'work', lines: [...user('/work').lines, slashResult('work-panel: Work panel open.')]}];
  blocks.push(user(DESIGN_USER, 'designUser'));
  if (f >= at(2, 2)) {
    blocks.push(block('designReply', say(DESIGN_REPLY[0]), ...DESIGN_REPLY.slice(1).map((t) => indent(t.trim()))));
    blocks.push(block(undefined, doneLine('Brewed for 12s')));
  }
  let input = '';
  if (f >= at(3, 1) && f < at(4)) input = typedText('/work create cart', f, at(3, 1), at(3, 3));
  let spinner: Line | undefined;
  if (f >= at(4)) {
    blocks.push(block('create', user('/work create cart').lines, slashResult('work-panel: asked the agent to draft the roadmap "cart". It will show a preview first.')));
  }
  if (f >= at(4, 1)) blocks.push(pluginPrompt([...CREATE_MSG, '', SURFACES], 'createMsg'));
  if (f >= at(4, 2)) blocks.push(block(undefined, tool('Skill', 'work-panel:roadmap'), result('Successfully loaded skill')));
  if (f >= at(4, 3)) blocks.push(block(undefined, tool('Write', 'docs/programs/cart/PLAN.md'), collapsed('Ran **1** shell command')));
  if (f >= at(4) && f < at(5)) spinner = spinnerFor(f, at(4), at(5), 'Churning…', 2, 34, 120, 2400);
  if (f >= at(5)) {
    blocks.push(
      block(
        'preview',
        say('This is the dry-run preview for the "cart" roadmap. No tasks are registered yet.'),
        indent('Plan file: docs/programs/cart/PLAN.md.'),
        TABLE.map((t) => raw('  ' + t)),
        indent("Reply OK to register the roadmap. If you want changes, tell me and I'll redo the dry run."),
      ),
    );
    blocks.push(block(undefined, doneLine('Churned for 37s')));
  }
  if (f >= at(6, 2) && f < at(7)) input = typedText('ok', f, at(6, 2), at(6, 3));
  if (f >= at(7)) blocks.push(user('ok', 'ok'));
  if (f >= at(7, 1)) blocks.push(block(undefined, collapsed('Ran **1** shell command')));
  if (f >= at(7) && f < at(7, 2)) spinner = spinnerFor(f, at(7), at(7, 2), 'Registering…', 1, 6, 80, 640);
  if (f >= at(7, 2)) {
    blocks.push(
      block(
        'registered',
        say('The "cart" roadmap is registered and Active, and validate prints OK.'),
        indent('Ready now (●): TASK-001.01, TASK-001.02 · Waiting (○): TASK-001.03 needs .01, TASK-001.04 needs .02'),
        indent('The Work Panel will show the roadmap after this turn.'),
      ),
    );
  }
  const chat = drawChat(s, blocks, spinner);
  const panel: PanelState =
    f < at(7, 2)
      ? {focused: false, roadmaps: 0, empty: ['No roadmaps here yet.', 'Talk through a design with the agent, then type /work create <name>.']}
      : {focused: false, roadmaps: 1, roadmap: {open: false, right: '0/4 · 2 ready'}, hint: 'Pick a ● task to start it.'};
  const rows = drawPanel(s, panel);
  drawPrompt(s, input);
  return {screen: s, chat, panel: rows, session: 'A'};
};

/* ---------------- session B: fresh session, start, work, clear and start, handoff ---------------- */

const rowsFresh = (sel?: string): PanelRow[] => [
  {glyph: '●', id: '.01', title: T.t01, sel: sel === '.01'},
  {glyph: '●', id: '.02', title: T.t02, sel: sel === '.02'},
  {glyph: '○', id: '.03', title: T.t03, dim: true, sub: 'needs .01'},
  {glyph: '○', id: '.04', title: T.t04, dim: true, sub: 'needs .02'},
];

const sessionBPanel = (f: number): PanelState => {
  if (f < at(9)) {
    // fresh session: panel auto-opens with the roadmap folded
    const open = f >= at(8, 1);
    const sel = f >= at(8, 3) ? '.01' : undefined;
    return {
      focused: true,
      roadmaps: 1,
      roadmap: {open, focus: !sel, right: '0/4 · 2 ready'},
      rows: rowsFresh(sel),
      button: sel ? {label: 'Start TASK-001.01'} : undefined,
      hint: sel ? 'Fresh session: nothing to clear.' : 'Pick a ● task to start it.',
    };
  }
  const thisSession = `TASK-001.01 · ${T.t01}`;
  if (f < at(11, 2)) {
    return {
      focused: false,
      roadmaps: 1,
      thisSession,
      roadmap: {open: true, right: 'this roadmap', teal: true},
      rows: [
        {glyph: '●', id: '.02', title: T.t02},
        {glyph: '○', id: '.01', title: T.t01, dim: true, sub: 'this session'},
        {glyph: '○', id: '.03', title: T.t03, dim: true, sub: 'needs .01'},
        {glyph: '○', id: '.04', title: T.t04, dim: true, sub: 'needs .02'},
      ],
      hint: 'Pick a ● task to start it.',
    };
  }
  const sel = f >= at(12) ? '.02' : undefined;
  const base: PanelState = {
    focused: !!sel,
    roadmaps: 1,
    thisSession,
    roadmap: {open: true, right: 'this roadmap', teal: true},
    rows: [
      {glyph: '●', id: '.02', title: T.t02, sel: sel === '.02'},
      {glyph: '●', id: '.03', title: T.t03},
      {glyph: '○', id: '.04', title: T.t04, dim: true, sub: 'needs .02'},
    ],
    done: 1,
    hint: 'Pick a ● task to start it.',
  };
  if (f >= at(13)) return {...base, button: undefined, status: 'writing the handoff note on TASK-001.01…', hint: undefined};
  if (f >= at(12, 2)) return {...base, button: {label: 'Press again: clear and start .02', rev: true}, hint: 'Same roadmap: a handoff note goes on TASK-001.01 first.'};
  if (sel) return {...base, button: {label: 'Clear and start TASK-001.02'}, hint: 'Same roadmap: a handoff note goes on TASK-001.01 first.'};
  return base;
};

const sessionB = (f: number): Built => {
  const s = new Screen();
  const blocks: Block[] = [header()];
  let spinner: Line | undefined;
  if (f >= at(9)) blocks.push(pluginPrompt(START_01, 'start01'));
  if (f >= at(9, 1)) blocks.push(block(undefined, tool('Skill', 'work-panel:roadmap'), result('Successfully loaded skill')));
  if (f >= at(9, 2)) blocks.push(block(undefined, collapsed('Ran **1** shell command')));
  if (f >= at(9, 3)) blocks.push(block('claimed', say('Claimed TASK-001.01 and added the session-start record. Writing the totals function first.')));
  if (f >= at(10)) blocks.push(block('write', tool('Write', 'shop/cart.py'), result('Wrote **48** lines to **shop/cart.py**')));
  if (f >= at(10, 2)) blocks.push(block(undefined, collapsed('Read **1** file, ran **5** shell commands')));
  if (f >= at(11)) blocks.push(block('tests', say("Tests pass (7 of 7). Next I'm checking the acceptance criteria and writing the journal record."), collapsed('Ran **3** shell commands')));
  if (f >= at(11, 2)) {
    blocks.push(block('done', say('TASK-001.01 is done. The cart roadmap is now at 1/4.')));
    blocks.push(block(undefined, doneLine('Sautéed for 41s')));
  }
  if (f >= at(9) && f < at(11, 2)) spinner = spinnerFor(f, at(9), at(11, 2), 'Manifesting…', 3, 40, 380, 9800);
  const chat = drawChat(s, blocks, spinner);
  const panel = drawPanel(s, sessionBPanel(f));
  drawPrompt(s, '');
  return {screen: s, chat, panel, session: 'B'};
};

/* ---------------- after the drop: the same session B, cleared, new task with the note ---------------- */

const sessionB2 = (f: number): Built => {
  const s = new Screen();
  const blocks: Block[] = [header()];
  let spinner: Line | undefined;
  if (f >= at(14, 1)) blocks.push(pluginPrompt(START_02_NOTE, 'note'));
  if (f >= at(15, 2)) blocks.push(block(undefined, tool('Skill', 'work-panel:roadmap'), result('Successfully loaded skill')));
  if (f >= at(15, 3)) blocks.push(block(undefined, collapsed('Read **1** file, ran **1** shell command')));
  if (f >= at(16)) blocks.push(block('b2say', say('The note says the totals live in shop/cart.py, so guest checkout reuses compute_totals. Claimed TASK-001.02.')));
  if (f >= at(16, 2)) blocks.push(block(undefined, tool('Write', 'shop/checkout.py'), result('Wrote **23** lines to **shop/checkout.py**')));
  if (f >= at(14, 1)) spinner = spinnerFor(f, at(14, 1), at(17), 'Envisioning…', 1, 30, 200, 3200);
  const chat = drawChat(s, blocks, spinner);
  const panel = drawPanel(s, {
    focused: false,
    roadmaps: 1,
    thisSession: `TASK-001.02 · ${T.t02}`,
    roadmap: {open: true, right: 'this roadmap', teal: true},
    rows: [
      {glyph: '●', id: '.03', title: T.t03},
      {glyph: '○', id: '.02', title: T.t02, dim: true, sub: 'this session'},
      {glyph: '○', id: '.04', title: T.t04, dim: true, sub: 'needs .02'},
    ],
    done: 1,
    hint: 'Pick a ● task to start it.',
  });
  drawPrompt(s, '');
  return {screen: s, chat, panel, session: 'B', sweepFrom: at(S.drop) - 1};
};

/* ---------------- session C: a second session sees the live claim ---------------- */

export const LOCK_PRESS = at(17, 2);

const sessionC = (f: number): Built => {
  const s = new Screen();
  const chat = drawChat(s, [header()]);
  // the roadmap row has focus; ↓ jumps past the live .02 row straight to .03
  const onTask = f >= LOCK_PRESS;
  const panel = drawPanel(s, {
    focused: true,
    roadmaps: 1,
    roadmap: {open: true, focus: !onTask, right: '1/4 · 1 ready'},
    rows: [
      {glyph: '◐', id: '.02', title: T.t02, dim: true, sub: 'being worked on now', pulse: beatPulse(f)},
      {glyph: '●', id: '.03', title: T.t03, sel: onTask},
      {glyph: '○', id: '.04', title: T.t04, dim: true, sub: 'needs .02'},
    ],
    done: 1,
    button: onTask ? {label: 'Start TASK-001.03'} : undefined,
    hint: onTask ? 'Fresh session: nothing to clear.' : 'Pick a ● task to start it.',
  });
  drawPrompt(s, '');
  return {screen: s, chat, panel, session: 'C'};
};

/* ---------------- public ---------------- */

export const build = (f: number): Built => {
  if (f < at(S.panel)) return sessionA(f);
  if (f < at(S.drop)) return sessionB(f);
  if (f < at(S.liveness)) {
    const b = sessionB2(f);
    if (f < at(S.drop) + 8) {
      b.sweepP = (f - at(S.drop)) / 8;
    }
    return b;
  }
  return sessionC(f);
};

/* ---------------- camera targets (cell rects: c0, r0, c1, r1) ---------------- */

export type Rect = [number, number, number, number];
export type CamKey = {f: number; dur: number; target: (b: Built) => Rect};

const WIDE: Rect = [0, 0, COLS, ROWS];
const PANEL_TOP = (rows = 16): Rect => [DIV - 2, 0, COLS, rows];
const chatAround = (id: string, before = 1, after = 1, c1 = DIV) => (b: Built): Rect => {
  const span = b.chat[id];
  if (!span) return [0, 0, DIV, 28];
  return [0, Math.max(0, span[0] - before), c1, span[1] + 1 + after];
};

export const CAMERA: CamKey[] = [
  {f: at(S.design), dur: 0, target: () => WIDE},
  {f: at(2, 2), dur: 12, target: (b) => { const u = b.chat.designUser; const r = b.chat.designReply ?? u; return [0, u[0] - 1, DIV, r[1] + 3]; }},
  {f: at(S.create), dur: 10, target: chatAround('create', 1, 14)},
  {f: at(S.preview), dur: 12, target: chatAround('preview', 1, 2, 96)},
  {f: at(S.registered), dur: 10, target: (b) => { const r = b.chat.ok; return [0, r[0] - 1, COLS, r[0] + 12]; }},
  {f: at(7, 2), dur: 12, target: () => PANEL_TOP(12)},
  {f: at(S.panel), dur: 0, target: () => PANEL_TOP(16)},
  {f: at(S.start), dur: 10, target: () => WIDE},
  {f: at(S.working), dur: 12, target: (b) => { const r = b.chat.write ?? [10, 20]; return [0, Math.max(0, r[0] - 12), DIV, r[1] + 10]; }},
  {f: at(11, 2), dur: 12, target: () => PANEL_TOP(18)},
  {f: at(S.drop), dur: 0, target: () => WIDE},
  {f: at(S.drop + 1), dur: 12, target: chatAround('note', 0, 0)},
  {f: at(S.drop + 2), dur: 12, target: (b) => { const n = b.chat.note; const e = b.chat.b2say ?? n; return [0, e[1] - 26, DIV, e[1] + 2]; }},
  {f: at(S.liveness), dur: 0, target: () => PANEL_TOP(16)},
];

/* ---------------- captions and key presses ---------------- */

export const CAPTIONS: {f: number; text: string}[] = [
  {f: at(0), text: 'Big features take many sessions.'},
  {f: at(1), text: 'One long chat bloats. A fresh one forgets.'},
  {f: at(2), text: 'Design it first, in plain chat.'},
  {f: at(4), text: '/work create turns the design into a roadmap.'},
  {f: at(5), text: 'You get a preview first.'},
  {f: at(6), text: 'Nothing is written until you say OK.'},
  {f: at(7), text: 'Say OK, and the roadmap lands in the panel.'},
  {f: at(8), text: 'A new session opens the roadmap. Ready tasks show ●.'},
  {f: at(9), text: 'One key starts a task.'},
  {f: at(10), text: 'The agent claims it and does the work.'},
  {f: at(11, 2), text: 'Done. The next task unlocks.'},
  {f: at(12), text: 'Next task, same roadmap: Clear and start.'},
  {f: at(12, 2), text: 'Press again to confirm.'},
  {f: at(13), text: 'The old session writes a handoff note.'},
  {f: at(14), text: '/clear. Fresh context for the next task.'},
  {f: at(15), text: 'The handoff note carries what matters.'},
  {f: at(16), text: 'Clean context. Kept knowledge.'},
  {f: at(17), text: 'A second session sees the task is taken.'},
  {f: at(18), text: 'Someone is on it? Locked. One task, one agent.'},
  {f: at(19), text: ''},
];

export const KEYS: {f: number; key: string; label?: string}[] = [
  {f: at(4), key: '⏎', label: 'send'},
  {f: at(7), key: '⏎', label: 'send'},
  {f: at(8, 1), key: '⏎', label: 'open'},
  {f: at(8, 3), key: '↓'},
  {f: at(9), key: '⏎', label: 'start'},
  {f: at(12), key: '↓'},
  {f: at(12, 2), key: '⏎', label: 'clear and start'},
  {f: at(13), key: '⏎', label: 'press again'},
  {f: LOCK_PRESS, key: '↓', label: 'skips .02'},
];

/** Every scene boundary, for the sync table and the cut transitions. */
export const CUTS: {f: number; name: string; kind: 'fade' | 'cut' | 'smash' | 'push'}[] = [
  {f: at(S.title), name: 'Title card', kind: 'fade'},
  {f: at(-1, 3), name: 'Title card push-out (10 frames)', kind: 'push'},
  {f: at(S.problem), name: 'Problem', kind: 'fade'},
  {f: at(S.design), name: 'Session A: design chat', kind: 'fade'},
  {f: at(S.panel), name: 'Session B: fresh session', kind: 'cut'},
  {f: at(S.drop), name: 'DROP: /clear sweep', kind: 'smash'},
  {f: at(S.liveness), name: 'Session C: second session', kind: 'cut'},
  {f: at(S.end), name: 'End card', kind: 'fade'},
];

export {K};
