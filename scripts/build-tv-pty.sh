#!/bin/sh
set -eu
workspace=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
dotnet_cli=${DOTNET_CLI:-dotnet}
"$dotnet_cli" build "$workspace/tv-pty/FrameTerminalPty.csproj" --configuration Release --output "$workspace/.tools/tv-pty"
