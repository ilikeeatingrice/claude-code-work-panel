import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import {C, FONT_MONO, FONT_SANS, TERM, PANEL_W, LH, TERM_FONT} from './theme';

/* ---------- helpers ---------- */

export const typed = (text: string, frame: number, start: number, cps = 32): string => {
  const n = Math.floor(((frame - start) / 30) * cps);
  if (n <= 0) return '';
  return text.slice(0, n);
};

export const fade = (frame: number, a: number, b: number) =>
  interpolate(frame, [a, b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

export const ease = (frame: number, a: number, b: number) =>
  interpolate(frame, [a, b], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });

/* ---------- background ---------- */

export const Backdrop: React.FC<{children?: React.ReactNode}> = ({children}) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse at 50% 40%, ${C.bg} 0%, ${C.bgVignette} 100%)`,
      fontFamily: FONT_MONO,
      color: C.text,
    }}
  >
    {children}
  </AbsoluteFill>
);

/* ---------- caption ---------- */

export type Cap = {from: number; to: number; text: string};

export const Captions: React.FC<{items: Cap[]}> = ({items}) => {
  const f = useCurrentFrame();
  const cur = items.find((c) => f >= c.from && f < c.to);
  if (!cur) return null;
  const o = Math.min(fade(f, cur.from, cur.from + 8), 1 - fade(f, cur.to - 8, cur.to));
  const y = interpolate(o, [0, 1], [10, 0]);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 925,
        display: 'flex',
        justifyContent: 'center',
        opacity: o,
        transform: `translateY(${y}px)`,
      }}
    >
      <div
        style={{
          fontFamily: FONT_SANS,
          fontSize: 38,
          fontWeight: 500,
          color: C.text,
          letterSpacing: -0.3,
          padding: '14px 30px',
          borderRadius: 14,
          background: 'rgba(16,15,13,0.72)',
          border: `1px solid ${C.border}`,
        }}
      >
        {cur.text}
      </div>
    </div>
  );
};

/* ---------- keycap ---------- */

export const Keycap: React.FC<{label: string; at: number; x?: number; y?: number; hint?: string}> = ({
  label,
  at,
  x = 1700,
  y = 912,
  hint,
}) => {
  const f = useCurrentFrame();
  const local = f - at;
  if (local < -8 || local > 34) return null;
  const appear = fade(f, at - 8, at);
  const gone = 1 - fade(f, at + 22, at + 34);
  const press = interpolate(local, [0, 4, 10], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left: x, top: y, opacity: Math.min(appear, gone), textAlign: 'center'}}>
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: 14,
          background: '#2a2620',
          border: `1.5px solid #4a443b`,
          boxShadow: `0 ${8 - press * 6}px 0 #0c0b09, 0 ${12 - press * 6}px 22px rgba(0,0,0,0.5)`,
          transform: `translateY(${press * 6}px)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT_MONO,
          fontSize: 40,
          fontWeight: 600,
          color: press > 0.3 ? C.teal : C.text,
        }}
      >
        {label}
      </div>
      {hint ? (
        <div style={{marginTop: 16, fontSize: 18, color: C.dim, fontFamily: FONT_MONO}}>{hint}</div>
      ) : null}
    </div>
  );
};

/* ---------- terminal window ---------- */

export const TerminalWindow: React.FC<{
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  title: string;
  children?: React.ReactNode;
}> = ({x = TERM.x, y = TERM.y, w = TERM.w, h = TERM.h, title, children}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      height: h,
      background: C.term,
      borderRadius: 16,
      border: `1px solid ${C.border}`,
      boxShadow: '0 40px 80px rgba(0,0,0,0.45)',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        height: TERM.bar,
        background: C.termBar,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 10,
      }}
    >
      {[0, 1, 2].map((i) => (
        <div key={i} style={{width: 13, height: 13, borderRadius: 7, background: '#3a352f'}} />
      ))}
      <div style={{marginLeft: 18, fontSize: 18, color: C.dim}}>{title}</div>
    </div>
    <div style={{position: 'absolute', top: TERM.bar, left: 0, right: 0, bottom: 0}}>{children}</div>
  </div>
);

/* ---------- chat area ---------- */

export type ChatLine = {kind: 'user' | 'agent' | 'dim'; text: string};

export const Chat: React.FC<{lines: ChatLine[]; width: number}> = ({lines, width}) => (
  <div style={{padding: '26px 30px', width, fontSize: TERM_FONT, lineHeight: '34px'}}>
    {lines.map((l, i) =>
      l.kind === 'user' ? (
        <div
          key={i}
          style={{
            background: C.userBg,
            borderLeft: `3px solid ${C.faint}`,
            padding: '10px 16px',
            margin: '0 0 18px 0',
            color: C.text,
            whiteSpace: 'pre-wrap',
          }}
        >
          <span style={{color: C.dim}}>{'> '}</span>
          {l.text}
        </div>
      ) : (
        <div key={i} style={{display: 'flex', gap: 14, margin: '0 0 10px 0', color: l.kind === 'dim' ? C.dim : C.text}}>
          <span style={{color: C.faint}}>{l.kind === 'agent' ? '•' : ' '}</span>
          <span style={{whiteSpace: 'pre-wrap'}}>{l.text}</span>
        </div>
      ),
    )}
  </div>
);

export const InputBox: React.FC<{text: string; width: number; cursor?: boolean}> = ({text, width, cursor = true}) => {
  const f = useCurrentFrame();
  const blink = Math.floor(f / 16) % 2 === 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: 26,
        bottom: 24,
        width: width - 52,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '12px 18px',
        fontSize: TERM_FONT,
        color: C.text,
        background: '#141310',
        display: 'flex',
        alignItems: 'center',
        minHeight: 32,
      }}
    >
      <span style={{color: C.dim, marginRight: 12}}>{'>'}</span>
      <span style={{whiteSpace: 'pre'}}>{text}</span>
      <span
        style={{
          display: 'inline-block',
          width: 12,
          height: 26,
          marginLeft: 2,
          background: cursor && blink ? C.text : 'transparent',
        }}
      />
    </div>
  );
};

/* ---------- the panel ---------- */

export type TaskState = 'ready' | 'waiting' | 'progress' | 'blocked' | 'live';

export type Task = {
  id: string; // ".04"
  title: string;
  state: TaskState;
  sub?: string;
  mine?: boolean;
  flash?: number; // 0..1 amber flash
  shake?: number; // 0..1 shake
  appear?: number; // 0..1
};

export type Roadmap = {
  id: string;
  name: string;
  progress: string;
  expanded: boolean;
  tasks: Task[];
  done: number;
  appear?: number;
};

export type PanelProps = {
  roadmaps: Roadmap[];
  selected?: string; // "001.04" or "rm:001"
  button?: {label: string; mode: 'idle' | 'armed' | 'press'};
  hint?: string;
  width?: number;
  heartbeat?: number; // 0..1 pulse for live rows
  selectFlash?: number;
};

const glyph: Record<TaskState, string> = {
  ready: '●',
  waiting: '○',
  progress: '◐',
  blocked: '■',
  live: '◐',
};

export const glyphColor = (t: Task) => {
  if (t.mine) return C.amber;
  switch (t.state) {
    case 'ready':
      return C.teal;
    case 'waiting':
      return C.faint;
    case 'progress':
      return C.amber;
    case 'blocked':
      return C.blocked;
    case 'live':
      return C.dim;
  }
};

// Panel inner layout: header row then lines. Exposed so scenes can aim at a row.
export const PANEL_PAD_TOP = 22;
export const rowTop = (roadmaps: Roadmap[], key: string): number => {
  let y = PANEL_PAD_TOP + LH + 10; // header + gap
  for (const r of roadmaps) {
    if (`rm:${r.id}` === key) return y;
    y += LH;
    if (r.expanded) {
      for (const t of r.tasks) {
        if (`${r.id}${t.id}` === key) return y;
        y += LH;
        if (t.sub) y += LH - 6;
      }
      y += LH;
    }
  }
  return y;
};

export const Panel: React.FC<PanelProps> = ({
  roadmaps,
  selected,
  button,
  hint,
  width = PANEL_W,
  heartbeat = 0,
  selectFlash = 0,
}) => {
  const sel = (on: boolean): React.CSSProperties =>
    on
      ? {
          background: selectFlash > 0 ? `rgba(111,183,185,${0.14 + selectFlash * 0.18})` : C.tealSoft,
          boxShadow: `inset 3px 0 0 ${C.teal}`,
        }
      : {};
  return (
    <div
      style={{
        width,
        height: '100%',
        borderLeft: `1px solid ${C.border}`,
        background: '#121110',
        padding: `${PANEL_PAD_TOP}px 22px`,
        boxSizing: 'border-box',
        fontSize: TERM_FONT,
        position: 'relative',
      }}
    >
      <div
        style={{
          border: `1.5px solid #3b362f`,
          borderRadius: 12,
          position: 'absolute',
          inset: 10,
          pointerEvents: 'none',
        }}
      />
      <div style={{display: 'flex', justifyContent: 'space-between', height: LH, alignItems: 'center', padding: '0 12px'}}>
        <span style={{fontWeight: 700, letterSpacing: 2, color: C.text}}>WORK</span>
        <span style={{color: C.dim, fontSize: 19}}>
          {roadmaps.length} {roadmaps.length === 1 ? "roadmap" : "roadmaps"} · /work hides
        </span>
      </div>
      <div style={{height: 10}} />
      {roadmaps.map((r) => (
        <div key={r.id} style={{opacity: r.appear ?? 1}}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              height: LH,
              padding: '0 12px',
              borderRadius: 6,
              ...sel(selected === `rm:${r.id}`),
            }}
          >
            <span>
              <span style={{color: C.dim}}>{r.expanded ? '▾' : '▸'}</span> <span style={{color: C.dim}}>{r.id}</span>{' '}
              <span style={{fontWeight: 600}}>{r.name}</span>
            </span>
            <span style={{color: C.dim, fontSize: 20}}>{r.progress}</span>
          </div>
          {r.expanded ? (
            <>
              {r.tasks.map((t) => {
                const key = `${r.id}${t.id}`;
                const isSel = selected === key;
                const shakeX = t.shake ? Math.sin(t.shake * Math.PI * 6) * 8 * (1 - t.shake) : 0;
                const a = t.appear ?? 1;
                const subColor = t.mine ? C.amber : t.state === 'blocked' ? C.blocked : C.dim;
                return (
                  <div
                    key={key}
                    style={{
                      opacity: a,
                      transform: `translateX(${shakeX + (1 - a) * 16}px)`,
                      borderRadius: 6,
                      ...sel(isSel),
                      background:
                        t.flash && t.flash > 0
                          ? `rgba(224,168,90,${0.22 * t.flash})`
                          : (sel(isSel).background as string | undefined),
                    }}
                  >
                    <div style={{height: LH, display: 'flex', alignItems: 'center', padding: '0 12px 0 40px'}}>
                      <span style={{color: glyphColor(t), width: 30}}>{glyph[t.state]}</span>
                      <span style={{color: C.dim, width: 64}}>{t.id}</span>
                      <span
                        style={{
                          color:
                            t.state === 'waiting' || t.state === 'live'
                              ? C.dim
                              : isSel
                                ? '#f4efe6'
                                : C.text,
                        }}
                      >
                        {t.title}
                      </span>
                    </div>
                    {t.sub ? (
                      <div
                        style={{
                          height: LH - 6,
                          display: 'flex',
                          alignItems: 'flex-start',
                          padding: '0 12px 0 134px',
                          fontSize: 19,
                          color: subColor,
                        }}
                      >
                        {t.state === 'live' ? (
                          <span
                            style={{
                              display: 'inline-block',
                              width: 10,
                              height: 10,
                              borderRadius: 5,
                              background: C.teal,
                              marginRight: 10,
                              marginTop: 7,
                              opacity: 0.45 + heartbeat * 0.55,
                              transform: `scale(${1 + heartbeat * 0.5})`,
                            }}
                          />
                        ) : null}
                        {t.sub}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div style={{height: LH, display: 'flex', alignItems: 'center', padding: '0 12px 0 40px', color: C.faint}}>
                <span style={{width: 30}}>✓</span>
                {r.done} done
              </div>
            </>
          ) : null}
        </div>
      ))}
      {button ? (
        <div style={{marginTop: 22, padding: '0 12px'}}>
          <div
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              borderRadius: 8,
              border: `1.5px solid ${button.mode === 'armed' ? C.amber : C.teal}`,
              color: button.mode === 'armed' ? C.amber : button.mode === 'press' ? C.term : C.teal,
              background: button.mode === 'press' ? C.teal : button.mode === 'armed' ? C.amberSoft : 'transparent',
              fontWeight: 600,
            }}
          >
            [ {button.label} ]
          </div>
          {hint ? (
            <div style={{marginTop: 12, fontSize: 19, color: C.dim, lineHeight: '28px'}}>{hint}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

/* ---------- /clear sweep ---------- */

export const Sweep: React.FC<{p: number; width: number; children: React.ReactNode}> = ({p, width, children}) => (
  <div style={{position: 'absolute', inset: 0}}>
    <div style={{position: 'absolute', inset: 0, clipPath: `inset(0 0 0 ${p * 100}%)`}}>{children}</div>
    {p > 0 && p < 1 ? (
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: p * width - 3,
          width: 6,
          background: C.text,
          opacity: 0.7,
          boxShadow: `0 0 30px 8px rgba(232,226,215,0.25)`,
        }}
      />
    ) : null}
  </div>
);

export const useSpring = (at: number, damping = 18) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({frame: f - at, fps, config: {damping}});
};
