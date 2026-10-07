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
import {C, FONT_MONO, FONT_SANS, PANEL_W, TERM, TERM_FONT} from './theme';

const CHAT_W = TERM.w - PANEL_W;
const TITLE = 'claude  ~/shop';

/* ---------- shared data ---------- */

type Over = Partial<Record<string, Partial<Task>>>;

const checkout = (expanded: boolean, over: Over = {}, progress = '5/10 · 2 ready'): Roadmap => {
  const base: Task[] = [
    {id: '.04', title: 'Cart totals in one place', state: 'ready'},
    {id: '.05', title: 'Guest checkout', state: 'progress', sub: 'claimed 4d ago · nobody on it now'},
    {id: '.06', title: 'Coupon codes', state: 'ready'},
    {id: '.07', title: 'Payment retries', state: 'waiting', sub: 'needs .06'},
    {id: '.08', title: 'Receipt emails', state: 'blocked', sub: 'blocked · email copy not final'},
  ];
  return {
    id: '001',
    name: 'checkout-redesign',
    progress,
    expanded,
    done: 5,
    tasks: base.map((t) => ({...t, ...(over[t.id] ?? {})})),
  };
};

const search = (expanded: boolean, over: Over = {}, progress = '2/5 · 1 ready'): Roadmap => {
  const base: Task[] = [
    {id: '.02', title: 'Typo-tolerant search', state: 'ready'},
    {id: '.03', title: 'Search filters', state: 'waiting', sub: 'needs .02'},
    {id: '.04', title: 'Saved searches', state: 'waiting', sub: 'needs .03'},
  ];
  return {
    id: '002',
    name: 'search-revamp',
    progress,
    expanded,
    done: 2,
    tasks: base.map((t) => ({...t, ...(over[t.id] ?? {})})),
  };
};

/* A full single-terminal layout: chat on the left, panel docked right. */
const Shell: React.FC<{
  chat: ChatLine[];
  input: string;
  panel?: PanelProps;
  panelIn?: number; // 0..1 slide
  sweep?: number;
  overlay?: React.ReactNode;
}> = ({chat, input, panel, panelIn = 1, sweep, overlay}) => (
  <TerminalWindow title={TITLE}>
    <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: CHAT_W}}>
      {sweep !== undefined ? (
        <Sweep p={sweep} width={CHAT_W}>
          <Chat lines={chat} width={CHAT_W} />
        </Sweep>
      ) : (
        <Chat lines={chat} width={CHAT_W} />
      )}
      <InputBox text={input} width={CHAT_W} />
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

/* ================= Scene 1: hook (120f) ================= */

export const SceneHook: React.FC = () => {
  const f = useCurrentFrame();
  const q = 'what was I working on yesterday?';
  let input = typed(q, f, 14, 26);
  if (f > 84) input = q.slice(0, Math.max(0, q.length - Math.floor((f - 84) * 2.2)));
  const pulse = fade(f, 40, 52) * (1 - fade(f, 100, 112));
  return (
    <Backdrop>
      <TerminalWindow title={TITLE}>
        <div style={{position: 'absolute', inset: 0}}>
          <div style={{padding: '30px 34px', fontSize: TERM_FONT, color: C.faint}}>
            <div>Claude Code</div>
            <div style={{marginTop: 6}}>new session · empty context</div>
          </div>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 260,
              textAlign: 'center',
              fontFamily: FONT_MONO,
              fontSize: 120,
              color: C.faint,
              opacity: pulse * 0.6,
              transform: `scale(${0.9 + pulse * 0.1})`,
            }}
          >
            ?
          </div>
          <InputBox text={input} width={TERM.w} />
        </div>
      </TerminalWindow>
      <Captions items={[{from: 4, to: 116, text: 'New session. What was I doing again?'}]} />
    </Backdrop>
  );
};

/* ================= Scene 2: /work opens the panel (300f) ================= */

const LEGEND: {g: string; c: string; t: string}[] = [
  {g: '●', c: C.teal, t: 'ready: everything it needs is done'},
  {g: '○', c: C.faint, t: 'waiting: shows what it needs'},
  {g: '◐', c: C.amber, t: 'in progress: someone claimed it'},
  {g: '■', c: C.blocked, t: 'blocked: shows what unblocks it'},
  {g: '✓', c: C.faint, t: 'done: folded into one line'},
];

