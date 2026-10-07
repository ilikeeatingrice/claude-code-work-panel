#!/usr/bin/env python3
"""Generate the demo's original soundtrack: audio/track.wav.

120 BPM, 4/4, 25 bars (50 s): a 2-bar title intro, then the 23-bar story.
Tech-house feel, built only from numpy maths:
kick, offbeat hats, clap, sidechain-pumped bass, a short chord-stab motif,
a riser into a drop on bar 14 (the /clear moment in the video), and a short
outro that ends on a button hit on bar 22.

The bar map matches src/beat.ts. Mastering targets about -14 LUFS integrated
with peaks at or below -1 dBFS; loudness is measured with ffmpeg's loudnorm.

Usage: python3 audio/make_track.py   (needs numpy and ffmpeg on PATH)
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
BPM = 120
BEAT = 60.0 / BPM  # 0.5 s
BAR = 4 * BEAT  # 2 s
INTRO = 2  # title-card bars before the story (story bar 0 starts at 4 s)
STORY_BARS = 23
BARS = INTRO + STORY_BARS
DUR = BARS * BAR  # 50 s
N = int(DUR * SR)
TARGET_LUFS = -14.0
CEILING = 10 ** (-1.3 / 20)  # soft limiter ceiling, about -1.3 dBFS

rng = np.random.default_rng(7)
L = np.zeros(N)
R = np.zeros(N)
SC_BUS_L = np.zeros(N)  # goes through the sidechain ducker
SC_BUS_R = np.zeros(N)
VERB_L = np.zeros(N)  # reverb send
VERB_R = np.zeros(N)


def t_of(bar: float, beat: float = 0.0) -> float:
    """Time of a story bar (bar -2 and -1 are the title intro)."""
    return (bar + INTRO) * BAR + beat * BEAT


def midi(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def place(sig: np.ndarray, t0: float, gain=1.0, pan=0.0, bus="main", send=0.0):
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    sig = sig[: N - i0]
    lg = gain * np.sqrt(0.5 * (1 - pan))
    rg = gain * np.sqrt(0.5 * (1 + pan))
    if bus == "sc":
        SC_BUS_L[i0 : i0 + len(sig)] += sig * lg
        SC_BUS_R[i0 : i0 + len(sig)] += sig * rg
    else:
        L[i0 : i0 + len(sig)] += sig * lg
        R[i0 : i0 + len(sig)] += sig * rg
    if send:
        VERB_L[i0 : i0 + len(sig)] += sig * lg * send
        VERB_R[i0 : i0 + len(sig)] += sig * rg * send


def tt(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


# ---------------- instruments ----------------

def kick(dur=0.42):
    t = tt(dur)
    f = 46 + 110 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 6.5)
    click = rng.standard_normal(len(t)) * np.exp(-t * 900) * 0.35
    return np.tanh((body + click) * 1.6) * 0.95


def hat(open_=False):
    dur = 0.18 if open_ else 0.05
    t = tt(dur)
    n = rng.standard_normal(len(t))
    n = n - np.convolve(n, np.ones(5) / 5, mode="same")  # high-pass
    n = np.convolve(n, [0.5, 0.5], mode="same")  # keep energy away from Nyquist
    return n * np.exp(-t * (22 if open_ else 75)) * 0.3


def clap():
    t = tt(0.25)
    n = rng.standard_normal(len(t))
    n = n - np.convolve(n, np.ones(6) / 6, mode="same")  # take off the low end
    env = np.zeros(len(t))
    for k, d in enumerate([0.0, 0.011, 0.022]):
        i = int(d * SR)
        env[i:] += np.exp(-(t[: len(t) - i]) * (140 if k < 2 else 18))
    return n * env * 0.32


def snare_hit(gain=1.0):
    t = tt(0.12)
    n = rng.standard_normal(len(t))
    n = n - np.convolve(n, np.ones(4) / 4, mode="same")
    tone = np.sin(2 * np.pi * 190 * t) * 0.5
    return (n * 0.6 + tone) * np.exp(-t * 30) * 0.3 * gain


def saw(freq, t, harmonics=10, bright=1.0):
    out = np.zeros_like(t)
    for n in range(1, harmonics + 1):
        if freq * n > 16000:
            break
        out += np.sin(2 * np.pi * freq * n * t) / n * np.exp(-(n - 1) / (3.5 * bright))
    return out


def bass_note(m, dur=0.22):
    t = tt(dur)
    f = midi(m)
    sig = saw(f, t, harmonics=9, bright=0.9) * 0.7 + np.sin(2 * np.pi * f * t) * 0.6
    env = np.minimum(1, t / 0.004) * np.exp(-t * 7)
    env[-200:] *= np.linspace(1, 0, 200)
    return sig * env * 0.55


def stab(notes, dur=0.26, bright=1.0):
    t = tt(dur)
    sig_l = np.zeros_like(t)
    sig_r = np.zeros_like(t)
    for m in notes:
        f = midi(m)
        sig_l += saw(f * 2 ** (-7 / 1200), t, harmonics=12, bright=bright)
        sig_r += saw(f * 2 ** (7 / 1200), t, harmonics=12, bright=bright)
    env = np.minimum(1, t / 0.003) * np.exp(-t * 11)
    env[-300:] *= np.linspace(1, 0, 300)
    k = 0.11 / len(notes) ** 0.5
    return sig_l * env * k, sig_r * env * k


def pad(notes, dur):
    t = tt(dur)
    sig = np.zeros_like(t)
    for i, m in enumerate(notes):
        f = midi(m + 12)
        sig += np.sin(2 * np.pi * f * t + i) + 0.3 * np.sin(2 * np.pi * 2 * f * t)
    lfo = 0.85 + 0.15 * np.sin(2 * np.pi * 0.25 * t)
    env = np.minimum(1, t / 0.4) * np.minimum(1, (dur - t) / 0.4)
    return sig * env * lfo * 0.05


def riser(dur):
    t = tt(dur)
    x = t / dur
    n = rng.standard_normal(len(t))
    # brightness rises: mix from smoothed noise to raw noise
    smooth = np.convolve(n, np.ones(24) / 24, mode="same")
    noise = smooth * (1 - x) + (n - smooth) * x
    sweep_f = 180 * (8 ** x)
    sweep = np.sin(2 * np.pi * np.cumsum(sweep_f) / SR) * 0.25
    return (noise * 0.35 + sweep) * (x**1.6) * 0.5


def crash(dur=1.8):
    t = tt(dur)
    n = rng.standard_normal(len(t))
    n = n - np.convolve(n, np.ones(4) / 4, mode="same")
    n = np.convolve(n, [0.5, 0.5], mode="same")
    return n * np.exp(-t * 2.2) * 0.2


# ---------------- harmony ----------------
# A minor: Am - F - C - G, one chord per bar.
CHORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [55, 60, 64, 67], [55, 59, 62, 67]]
ROOTS = [33, 29, 36, 31]
# Stab motif inside a bar, in beats: a syncopated figure.
MOTIF = [0.5, 1.5, 2.25, 3.0, 3.5]

# ---------------- arrangement ----------------
KICK_BARS = set(range(2, 13)) | set(range(14, 22))
HAT_BARS = set(range(1, 22))
BASS_BARS = set(range(4, 13)) | set(range(14, 21))
CLAP_BARS = set(range(8, 13)) | set(range(14, 21))
STAB_BARS = set(range(5, 13)) | set(range(14, 22))
PAD_BARS = set(range(0, 12)) | set(range(19, 22))
DROP = 14
END_HIT = 22

kick_times = []
for bar in range(STORY_BARS):
    ch = CHORDS[bar % 4]
    root = ROOTS[bar % 4]
    if bar in KICK_BARS:
        for b in range(4):
            kick_times.append(t_of(bar, b))
            place(kick(), t_of(bar, b), gain=0.9)
    elif bar == 0:
        kick_times.append(t_of(0))
        place(kick(), t_of(0), gain=0.5)
    elif bar == 13:  # pre-drop: kick only on the first two beats
        for b in range(2):
            kick_times.append(t_of(bar, b))
            place(kick(), t_of(bar, b), gain=0.85)
    if bar in HAT_BARS:
        hg = 0.5 if bar < 2 else 0.85
        for b in range(4):
            place(hat(open_=bar >= 8 and bar != 13), t_of(bar, b + 0.5), gain=hg, pan=0.25)
            if bar >= 4:
                place(hat(), t_of(bar, b + 0.25), gain=hg * 0.35, pan=-0.3)
                place(hat(), t_of(bar, b + 0.75), gain=hg * 0.35, pan=-0.3)
    if bar in CLAP_BARS:
        for b in (1, 3):
            place(clap(), t_of(bar, b), gain=0.9, send=0.35)
    if bar in BASS_BARS:
        for b in range(4):
            place(bass_note(root + (12 if b == 3 and bar >= DROP else 0)), t_of(bar, b + 0.5), gain=1.0, bus="sc")
    if bar in STAB_BARS:
        g = 1.0 if bar >= DROP else 0.7
        bright = 1.3 if bar >= DROP else 0.8
        for pos in MOTIF:
            sl, sr_ = stab(ch, bright=bright)
            place(sl, t_of(bar, pos), gain=g, pan=-0.35, bus="sc", send=0.25)
            place(sr_, t_of(bar, pos), gain=g, pan=0.35, bus="sc", send=0.25)
    if bar in PAD_BARS:
        place(pad(ch, BAR + 0.3), t_of(bar), gain=1.4 if bar < 2 else 1.0, bus="sc", send=0.3)

# title intro (bars -2, -1): filtered pad, soft ticks, a light blip under each highlight chip
def tick(gain=1.0):
    t = tt(0.03)
    n = rng.standard_normal(len(t))
    n = n - np.convolve(n, np.ones(3) / 3, mode="same")
    n = np.convolve(n, [0.5, 0.5], mode="same")
    return n * np.exp(-t * 160) * 0.25 * gain


def blip(m):
    t = tt(0.35)
    f = midi(m)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)) * np.exp(-t * 9) * np.minimum(1, t / 0.004) * 0.12


for bar in (-2, -1):
    place(pad(CHORDS[0] if bar == -2 else CHORDS[3], BAR + 0.3), t_of(bar), gain=1.2, bus="sc", send=0.35)
    for b in range(4):
        place(tick(0.5 + 0.15 * (bar + 2)), t_of(bar, b), gain=1.0, pan=-0.2)
        if bar == -1:
            place(hat(), t_of(bar, b + 0.5), gain=0.35, pan=0.25)
# a blip on each chip beat (title card: -2.2, -2.3, -1.0), rising A minor notes
for (bar, b), m in zip([(-2, 2), (-2, 3), (-1, 0)], [76, 79, 81]):
    place(blip(m), t_of(bar, b), gain=1.0, pan=0.0, send=0.5)
# a short soft swell into the story on the last beat
place(riser(BEAT * 1.0) * 0.5, t_of(-1, 3), gain=0.6, send=0.2)

# riser + snare roll into the drop (bar 13)
place(riser(BAR), t_of(13), gain=1.0, send=0.2)
roll = [0, 1, 2, 2.5, 3, 3.25, 3.5, 3.625, 3.75, 3.875]
for i, b in enumerate(roll):
    place(snare_hit(0.4 + 0.6 * i / len(roll)), t_of(13, b), gain=0.9, pan=0.1)
# the drop
place(crash(), t_of(DROP), gain=1.0, send=0.3)
place(crash(1.2), t_of(19), gain=0.6, send=0.3)
# ending button on bar 22: kick + full stab + short crash, then the tail
kick_times.append(t_of(END_HIT))
place(kick(), t_of(END_HIT), gain=1.0)
sl, sr_ = stab(CHORDS[0] + [45], dur=0.9, bright=1.2)
place(sl, t_of(END_HIT), gain=1.2, pan=-0.3, send=0.6)
place(sr_, t_of(END_HIT), gain=1.2, pan=0.3, send=0.6)
place(crash(1.4), t_of(END_HIT), gain=0.7, send=0.4)

# ---------------- sidechain ----------------
duck = np.ones(N)
for k in kick_times:
    i0 = int(k * SR)
    d = tt(0.45)
    seg = 1 - 0.78 * np.exp(-d / 0.09)
    j = min(N, i0 + len(seg))
    duck[i0:j] = np.minimum(duck[i0:j], seg[: j - i0])
L += SC_BUS_L * duck
R += SC_BUS_R * duck

# ---------------- reverb (FFT convolution with a decaying noise tail) ----------------
def fft_conv(x, ir):
    n = len(x) + len(ir) - 1
    nfft = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]
    return y


ir_t = tt(1.1)
ir_l = rng.standard_normal(len(ir_t)) * np.exp(-ir_t * 4.5)
ir_r = rng.standard_normal(len(ir_t)) * np.exp(-ir_t * 4.5)
ir_l[:300] = 0
ir_r[:300] = 0
L += fft_conv(VERB_L, ir_l) * 0.012
R += fft_conv(VERB_R, ir_r) * 0.012

# ---------------- section levels (dB per bar, before the limiter) ----------------
SECTION_DB = {-2: -4, -1: -3, 0: -3, 1: -3, 2: -7, 3: -7, 4: -6, 5: -5, 6: -5, 7: -5,
              8: -3.5, 9: -3.5, 10: -3.5, 11: -3.5, 12: -3, 13: -4,
              14: 0, 15: 0, 16: 0, 17: 0, 18: 0, 19: -2.5, 20: -2.5, 21: -3, 22: 0}
lvl = np.ones(N)
for bar, db in SECTION_DB.items():
    i0, i1 = int(t_of(bar) * SR), min(N, int(t_of(bar + 1) * SR))
    lvl[i0:i1] = 10 ** (db / 20)
if True:  # bar 13 swells from its level up to the drop
    i0, i1 = int(t_of(13) * SR), int(t_of(14) * SR)
    lvl[i0:i1] = np.linspace(10 ** (-6 / 20), 1.0, i1 - i0) ** 1.5
lvl = np.convolve(lvl, np.ones(441) / 441, mode="same")  # 10 ms smoothing
L *= lvl
R *= lvl

# ---------------- master ----------------
mix = np.stack([L, R], axis=1)
mix -= mix.mean(axis=0)
# fade the tail after the button hit
fade_start = t_of(END_HIT) + 0.7
fs, fe = int(fade_start * SR), N
mix[fs:fe] *= np.linspace(1, 0, fe - fs)[:, None] ** 1.5
mix[:200] *= np.linspace(0, 1, 200)[:, None]


def limit(x, gain, ceiling=CEILING):
    return ceiling * np.tanh(x * gain / ceiling)


def write_wav(path, x):
    pcm = np.clip(np.round(x * 32767), -32768, 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def measure(path):
    p = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af",
         "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", p.stderr, re.S)
    if not m:
        sys.exit("could not read loudnorm output:\n" + p.stderr[-2000:])
    d = json.loads(m.group(0))
    return float(d["input_i"]), float(d["input_tp"])


out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "track.wav")
gain = 1.0 / max(1e-9, np.abs(mix).max()) * 0.5
with tempfile.TemporaryDirectory() as td:
    probe = os.path.join(td, "probe.wav")
    ceiling = CEILING
    for _ in range(10):
        y = limit(mix, gain, ceiling)
        write_wav(probe, y)
        lufs, tp = measure(probe)
        if tp > -1.2:
            ceiling *= 10 ** ((-1.4 - tp) / 20)
            continue
        if abs(lufs - TARGET_LUFS) < 0.25:
            break
        gain *= 10 ** ((TARGET_LUFS - lufs) / 20)
    y = limit(mix, gain, ceiling)
    write_wav(out, y)
lufs, tp = measure(out)
peak_db = 20 * np.log10(np.abs(y).max())
print(f"wrote {out}")
print(f"integrated {lufs:.1f} LUFS · true peak {tp:.1f} dBTP · sample peak {peak_db:.2f} dBFS · {DUR:.0f} s")
