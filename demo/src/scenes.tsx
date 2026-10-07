import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {
  Backdrop,
  Captions,
  Chat,
  ChatLine,
  InputBox,
  Keycap,
  Panel,
  PanelProps,
  Roadmap,
  Sweep,
  Task,
  TerminalWindow,
  ease,
  fade,
  rowTop,
  typed,
  useSpring,
} from './components';
import {C, FONT_MONO, FONT_SANS, PANEL_W, TERM} from './theme';

const CHAT_W = TERM.w - PANEL_W;
const TITLE = 'claude  ~/shop';

/* ---------- shared data ---------- */

type Over = Partial<Record<string, Partial<Task>>>;

const checkout = (expanded: boolean, over: Over = {}, progress = '0/5 · 2 ready', done = 0): Roadmap => {
  const base: Task[] = [
    {id: '.01', title: 'Cart totals in one place', state: 'ready'},
    {id: '.02', title: 'Guest checkout', state: 'ready'},
    {id: '.03', title: 'Coupon codes', state: 'waiting', sub: 'needs .01'},
    {id: '.04', title: 'Payment retries', state: 'waiting', sub: 'needs .02'},
    {id: '.05', title: 'Receipt emails', state: 'blocked', sub: 'blocked · email copy not final'},
  ];
  return {
    id: '001',
    name: 'checkout-redesign',
    progress,
    expanded,
    done,
    tasks: base.map((t) => ({...t, ...(over[t.id] ?? {})})).filter((t) => !(over[t.id] as {hide?: boolean})?.hide),
  };
};

const search = (expanded: boolean, progress = '2/5 · 1 ready'): Roadmap => ({
  id: '002',
  name: 'search-revamp',
  progress,
  expanded,
  done: 2,
  tasks: [
    {id: '.03', title: 'Typo-tolerant search', state: 'ready'},
    {id: '.04', title: 'Search filters', state: 'waiting', sub: 'needs .03'},
    {id: '.05', title: 'Saved searches', state: 'waiting', sub: 'needs .04'},
  ],
});

/* A full single-terminal layout: chat on the left, panel docked right. */
const Shell: React.FC<{
  chat: ChatLine[];
  input: string;
  panel?: PanelProps;
  panelIn?: number; // 0..1 slide
  chatW?: number;
  sweep?: number;
  overlay?: React.ReactNode;
}> = ({chat, input, panel, panelIn = 1, chatW = CHAT_W, sweep, overlay}) => (
  <TerminalWindow title={TITLE}>
    <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: chatW}}>
      {sweep !== undefined ? (
        <Sweep p={sweep} width={chatW}>
          <Chat lines={chat} width={chatW} />
        </Sweep>
      ) : (
        <Chat lines={chat} width={chatW} />
      )}
      <InputBox text={input} width={chatW} />
      {overlay}
    </div>
    {panel ? (
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: PANEL_W,
          transform: `translateX(${(1 - panelIn) * (PANEL_W + 40)}px)`,
          opacity: interpolate(panelIn, [0, 0.3, 1], [0, 1, 1]),
        }}
      >
        <Panel {...panel} />
      </div>
    ) : null}
  </TerminalWindow>
);

/* ================= Scene 1: the problem (210f) ================= */

const Bar: React.FC<{fill: number; over?: boolean; w: number}> = ({fill, over, w}) => (
  <div style={{width: w, height: 16, borderRadius: 8, background: '#24211d', position: 'relative'}}>
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: Math.min(fill, 1.08) * w,
        borderRadius: 8,
        background: over && fill > 0.85 ? C.amber : C.teal,
        opacity: 0.85,
      }}
    />
  </div>
);

