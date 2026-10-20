# Security

Frame Terminal can execute commands as the host user. Its pairing keys are access credentials. A paired TV should be trusted at the same level as another terminal logged in as that user.

## Intended deployment

The host binds a selected LAN IPv4 and accepts an explicit source-address allowlist. Cryptographic pairing is required before shell creation or terminal input. The preview serves the paired widget on loopback only. Use this on a private network with trusted devices; don't expose the listener through router forwarding, a public tunnel or an unprotected reverse proxy.

IP filtering is an extra check, not a substitute for pairing. The host service runs without `sudo`; its shells have the normal user's permissions. Startup files can load that user's tools and credentials. The TV's app sandbox doesn't constrain commands once they reach the host shell.

## Transport properties and limits

The client authenticates the host through its pinned public key. The host checks the client's public key against its saved allowlist. A fresh server challenge prevents an old handshake from being accepted on a new connection. Per-connection symmetric keys and independent counters protect encrypted messages against modification and replay.

This is a custom application protocol built with TweetNaCl, over ordinary WebSocket. It isn't TLS and hasn't had an independent security audit. It doesn't provide forward secrecy against later compromise of the static keypairs: recorded handshakes can become decryptable if a corresponding static private key is stolen. Endpoint addresses, connection timing and traffic sizes are visible to the network. A compromised TV/widget or host can access terminal content. Resource limits reduce some abuse but don't make the service suitable for public exposure.

The host has no user-account system, per-session authorization between different people, or key-revocation UI. The current paired client can manage all host sessions. Multiple independent untrusted users are outside this design.

## Files to keep private

- `.tools/frame-terminal/host.json` and `study-tv.json`.
- Generated `dist/frame-terminal/connection.js`, preview copies and the signed Frame Terminal `.wgt`.
- Samsung author/distributor certificates, password records and profile files.
- Device DUIDs, serial numbers, support tokens, root evidence with session credentials, and terminal output containing secrets.

The repository ignores the default private directories and common credential extensions. A custom data directory outside those ignored paths needs its own protection. Don't assume a file is safe to publish because it is generated or encrypted with a password.

Publish source and build instructions. A signed terminal widget from your installation contains a private client key and should stay with that installation. Neither CI nor a release job should upload its generated widget/config as a public artifact.

## Lost or published pairing key

Stop the service. Rotate the host/client pair by removing both private pairing JSON files and running setup again with the right addresses. Rebuild, reinstall the widget and restart the service. An old client can't authenticate against the replacement host config. Restarting ends current shells; preserve any needed work first.

If a Samsung author certificate or password was exposed, use Samsung's certificate procedures for that credential. Terminal-pair rotation doesn't revoke a signing certificate.

## Root tooling

The optional root route executes privileged TV commands and stages temporary payloads. Its returned identity/cleanup checks describe that execution; arbitrary root commands can still write persistent state. Root acquisition happens only for an explicit TV session or one-command wrapper invocation. It doesn't run at login. The [TV shell backend](docs/tv-shell.md) uses a pinned TLS callback, a fresh session token and verified UID/EUID 0. The initial SDB/root-agent bootstrap remains a trusted-LAN operation with unencrypted components. Read [the root guide](docs/root-access.md) and pinned upstream code before enabling it.

## Reporting a vulnerability

Use this repository's GitHub private vulnerability reporting when available. Keep exploit credentials, pairing keys and user terminal output out of public issues. If private reporting isn't available, open a minimal issue asking for a private contact route without publishing the sensitive details. Compatibility and normal setup failures can use public issues with identifiers and credentials removed.
