#!/bin/sh
set -eu

workspace=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$workspace/scripts/tizen-env.sh"
app="$workspace/study-tv-lab"

"$tizen_cli" build-web -- "$app"
"$tizen_cli" package -t wgt -s "$profile" -- "$app/.buildResult"
"$sdb" connect "$serial"
if ! "$sdb" devices | awk -v serial="$serial" '$1 == serial && $2 == "device" {found=1} END {exit !found}'; then
  printf 'TV is not connected: %s\n' "$serial" >&2
  exit 1
fi
"$tizen_cli" install -s "$serial" -n StudyTVLab.wgt -- "$app/.buildResult"
"$tizen_cli" run -s "$serial" -p wbnosstudy.StudyLab
