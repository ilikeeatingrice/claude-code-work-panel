import React from 'react';
import {Composition} from 'remotion';
import {FPS, TOTAL_FRAMES} from './beat';
import {Main, TALL_LAYOUT, WIDE_LAYOUT} from './Main';

const Wide: React.FC = () => <Main L={WIDE_LAYOUT} />;
const Tall: React.FC = () => <Main L={TALL_LAYOUT} />;

export const Root: React.FC = () => (
  <>
    <Composition id="WorkPanelDemo" component={Wide} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="WorkPanelDemo4x5" component={Tall} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1350} />
  </>
);
