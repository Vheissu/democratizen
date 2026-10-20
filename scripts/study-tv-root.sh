#!/bin/sh
set -eu

workspace=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$workspace/scripts/tizen-env.sh"
tool=${SAMSUNG_TV_ROOT_HOME:-"$workspace/.tools/samsung-tv-root"}
payloads=${TV_ROOT_PAYLOADS:-"$tool/build/common"}
python=${TV_ROOT_PYTHON:-python3}
command=${1:-id}

if [ ! -x "$sdb" ] || [ ! -f "$payloads/SamsungTvArchiveRoot.dll" ] || [ ! -f "$payloads/SamsungTvRootAgent.dll" ]; then
  printf '%s\n' 'Root payloads are missing. See docs/root-access.md for setup.' >&2
  exit 1
fi

PYTHONPATH="$tool/src" \
  exec "$python" -m samsung_tv_root --sdb "$sdb" -o json archive-root root "$tv_ip" \
    --payload-directory "$payloads" --command "$command"
