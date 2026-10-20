# Contributing

Start with a concrete change or a reproducible hardware report. The project began on one Samsung Frame; carefully described results on other TVs are useful.

## Work locally

```sh
npm ci
npm test
```

To build without connecting to a TV, generate a disposable pair in a private temporary directory and use example endpoint addresses:

```sh
export FRAME_TERMINAL_DATA_DIR="$(mktemp -d)"
export TV_IP=192.0.2.50
export FRAME_HOST=192.0.2.10
npm run build
```

That compiles browser assets; it doesn't validate a network connection or sign/install a widget. The generated config and build remain private. Don't use a disposable pair to overwrite a working installation's pairing files.

For hardware work follow [the first-app guide](docs/first-app.md) and [terminal setup](docs/frame-terminal.md). CI doesn't access a TV, Samsung account, private signing profile or root shell.

## Before a pull request

- Explain the problem and the behaviour changed.
- Run tests relevant to the change and report the result.
- For TV changes, name the model/firmware and the keys or screens you checked. Distinguish browser testing from physical-device testing.
- Update the guide if setup, privileges, ports or generated files change.
- Keep certificates, client keys, paired widgets and device identifiers out of the diff.

Use the configured human Git author identity and factual commit messages. Avoid committing SDK trees, generated bundles or vendor binaries. Changes to the root runtime patch should name the upstream revision they apply to and explain why any catch/fallback is narrow enough.

## Hardware reports

Use the [compatibility template](docs/compatibility.md#report-another-device). If you're testing input, include keyboard model, USB/Bluetooth, layout and individual modifier keys. A result such as “typing and Enter work; Alt untested” is more useful than “everything works”.

For root-related failures, report the stage and sanitized error. Don't attach raw root-agent credentials or ask another person to publish their DUID, signing identity or private configuration.

## Areas that need work

Physical Bluetooth verification, more TV models, non-US layouts, long-running terminal use and a host platform matrix all need evidence. The [TV root backend](docs/tv-shell.md) also needs reports from other compatible firmware. Keep its authenticated callback, explicit acquisition and cleanup checks intact when extending it.
