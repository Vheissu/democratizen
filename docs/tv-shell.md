# The TV's own root shell

Frame Terminal can run one root shell on a compatible TV alongside its Mac sessions. The sidebar and header label it `TV ROOT`, so you can see which machine receives a command. It is a real Bash session on a TV PTY, with persistent working directory/environment, terminal resizing and Ctrl+C.

The Mac remains the companion host. It acquires the tested archive root route, holds the session and relays the terminal. The TV opens an authenticated TLS connection back to the Mac. No terminal listener is opened on the TV.

## Enable it

Complete the existing [terminal setup](frame-terminal.md) and [root tooling setup](root-access.md) first. The root route must work on your exact firmware. Then build the additional managed payload with a .NET 6 SDK:

```sh
npm run root:setup
npm run tv:build
npm run tv:enable
npm run service:install
npm run deploy
```

For a local SDK install, prefix either build command with `DOTNET_CLI=/absolute/path/to/dotnet`. `tv:enable` records the paths to Python, SDB, pinned upstream source and compiled payloads in private `tv-root.json`. It creates a private TLS key and certificate on the Mac. Repeating it reuses the certificate. These files stay under the Frame Terminal data directory.

`service:install` restarts the host and ends existing sessions. Enabling support doesn't acquire root at login or app launch. A TV session starts only when you select **TV root shell** or press **Ctrl Shift T**.

The current route requires the TV's `script`, `stty`, Bash, .NET runtime and the archive-route capabilities. These were verified on the Frame in [compatibility](compatibility.md). Other models need a deliberate test. No model-specific GPU exploit is selected automatically.

## Switch between machines

**Mac session** creates another host shell. **TV root shell** creates or returns to the live TV root session. Both appear in the same list, with `MAC` or `ROOT` labels. Ctrl Shift Left/Right switches between them using the existing session shortcuts. Ctrl Shift T jumps to the TV session.

There are eight sessions total, including a TV session. Only one TV root session can be live at a time. Starting it reserves a slot while connecting, so repeated clicks don't launch multiple root acquisitions. Connection phases appear in its terminal, and failure stays visible as an exited/error session.

Try `id`, `tty`, `pwd` and `stty size` to check the target. The TV session should report UID 0 and a `/dev/pts/` device. Linux paths and commands refer to the television in this session. Its Samsung `User` SMACK label still applies despite UID 0.

## Lifetime and closing

Switching to a Mac session or reconnecting the widget preserves the TV shell while the TV and companion stay online. The host keeps its terminal screen for restoration, just as with a Mac session. The TV's deep standby, reboot or network loss can end the underlying root connection. A failed session isn't silently recreated with elevated privileges; create another explicitly after restoring access.

`exit` ends Bash, runs cleanup, and leaves the final screen visible. **Close** terminates the shell and waits for cleanup before removing the session. The service closes the terminal's process tree, shuts down the root agent, waits for the archive launcher to unwind, removes staging files and compares the original hashes of `/etc/passwd` and `/usr/share/sdbd/public.pem`.

If verification fails, the session remains visible with an error. The last result is saved privately in `tv-root-last-cleanup.json`, including the staging path when known. A timeout is reported as unconfirmed cleanup. Those two file hashes don't cover arbitrary filesystem writes made by your commands.

## Verify on a real TV

```sh
npm run tv:verify
```

This opt-in check acquires root, verifies UID 0 and persistent shell state, changes the PTY to 120 columns by 40 rows, interrupts a `sleep` command with Ctrl+C, and closes the session. It requires verified cleanup before reporting success. It isn't run by CI. Close a live UI root session before using it; don't run multiple SDB/root operations against the same TV concurrently.

The automated suite separately checks target isolation, the disabled-by-default policy, the single-live-root limit, closing input restrictions and failure retention. Hardware testing establishes whether the native PTY and firmware route work on a device.

## Transport and bootstrap

The root terminal stream uses TLS 1.2 or newer. The TV helper pins the Mac certificate's SHA-256 fingerprint. The Mac accepts only the configured TV address and a fresh per-session token, with UID/EUID 0 checked both through the root agent and terminal callback. The helper connects outward and ends its PTY when the connection closes. A heartbeat detects a lost terminal connection.

Initial acquisition still uses Samsung's unencrypted SDB transport and the pinned upstream root-agent protocol. That bootstrap is a trusted-LAN operation. Encrypting the terminal stream doesn't make the initial root acquisition safe on an untrusted network. The existing encrypted widget-to-Mac protocol remains in use for both session targets.

If the Mac address changes, update both the normal terminal configuration and `tv-root.json`, then rebuild/redeploy and restart. To disable TV support, set `enabled` to `false` in that private file and restart the host. Removing the TLS files alone doesn't disable an already running process.
