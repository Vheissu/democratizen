# Documentation

## First run

1. [Requirements](prerequisites.md): TV, host, network, SDK and accounts.
2. [Getting into the TV](developer-mode.md): the hidden Developer Mode screen, the host IP, a full reboot and SDB.
3. [Signing](signing.md): author certificate, distributor certificate, DUID and your profile name.
4. [Your first TV app](first-app.md): build, sign, install and launch the included clock.
5. [Frame Terminal](frame-terminal.md): pair the host, deploy the terminal and use a keyboard.
6. [TV root shell](tv-shell.md): enable the optional TV backend and switch between machines.

## Build and investigate

- [App development](building-apps.md): widget anatomy, focus, keyboard events, permissions, debugging and a repeatable workflow.
- [Root access](root-access.md): the optional archive-launcher route, local build, probe, one-command execution and cleanup evidence.
- [Architecture](architecture.md): PTYs, screen restoration, encryption and files worth reading.
- [Compatibility](compatibility.md): exact hardware, verification status and a report template.
- [Troubleshooting](troubleshooting.md): symptoms with the next concrete check.

## Project policies

- [Security](../SECURITY.md)
- [Contributing](../CONTRIBUTING.md)
- [License](../LICENSE)

Commands assume a POSIX shell and that you're in the repository root unless a guide says otherwise. The tested host is macOS on Apple Silicon. Addresses such as `192.168.1.50` in these guides are examples: replace them with addresses from your own LAN. Keep your local paths, DUID, serial number, keys and passwords out of bug reports.
