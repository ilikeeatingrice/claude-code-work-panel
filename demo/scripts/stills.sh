#!/usr/bin/env bash
# Three review stills from the MP4: scene 2 (panel + states), scene 4 (handoff note), scene 6 (liveness).
set -euo pipefail
cd "$(dirname "$0")/.."
grab() { ffmpeg -loglevel error -y -ss "$1" -i out/work-panel-demo.mp4 -frames:v 1 "out/frame-$2.png"; }
grab 13.4 scene2-states
grab 28.7 scene4-handoff
grab 46.7 scene6-liveness
ls -lh out/frame-*.png