export const SceneOpen: React.FC = () => {
  const f = useCurrentFrame();
  const input = f < 40 ? typed('/work', f, 8, 12) : '';
  const panelIn = useSpring(42, 20);
  const expanded = f >= 98;
  const rm1 = checkout(expanded);
  rm1.tasks = rm1.tasks.map((t, i) => ({...t, appear: ease(f, 98 + i * 5, 110 + i * 5)}));
  const rm2 = search(false);
  const legendO = fade(f, 150, 160) * (1 - fade(f, 284, 296));
  return (
    <Backdrop>
      <Shell
        chat={[]}
        input={input}
        panelIn={panelIn}
        panel={{
          roadmaps: [rm1, rm2],
          selected: f < 120 ? 'rm:001' : '001.04',
          button: f >= 120 ? {label: 'Start WORK-001.04', mode: 'idle'} : undefined,
          hint: f >= 120 ? 'Fresh session: it just sends the first message.' : undefined,
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
              padding: '26px 30px',
              fontSize: 24,
            }}
          >
            <div style={{color: C.dim, fontSize: 19, letterSpacing: 2, marginBottom: 18}}>TASK STATES</div>
            {LEGEND.map((l, i) => (
              <div
                key={l.g}
                style={{
                  display: 'flex',
                  gap: 22,
                  alignItems: 'center',
                  height: 48,
                  opacity: fade(f, 156 + i * 8, 166 + i * 8),
                }}
              >
                <span style={{color: l.c, width: 26, fontSize: 26}}>{l.g}</span>
                <span>{l.t}</span>
              </div>
            ))}
          </div>
        }
      />
      <Keycap label="⏎" at={36} />
      <Keycap label="⏎" at={92} hint="expand" />
      <Captions
        items={[
          {from: 0, to: 80, text: 'Type /work. A panel docks on the right.'},
          {from: 80, to: 148, text: 'Roadmaps fold open into tasks.'},
          {from: 148, to: 300, text: 'Each row shows where the task stands.'},
        ]}
      />
    </Backdrop>
  );
};

/* ================= Scene 3: Start in a fresh session (240f) ================= */

const FIRST_04 =
  'Work on WORK-001.04 "Cart totals in one place". Read the task file, claim it, then plan.';

export const SceneStart: React.FC = () => {
  const f = useCurrentFrame();
  let selected = '001.04';
  if (f >= 22 && f < 54) selected = '001.05';
  const pressed = f >= 92 && f < 104;
  const sent = f >= 104;
  const msg = sent ? typed(FIRST_04, f, 104, 70) : '';
  const claimed = f >= 196;
  const chat: ChatLine[] = [];
  if (sent) chat.push({kind: 'user', text: msg});
  if (f >= 178) chat.push({kind: 'agent', text: 'Reading backlog/tasks/work-001.04.md'});
  if (f >= 196) chat.push({kind: 'agent', text: 'Claimed WORK-001.04. Planning the change.'});
  const hint =
    selected === '001.05'
      ? 'Claimed 4d ago, nobody on it now. You can take it over.'
      : 'Fresh session: it just sends the first message.';
  return (
    <Backdrop>
      <Shell
        chat={chat}
        input=""
        panel={{
          roadmaps: [
            checkout(true, claimed ? {'.04': {state: 'progress', mine: true, sub: 'this session'}} : {},
              claimed ? '5/10 · 1 ready' : '5/10 · 2 ready'),
            search(false),
          ],
          selected: sent ? undefined : selected,
          button: sent
            ? undefined
            : {label: selected === '001.05' ? 'Start WORK-001.05' : 'Start WORK-001.04', mode: pressed ? 'press' : 'idle'},
          hint: sent ? undefined : hint,
        }}
      />
      <Keycap label="↓" at={20} />
      <Keycap label="↑" at={52} />
      <Keycap label="⏎" at={90} hint="start" />
      <Captions
        items={[
          {from: 0, to: 80, text: 'Only rows you can start can be selected.'},
          {from: 80, to: 170, text: 'Fresh session: the button is Start. It sends the first message.'},
          {from: 170, to: 240, text: 'The new agent claims the task itself.'},
        ]}
      />
    </Backdrop>
  );
};

/* ================= Scene 4: Clear and start, same roadmap (420f) ================= */

