// Prints every cut, key press, caption, camera move and the drop with its distance
// from the nearest beat. Run: npm run sync
import {FPB, BAR, at, SECTIONS} from '../src/beat';
import {CAMERA, CAPTIONS, CUTS, KEYS} from '../src/story';
import {TITLE_BEATS} from '../src/titleBeats';

type Row = {f: number; what: string};
const rows: Row[] = [
  ...CUTS.map((c) => ({f: c.f, what: `cut (${c.kind}): ${c.name}`})),
  {f: at(SECTIONS.drop), what: 'DROP: /clear sweep starts (8 frames)'},
  ...TITLE_BEATS.map((t) => ({f: t.f, what: `title card: ${t.text}`})),
  ...KEYS.map((k) => ({f: k.f, what: `key ${k.key}${k.label ? ' ' + k.label : ''}`})),
  ...CAPTIONS.filter((c) => c.text).map((c) => ({f: c.f, what: `caption: ${c.text}`})),
  ...CAMERA.map((c) => ({f: c.f, what: `camera ${c.dur ? `move ${c.dur}f` : 'cut'}`})),
].sort((a, b) => a.f - b.f);

let worst = 0;
console.log('frame   time    bar.beat  off  event');
for (const r of rows) {
  const beat = r.f / FPB;
  const off = r.f - Math.round(beat) * FPB;
  worst = Math.max(worst, Math.abs(off));
  const bar = Math.floor(r.f / BAR);
  const b = (r.f % BAR) / FPB;
  console.log(
    `${String(r.f).padStart(5)}  ${(r.f / 30).toFixed(2).padStart(6)}s  ${String(bar).padStart(3)}.${b.toFixed(2).padEnd(4)}  ${String(off).padStart(3)}  ${r.what}`,
  );
}
console.log(`\n${rows.length} events, largest distance from a beat: ${worst} frames`);
