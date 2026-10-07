import {Config} from '@remotion/cli/config';
import fs from 'node:fs';

// Remotion normally downloads its own headless Chrome. When that download is
// blocked, point REMOTION_CHROME at any local chrome-headless-shell binary.
const chrome = process.env.REMOTION_CHROME;
if (chrome && fs.existsSync(chrome)) {
  Config.setBrowserExecutable(chrome);
}
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
