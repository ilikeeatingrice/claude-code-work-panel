#!/usr/bin/env bash
# Review stills from the MP4: title card, create preview, panel with ready tasks, the drop, the note, one task one agent, end card.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f out/frame-*.png
grab() { ffmpeg -loglevel error -y -ss "$1" -i out/work-panel-demo.mp4 -frames:v 1 "out/frame-$2.png"; }
grab 3.17 0-intro
grab 15.50 1-create-preview
grab 21.83 2-panel-ready-tasks
grab 32.17 3-drop-clear
grab 35.50 4-handoff-note
grab 39.50 5-one-task-one-agent
grab 47.33 6-end-card
ls -lh out/frame-*.png
