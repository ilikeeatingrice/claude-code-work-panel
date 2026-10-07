// One beat grid for the whole video. audio/make_track.py uses the same numbers
// (BPM 120, 4/4, 23 bars) so every cut, key press and caption can land on a beat.
export const FPS = 30;
export const BPM = 120;
export const FPB = (FPS * 60) / BPM; // 15 frames per beat
export const BEATS_PER_BAR = 4;
export const BAR = FPB * BEATS_PER_BAR; // 60 frames per bar

// A 2-bar title card plays before the story. Story bars below are counted from the
// start of the story; bar -2 and -1 are the title card.
export const INTRO_BARS = 2;

/** Frame of a story bar plus an optional beat offset (may be fractional for offbeats). */
export const at = (bar: number, beat = 0) => Math.round((bar + INTRO_BARS) * BAR + beat * FPB);

// Story map, in bars. The drop (the /clear moment) is bar 14.
export const SECTIONS = {
  title: -2, // 2 bars: title card with the three highlights
  problem: 0, // 2 bars
  design: 2, // 2 bars
  create: 4, // 1 bar
  preview: 5, // 2 bars
  registered: 7, // 1 bar
  panel: 8, // 1 bar
  start: 9, // 1 bar
  working: 10, // 2 bars
  clearStart: 12, // 1 bar
  handoff: 13, // 1 bar (riser)
  drop: 14, // 3 bars (the /clear sweep lands on this downbeat)
  liveness: 17, // 2 bars
  end: 19, // 4 bars, button hit on bar 22
} as const;

export const TOTAL_BARS = INTRO_BARS + 23;
export const TOTAL_FRAMES = TOTAL_BARS * BAR; // 1500 = 50 s
