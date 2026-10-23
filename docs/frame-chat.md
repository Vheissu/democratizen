# Frame Chat

Frame Chat runs on the Samsung TV and connects directly to OpenAI using a ChatGPT subscription. **Your computer can be asleep or switched off after installation.** No Mac companion, root access or TV background service is required in the default mode.

The interface has a collapsible chat sidebar, search, streaming Markdown replies, a model picker, adjustable text size and light/dark appearance. Conversations and sign-in are saved on the TV.

![Frame Chat standalone interface](images/frame-chat.png)

The screenshot is a browser preview. See the verification section below for the distinction between browser, protocol and TV checks.

## Install

Complete [Developer Mode](developer-mode.md) and [signing](signing.md) first. A computer with Node.js and Samsung's SDK is needed to build and install the app, then it can be disconnected.

```sh
npm ci

# Replace this address and profile with your own TV and certificate profile.
export TV_IP=192.168.1.50
export TIZEN_STUDIO_HOME="$HOME/tizen-studio"
export SAMSUNG_SIGNING_PROFILE=MySamsungTV

npm run chat:deploy
```

Deploy builds, signs, installs and opens Frame Chat. `npm run chat:build` builds the unsigned widget separately. It defaults to standalone mode and needs no pairing configuration or installed ChatGPT desktop application.

## Sign in

1. Select **Sign in with ChatGPT** on the TV.
2. Scan the QR code with your phone, or open the displayed `auth.openai.com/codex/device` address.
3. Sign in to OpenAI and enter the code shown on the TV.
4. Return to the TV. The available models load when sign-in completes.

OpenAI may require device-code sign-in to be enabled in your ChatGPT security settings. Codes expire after 15 minutes; **Cancel sign-in** stops polling. Passwords and passkeys are entered on OpenAI's site, not in Frame Chat. The TV receives its own access and refresh tokens and refreshes them when necessary.

