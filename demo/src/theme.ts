import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';
import {loadFont as loadSans} from '@remotion/google-fonts/Inter';

const mono = loadMono('normal', {weights: ['400', '600', '700'], subsets: ['latin', 'latin-ext']});
const sans = loadSans('normal', {weights: ['400', '500', '600'], subsets: ['latin']});

export const FONT_MONO = `${mono.fontFamily}, "DejaVu Sans Mono", "Noto Sans Mono", monospace`;
export const FONT_SANS = `${sans.fontFamily}, "Noto Sans", sans-serif`;

export const C = {
  bg: '#1b1814',
  bgVignette: '#141210',
  term: '#100f0d',
  termBar: '#1a1815',
  border: '#2e2a25',
  text: '#e8e2d7',
  dim: '#8f887d',
  faint: '#5f5a52',
  teal: '#6fb7b9',
  tealSoft: 'rgba(111,183,185,0.14)',
  amber: '#e0a85a',
  amberSoft: 'rgba(224,168,90,0.14)',
  blocked: '#b38a7c',
  userBg: '#1d1b18',
  card: '#1c1a17',
};

export const FPS = 30;
export const W = 1920;
export const H = 1080;

// Terminal window geometry (single-terminal scenes)
export const TERM = {x: 80, y: 52, w: 1760, h: 840, bar: 46};
export const PANEL_W = 770;
export const LH = 36; // panel line height
export const TERM_FONT = 22;
