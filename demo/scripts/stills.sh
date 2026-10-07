#!/usr/bin/env bash
# Review stills from the MP4: create preview, panel with ready tasks, the drop, end card.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f out/frame-*.png
grab() { ffmpeg -loglevel error -y -ss "$1" -i out/work-panel-demo.mp4 -frames:v 1 "out/frame-$2.png"; }
grab 11.50 1-create-preview
grab 17.83 2-panel-ready-tasks
grab 28.17 3-drop-clear
grab 31.50 4-handoff-note
grab 35.50 5-one-task-one-agent
grab 43.33 6-end-card
ls -lh out/frame-*.png
