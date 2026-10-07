import {at} from './beat';

// The 2-bar title card: what appears on which beat.
export const TITLE_BEATS = [
  {f: at(-2, 0), text: 'Work Panel'},
  {f: at(-2, 1), text: 'for Claude Code'},
  {f: at(-2, 2), text: 'Design → roadmap'},
  {f: at(-2, 3), text: 'Clean context, kept knowledge'},
  {f: at(-1, 0), text: 'One task, one agent'},
];
export const TITLE_OUT = at(-1, 3); // push-out starts on the last beat
export const TITLE_OUT_FRAMES = 10;
