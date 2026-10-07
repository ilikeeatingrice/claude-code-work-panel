#!/usr/bin/env bash
# Silent README GIF from the rendered MP4: 960 px wide, two-pass palette, kept under 8 MB.
set -euo pipefail
cd "$(dirname "$0")/.."
IN=out/work-panel-demo.mp4
OUT=out/work-panel-demo.gif
PAL=$(mktemp --suffix=.png)
for FPS in 10 8 6; do
  F="fps=$FPS,scale=960:-1:flags=lanczos"
  ffmpeg -loglevel error -y -i "$IN" -vf "$F,palettegen=max_colors=128:stats_mode=diff" "$PAL"
  ffmpeg -loglevel error -y -i "$IN" -i "$PAL" -an -lavfi "$F[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" "$OUT"
  SIZE=$(stat -c %s "$OUT")
  echo "fps=$FPS -> $((SIZE / 1024)) KB"
  [ "$SIZE" -le $((8 * 1024 * 1024)) ] && break
done
rm -f "$PAL"
