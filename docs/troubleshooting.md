# Troubleshooting

Work through the layer that failed. A successful SDK connection, signed install and host terminal connection are three separate results.

## Can't open the Developer Mode popup

Open Apps and focus App Settings before entering `12345`. On a compact Samsung remote, open the `123` number pad and enter the digits there. Older UI layouts can open the popup from Apps directly. You're looking for Developer Mode and a Host PC IP field. The service menu and remote-support PIN are different screens.

## SDB times out or the TV is offline

Check both current LAN addresses. The TV's Developer Mode host field needs the computer's address, while `sdb connect` needs the TV's address. Save the setting and fully power-cycle the Frame; standby didn't enable SDB in the initial setup.

```sh
"$SDB" connect "$TV_IP:26101"
"$SDB" devices
```

Confirm the exact target says `device`. Check guest Wi-Fi/client isolation, VPN routes and firewall rules next. Keep these ports on your LAN; forwarding a router port doesn't fix a TV that hasn't enabled its development interface.

## `sdb shell` prints `closed`

That is normal on the tested retail firmware. Use the documented SDB app commands for deployment. A restricted shell doesn't establish whether the separate [root route](root-access.md) is compatible.

## Signing profile isn't found

```sh
"$TIZEN_CLI" security-profiles list
"$TIZEN_CLI" cli-config -l
```

Match `SAMSUNG_SIGNING_PROFILE` exactly. Confirm CLI and Certificate Manager use the same SDK/profile storage. If the SDK was moved, inspect its configured profile path and certificate paths. Restore missing private files from your own backup rather than creating a different author identity for an existing app.

## Install fails with 1010 or an authorization error

Check the Samsung TV distributor certificate contains this TV's DUID and hasn't expired. Use your own Samsung TV profile. Check the connected-device installation permission in Device Manager if offered. Then inspect the manifest: valid application/package IDs, TV profile, referenced assets and screen feature.

The initial clock install had a generic failure before correcting the widget metadata and using a simple package name. That observation isn't proof that every generic install failure has the same cause. Capture the platform log around the failed stage.

## App installed but didn't appear

Run the application ID from `tizen:application`, such as `frameterm0.FrameTerminal`. It differs from the widget URI and package filename. An installed app may still fail at JavaScript startup; use Web Inspector if launching doesn't render the interface.

## `posix_spawnp failed`

For node-pty 1.1.0 on macOS, run:

```sh
node scripts/prepare-pty.mjs
```

That restores the npm package's spawn-helper executable bit and is also run by `npm ci`. If the error remains, check that the configured shell and starting directory exist and that your native PTY module matches the host architecture/runtime. Don't run the terminal host as root to work around it.

## TV app keeps reconnecting

Check the host is awake, its service is running and the saved endpoint is current:

```sh
npm run service:status
curl http://HOST:4319/health
```

Replace `HOST` and the port. A health response proves that listener is up, not that pairing succeeded. Check the TV's current IP is in `allowedAddresses`, and that `study-tv.json` and the installed widget belong to the host's current keypair. Rebuild/redeploy after endpoint or pairing changes. The LAN HTTP server deliberately returns 404 for `/connection.js` and app assets; use the loopback preview on the host.

On macOS inspect `.tools/frame-terminal/host-error.log`. If using `FRAME_TERMINAL_DATA_DIR`, inspect that directory instead. A launchd status of running can briefly precede the listener becoming available during startup.

## `EADDRINUSE` or bind failure

A background service and foreground `npm start` may be competing for the same ports. Stop one. If the stored LAN address no longer belongs to the computer, update the private endpoint configuration as described in the [terminal guide](frame-terminal.md). Changing only `FRAME_HOST` in the environment won't rewrite an existing pair.

## Keyboard produces nothing or opens a TV screen

Select **Type in terminal** or press remote Back to return from controls to typing. Test `pwd` and Enter first. Some TV keyboard events arrive through the IME rather than normal browser keydown codes; don't add blanket key suppression. Reserved function keys can open TV functions.

Check the keyboard works in a native TV text field. If USB works and Bluetooth doesn't, verify Bluetooth pairing in the TV settings before investigating the terminal. Report keyboard model, layout, connection type, failed keys and TV firmware. Never include terminal content containing credentials in a screenshot.

## Shell startup prints a long list of variables

The host launches the user's normal login shell. A bare `export` in a shell startup file prints exported variables; that was present in the initial Mac setup. Check your own startup files if unwanted text appears before the prompt. `clear` clears the visible screen but doesn't fix the startup file.

## Text wraps oddly after preview testing

The local preview and TV can view the same PTY. Whichever client last resizes it changes its dimensions. Close the preview and select the session again on the TV. Each session still runs independently of the others.

## Root probe rejects `--list-runtimes`

Use the pinned source and runtime patch from [root access](root-access.md). The tested Frame's dotnet launcher didn't implement that flag. The patch only handles its known response; missing runtime directories or other errors need separate investigation.

## Root command timed out or cleanup failed

Keep the structured result and redact it before sharing. Check the actual failing stage. Don't report success from a partial result or assume reboot removes persistent staging files. Refer to the pinned upstream source for the reported failure; avoid unrelated root commands while diagnosing it.
