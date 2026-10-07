import React from 'react';
import {AbsoluteFill, Composition, Sequence, interpolate, useCurrentFrame} from 'remotion';
import {SceneClearOther, SceneClearSame, SceneCreate, SceneEnd, SceneLive, SceneProblem, SceneStartable} from './scenes';
import {FPS, H, W} from './theme';

export const SCENES: {name: string; dur: number; C: React.FC}[] = [
  {name: 'Problem: big work, many sessions', dur: 210, C: SceneProblem},
  {name: 'Design, then /work create', dur: 510, C: SceneCreate},
  {name: 'Only startable work', dur: 240, C: SceneStartable},
  {name: 'Clear and start (same roadmap)', dur: 570, C: SceneClearSame},
  {name: 'Clear and start (other roadmap)', dur: 180, C: SceneClearOther},
  {name: 'One task, one agent', dur: 210, C: SceneLive},
  {name: 'End card', dur: 210, C: SceneEnd},
];

const TOTAL = SCENES.reduce((s, x) => s + x.dur, 0);

const FadeIn: React.FC<{children: React.ReactNode; dur: number; last: boolean}> = ({children, dur, last}) => {
  const f = useCurrentFrame();
  const o = Math.min(
    interpolate(f, [0, 8], [0, 1], {extrapolateRight: 'clamp'}),
    last ? 1 : interpolate(f, [dur - 6, dur], [1, 0.0], {extrapolateLeft: 'clamp'}),
  );
  return <AbsoluteFill style={{opacity: o, background: '#141210'}}>{children}</AbsoluteFill>;
};

const Demo: React.FC = () => {
  let at = 0;
  return (
    <AbsoluteFill style={{background: '#141210'}}>
      {SCENES.map((s, i) => {
        const from = at;
        at += s.dur;
        return (
          <Sequence key={s.name} from={from} durationInFrames={s.dur} name={s.name}>
            <FadeIn dur={s.dur} last={i === SCENES.length - 1}>
              <s.C />
            </FadeIn>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const Root: React.FC = () => (
  <Composition id="WorkPanelDemo" component={Demo} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
);
