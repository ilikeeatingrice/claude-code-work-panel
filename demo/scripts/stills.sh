#!/usr/bin/env bash
# Review stills from the MP4: create preview, handoff note, liveness, end card.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f out/frame-*.png
grab() { ffmpeg -loglevel error -y -ss "$1" -i out/work-panel-demo.mp4 -frames:v 1 "out/frame-$2.png"; }
grab 18.0 1-create-preview
grab 39.7 2-handoff-note
grab 60.0 3-one-task-one-agent
grab 69.0 4-end-card
ls -lh out/frame-*.png
