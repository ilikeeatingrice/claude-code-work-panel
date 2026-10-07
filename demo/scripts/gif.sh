#!/usr/bin/env bash
# README GIF from the rendered MP4: 960 px wide, 10 fps, two-pass palette.
set -euo pipefail
cd "$(dirname "$0")/.."
IN=out/work-panel-demo.mp4
OUT=out/work-panel-demo.gif
PAL=$(mktemp --suffix=.png)
F="fps=10,scale=960:-1:flags=lanczos"
ffmpeg -loglevel error -y -i "$IN" -vf "$F,palettegen=max_colors=192:stats_mode=diff" "$PAL"
ffmpeg -loglevel error -y -i "$IN" -i "$PAL" -lavfi "$F[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" "$OUT"
rm -f "$PAL"
ls -lh "$OUT"
