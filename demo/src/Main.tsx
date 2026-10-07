import React from 'react';
import {AbsoluteFill, Audio, Easing, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {at, FPB, SECTIONS as S, TOTAL_FRAMES} from './beat';
import {build, CAMERA, CAPTIONS, CUTS, KEYS, Rect} from './story';
import {TITLE_BEATS, TITLE_OUT, TITLE_OUT_FRAMES} from './titleBeats';
import {CH, CW, DIV, K, TH, TW} from './term/grid';

const DIV_PX = DIV * CW;
import {Terminal} from './term/Terminal';
import {FONT_MONO, FONT_SANS} from './theme';

export type Layout = {W: number; H: number; VH: number; caption: number; maxScale: number; stacked?: boolean};
export const WIDE_LAYOUT: Layout = {W: 1920, H: 1080, VH: 944, caption: 36, maxScale: 1.6};
export const TALL_LAYOUT: Layout = {W: 1080, H: 1350, VH: 1150, caption: 38, maxScale: 1.6, stacked: true};

const BG = '#14120f';
const easeIO = Easing.inOut(Easing.cubic);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/* ---------------- camera ---------------- */

type Cam = {s: number; cx: number; cy: number};

const rectToCam = (r: Rect, L: Layout): Cam => {
  const pad = 1;
  const x0 = (r[0] - pad) * CW;
  const x1 = (r[2] + pad) * CW;
  const y0 = (r[1] - pad) * CH;
  const y1 = (r[3] + pad) * CH;
  const fit = Math.min(L.W / TW, L.VH / TH);
  let s = Math.min(L.W / (x1 - x0), L.VH / (y1 - y0), L.maxScale);
  s = Math.max(s, fit);
  let cx = (x0 + x1) / 2;
  let cy = (y0 + y1) / 2;
  const halfW = L.W / (2 * s);
  const halfH = L.VH / (2 * s);
  cx = TW * s > L.W ? Math.min(Math.max(cx, halfW), TW - halfW) : TW / 2;
  cy = TH * s > L.VH ? Math.min(Math.max(cy, halfH), TH - halfH) : TH / 2;
  return {s, cx, cy};
};

const keyCam = (i: number, L: Layout): Cam => {
  const k = CAMERA[i];
  const next = CAMERA[i + 1];
  const settle = Math.min(k.f + k.dur + 4, next ? next.f - 1 : k.f + k.dur + 4);
  return rectToCam(k.target(build(settle)), L);
};

const cameraAt = (f: number, L: Layout): Cam => {
  let i = -1;
  for (let j = 0; j < CAMERA.length; j++) if (f >= CAMERA[j].f) i = j;
  if (i < 0) return keyCam(0, L);
  const k = CAMERA[i];
  const to = keyCam(i, L);
  if (i === 0 || k.dur === 0 || f >= k.f + k.dur) return to;
  const from = keyCam(i - 1, L);
  const t = easeIO(clamp01((f - k.f) / k.dur));
  return {s: from.s + (to.s - from.s) * t, cx: from.cx + (to.cx - from.cx) * t, cy: from.cy + (to.cy - from.cy) * t};
};

const TermView: React.FC<{f: number; L: Layout}> = ({f, L}) => {
  const b = build(f);
  const cam = cameraAt(f, L);
  const old = b.sweepP !== undefined && b.sweepFrom !== undefined ? build(b.sweepFrom).screen : undefined;
  // short cross-fade on plain cuts
  const cut = CUTS.find((c) => c.kind === 'cut' && f >= c.f && f < c.f + 6);
  const prev = cut ? build(cut.f - 1) : undefined;
  const prevCam = cut ? cameraAt(cut.f - 1, L) : undefined;
  const layer = (bb: typeof b, c: Cam, o: number, sweep?: {p: number; old: typeof b.screen}) => (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transformOrigin: '0 0',
        transform: `translate(${L.W / 2 - c.cx * c.s}px, ${L.VH / 2 - c.cy * c.s}px) scale(${c.s})`,
        opacity: o,
        boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
      }}
    >
      <Terminal screen={bb.screen} sweep={sweep} panelShift={bb.panelShift} />
    </div>
  );
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: L.W, height: L.VH, overflow: 'hidden'}}>
      {layer(b, cam, 1, old ? {p: b.sweepP!, old} : undefined)}
      {prev && prevCam && cut ? layer(prev, prevCam, 1 - (f - cut.f) / 6) : null}
    </div>
  );
};

