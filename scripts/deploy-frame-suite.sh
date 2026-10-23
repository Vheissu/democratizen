#!/bin/sh
set -eu
workspace=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$workspace/scripts/tizen-env.sh"
cd "$workspace"
node scripts/build-frame-suite.mjs "${1:-all}"
export FRAME_SUITE_TIZEN="$tizen_cli" FRAME_SUITE_SDB="$sdb" FRAME_SUITE_SERIAL="$serial" FRAME_SUITE_PROFILE="$profile"
node scripts/install-frame-suite.mjs "${1:-all}"
