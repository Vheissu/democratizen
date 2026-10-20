# Requirements

## Hardware and network

Use a Samsung TV running Tizen, a computer on the same LAN, and a remote that can enter numbers. An LG webOS television needs a different SDK and app format. Check the model label and the TV's software information before installing anything.

For Frame Terminal, a USB keyboard is the simplest first check. Pair a Bluetooth keyboard through the TV's input-device settings if your model supports it. Menu names vary. The physical USB keyboard has been tested here; Bluetooth device testing is still outstanding.

The TV needs to reach the host's terminal port, and the host needs to reach SDB on the TV. Guest Wi-Fi, client isolation, some VPN routes and separate VLANs can prevent this even when both devices have internet access. Start on a private LAN with direct device-to-device traffic.

Write down:

| Value | Example | Used for |
| --- | --- | --- |
| TV LAN IPv4 | `192.168.1.50` | SDB target and host address allowlist |
| Host LAN IPv4 | `192.168.1.10` | TV Developer Mode host and terminal connection |
| TV model and firmware | See [tested device](compatibility.md) | Compatibility and bug reports |

An Ethernet adapter, VPN or second Wi-Fi interface can give the computer several addresses. Choose the one reachable from the TV. On macOS, `networksetup -listallhardwareports` identifies interfaces; `ipconfig getifaddr en0` is useful when `en0` is your active Wi-Fi interface. Don't assume that interface name on every Mac. A DHCP reservation makes addresses easier to keep stable.

## For signed TV apps

Install [Tizen Studio](https://developer.tizen.org/development/tizen-studio/download) from the official site. In its Package Manager, install the TV development packages and Samsung Certificate Extension. Samsung maintains the [TV SDK setup guide](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk.html); check its current host and Java requirements for the installer you're using.

You need:

- The `sdb` executable under `tools/`.
- The `tizen` CLI under `tools/ide/bin/`.
- Certificate Manager and a Samsung developer account.
- A Samsung TV signing profile that includes your TV's DUID.

On macOS the setup also needs a working Java environment for the SDK tools. Intel-only components may need Rosetta on Apple Silicon. Use the vendor's requirements for your SDK build. The SDK is several gigabytes and is installed separately from this repository.

Set the SDK location and check both tools:

```sh
export TIZEN_STUDIO_HOME="$HOME/tizen-studio"
"$TIZEN_STUDIO_HOME/tools/sdb" version
"$TIZEN_STUDIO_HOME/tools/ide/bin/tizen" version
```

The scripts look for a checkout-local `.tools/tizen-studio` first, then `~/tizen-studio`. `TIZEN_STUDIO_HOME` overrides that choice. You can also set exact executable paths with `SDB` and `TIZEN_CLI`. Paths containing spaces are quoted by the scripts.

## For Frame Terminal

Install Node.js 22 or newer, npm, and Git. The verified runtime was Node 25.2.1 on macOS. `npm ci` installs the pinned lockfile, including the native PTY module. A supported prebuilt PTY binary avoids compilation; building from source can require the host's compiler tools. On macOS those are installed with `xcode-select --install`.

The postinstall script restores the executable permission on node-pty 1.1.0's macOS spawn helper. Without it, creating a shell can fail with `posix_spawnp failed`.

The macOS login service uses `launchd`. Windows isn't supported by the current host shell/service code; Linux foreground use is experimental and hasn't been validated on hardware.

## For optional root access

Root has a separate [guide](root-access.md). Its host tooling uses Python (upstream requests 3.12+) and the .NET 6 SDK to build the two archive-route payloads. You don't need Python, .NET or root access to build and install the web apps.