/* 4:5: the panel and the chat as two stacked views of the same terminal */
const PANEL_VIEW_H = 520;
const GAP = 12;
const TermStacked: React.FC<{f: number; L: Layout}> = ({f, L}) => {
  const b = build(f);
  const old = b.sweepP !== undefined && b.sweepFrom !== undefined ? build(b.sweepFrom).screen : undefined;
  const cut = CUTS.find((c) => c.kind === 'cut' && f >= c.f && f < c.f + 6);
  const prev = cut ? build(cut.f - 1) : undefined;
  const chatH = L.VH - PANEL_VIEW_H - GAP;
  const sc = L.W / DIV_PX;
  const chatLayout: Layout = {W: L.W, H: L.H, VH: chatH, caption: 0, maxScale: sc};
  const camOf = (ff: number) => {
    const c = cameraAt(ff, chatLayout);
    const half = chatH / (2 * sc);
    return {s: sc, cx: DIV_PX / 2, cy: Math.min(Math.max(c.cy, half), TH - half)};
  };
  const sp = L.W / (TW - DIV_PX);
  const pcx = DIV_PX + (TW - DIV_PX) / 2;
  const views = (bb: typeof b, o: number, ff: number, sweep?: {p: number; old: typeof b.screen}) => {
    const c = camOf(ff);
    return (
      <React.Fragment key={ff}>
        <div style={{position: 'absolute', left: 0, top: 0, width: L.W, height: PANEL_VIEW_H, overflow: 'hidden', opacity: o, background: K.panelBg}}>
          <div style={{position: 'absolute', transformOrigin: '0 0', transform: `translate(${L.W / 2 - pcx * sp}px, 0px) scale(${sp})`}}>
            <Terminal screen={bb.screen} panelShift={bb.panelShift} />
          </div>
        </div>
        <div style={{position: 'absolute', left: 0, top: PANEL_VIEW_H + GAP, width: L.W, height: chatH, overflow: 'hidden', opacity: o, background: K.bg}}>
          <div style={{position: 'absolute', transformOrigin: '0 0', transform: `translate(${L.W / 2 - c.cx * c.s}px, ${chatH / 2 - c.cy * c.s}px) scale(${c.s})`}}>
            <Terminal screen={bb.screen} sweep={sweep} />
          </div>
        </div>
      </React.Fragment>
    );
  };
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: L.W, height: L.VH, overflow: 'hidden'}}>
      {views(b, 1, f, old ? {p: b.sweepP!, old} : undefined)}
      {prev && cut ? views(prev, 1 - (f - cut.f) / 6, cut.f - 1) : null}
    </div>
  );
};

/* ---------------- captions + keycaps ---------------- */

const Caption: React.FC<{f: number; L: Layout}> = ({f, L}) => {
  let c = CAPTIONS[0];
  for (const x of CAPTIONS) if (f >= x.f) c = x;
  if (!c.text || f < c.f) return null;
  const t = clamp01((f - c.f) / 6);
  const o = easeIO(t);
  return (
    <div
      style={{
        position: 'absolute',
        left: 40,
        right: L.W > L.H ? 200 : 40,
        top: L.VH,
        height: L.H - L.VH - (L.W > L.H ? 0 : 110),
        display: 'flex',
        alignItems: 'center',
        justifyContent: L.W > L.H ? 'flex-start' : 'center',
        paddingLeft: L.W > L.H ? 44 : 0,
      }}
    >
      <div
        style={{
          fontFamily: FONT_SANS,
          fontSize: L.caption,
          fontWeight: 500,
          color: '#efe9df',
          letterSpacing: -0.2,
          opacity: o,
          transform: `translateY(${(1 - o) * 8}px)`,
          textAlign: L.W > L.H ? 'left' : 'center',
          lineHeight: 1.25,
        }}
      >
        {c.text}
      </div>
    </div>
  );
};

