#!/bin/sh
set -eu
workspace=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$workspace/scripts/tizen-env.sh"
cd "$workspace"
export FRAME_SUITE_SDB="$sdb" FRAME_SUITE_SERIAL="$serial"
node scripts/verify-frame-suite.mjs "${1:-all}"