export const SceneProblem: React.FC = () => {
  const f = useCurrentFrame();
  const head = fade(f, 4, 18);
  const laneA = fade(f, 60, 72);
  const laneB = fade(f, 120, 132);
  const fillA = interpolate(f, [66, 118], [0.15, 1.08], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pct = Math.min(100, Math.round(fillA * 100));
  return (
    <Backdrop>
      <AbsoluteFill style={{alignItems: 'center'}}>
        <div
          style={{
            marginTop: 120,
            fontSize: 58,
            fontWeight: 700,
            letterSpacing: -1,
            opacity: head,
            transform: `translateY(${(1 - head) * 14}px)`,
          }}
        >
          One feature. Many tasks. Many sessions.
        </div>
        <div style={{marginTop: 18, fontSize: 24, color: C.dim, opacity: head}}>
          checkout-redesign · 5 tasks · a week of work
        </div>

        {/* lane A: one long chat */}
        <div
          style={{
            position: 'absolute',
            top: 330,
            left: 200,
            right: 200,
            opacity: laneA,
            display: 'flex',
            alignItems: 'center',
            gap: 40,
          }}
        >
          <div style={{width: 380, fontSize: 26, whiteSpace: 'nowrap'}}>one long chat</div>
          <div style={{flex: 1}}>
            <Bar fill={fillA} over w={1080} />
            <div style={{marginTop: 14, fontSize: 21, color: fillA > 0.85 ? C.amber : C.dim}}>
              context {pct}%{fillA > 0.98 ? ' · old details crowd out the new task' : ''}
            </div>
          </div>
        </div>

        {/* lane B: fresh every time */}
        <div
          style={{
            position: 'absolute',
            top: 520,
            left: 200,
            right: 200,
            opacity: laneB,
            display: 'flex',
            alignItems: 'center',
            gap: 40,
          }}
        >
          <div style={{width: 380, fontSize: 26, whiteSpace: 'nowrap'}}>a fresh chat each time</div>
          <div style={{flex: 1, display: 'flex', gap: 22}}>
            {[0, 1, 2, 3, 4].map((i) => {
              const o = fade(f, 126 + i * 6, 136 + i * 6);
              return (
                <div
                  key={i}
                  style={{
                    width: 200,
                    height: 120,
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    background: C.term,
                    opacity: o,
                    padding: '14px 16px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{fontSize: 19, color: C.dim}}>session {i + 1}</div>
                  <div style={{fontSize: 40, color: C.faint, textAlign: 'center', lineHeight: '40px'}}>?</div>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
      <Captions
        items={[
          {from: 6, to: 60, text: 'Built for big work that spans many sessions.'},
          {from: 60, to: 120, text: 'One long chat? The context bloats.'},
          {from: 120, to: 180, text: 'A fresh chat? What you learned is lost.'},
          {from: 180, to: 210, text: 'Work Panel keeps both in check.'},
        ]}
      />
    </Backdrop>
  );
};

/* ================= Scene 2: design, then /work create (510f) ================= */

const DESIGN: {at: number; line: ChatLine}[] = [
  {at: 8, line: {kind: 'user', text: 'Big one: redesign checkout. Totals live in three places and coupons count shipping twice.'}},
  {at: 64, line: {kind: 'agent', text: 'Then totals in one place first. Coupons build on that.'}},
  {at: 92, line: {kind: 'agent', text: 'Guest checkout and payment retries can go side by side.'}},
  {at: 124, line: {kind: 'user', text: 'Receipt emails too, but the copy is not final.'}},
  {at: 168, line: {kind: 'agent', text: 'Then receipts start blocked until the copy is in. Make it a roadmap?'}},
];

const PREVIEW: {id: string; title: string; note: string; color: string}[] = [
  {id: '.01', title: 'Cart totals in one place', note: 'ready', color: C.teal},
  {id: '.02', title: 'Guest checkout', note: 'ready', color: C.teal},
  {id: '.03', title: 'Coupon codes', note: '← waits on .01', color: C.dim},
  {id: '.04', title: 'Payment retries', note: '← waits on .02', color: C.dim},
  {id: '.05', title: 'Receipt emails', note: 'blocked · email copy', color: C.blocked},
];

export const SceneCreate: React.FC = () => {
  const f = useCurrentFrame();
  const CMD = '/work create checkout-redesign';
  const cmdAt = 214;
  const sentCmd = 250;
  const okAt = 372;
  const sentOk = 384;
  const written = 400;
  const panelAt = 408;

  let chat: ChatLine[];
  if (f < sentCmd) {
    chat = DESIGN.filter((d) => f >= d.at).map((d) =>
      d.line.kind === 'user' ? {...d.line, text: typed(d.line.text, f, d.at, 90)} : d.line,
    );
  } else {
    chat = [{kind: 'user', text: CMD}];
    if (f >= sentCmd + 10) chat.push({kind: 'agent', text: 'Wrote PLAN.md. Here is the roadmap preview:'});
    if (f >= sentOk) {
      chat = [
        {kind: 'user', text: CMD},
        {kind: 'agent', text: 'Wrote PLAN.md. Showed the preview.'},
        {kind: 'user', text: 'ok'},
      ];
    }
    if (f >= written) chat.push({kind: 'agent', text: 'Wrote WORK.md and 5 task files in tasks/.'});
  }

  let input = '';
  if (f >= cmdAt && f < sentCmd) input = typed(CMD, f, cmdAt, 34);
  if (f >= okAt - 10 && f < sentOk) input = typed('ok', f, okAt - 10, 12);

  const panelIn = useSpring(panelAt, 20);
  const chatW = f < panelAt ? TERM.w : interpolate(panelIn, [0, 1], [TERM.w, CHAT_W]);

  const rm1 = checkout(true);
  rm1.appear = fade(f, panelAt + 12, panelAt + 22);
  rm1.tasks = rm1.tasks.map((t, i) => ({
    ...t,
    appear: ease(f, panelAt + 20 + i * 5, panelAt + 32 + i * 5),
    glow: t.state === 'ready' ? Math.max(0, Math.sin(((f - panelAt - 40) / 30) * Math.PI)) * fade(f, panelAt + 40, panelAt + 50) : 0,
  }));

  const cardO = fade(f, sentCmd + 16, sentCmd + 26) * (1 - fade(f, sentOk - 2, sentOk + 6));
  const card =
    f >= sentCmd + 16 && f < sentOk + 6 ? (
      <div
        style={{
          position: 'absolute',
          left: 30,
          top: 160,
          width: 1000,
          opacity: cardO,
          background: C.card,
          border: `1.5px solid ${C.teal}`,
          borderRadius: 14,
          padding: '22px 30px',
          fontSize: 23,
          lineHeight: '40px',
        }}
      >
        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 8}}>
          <span style={{color: C.teal, fontWeight: 700, letterSpacing: 1}}>PREVIEW · 001 checkout-redesign</span>
          <span style={{color: C.dim, fontSize: 20}}>not in the tracker yet</span>
        </div>
        {PREVIEW.map((p, i) => (
          <div key={p.id} style={{display: 'flex', opacity: fade(f, sentCmd + 24 + i * 7, sentCmd + 30 + i * 7)}}>
            <span style={{width: 76, color: C.dim}}>{p.id}</span>
            <span style={{width: 440}}>{p.title}</span>
            <span style={{color: p.color}}>{p.note}</span>
          </div>
        ))}
        <div style={{marginTop: 12, color: C.dim, fontSize: 21}}>
          Reply <span style={{color: C.text}}>ok</span> to write WORK.md and 5 task files.
        </div>
      </div>
    ) : null;

  return (
    <Backdrop>
      <Shell
        chat={chat}
        input={input}
        chatW={chatW}
        panelIn={f >= panelAt ? panelIn : 0}
        panel={
          f >= panelAt
            ? {roadmaps: [rm1, search(false)]}
            : undefined
        }
        overlay={card}
      />
      <Keycap label="⏎" at={sentCmd - 2} />
      <Keycap label="⏎" at={sentOk - 2} hint="ok" />
      <Captions
        items={[
          {from: 4, to: 210, text: 'Design it first, in plain chat.'},
          {from: 210, to: 290, text: '/work create turns the design into a roadmap.'},
          {from: 290, to: 396, text: 'A preview first. Nothing goes in the tracker until you say OK.'},
          {from: 396, to: 510, text: 'The roadmap lands in the panel. Ready tasks get ●.'},
        ]}
      />
    </Backdrop>
  );
};

/* ================= Scene 3: only startable work (240f) ================= */

const LEGEND: {g: string; c: string; t: string}[] = [
  {g: '●', c: C.teal, t: 'ready: you can start it'},
  {g: '○', c: C.faint, t: 'waiting: shows what it needs'},
  {g: '■', c: C.blocked, t: 'blocked: shows what unblocks it'},
  {g: '◐', c: C.amber, t: 'in progress: someone claimed it'},
];

const FIRST_01 = 'Work on WORK-001.01 "Cart totals in one place". Read the task file, claim it, then plan.';

export const SceneStartable: React.FC = () => {
  const f = useCurrentFrame();
  let selected = '001.01';
  if (f >= 30 && f < 96) selected = '001.02';
  const nudge = f >= 62 && f < 86 ? (f - 62) / 24 : 0;
  const pressed = f >= 126 && f < 136;
  const sent = f >= 136;
  const claimed = f >= 206;
  const chat: ChatLine[] = [];
  if (sent) chat.push({kind: 'user', text: typed(FIRST_01, f, 136, 80)});
  if (claimed) chat.push({kind: 'agent', text: 'Claimed WORK-001.01. Planning the change.'});
  const legendO = fade(f, 4, 12) * (1 - fade(f, 112, 124));
  const over: Over = {};
  if (nudge) {
    over['.03'] = {shake: nudge};
    over['.04'] = {shake: nudge};
    over['.05'] = {shake: nudge};
  }
  if (claimed) over['.01'] = {state: 'progress', mine: true, sub: 'this session'};
  return (
    <Backdrop>
      <Shell
        chat={chat}
        input=""
        panel={{
          roadmaps: [checkout(true, over, claimed ? '0/5 · 1 ready' : '0/5 · 2 ready'), search(false)],
          selected: sent ? undefined : selected,
          button: sent
            ? undefined
            : {label: `Start WORK-${selected}`, mode: pressed ? 'press' : 'idle'},
          hint: sent ? undefined : nudge ? 'Waiting and blocked rows cannot be picked.' : 'Fresh session: it just sends the first message.',
        }}
        overlay={
          <div
            style={{
              position: 'absolute',
              left: 40,
              top: 60,
              width: CHAT_W - 100,
              opacity: legendO,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: '24px 30px',
              fontSize: 24,
            }}
          >
            {LEGEND.map((l, i) => (
              <div key={l.g} style={{display: 'flex', gap: 22, alignItems: 'center', height: 48, opacity: fade(f, 6 + i * 6, 14 + i * 6)}}>
                <span style={{color: l.c, width: 26, fontSize: 26}}>{l.g}</span>
                <span>{l.t}</span>
              </div>
            ))}
          </div>
        }
      />
      <Keycap label="↓" at={28} />
      <Keycap label="↓" at={60} hint="nothing below" />
      <Keycap label="↑" at={94} />
      <Keycap label="⏎" at={124} hint="start" />
      <Captions
        items={[
          {from: 0, to: 120, text: 'Only work you can start is offered.'},
          {from: 120, to: 200, text: 'Start sends the first message.'},
          {from: 200, to: 240, text: 'The new agent claims the task itself.'},
        ]}
      />
    </Backdrop>
  );
};

/* ================= Scene 4: Clear and start, same roadmap (570f) ================= */

const NOTE: [string, string][] = [
  ['Changes', 'totals now live in cart/totals.ts only'],
  ['Decisions', 'tax is rounded once, at the end'],
  ['Findings', 'old coupon math counted shipping twice'],
  ['Risk', 'mobile cart still reads the old field'],
  ['Next', 'guest checkout can reuse totals as is'],
];

const HANDOFF = 'Handoff from .01: totals live in cart/totals.ts, tax rounds once, mobile cart still reads the old field.';
const FIRST_02 = `Work on WORK-001.02 "Guest checkout". ${HANDOFF}`;

export const SceneClearSame: React.FC = () => {
  const f = useCurrentFrame();
  const armAt = 60;
  const confirmAt = 112;
  const armed = f >= armAt && f < confirmAt;
  const confirmed = f >= confirmAt;
  const noteStart = 126;
  const foldStart = 246;
  const flyStart = 268;
  const flyEnd = 300;
  const filed = f >= flyEnd;
  const clearTypeStart = 320;
  const sweepStart = 340;
  const sweepEnd = 376;
  const newStart = 390;
  const claimAt = 500;

  const oldChat: ChatLine[] = [
    {kind: 'user', text: FIRST_01},
    {kind: 'agent', text: 'Moved all total math into cart/totals.ts.'},
    {kind: 'agent', text: 'Tests pass: npm test cart (42 passed).'},
    {kind: 'agent', text: 'Committed a1c9e02. Task done.'},
  ];

  const newChat: ChatLine[] = [];
  if (f >= newStart) newChat.push({kind: 'user', text: typed(FIRST_02, f, newStart, 70), accent: HANDOFF});
  if (f >= claimAt) newChat.push({kind: 'agent', text: 'Claimed WORK-001.02. Starting from the note.'});

  const showOld = f < sweepEnd;
  const sweepP = ease(f, sweepStart, sweepEnd);
  const input = f >= clearTypeStart && f < sweepStart ? typed('/clear', f, clearTypeStart, 20) : '';

  const over: Over = {
    '.01': {
      state: 'progress',
      mine: !confirmed,
      sub: filed ? 'handoff note saved in its journal' : 'this session',
      flash: filed ? 1 - fade(f, flyEnd, flyEnd + 45) : 0,
    },
  };
  const claimed02 = f >= claimAt;
  if (claimed02) over['.02'] = {state: 'progress', mine: true, sub: 'this session'};

  const button =
    f >= 190
      ? undefined
      : confirmed
        ? {label: 'Clearing...', mode: 'press' as const}
        : armed
          ? {label: 'Press again to clear', mode: 'armed' as const}
          : {label: 'Clear and start WORK-001.02', mode: 'idle' as const};
  const hint = armed
    ? 'Clear needs a second press.'
    : confirmed
      ? 'Writing a handoff note for WORK-001.01 first.'
      : 'Same roadmap: a handoff note goes on WORK-001.01 first.';

  const roadmaps = [checkout(true, over, claimed02 ? '0/5 · 0 ready' : '0/5 · 1 ready'), search(false)];

  // note card geometry (relative to chat area)
  const cardX = 20;
  const cardY = 22;
  const cardW = CHAT_W - 40;
  const cardH = 300;
  const fold = ease(f, foldStart, flyStart);
  const fly = ease(f, flyStart, flyEnd);
  const targetX = CHAT_W + 150;
  const targetY = rowTop(roadmaps, '001.01') + 4;
  const envW = 220;
  const envH = 140;
  const curW = interpolate(fold, [0, 1], [cardW, envW]);
  const curH = interpolate(fold, [0, 1], [cardH, envH]);
  const cx = interpolate(fly, [0, 1], [cardX + cardW / 2, targetX + 40]);
  const cy = interpolate(fly, [0, 1], [cardY + cardH / 2, targetY + 16]) - Math.sin(fly * Math.PI) * 120;
  const sc = interpolate(fly, [0, 1], [1, 0.22]);
  const cardO = fade(f, noteStart, noteStart + 8) * (1 - fade(f, flyEnd - 6, flyEnd));

  const card =
    f >= noteStart && f < flyEnd ? (
      <div
        style={{
          position: 'absolute',
          left: cx - curW / 2,
          top: cy - curH / 2,
          width: curW,
          height: curH,
          transform: `scale(${sc})`,
          opacity: cardO,
          background: C.card,
          border: `1.5px solid ${fold > 0.05 ? C.amber : C.border}`,
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          zIndex: 5,
        }}
      >
        <div style={{opacity: 1 - fold * 2.5, padding: '22px 28px', fontSize: 22, lineHeight: '38px'}}>
          <div style={{color: C.amber, fontWeight: 700, letterSpacing: 1, marginBottom: 10}}>
            HANDOFF NOTE · WORK-001.01
          </div>
          {NOTE.map(([k, v], i) => {
            const at = noteStart + 14 + i * 18;
            return (
              <div key={k} style={{display: 'flex', opacity: fade(f, at, at + 6)}}>
                <span style={{width: 150, color: C.dim}}>{k}</span>
                <span>{typed(v, f, at, 80)}</span>
              </div>
            );
          })}
        </div>
        {fold > 0.4 ? (
          <svg
            width={curW}
            height={curH}
            viewBox={`0 0 ${curW} ${curH}`}
            style={{position: 'absolute', left: 0, top: 0, opacity: fade(f, foldStart + 8, foldStart + 16)}}
          >
            <polyline points={`2,2 ${curW / 2},${curH * 0.58} ${curW - 2},2`} fill="none" stroke={C.amber} strokeWidth={3} />
            <text x={curW / 2} y={curH - 18} textAnchor="middle" fill={C.amber} fontFamily={FONT_MONO} fontSize={20}>
              note
            </text>
          </svg>
        ) : null}
      </div>
    ) : null;

  return (
    <Backdrop>
      <Shell
        chat={showOld ? oldChat : newChat}
        input={input}
        sweep={showOld && f >= sweepStart ? sweepP : undefined}
        panel={{
          roadmaps,
          selected: f < confirmAt ? '001.02' : undefined,
          button,
          hint: button ? hint : undefined,
        }}
        overlay={card}
      />
      <Keycap label="⏎" at={armAt - 2} hint="clear and start" />
      <Keycap label="⏎" at={confirmAt - 2} hint="press again" />
      <Captions
        items={[
          {from: 0, to: 58, text: 'Task done. Next task, same roadmap.'},
          {from: 58, to: 122, text: 'Clear and start. Press twice to confirm.'},
          {from: 122, to: 246, text: 'First, the old session writes a handoff note.'},
          {from: 246, to: 318, text: 'The note is saved on the old task.'},
          {from: 318, to: 392, text: 'Then /clear. Fresh context for the next task.'},
          {from: 392, to: 570, text: 'The handoff note carries what matters.'},
        ]}
      />
    </Backdrop>
  );
};

/* ================= Scene 5: Different roadmap, plain clear (180f) ================= */

const FIRST_S03 = 'Work on WORK-002.03 "Typo-tolerant search". Read the task file, claim it, then plan.';

export const SceneClearOther: React.FC = () => {
  const f = useCurrentFrame();
  const armed = f >= 34 && f < 62;
  const go = f >= 62;
  const sweepS = 70;
  const sweepE = 96;
  const oldChat: ChatLine[] = [
    {kind: 'user', text: FIRST_02, accent: HANDOFF},
    {kind: 'agent', text: 'Guest checkout works. Committed 7d41b3c.'},
  ];
  const newChat: ChatLine[] = f >= 104 ? [{kind: 'user', text: typed(FIRST_S03, f, 104, 80)}] : [];
  const button = go
    ? f < sweepS
      ? {label: 'Clearing...', mode: 'press' as const}
      : undefined
    : armed
      ? {label: 'Press again to clear', mode: 'armed' as const}
      : {label: 'Clear and start WORK-002.03', mode: 'idle' as const};
  return (
    <Backdrop>
      <Shell
        chat={f < sweepE ? oldChat : newChat}
        input={f >= 64 && f < sweepS ? '/clear' : ''}
        sweep={f >= sweepS && f < sweepE ? ease(f, sweepS, sweepE) : undefined}
        panel={{
          roadmaps: [checkout(false, {}, '2/5 · 1 ready'), search(true)],
          selected: go ? undefined : '002.03',
          button,
          hint: button ? (armed ? 'Clear needs a second press.' : 'Different roadmap: a plain clear, no note.') : undefined,
        }}
      />
      <Keycap label="⏎" at={32} />
      <Keycap label="⏎" at={60} hint="press again" />
      <Captions
        items={[
          {from: 0, to: 100, text: 'Different roadmap? Plain clear, no note.'},
          {from: 100, to: 180, text: 'Unrelated work starts clean.'},
        ]}
      />
    </Backdrop>
  );
};

/* ================= Scene 6: Liveness (210f) ================= */

export const SceneLive: React.FC = () => {
  const f = useCurrentFrame();
  const ph = (f % 30) / 30;
  const beat = ph < 0.25 ? 1 - ph / 0.25 : 0;
  const secs = Math.floor((f % 60) / 6);
  const shake = f >= 76 && f < 106 ? (f - 76) / 30 : 0;
  const selFlash = f >= 140 && f < 170 ? 1 - (f - 140) / 30 : 0;

  const leftW = 820;
  const rightX = 80 + leftW + 40;
  const rightW = 1840 - rightX;

  const panelRoadmaps: Roadmap[] = [
    {
      ...checkout(true),
      progress: '1/5 · 0 ready',
      done: 1,
      tasks: [
        {id: '.02', title: 'Guest checkout', state: 'live', sub: 'being worked on now', shake},
        {id: '.03', title: 'Coupon codes', state: 'progress', sub: 'claimed 4d ago · nobody on it now'},
        {id: '.04', title: 'Payment retries', state: 'waiting', sub: 'needs .02'},
        {id: '.05', title: 'Receipt emails', state: 'blocked', sub: 'blocked · email copy not final'},
      ],
    },
  ];

  return (
    <Backdrop>
      <TerminalWindow x={80} y={52} w={leftW} h={840} title="session A">
        <Chat
          width={leftW}
          lines={[
            {kind: 'user', text: 'Work on WORK-001.02 "Guest checkout".'},
            {kind: 'agent', text: 'Claimed WORK-001.02.'},
            {kind: 'agent', text: 'Building the guest form...'},
          ]}
        />
        <div
          style={{
            position: 'absolute',
            left: 30,
            right: 30,
            bottom: 30,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '18px 22px',
            fontSize: 21,
            background: '#141310',
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                background: C.teal,
                opacity: 0.4 + beat * 0.6,
                transform: `scale(${1 + beat * 0.6})`,
                boxShadow: `0 0 ${beat * 18}px ${C.teal}`,
              }}
            />
            <span>heartbeat file</span>
            <span style={{color: C.dim, marginLeft: 'auto'}}>written {secs}s ago</span>
          </div>
          <div style={{color: C.dim, fontSize: 19, marginTop: 10}}>a tiny file, rewritten every 60 s</div>
        </div>
      </TerminalWindow>

      <div
        style={{
          position: 'absolute',
          left: 80 + leftW,
          top: 52 + 420,
          width: 40,
          height: 2,
          background: C.teal,
          opacity: 0.3 + beat * 0.7,
        }}
      />

      <TerminalWindow x={rightX} y={52} w={rightW} h={840} title="session B · /work">
        <div style={{position: 'absolute', inset: 0}}>
          <Panel
            width={rightW}
            roadmaps={panelRoadmaps}
            heartbeat={beat}
            selected="001.03"
            selectFlash={selFlash}
            button={{label: 'Start WORK-001.03', mode: 'idle'}}
            hint={
              shake > 0
                ? '.02 has a live session. It cannot be started.'
                : 'Claimed 4d ago, nobody on it now. You can take it over.'
            }
          />
        </div>
      </TerminalWindow>

      <Keycap label="↑" at={74} x={1740} hint="locked" />
      <Captions
        items={[
          {from: 0, to: 70, text: 'Every session writes a heartbeat every 60 s.'},
          {from: 70, to: 140, text: 'Someone is on it? Locked. One task, one agent.'},
          {from: 140, to: 210, text: 'Old claim, nobody home? You can take it over.'},
        ]}
      />
    </Backdrop>
  );
};

/* ================= Scene 7: End card (210f) ================= */

const HIGHLIGHTS = ['Design → roadmap', 'Clean context, kept knowledge', 'One task, one agent'];

export const SceneEnd: React.FC = () => {
  const f = useCurrentFrame();
  const a = useSpring(0, 22);
  const sub = fade(f, 14, 28);
  const hl = (i: number) => fade(f, 30 + i * 8, 40 + i * 8);
  const inst = fade(f, 64, 78);
  const repo = fade(f, 80, 94);
  return (
    <Backdrop>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', flexDirection: 'column'}}>
        <div style={{display: 'flex', gap: 26, fontSize: 36, opacity: a, marginBottom: 24}}>
          <span style={{color: C.teal}}>●</span>
          <span style={{color: C.faint}}>○</span>
          <span style={{color: C.amber}}>◐</span>
          <span style={{color: C.blocked}}>■</span>
          <span style={{color: C.faint}}>✓</span>
        </div>
        <div style={{fontSize: 104, fontWeight: 700, letterSpacing: -2, opacity: a, transform: `translateY(${(1 - a) * 20}px)`}}>
          Work Panel
        </div>
        <div style={{fontFamily: FONT_SANS, fontSize: 36, color: C.dim, marginTop: 14, opacity: sub}}>
          panel + roadmap skill + tracker, in one plugin
        </div>
        <div style={{display: 'flex', gap: 22, marginTop: 50}}>
          {HIGHLIGHTS.map((h, i) => (
            <div
              key={h}
              style={{
                opacity: hl(i),
                transform: `translateY(${(1 - hl(i)) * 10}px)`,
                fontFamily: FONT_SANS,
                fontSize: 30,
                fontWeight: 500,
                padding: '14px 26px',
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: 'rgba(16,15,13,0.7)',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <span style={{color: [C.teal, C.amber, C.teal][i], fontFamily: FONT_MONO}}>{['●', '◐', '●'][i]}</span>
              {h}
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 56,
            opacity: inst,
            background: C.term,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: '22px 34px',
            fontSize: 30,
          }}
        >
          <span style={{color: C.dim}}>{'> '}</span>
          <span style={{color: C.teal}}>/plugin install</span> work-panel --marketplace ilikeeatingrice/claude-code-work-panel
        </div>
        <div style={{marginTop: 30, fontSize: 26, color: C.dim, opacity: repo}}>
          github.com/ilikeeatingrice/claude-code-work-panel · <span style={{color: C.text}}>/work</span> ·{' '}
          <span style={{color: C.text}}>/work create</span>
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
};

