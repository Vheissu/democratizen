#!/bin/sh
set -eu
workspace=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tool=${SAMSUNG_TV_ROOT_HOME:-"$workspace/.tools/samsung-tv-root"}
revision=4ad2c4d3b0d0e0da4b5b7ebe4a787e94596f416b
dotnet_cli=${DOTNET_CLI:-dotnet}
if ! command -v "$dotnet_cli" >/dev/null 2>&1; then
  printf '%s\n' 'Install the .NET 6 SDK or set DOTNET_CLI to its executable. See docs/root-access.md.' >&2
  exit 1
fi
if [ ! -d "$tool" ]; then
  mkdir -p "$(dirname "$tool")"
  git clone https://github.com/chris-ritsen/samsung-tv-root.git "$tool"
  git -C "$tool" checkout --detach "$revision"
fi
if [ "$(git -C "$tool" rev-parse HEAD)" != "$revision" ]; then
  printf '%s\n' 'Root checkout is at a different revision. Use a separate SAMSUNG_TV_ROOT_HOME directory or inspect it manually.' >&2
  exit 1
fi
patch="$workspace/patches/samsung-tv-root-tizen-runtime.patch"
if git -C "$tool" apply --check "$patch" 2>/dev/null; then
  git -C "$tool" apply "$patch"
elif ! git -C "$tool" apply --reverse --check "$patch" 2>/dev/null; then
  printf '%s\n' 'The runtime patch does not apply cleanly. Inspect the upstream checkout before continuing.' >&2
  exit 1
fi
payloads="$tool/build/common"
mkdir -p "$payloads"
"$dotnet_cli" build "$tool/payloads/common/SamsungTvRootAgent.csproj" --configuration Release --output "$payloads"
"$dotnet_cli" build "$tool/payloads/common/SamsungTvArchiveRoot.csproj" --configuration Release --output "$payloads"
for name in SamsungTvRootAgent SamsungTvArchiveRoot; do
  cp "$tool/payloads/qn90f/MaliPhysicalProbe.runtimeconfig.json" "$payloads/$name.runtimeconfig.json"
done
printf '%s\n' 'Root tooling built locally. No TV commands have been run. See docs/root-access.md for the probe and one-command wrapper.'
