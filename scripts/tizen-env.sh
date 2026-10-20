#!/bin/sh
# Source from a repository script after setting workspace.
sdk=${TIZEN_STUDIO_HOME:-"$workspace/.tools/tizen-studio"}
if [ -z "${TIZEN_STUDIO_HOME:-}" ] && [ ! -d "$sdk" ] && [ -d "$HOME/tizen-studio" ]; then sdk="$HOME/tizen-studio"; fi
tizen_cli=${TIZEN_CLI:-"$sdk/tools/ide/bin/tizen"}
sdb=${SDB:-"$sdk/tools/sdb"}
profile=${SAMSUNG_SIGNING_PROFILE:-StudyFramePublic}
tv_ip=${TV_IP:-${STUDY_TV_IP:-}}
if [ -z "$tv_ip" ]; then
  tv_ip=$(cd "$workspace" && node --input-type=module -e 'import {readConfig} from "./scripts/frame-config.mjs"; try { console.log(readConfig().host.tvIP); } catch {}')
fi
if [ -z "$tv_ip" ]; then
  printf '%s\n' 'Set TV_IP to your TV LAN address. See docs/developer-mode.md.' >&2
  exit 1
fi
if [ ! -x "$sdb" ] || [ ! -x "$tizen_cli" ]; then
  printf '%s\n' 'Tizen SDK tools not found. Set TIZEN_STUDIO_HOME. See docs/prerequisites.md.' >&2
  exit 1
fi
serial="$tv_ip:26101"
