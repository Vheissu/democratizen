# democratizen

Your TV is a computer. Build something for it.

democratizen is a practical starting point for making Samsung Tizen TVs your own. It includes a working terminal app, a tiny first-app example, deployment scripts, and the steps that got a Samsung Frame accepting our apps and running commands as root.

The first app is **Frame Terminal**: real shells on your Mac, displayed on the TV, with up to eight independent sessions and keyboard input. Leave the TV app, come back, and your shells are still there while the host service is running.

## Start here

| I want to… | Read |
| --- | --- |
| Check what hardware and software I need | [Requirements](docs/prerequisites.md) |
| Enable Developer Mode and connect to the TV | [Getting into the TV](docs/developer-mode.md) |
| Create the certificates needed to install apps | [Signing and certificates](docs/signing.md) |
| Put a small app on the screen first | [Your first TV app](docs/first-app.md) |
| Use a Mac terminal on the TV | [Frame Terminal setup and controls](docs/frame-terminal.md) |
| Build my own app | [App development guide](docs/building-apps.md) |
| Run a command as root on a compatible TV | [Optional root access](docs/root-access.md) |
| Understand the terminal protocol and session service | [Architecture](docs/architecture.md) |
| Fix a failed connection, install or keyboard | [Troubleshooting](docs/troubleshooting.md) |
| Check exactly what has been tested | [Compatibility and test evidence](docs/compatibility.md) |

For a reading order, use the [documentation index](docs/README.md).

## What works today

- A signed Tizen web widget installed and launched over the local network.
- Frame Terminal connected to a Mac, with separate login shells, names, adjustable text size and reconnect restoration.
- USB keyboard typing and Enter, confirmed on the physical TV. Bluetooth follows the same TV keyboard input path; a Bluetooth device hasn't been tested yet.
- Remote navigation and buttons for Esc, Tab, Ctrl C, Ctrl D and arrows.
- Paired clients and encrypted terminal messages. The Mac host accepts an explicit address allowlist.
- An optional one-command root wrapper using [chris-ritsen/samsung-tv-root](https://github.com/chris-ritsen/samsung-tv-root), plus a runtime-detection patch for the tested Frame.

Root is optional. Installing these web apps uses Samsung's Developer Mode and signing tools. Frame Terminal currently runs shells on the host computer; an interactive shell on the TV itself is future work.

## Tested hardware

| Device | Platform | Verified |
| --- | --- | --- |
| Samsung Frame `QA43LS03DAWXXY` | Tizen 9.0; internal build `T-PTMDUABC-0090-REL-202605141702` | Signed apps, Mac terminal, USB keyboard typing/Enter, one-command root |
| macOS, Apple Silicon | Node.js 25.2.1; node-pty 1.1.0 | Host service, real PTYs, login startup |

These are the devices tested here. Other Samsung TVs, firmware builds and host platforms need their own reports. The app manifest's minimum Tizen version is a build setting, not a compatibility claim. See [the evidence and limits](docs/compatibility.md).

## Quick start

First complete [Developer Mode](docs/developer-mode.md) and [signing](docs/signing.md). You need your own Samsung TV certificate profile containing your TV's DUID.

```sh
git clone https://github.com/Vheissu/democratizen.git
cd democratizen
npm ci

# Example LAN addresses. Replace both with your actual addresses.
export TV_IP=192.168.1.50
export FRAME_HOST=192.168.1.10
export TIZEN_STUDIO_HOME="$HOME/tizen-studio"
export SAMSUNG_SIGNING_PROFILE=MySamsungTV

npm run setup
npm run build
npm test
npm run service:install   # macOS; starts the host now and at login
npm run deploy           # signs, installs and launches Frame Terminal
```

On another Unix host, use `npm start` instead of the macOS service helper. That path is experimental. If you only want to check signing and deployment, `npm run deploy:hello` installs the small clock and remote test without a terminal host.

The [full terminal guide](docs/frame-terminal.md) covers configuration, keyboard shortcuts, changing addresses, stopping the service, and pairing recovery. Keep the host awake and on the same LAN as the TV.

## Repository map

```text
app/                 Frame Terminal TV interface and widget manifest
server/              Local host, real PTYs and reconnect screen state
shared/              Client/host cryptographic transport
study-tv-lab/        Small clock, OK and Back example (StudyTVLab)
scripts/             Pairing, build, deploy and macOS service helpers
patches/             Patch against a pinned upstream root-tool revision
tests/               Real PTY and transport tests
docs/                Setup, development, access and troubleshooting guides
```

Local SDKs, root tooling, certificates and pairing keys live under ignored `.tools/`. Builds go into ignored `dist/`. Neither directory belongs in a public release. In particular, a built Frame Terminal widget contains that installation's client key: build and sign your own copy. Read [the security model](SECURITY.md) before sharing an artifact.

## Contributing

Useful contributions include tested TV/firmware reports, keyboard fixes and small apps people can actually run. Include what you tested on hardware and what you only checked in a browser. [CONTRIBUTING.md](CONTRIBUTING.md) has the commands and report format.

democratizen's code is [MIT licensed](LICENSE). The optional upstream root project is [Unlicense](https://github.com/chris-ritsen/samsung-tv-root/blob/4ad2c4d3b0d0e0da4b5b7ebe4a787e94596f416b/LICENSE); Samsung's SDK and certificates have their own terms. This project isn't affiliated with Samsung.