const NOTE: [string, string][] = [
  ['Changes', 'totals now computed in cart/totals.ts only'],
  ['Commands', 'npm test cart  ->  42 passed'],
  ['Commits', 'a1c9e02 move totals into one module'],
  ['Decisions', 'tax is rounded once, at the end'],
  ['Findings', 'old coupon math counted shipping twice'],
  ['Risk', 'mobile cart still reads the old field'],
  ['Next', 'drop the old field after mobile ships'],
];

const FIRST_06 =
  'Work on WORK-001.06 "Coupon codes". Handoff from .04: totals live in cart/totals.ts, tax rounds once, mobile cart still reads the old field.';

export const SceneClearSame: React.FC = () => {
  const f = useCurrentFrame();
  const armed = f >= 46 && f < 92;
  const confirmed = f >= 92;
  // note card timeline
  const noteStart = 100;
  const foldStart = 214;
  const flyStart = 236;
  const flyEnd = 266;
  const filed = f >= flyEnd;
  const clearTypeStart = 278;
  const sweepStart = 296;
  const sweepEnd = 326;
  const newStart = 336;

  const oldChat: ChatLine[] = [
    {kind: 'user', text: 'Work on WORK-001.04 "Cart totals in one place". Read the task file, claim it, then plan.'},
    {kind: 'agent', text: 'Moved all total math into cart/totals.ts.'},
    {kind: 'agent', text: 'Tests pass: npm test cart (42 passed).'},
    {kind: 'agent', text: 'Committed a1c9e02. Ready for the next step.'},
  ];

  const newChat: ChatLine[] = [];
  if (f >= newStart) newChat.push({kind: 'user', text: typed(FIRST_06, f, newStart, 80)});
  if (f >= 398) newChat.push({kind: 'agent', text: 'Claimed WORK-001.06. Starting from the note.'});

  const showOld = f < sweepEnd;
  const sweepP = ease(f, sweepStart, sweepEnd);
  const input = f >= clearTypeStart && f < sweepStart ? typed('/clear', f, clearTypeStart, 20) : '';

  // panel state
  const o04: Partial<Task> = {
    state: 'progress',
    mine: !confirmed,
    sub: filed ? 'claimed · handoff note in its journal' : 'this session',
    flash: filed ? 1 - fade(f, flyEnd, flyEnd + 40) : 0,
  };
  const claimed06 = f >= 398;
  const over: Over = {'.04': o04};
  if (claimed06) over['.06'] = {state: 'progress', mine: true, sub: 'this session'};

  const button =
    f >= 160
      ? undefined
      : confirmed
        ? {label: 'Clearing...', mode: 'press' as const}
        : armed
          ? {label: 'Press again to clear', mode: 'armed' as const}
          : {label: 'Clear and start WORK-001.06', mode: 'idle' as const};
  const hint = armed
    ? 'Clear needs a second press.'
    : confirmed
      ? 'Writing a handoff note for WORK-001.04 first.'
      : 'Same roadmap: a handoff note goes on WORK-001.04 first.';

  const roadmaps = [checkout(true, over, claimed06 ? '5/10 · 0 ready' : '5/10 · 1 ready'), search(false)];

  // note card geometry (relative to chat area)
  const cardX = 20;
  const cardY = 22;
  const cardW = CHAT_W - 40;
  const cardH = 360;
  const fold = ease(f, foldStart, flyStart);
  const fly = ease(f, flyStart, flyEnd);
  // target: the .04 row in the panel (panel starts at x = CHAT_W inside the terminal body)
  const targetX = CHAT_W + 150;
  const targetY = rowTop(roadmaps, '001.04') + 4;
  const envW = 220;
  const envH = 140;
  const curW = interpolate(fold, [0, 1], [cardW, envW]);
  const curH = interpolate(fold, [0, 1], [cardH, envH]);
  const startCX = cardX + cardW / 2;
  const startCY = cardY + cardH / 2;
  const cx = interpolate(fly, [0, 1], [startCX, targetX + 40]);
  const cy = interpolate(fly, [0, 1], [startCY, targetY + 16]) - Math.sin(fly * Math.PI) * 120;
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
        <div style={{opacity: 1 - fold * 2.5, padding: '22px 28px', fontSize: 21, lineHeight: '34px'}}>
          <div style={{color: C.amber, fontWeight: 700, letterSpacing: 1, marginBottom: 12}}>
            HANDOFF NOTE · WORK-001.04
          </div>
          {NOTE.map(([k, v], i) => {
            const at = noteStart + 12 + i * 12;
            return (
              <div key={k} style={{display: 'flex', opacity: fade(f, at, at + 6)}}>
                <span style={{width: 150, color: C.dim}}>{k}</span>
                <span>{typed(v, f, at, 90)}</span>
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
            <polyline
              points={`2,2 ${curW / 2},${curH * 0.58} ${curW - 2},2`}
              fill="none"
              stroke={C.amber}
              strokeWidth={3}
            />
            <text
              x={curW / 2}
              y={curH - 18}
              textAnchor="middle"
              fill={C.amber}
              fontFamily={FONT_MONO}
              fontSize={20}
            >
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
          selected: f < 92 ? '001.06' : undefined,
          button,
          hint: button ? hint : undefined,
        }}
        overlay={card}
      />
      {/* the card flies over the terminal boundary, so render a copy outside clip: handled by overflow on window */}
      <Keycap label="⏎" at={44} hint="clear and start" />
      <Keycap label="⏎" at={90} hint="press again" />
      <Captions
        items={[
          {from: 0, to: 44, text: 'Later: next task, same roadmap.'},
          {from: 44, to: 100, text: 'The button is now Clear and start. Press twice.'},
          {from: 100, to: 214, text: 'The old session writes a handoff note.'},
          {from: 214, to: 278, text: 'The note is saved on the old task.'},
          {from: 278, to: 336, text: 'Then /clear wipes the chat. The panel stays.'},
          {from: 336, to: 420, text: 'The new session starts with the note summary.'},
        ]}
      />
    </Backdrop>
  );
};

/* ================= Scene 5: Different roadmap, plain clear (180f) ================= */

const FIRST_S02 = 'Work on WORK-002.02 "Typo-tolerant search". Read the task file, claim it, then plan.';

export const SceneClearOther: React.FC = () => {
  const f = useCurrentFrame();
  const armed = f >= 34 && f < 62;
  const go = f >= 62;
  const sweepS = 70;
  const sweepE = 96;
  const oldChat: ChatLine[] = [
    {kind: 'user', text: FIRST_06},
    {kind: 'agent', text: 'Coupons apply before tax. Tests added.'},
    {kind: 'agent', text: 'Committed 7d41b3c.'},
  ];
  const newChat: ChatLine[] = f >= 104 ? [{kind: 'user', text: typed(FIRST_S02, f, 104, 80)}] : [];
  const button = go
    ? f < sweepS
      ? {label: 'Clearing...', mode: 'press' as const}
      : undefined
    : armed
      ? {label: 'Press again to clear', mode: 'armed' as const}
      : {label: 'Clear and start WORK-002.02', mode: 'idle' as const};
  return (
    <Backdrop>
      <Shell
        chat={f < sweepE ? oldChat : newChat}
        input={f >= 64 && f < sweepS ? '/clear' : ''}
        sweep={f >= sweepS && f < sweepE ? ease(f, sweepS, sweepE) : undefined}
        panel={{
          roadmaps: [
            {...checkout(false, {}, '5/10 · 0 ready')},
            search(true),
          ],
          selected: go ? undefined : '002.02',
          button,
          hint: button
            ? armed
              ? 'Clear needs a second press.'
              : 'Different roadmap: a plain clear, no note.'
            : undefined,
        }}
      />
      <Keycap label="⏎" at={32} />
      <Keycap label="⏎" at={60} hint="press again" />
      <Captions
        items={[
          {from: 0, to: 96, text: 'Different roadmap? A plain clear. No note.'},
          {from: 96, to: 180, text: 'Fresh context for unrelated work.'},
        ]}
      />
    </Backdrop>
  );
};

/* ================= Scene 6: Liveness (300f) ================= */

export const SceneLive: React.FC = () => {
  const f = useCurrentFrame();
  // heartbeat pulse every 30 frames ("tick")
  const ph = (f % 30) / 30;
  const beat = ph < 0.25 ? 1 - ph / 0.25 : 0;
  const secs = Math.floor((f % 60) / 6); // fake "written Ns ago" that resets
  const shake = f >= 96 && f < 126 ? (f - 96) / 30 : 0;
  const onO4 = f >= 224;
  const selFlash = f >= 160 && f < 190 ? 1 - (f - 160) / 30 : 0;

  const leftW = 820;
  const rightX = 80 + leftW + 40;
  const rightW = 1840 - rightX;

  const panelRoadmaps: Roadmap[] = [
    {
      ...checkout(true),
      progress: '5/10 · 0 ready',
      tasks: [
        {id: '.04', title: 'Cart totals in one place', state: 'progress', sub: 'claimed 40m ago · no live session'},
        {id: '.05', title: 'Guest checkout', state: 'progress', sub: 'claimed 4d ago · nobody on it now'},
        {id: '.06', title: 'Coupon codes', state: 'live', sub: 'being worked on now', shake},
        {id: '.07', title: 'Payment retries', state: 'waiting', sub: 'needs .06'},
      ],
    },
  ];

  return (
    <Backdrop>
      {/* session A */}
      <TerminalWindow x={80} y={52} w={leftW} h={840} title="session A">
        <Chat
          width={leftW}
          lines={[
            {kind: 'user', text: 'Work on WORK-001.06 "Coupon codes".'},
            {kind: 'agent', text: 'Claimed WORK-001.06.'},
            {kind: 'agent', text: 'Writing the coupon rules...'},
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

      {/* link between them */}
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

      {/* session B */}
      <TerminalWindow x={rightX} y={52} w={rightW} h={840} title="session B · /work">
        <div style={{position: 'absolute', inset: 0}}>
          <Panel
            width={rightW}
            roadmaps={panelRoadmaps}
            heartbeat={beat}
            selected={onO4 ? '001.04' : '001.05'}
            selectFlash={selFlash}
            button={{label: onO4 ? 'Start WORK-001.04' : 'Start WORK-001.05', mode: 'idle'}}
            hint={
              onO4
                ? 'Claimed under 2 h ago, no live session. Press twice to start.'
                : shake > 0
                  ? '.06 has a live session. It cannot be started.'
                  : 'Claimed 4d ago, nobody on it now. You can take it over.'
            }
          />
        </div>
      </TerminalWindow>

      <Keycap label="↓" at={94} x={1740} hint="locked" />
      <Keycap label="↑" at={222} x={1740} />
      <Captions
        items={[
          {from: 0, to: 90, text: 'Every session writes a heartbeat every 60 s.'},
          {from: 90, to: 156, text: 'Fresh heartbeat: being worked on now. Locked.'},
          {from: 156, to: 220, text: 'Old claim, nobody home: yours to take over.'},
          {from: 220, to: 300, text: 'Claimed under 2 h ago: press twice to be sure.'},
        ]}
      />
    </Backdrop>
  );
};

/* ================= Scene 7: End card (180f) ================= */

export const SceneEnd: React.FC = () => {
  const f = useCurrentFrame();
  const a = useSpring(0, 22);
  const tag = fade(f, 18, 34);
  const inst = fade(f, 38, 54);
  const repo = fade(f, 56, 70);
  return (
    <Backdrop>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', flexDirection: 'column'}}>
        <div style={{display: 'flex', gap: 26, fontSize: 40, opacity: a, marginBottom: 30}}>
          <span style={{color: C.teal}}>●</span>
          <span style={{color: C.faint}}>○</span>
          <span style={{color: C.amber}}>◐</span>
          <span style={{color: C.blocked}}>■</span>
          <span style={{color: C.faint}}>✓</span>
        </div>
        <div
          style={{
            fontSize: 110,
            fontWeight: 700,
            letterSpacing: -2,
            opacity: a,
            transform: `translateY(${(1 - a) * 20}px)`,
          }}
        >
          Work Panel
        </div>
        <div
          style={{
            fontFamily: FONT_SANS,
            fontSize: 42,
            color: C.text,
            marginTop: 24,
            opacity: tag,
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          Pick a task. Keep the context that matters.{' '}
          <span style={{color: C.dim}}>Drop the rest.</span>
        </div>
        <div
          style={{
            marginTop: 60,
            opacity: inst,
            background: C.term,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: '22px 34px',
            fontSize: 30,
          }}
        >
          <span style={{color: C.dim}}>{'> '}</span>
          <span style={{color: C.teal}}>/plugin install</span> work-panel --marketplace
          ilikeeatingrice/claude-code-work-panel
        </div>
        <div style={{marginTop: 34, fontSize: 26, color: C.dim, opacity: repo}}>
          github.com/ilikeeatingrice/claude-code-work-panel · toggle with <span style={{color: C.text}}>/work</span>
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
};