const Keycap: React.FC<{f: number; L: Layout}> = ({f, L}) => {
  const k = KEYS.find((x) => f >= x.f - 6 && f < x.f + 20);
  if (!k) return null;
  const appear = clamp01((f - (k.f - 6)) / 6);
  const gone = 1 - clamp01((f - (k.f + 14)) / 6);
  const press = interpolate(f - k.f, [-1, 0, 2, 6], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const wide = L.W > L.H;
  const size = 70;
  return (
    <div
      style={{
        position: 'absolute',
        right: wide ? 56 : (L.W - size) / 2,
        top: wide ? L.VH + (L.H - L.VH - size) / 2 - 6 : L.H - size - 40,
        opacity: Math.min(appear, gone),
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexDirection: 'row-reverse',
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          background: '#2a2724',
          border: '1.5px solid #4a463f',
          boxShadow: `0 ${7 - press * 5}px 0 #0b0a09`,
          transform: `translateY(${press * 5}px)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT_MONO,
          fontSize: 34,
          fontWeight: 600,
          color: press > 0.5 ? K.lavender : '#efe9df',
        }}
      >
        {k.key}
      </div>
      {k.label && wide ? <div style={{fontFamily: FONT_MONO, fontSize: 20, color: '#8f887d'}}>{k.label}</div> : null}
    </div>
  );
};

/* ---------------- intro and end card ---------------- */

const beatIn = (f: number, f0: number) => easeIO(clamp01((f - f0) / 8));

const Intro: React.FC<{f: number; L: Layout}> = ({f, L}) => {
  const wide = L.W > L.H;
  const big = wide ? 64 : 50;
  const items = ['1 feature', '4 tasks', 'many sessions'];
  return (
    <AbsoluteFill style={{background: BG, fontFamily: FONT_MONO, color: '#efe9df'}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: L.VH, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: wide ? 70 : 60}}>
        <div style={{display: 'flex', gap: wide ? 34 : 18, fontSize: big, fontWeight: 700, flexDirection: wide ? 'row' : 'column', alignItems: 'center'}}>
          {items.map((t, i) => {
            const o = beatIn(f, at(0, i));
            return (
              <span key={t} style={{opacity: o, transform: `translateY(${(1 - o) * 14}px)`}}>
                {t}
                {wide && i < 2 ? <span style={{color: K.orange, marginLeft: 34}}>·</span> : null}
              </span>
            );
          })}
        </div>
        <div style={{display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 36, rowGap: 20, fontSize: wide ? 32 : 28}}>
          {[
            ['one long chat', 'context bloats', K.amber],
            ['a fresh chat', 'context is lost', K.grey],
          ].map(([a, b, col], i) => {
            const o = beatIn(f, at(1, i * 2));
            return (
              <React.Fragment key={a}>
                <span style={{opacity: o, color: '#c9c2b6', textAlign: 'right'}}>{a}</span>
                <span style={{opacity: o, color: col, transform: `translateX(${(1 - o) * 12}px)`}}>→ {b}</span>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{f: number; L: Layout}> = ({f, L}) => {
  const wide = L.W > L.H;
  const e = at(S.end);
  const hl = ['Design → roadmap', 'Clean context, kept knowledge', 'One task, one agent'];
  const glyph = [
    ['●', K.teal],
    ['▲', K.amber],
    ['◐', K.lavender],
  ];
  const fadeOut = 1 - clamp01((f - (TOTAL_FRAMES - 14)) / 14);
  return (
    <AbsoluteFill style={{background: BG, fontFamily: FONT_MONO, color: '#efe9df', opacity: fadeOut}}>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: wide ? 0 : '0 50px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 22, opacity: beatIn(f, e), transform: `translateY(${(1 - beatIn(f, e)) * 16}px)`}}>
          <span style={{fontSize: wide ? 96 : 84, fontWeight: 700, letterSpacing: -2}}>Work Panel</span>
        </div>
        <div style={{fontFamily: FONT_SANS, fontSize: wide ? 32 : 30, color: '#a39b8f', marginTop: 14, opacity: beatIn(f, e), textAlign: 'center'}}>
          panel + roadmap skill + tracker, in one plugin
        </div>
        <div style={{display: 'flex', flexDirection: wide ? 'row' : 'column', gap: wide ? 20 : 16, marginTop: wide ? 52 : 56, alignItems: 'center'}}>
          {hl.map((h, i) => {
            const o = beatIn(f, at(S.end, i + 1));
            return (
              <div
                key={h}
                style={{
                  opacity: o,
                  transform: `translateY(${(1 - o) * 10}px)`,
                  fontFamily: FONT_SANS,
                  fontSize: wide ? 30 : 34,
                  fontWeight: 500,
                  padding: '14px 26px',
                  borderRadius: 12,
                  border: '1px solid #34302a',
                  background: '#1b1915',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'center',
                }}
              >
                <span style={{color: glyph[i][1], fontFamily: FONT_MONO}}>{glyph[i][0]}</span>
                {h}
              </div>
            );
          })}
        </div>
        <div
          style={{
            marginTop: wide ? 56 : 64,
            opacity: beatIn(f, at(S.end + 1)),
            background: '#0e0e0e',
            border: '1px solid #34302a',
            borderRadius: 12,
            padding: '20px 30px',
            fontSize: wide ? 28 : 25,
            lineHeight: 1.5,
            textAlign: 'left',
          }}
        >
          <span style={{color: K.grey}}>❯ </span>
          <span style={{color: K.lavender}}>/plugin install</span> work-panel{wide ? ' ' : <br />}
          {wide ? null : <span style={{marginLeft: 26}} />}--marketplace ilikeeatingrice/claude-code-work-panel
        </div>
        <div style={{marginTop: 28, fontSize: wide ? 26 : 24, color: '#a39b8f', opacity: beatIn(f, at(S.end + 1, 2))}}>
          github.com/ilikeeatingrice/claude-code-work-panel
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const TitleCard: React.FC<{f: number; L: Layout}> = ({f, L}) => {
  const wide = L.W > L.H;
  const glyph = [
    ['●', K.teal],
    ['▲', K.amber],
    ['◐', K.lavender],
  ];
  // eased push-out on the last beat of the card
  const out = easeIO(clamp01((f - TITLE_OUT) / TITLE_OUT_FRAMES));
  const [title, sub, ...chips] = TITLE_BEATS;
  return (
    <AbsoluteFill
      style={{
        background: BG,
        fontFamily: FONT_MONO,
        color: '#efe9df',
        opacity: 1 - out,
        transform: `scale(${1 + 0.08 * out})`,
      }}
    >
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', flexDirection: 'column'}}>
        <div style={{fontSize: wide ? 76 : 92, fontWeight: 700, letterSpacing: -2, opacity: beatIn(f, title.f), transform: `translateY(${(1 - beatIn(f, title.f)) * 14}px)`}}>
          {title.text}
        </div>
        <div style={{fontFamily: FONT_SANS, fontSize: wide ? 30 : 38, color: '#a39b8f', marginTop: 12, opacity: beatIn(f, sub.f)}}>
          {sub.text}
        </div>
        <div style={{display: 'flex', flexDirection: wide ? 'row' : 'column', gap: wide ? 20 : 22, marginTop: wide ? 50 : 70, alignItems: 'center'}}>
          {chips.map((c, i) => {
            const o = beatIn(f, c.f);
            return (
              <div
                key={c.text}
                style={{
                  opacity: o,
                  transform: `translateY(${(1 - o) * 10}px)`,
                  fontFamily: FONT_SANS,
                  fontSize: wide ? 30 : 40,
                  fontWeight: 500,
                  padding: wide ? '14px 26px' : '18px 34px',
                  borderRadius: 12,
                  border: '1px solid #34302a',
                  background: '#1b1915',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'center',
                }}
              >
                <span style={{color: glyph[i][1], fontFamily: FONT_MONO}}>{glyph[i][0]}</span>
                {c.text}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ---------------- the whole video ---------------- */

export const Main: React.FC<{L: Layout}> = ({L}) => {
  const f = useCurrentFrame();
  const termOn = f >= at(S.design) && f < at(S.end) + 8;
  const termIn = easeIO(clamp01((f - at(S.design)) / 8));
  const endIn = easeIO(clamp01((f - at(S.end)) / 8));
  return (
    <AbsoluteFill style={{background: BG}}>
      <Audio src={staticFile('track.wav')} />
      {f >= at(S.problem) - 5 && f < at(S.design) + 8 ? <Intro f={f} L={L} /> : null}
      {f < TITLE_OUT + TITLE_OUT_FRAMES ? <TitleCard f={f} L={L} /> : null}
      {termOn ? (
        <div style={{position: 'absolute', inset: 0, opacity: termIn, transform: `scale(${0.98 + 0.02 * termIn})`}}>
          {L.stacked ? <TermStacked f={f} L={L} /> : <TermView f={f} L={L} />}
        </div>
      ) : null}
      {f >= at(S.end) ? (
        <div style={{position: 'absolute', inset: 0, opacity: endIn}}>
          <EndCard f={f} L={L} />
        </div>
      ) : null}
      {f >= at(S.problem) && f < at(S.end) ? (
        <>
          <div style={{position: 'absolute', left: 0, right: 0, top: L.VH, bottom: 0, background: BG, borderTop: '1px solid #26231f'}} />
          <Caption f={f} L={L} />
          <Keycap f={f} L={L} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};

export {FPB};
