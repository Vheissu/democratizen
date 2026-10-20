# Compatibility and test evidence

Initial hardware validation was completed on 20 October 2026. This table describes observed results from that setup, rather than a claim about every Tizen television.

| Component | Tested configuration | Result |
| --- | --- | --- |
| TV | Samsung Frame `QA43LS03DAWXXY` | Developer Mode and SDB connection worked after a full power cycle |
| TV platform | Tizen 9.0, internal build `T-PTMDUABC-0090-REL-202605141702` | Both included widgets installed and launched |
| SDK signing | Samsung TV profile with the device's DUID | Build, package, install and run completed |
| Small clock app | `wbnosstudy.StudyLab` | Clock, OK and Back confirmed on the TV |
| Frame Terminal | `frameterm0.FrameTerminal` | Paired connection established from TV to Mac |
| Physical keyboard | USB keyboard plugged into TV | User confirmed `pwd` typing and Enter worked |
| Bluetooth keyboard | Same browser keyboard/IME path | Implementation present; no physical Bluetooth test yet |
| Multiple sessions | Real macOS PTYs and browser interface | Create, isolation, resize, rename, switch, reconnect and close verified |
| Mac host | Apple Silicon, Node 25.2.1 | Native PTY module and user LaunchAgent worked |
| Archive root | Pinned upstream plus runtime patch | Authenticated `uid=0`; cleanup and system-file checks reported true |
| Interactive TV root | Native `script` PTY, .NET helper and pinned TLS callback | UID 0, persistent state, resize, Ctrl+C and shell exit/cleanup confirmed |
| Frame Chat | `framechat0.FrameChat`, Tizen Chromium 120, 1920×1080 | Signed widget installed, launched and established its encrypted companion connection |
| Chat subscription engine | Codex `0.163.0-alpha.10.2` bundled with ChatGPT `26.1013.40934` | Real Pro-plan response, follow-up context and engine-restart recovery verified on the Mac |
| Chat interface | Browser preview at TV resolution | Keyboard submission, Markdown, streamed replies, Stop and reload restoration verified |
| Chat sign-in | Official device-code flow | Code/QR generation and navigation to OpenAI's passkey challenge verified; account-owner passkey completion remains a user action |

The app manifest requests Tizen 6.0 or newer. That lower bound hasn't been validated on older TVs. Keyboard modifiers, non-US layouts, every terminal application, suspend/resume scenarios and multi-day operation haven't all been checked. These are useful areas for further testing.

Linux foreground hosting is experimental. The macOS launchd helper won't run on Linux or Windows. The current tests use `/bin/zsh`; Windows support needs a deliberate shell/PTY/service implementation and its own verification.

Upstream root tooling has its own hardware reports. Those reports belong to [that project](https://github.com/chris-ritsen/samsung-tv-root) and don't extend democratizen's tested-device list automatically. Runtime, capabilities and firmware changes can affect the route even within a model family.

## Report another device

Open a compatibility report with:

```text
TV model:
Region/model suffix:
Tizen version:
Firmware UI version:
Internal build, if known:
Host OS and CPU:
Node version:
Tizen Studio / TV extension version:
Developer Mode + SDB result:
Small signed app install/run result:
Frame Terminal result:
Keyboard model, connection type and layout:
Keys tested, including Ctrl/Alt/Tab/Esc:
Root probe/command result, if deliberately tested:
Cleanup result, if applicable:
Exact error, with private information removed:
```

Don't include DUIDs, serial numbers, MAC addresses, pairing JSON, certificate files or passwords. A report of one working feature should identify that feature; it doesn't imply all remaining rows work.
