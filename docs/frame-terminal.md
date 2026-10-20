# Frame Terminal

Frame Terminal displays real host shells on a Samsung TV. On the tested Mac, each session is a separate `/bin/zsh -l` process on a PTY. Shell variables, working directories and running commands belong to that session. The TV renders the terminal and sends input.

## Install

With the [SDK](prerequisites.md), [Developer Mode](developer-mode.md) and [signing profile](signing.md) ready:

```sh
npm ci
export TV_IP=192.168.1.50
export FRAME_HOST=192.168.1.10
export TIZEN_STUDIO_HOME="$HOME/tizen-studio"
export SAMSUNG_SIGNING_PROFILE=MySamsungTV
npm run setup
npm run build
npm run service:install
npm run deploy
```

Replace the example addresses. On first setup, `TV_IP` is required. `FRAME_HOST` can be detected from a private IPv4 interface, but set it explicitly if the host has several interfaces. First setup writes a host keypair, a TV client keypair, the host address and an address allowlist. Existing pairing files are reused; repeating setup doesn't silently rotate keys or apply new environment values.

On the TV, wait for the host name and a prompt. Type `pwd`, press Enter, then create another session. Run `cd /tmp` in that second session and switch back to check the directories are independent.

## Controls

| Input | Action |
| --- | --- |
| Typing, arrows, Tab, Esc, Ctrl/Alt combinations | Terminal input while the shell has focus |
| Ctrl Shift N | Create a session |
| Ctrl Shift Left / Right | Switch between sessions |
| Ctrl Shift P | Toggle typing and app controls |
| Remote Back | Open controls, or return to typing |
| Remote arrows and OK in controls | Move focus and activate a button |
| New session | Start another shell, up to eight |
| Rename | Change the selected session's label |
| Close | End the selected shell, after confirmation |
| A− / A+ | Change terminal text size |
| Bottom key buttons | Send Esc, Tab, Ctrl C, Ctrl D or arrows |

The selected session and font size are remembered on that client. A new connection chooses the remembered session if it still exists. If no sessions exist when connecting, the app creates one.

Connect a USB keyboard directly to the TV or its keyboard-capable hub. For Bluetooth, pair through the TV's device settings before using the app. Bluetooth uses the same browser input path, but a physical Bluetooth keyboard hasn't been verified here. Samsung may reserve keys for TV functions. USB typing and Enter are confirmed; report modifier/layout issues with the keyboard model and firmware.

## Session lifetime

Leaving the app, a temporary Wi-Fi loss or a browser reload doesn't kill shells. The host retains each session and reconstructs its screen on attach, with up to 2,000 lines of scrollback. Reconnection uses a fresh encrypted transport session.

Closing a session ends its shell. `exit` leaves an exited session visible so you can read its final screen before closing it. Stopping/restarting the host service, logging out, or restarting the computer ends all its sessions. Sessions aren't saved to disk and aren't a replacement for `tmux` if you need recovery after a host-process restart. Mac sleep suspends reachability.

Two clients can attach to the same shell, and their terminal size changes affect that shared PTY. The browser preview is intended for local development. Close it after testing if you want the TV to be the only viewer; reselect the TV session to apply its dimensions again.

## First-setup configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `TV_IP` | Required | TV's IPv4 address; `STUDY_TV_IP` is a legacy alias |
| `FRAME_HOST` | Detected private IPv4 | Host address reachable by the TV |
| `FRAME_PORT` | `4319` | LAN terminal WebSocket/health port |
| `FRAME_PREVIEW_PORT` | `4320` | Loopback-only browser preview port |
| `FRAME_SHELL` | `/bin/zsh` on macOS; `/bin/bash` elsewhere | Existing host shell, launched with `-l` |
| `FRAME_CWD` | Repository directory | Starting directory for new sessions |
| `FRAME_TERMINAL_DATA_DIR` | `.tools/frame-terminal` | Private pairing/config/log directory |

Ports must be different integers between 1024 and 65535. The host binds one specific IPv4 address. It doesn't bind `0.0.0.0`. Changing an environment variable after setup doesn't overwrite saved configuration.

Files in the data directory:

| File | Contents |
| --- | --- |
| `host.json` | Host private/public key, allowed client public keys, addresses, ports and shell settings |
| `study-tv.json` | TV client private key, host public key and host endpoint; historical filename |
| `host.log`, `host-error.log` | LaunchAgent output/error logs |

Directories are created with mode `0700`; pairing JSON files with `0600`. If you choose a custom data directory outside the repository, keep it private and don't commit it elsewhere. `npm run build` embeds the client settings into `dist/frame-terminal/connection.js` and generates the manifest origin.

## Service management on macOS

```sh
npm run service:status
npm run service:stop
npm run service:install
```

`service:install` starts the service now and installs `~/Library/LaunchAgents/com.rangefront.frame-terminal.plist` for future logins. Running it again restarts the process and ends its shells. `service:stop` unloads it for the current login session; the plist remains. To remove login startup permanently, stop the service and remove that specific plist from `~/Library/LaunchAgents/`.

The plist records the current Node executable and repository path. If you move this checkout or remove that Node version, reinstall the service from the new location. It runs as your normal macOS user. It doesn't require `sudo`.

For foreground work, stop the LaunchAgent and run `npm start`. The health check is `http://HOST:4319/health`; the preview is `http://127.0.0.1:4320`. Replace the ports if configured differently. Logs and private config remain under the data directory.

## Changing addresses

Stop the host service before editing its saved configuration; that ends active shells. Update `listenHost`, `tvIP` and `allowedAddresses` in `host.json`. Update `host` in `study-tv.json`. Keep key values intact. If the host address changed, also update the TV's Developer Mode Host PC IP.

Rebuild, restart the service and redeploy the widget. For a TV address change, update `TV_IP` in your shell or use the saved `host.json` value. Exported `TV_IP` takes precedence for deploy commands, so an old export can still point at the wrong device.

## Lost or exposed pairing

Stop the service. Keep any needed configuration privately, remove both pairing JSON files, and run setup with your actual addresses to create a fresh pair. Then rebuild/redeploy and restart the service. Removing only one pairing file deliberately causes setup to fail so a partial loss isn't silently replaced.

A widget or `connection.js` from the old pair stops authenticating against the new host config. Follow the same process if a paired widget was made public. More detail is in [SECURITY.md](../SECURITY.md).
