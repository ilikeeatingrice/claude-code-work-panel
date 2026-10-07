import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';
import {loadFont as loadSans} from '@remotion/google-fonts/Inter';

const mono = loadMono('normal', {weights: ['400', '700'], subsets: ['latin', 'latin-ext']});
const sans = loadSans('normal', {weights: ['400', '500', '600'], subsets: ['latin']});

export const FONT_MONO = `${mono.fontFamily}, "DejaVu Sans Mono", "Noto Sans Mono", "Noto Sans Symbols 2", monospace`;
export const FONT_SANS = `${sans.fontFamily}, "Noto Sans", sans-serif`;
