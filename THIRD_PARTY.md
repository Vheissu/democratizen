# Third-party software

Dependencies are installed from their pinned npm versions in `package-lock.json`. Their licenses apply to their code and assets:

| Project | Use | License |
| --- | --- | --- |
| [xterm.js](https://github.com/xtermjs/xterm.js), including headless, fit and serialize packages | Terminal rendering and saved screen state | MIT |
| [node-pty](https://github.com/microsoft/node-pty) | Host pseudo-terminals | MIT |
| [TweetNaCl.js](https://github.com/dchest/tweetnacl-js) | Public-key boxes and authenticated message encryption | Unlicense |
| [ws](https://github.com/websockets/ws) | Host WebSocket implementation | MIT |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), distributed by Fontsource | Terminal font | SIL Open Font License 1.1 |
| [esbuild](https://github.com/evanw/esbuild) | Browser build | MIT |
| [Marked](https://github.com/markedjs/marked) | Frame Chat Markdown rendering | MIT |
| [DOMPurify](https://github.com/cure53/DOMPurify) | Sanitising assistant Markdown output | Apache-2.0 or MPL-2.0 |
| [Tabler Icons](https://github.com/tabler/tabler-icons) | Frame Chat interface icons | MIT |
| [node-qrcode](https://github.com/soldair/node-qrcode) | Official sign-in page QR code | MIT |

Standalone Frame Chat implements the subscription sign-in and streaming protocol described by the [openai/codex source at d571eaf](https://github.com/openai/codex/tree/d571eaf1f61d0d93a797506335a99a9950ffe37b), including its public OAuth client identifier. Codex is Apache-2.0 licensed. The standalone implementation does not bundle the Codex executable or copy OpenAI’s desktop assets. Optional companion mode runs the user's installed Codex engine; that installation retains its own licenses and terms. Direct subscription endpoints can change independently of this project.

The optional root setup clones [chris-ritsen/samsung-tv-root](https://github.com/chris-ritsen/samsung-tv-root) at `4ad2c4d3b0d0e0da4b5b7ebe4a787e94596f416b`. Its code is Unlicense. The patch in this repository modifies that project's host-side runtime detection; the upstream license remains applicable to that material. Its source/binaries aren't vendored in democratizen.

Samsung's Tizen SDK, certificate tools and firmware are installed separately and retain their own terms. This repository doesn't redistribute those packages.

When distributing a new build of your app, include the notices/licenses required by the code and fonts you bundle. Frame Terminal's build includes dependency license files alongside the app assets; keep them with any privately distributed widget. A terminal widget also contains pairing credentials, so a public release should distribute source rather than a paired build.

The Frame Apps collection uses the same SIL Open Font License 1.1 JetBrains Mono font already listed above. Each widget includes its font licence and the project licence. Pixel glyphs, game rules and synthesised audio are implemented in this repository; no commercial game artwork, sounds or Nokia assets are bundled.
