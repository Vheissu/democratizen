# Optional root access

The archive-launcher route was tested on the Frame listed in [compatibility](compatibility.md). It returned an authenticated `uid=0` command result with staging cleanup and unchanged system-file checks. Root is acquired for a command session. Developer Mode and the installed web apps work independently of it.

This guide uses [chris-ritsen/samsung-tv-root](https://github.com/chris-ritsen/samsung-tv-root), pinned to commit `4ad2c4d3b0d0e0da4b5b7ebe4a787e94596f416b`. That project contains the root implementation. democratizen adds a local build/wrapper and a small runtime-detection patch. It doesn't include Samsung firmware, extracted firmware keys or precompiled root payloads.

Use this on a TV you own or administer. A root command can damage the TV just as it can damage another Linux machine. Begin with identity and diagnostic commands. Firmware and platform differences matter: a successful result on one Frame doesn't establish support for all Samsung TVs. Don't select another model's GPU/kernel exploit just because its model number sounds similar.

## What this route does

The upstream archive route checks the SDB foothold, the SDK archive launcher, its effective capabilities, tar support and an available .NET runtime. Its helper uses per-run mount views and an authenticated root agent to execute commands. The local wrapper runs one requested command and returns structured evidence.

UID 0 is useful evidence of identity. Samsung's `User` SMACK label can still restrict operations. This route doesn't install a boot service, permanently replace the TV's firmware, or provide an interactive TV PTY through Frame Terminal. Consult the [pinned upstream source](https://github.com/chris-ritsen/samsung-tv-root/tree/4ad2c4d3b0d0e0da4b5b7ebe4a787e94596f416b) for the implementation and its limits.

## Prerequisites

Get the TV visible as `device` in SDB first. Install Git, Python and the .NET 6 SDK on the host. Upstream declares Python 3.12 or newer. The initial direct-source run here used Python 3.11; use the upstream requirement for a new installation. The Frame has the .NET 6 runtime used by these two payloads.

The host SDK compiles the payloads; the TV's existing runtime executes them. Download the .NET SDK from [Microsoft](https://dotnet.microsoft.com/en-us/download/dotnet/6.0). If you install it in a private local directory, set `DOTNET_CLI` to its executable when building. .NET 6 is an old toolchain used to match this TV runtime; it isn't a requirement for the Mac terminal service.

```sh
export TV_IP=192.168.1.50
export TIZEN_STUDIO_HOME="$HOME/tizen-studio"
export SDB="$TIZEN_STUDIO_HOME/tools/sdb"
"$SDB" connect "$TV_IP:26101"
"$SDB" devices
python3 --version
dotnet --list-sdks
```

If needed, select a specific Python with `TV_ROOT_PYTHON=/path/to/python3.12`. The wrapper uses source via `PYTHONPATH`, so it doesn't require a global `pip install`.

## Build the pinned tooling

From the democratizen repository root:

```sh
npm run root:setup
```

This clones the upstream source into ignored `.tools/samsung-tv-root`, checks out the pinned revision, applies the runtime patch and builds only `SamsungTvRootAgent` and `SamsungTvArchiveRoot` into `build/common`. It copies their .NET 6 runtime configuration. No TV commands are run by this setup step.

An existing checkout must already be at the pinned revision. The script accepts the patch already being applied and otherwise fails if it can't apply cleanly. It won't reset an unrelated checkout. `SAMSUNG_TV_ROOT_HOME` selects a different source directory; `DOTNET_CLI` selects the build executable.

The equivalent build, after cloning and checking out that exact commit, is:

```sh
git -C .tools/samsung-tv-root apply ../../patches/samsung-tv-root-tizen-runtime.patch
dotnet build .tools/samsung-tv-root/payloads/common/SamsungTvRootAgent.csproj \
  --configuration Release --output .tools/samsung-tv-root/build/common
dotnet build .tools/samsung-tv-root/payloads/common/SamsungTvArchiveRoot.csproj \
  --configuration Release --output .tools/samsung-tv-root/build/common
```

The setup script additionally copies the supplied `MaliPhysicalProbe.runtimeconfig.json` to each output assembly's runtimeconfig filename. These are the common archive-route assemblies; it doesn't build or invoke the model-specific Mali exploit.

## Probe the target

```sh
PYTHONPATH="$PWD/.tools/samsung-tv-root/src" \
  python3 -m samsung_tv_root --sdb "$SDB" -o json \
  archive-root probe "$TV_IP"
```

Use your selected Python or source directory if different. The probe checks whether the route's prerequisites are present. It exercises the SDB foothold; treat it as an active device check. An incompatible result is a reason to investigate that exact requirement. Don't bypass the check or change firmware just to match a guess.

## Run a command

```sh
scripts/study-tv-root.sh id
scripts/study-tv-root.sh 'uname -a'
```

The historical script name is retained. `TV_IP` selects the target, or the script can use the saved Frame Terminal host configuration. A single quoted argument is the command executed on the TV. Without an argument it runs `id`. `TV_ROOT_PAYLOADS` overrides the payload directory if you've built the assemblies elsewhere.

Read the JSON result and command exit status. For the tested Frame, the evidence included `uid=0`, `staging_cleaned: true`, and `system_files_unchanged: true`. Keep the full output privately if investigating a failure; redact tokens, device identifiers and network details before sharing it. Don't infer successful cleanup from a command that timed out or was interrupted.

## Why the runtime patch exists

The TV's `/usr/bin/dotnet` launcher rejected `--list-runtimes` with `Unknown option --list-runtimes`, even though a usable runtime was installed. The patch catches that specific launcher response, lists `/usr/share/dotnet/shared/Microsoft.NETCore.App`, and accepts directory-version lines alongside standard runtime output. Other failures still propagate.

See [`patches/samsung-tv-root-tizen-runtime.patch`](../patches/samsung-tv-root-tizen-runtime.patch). The change affects host-side runtime detection. It doesn't modify the TV's `dotnet` executable.

## Ending and recovering a session

The wrapper exits after the command and the upstream cleanup sequence. Root isn't reacquired by a democratizen background daemon. Developer Mode remains enabled separately.

Upstream stages files under the SDK tools temporary area on the TV. An interrupted run can leave staging files on persistent user storage. Its cleanup and system-file checks describe that run; they aren't a blanket guarantee that any arbitrary root command is harmless. If cleanup reports a failure, save the evidence and consult the pinned upstream recovery/source documentation before removing files manually. A reboot ends volatile runtime state, but doesn't prove that persistent staging files were removed.

For a TV-resident shell inside Frame Terminal, a separate authenticated backend and lifecycle design are still needed. The shipped UI currently connects to host PTYs only.