This follows the device-code flow described in [OpenAI's authentication documentation](https://learn.chatgpt.com/docs/auth). Subscription access, model availability and usage limits remain controlled by OpenAI. An OpenAI API key is not needed.

## Everyday use

| Action | Keyboard / remote |
| --- | --- |
| Send a message | Enter, or the arrow button |
| Add a line | Shift Enter |
| New chat | Ctrl N, or **New chat** |
| Focus the composer | Ctrl L |
| Stop a reply | The square stop button |
| Search saved chats | **Search chats** in the sidebar |
| Choose a model / reasoning effort | Open the header picker, highlight a choice, then press OK or click |
| Rename / archive | Header buttons |
| Restore an archived chat | **Settings → Archived chats → Restore** |
| Change appearance | **Settings → Appearance** |
| Change text size | **A− / A+** |
| Close a dialog | Escape or remote Back |
| Move between remote controls | Arrow keys highlight controls; OK selects |
| Edit a text field | Highlight it, then press OK or click; Back returns to navigation |
| Scroll the conversation | Focus the conversation, then Up/Down |

Moving through a model picker does not change the selection; OK/click applies it. Your choice is remembered for new chats and app restarts. Existing chats keep their own saved model. If that model becomes unavailable, choose a replacement explicitly.

A stopped or interrupted reply retains its saved text. Closing the app stops generation; reopening it restores the last saved checkpoint. Start a new chat when the conversation reaches its length limit.

Archiving hides a chat from the sidebar without deleting it. Archived chats can be restored or permanently deleted from Settings. Export produces JSON containing your chats and no account credentials. Download support depends on the TV browser; the browser preview supports downloading the file. Keep exported conversations private.

## Storage and privacy

Standalone Frame Chat uses the widget's own local storage:

- Chat history, archived conversations and the last model catalogue.
- An OpenAI access token, refresh token and identity token.
- Appearance, text size, sidebar and selected-chat preferences.

Tokens are stored in the app's browser storage, without a separate encryption key or hardware-backed keychain. Someone with access to the app's storage or root on the TV can read them. Sign out before passing the TV to someone else. Signing out removes the local tokens; existing chats remain associated with the original OpenAI user and workspace. A different signed-in user cannot open them through the app.

The standalone build contains **no account tokens or Mac pairing keys**. Credentials are created only when the user completes sign-in. Network requests go over HTTPS to `auth.openai.com` and `chatgpt.com`; there is no LAN server or telemetry service. Model output is sanitised before rendering, and remote images, scripts and executable tools are excluded.

The TV stores up to 50 chats, including archives, with a three-million-character storage budget. Each chat is limited to 200 messages and roughly 350,000 characters of input context. Messages can contain up to 16,000 characters and individual replies up to 200,000. The client reserves storage before sending and periodically saves streamed text. These are local safety limits, separate from OpenAI's context windows and subscription limits.

An app reinstall, app-data reset or TV factory reset may remove this data. Don't rely on the TV as your only copy of an important conversation.

## What it can and cannot do

This is an unofficial conversational client. It uses the subscription protocol implemented in the open-source Codex client, with its own TV interface and local history. **The direct subscription endpoints are not a documented, stable API for third-party clients.** OpenAI can change them or restrict access, so a working build may need updates.

Chats do not sync with ChatGPT web or desktop history. Voice, uploads, ChatGPT plugins, web search, computer control and filesystem tools are not included. A model appearing in the catalogue does not guarantee that the current subscription or workspace can use it; access errors are shown in the conversation.

The interface borrows familiar ChatGPT layout conventions, with larger type and remote focus controls for the TV. It does not redistribute OpenAI's desktop application, renderer, icons or fonts.

## Verification

The standalone implementation was checked with:

- Direct HTTPS requests from an installed widget on the Samsung Frame `QA43LS03DAWXXY`, Tizen 9.0 / Chromium 120. The TV could read responses from both authentication and Codex endpoints.
- Live subscription inference and a follow-up context check using the standalone client module on the development computer, without the companion engine.
- Automated tests for fragmented streaming, duplicate sends, cancellation, partial reply recovery, device-code login, token refresh, account isolation, archives and storage limits.
- Browser checks of the interface and signed installation/launch on the physical TV.
- Owner-confirmed sign-in and a working reply on the TV with the Mac chat companion stopped. Remote navigation through text fields was also confirmed on the TV.

The account owner completed the phone/browser verification for the TV check. Other firmware versions need their own checks; the manifest's minimum version is not a compatibility guarantee.

## Optional Mac companion mode

The previous companion mode is retained for comparison and recovery. It requires an awake Mac on the same LAN, running the Codex engine included in ChatGPT or a separately configured installation.

```sh
export FRAME_HOST=192.168.1.10
export TV_IP=192.168.1.50
npm run chat:setup
FRAME_CHAT_MODE=companion npm run chat:build
npm run chat:service:install
FRAME_CHAT_MODE=companion npm run chat:deploy
```

The companion stores its separate login and chat history under `.tools/frame-chat/`. Its default listener is port `4321`, and its loopback-only preview is `http://127.0.0.1:4322`. Pairing uses authenticated NaCl encryption, separate from Frame Terminal. A companion `.wgt` contains a private pairing key and must stay private. The tested bundled engine was `0.163.0-alpha.10.2` from ChatGPT `26.1013.40934`.

```sh
npm run chat:service:status
npm run chat:service:stop        # stop the companion for this login
npm run chat:service:uninstall   # remove login startup; preserve Mac chats
npm run chat:start               # foreground companion, if desired
npm run chat:verify              # companion engine verification
```

Changing modes keeps the two histories separate. Existing Mac conversations are not migrated to the TV. `npm run chat:deploy` without `FRAME_CHAT_MODE` returns to standalone mode. You can stop the old companion after switching; Frame Terminal's separate host is unaffected.
