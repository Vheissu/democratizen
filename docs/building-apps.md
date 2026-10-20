# Building apps for the TV

A Tizen web app is HTML, CSS and JavaScript packaged with a manifest and a signature. The TV's web runtime opens the manifest's entry page. You can use a framework that builds static browser assets, or start with the plain JavaScript example in this repository.

## Choose a starting point

Use `study-tv-lab/` for a standalone display, clock or remote-driven interface. It has no network dependencies. Use `app/` with `server/` when the TV is a client for a host service. Frame Terminal bundles xterm.js and its own interface with esbuild; the Tizen SDK then packages that output.

```text
Source HTML/CSS/JS
    → optional bundler
    → widget directory with config.xml
    → tizen build-web
    → tizen package with your Samsung profile
    → install on the selected TV
    → launch and test on hardware
```

Keep development output separate from source. Frame Terminal uses `dist/frame-terminal/`; the small example lets the SDK create `study-tv-lab/.buildResult/`. Both are ignored by Git.

## Read the manifest

| Setting | Job |
| --- | --- |
| Widget `id` | Identifies the widget; choose your own URI |
| Widget `version` | Version for the package |
| `tizen:application` `id` | Exact application ID passed to `tizen run` |
| `package` | Package identity; use a valid, unique ten-character identifier |
| `required_version` | Minimum platform requested by the widget |
| `content` | Entry HTML file |
| `name` | Display/package name used in these builds |
| `tizen:profile` | Samsung TV profile |
| `feature` | Required device capability; examples declare the TV screen feature |
| `access` | Allowed network origins |
| `tizen:privilege` | APIs the app requests |

The included terminal manifest declares internet access and its generated host origin. Add only the origins and privileges your app uses. Review Samsung's [configuration guide](https://developer.samsung.com/smarttv/develop/guides/fundamentals/configuring-tv-applications.html) when adding platform features. The manifest's `encryption` setting is a packaging setting; Frame Terminal's network encryption is implemented in `shared/crypto.mjs`.

## Design for a sofa and a remote

Leave margins around important content and use text you can read at viewing distance. A TV can expose a logical viewport different from its panel resolution. Frame Terminal scales its interface from a 1920-wide reference and fits terminal columns to the available space.

Every action needs a visible focus state. Define where arrows move focus, what OK activates, and where Back returns. Don't depend on mouse hover. A focus ring that disappears into a dark panel is a navigation bug on a TV.

For a form, allow the TV's input method to do its job. Ordinary text input can arrive as composition or IME events. Blanket `preventDefault()` in a document-level key handler can make an otherwise working input field stop accepting text.

## Keyboard and remote input

The basic remote events include arrows, Enter (`13`) and Back (`10009`). Frame Terminal keeps Back for app controls and uses Esc for shell input. Samsung's input method can emit Done (`65376`), Cancel (`65385`) and composition code `229`, including with a physical keyboard when a textarea is focused. The app maps Done to terminal Enter and Cancel to terminal Esc.

For extra remote keys, use Samsung's TV input-device API and the privileges/registration it requires. The keyboard path in this repository doesn't register every typing key. Keep handling narrow, and check Samsung's [keyboard/IME documentation](https://developer.samsung.com/smarttv/develop/guides/user-interaction/keyboardime.html) and [remote input guide](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html).

Some keyboard function keys are reserved by the TV. Don't design critical shortcuts around F5–F12 without testing their behaviour on the target device. Test USB and Bluetooth separately, including modifiers, keyboard layout, reconnecting and input after returning from another TV screen.

## Network-backed apps

Your host process is outside the widget sandbox. That makes it useful for filesystem access, shells and local integrations. It also makes authentication part of the app: a TV interface that can run host commands must authenticate before creating a process.

Frame Terminal's connection config is generated locally during the build. Its private client key is included in the widget and the loopback preview. Publish source and build instructions; a paired widget is an installation credential. See [architecture](architecture.md) and [security](../SECURITY.md) before extending this design.

For a different app, decide which operations the host actually needs to expose. Validate those operations on the host even if the UI already validates them. Account for the TV going to standby, the network dropping, and the host sleeping.

## Develop locally, verify on hardware

For terminal changes:

```sh
npm ci
npm test
npm run build
npm start
```

Stop the background service first if it's already using the same ports. Open `http://127.0.0.1:4320` on the host computer. The preview controls the same sessions as the TV. Rebuild after source changes; it isn't a hot-reload server.

Deploy with `npm run deploy`. On the TV, check initial launch, text input, focus navigation, Back, long output and returning after standby. Browser testing is useful, but the TV runtime and its input method are part of the product.

## Debugging

Use Tizen Studio's **Debug As → Tizen Web Application** to launch Samsung's Web Inspector. Console errors, failed network requests and the actual viewport are useful first checks. Samsung's [Web Inspector guide](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/web-inspector.html) describes that workflow.

The Mac service writes startup information to `.tools/frame-terminal/host.log` and errors to `host-error.log` when run through the LaunchAgent. It doesn't record terminal input/output. In foreground mode, service errors appear in your terminal. Don't add key or terminal-content logging to a public diagnostic endpoint.

## Small apps worth building

A home dashboard, a local photo frame with your own albums, a build-status wall, a remote-controlled presentation timer, or a LAN music controller can start from the clock example. Keep one useful screen working before adding background services. For TV-specific native capabilities, check the privilege and model support in Samsung's API reference before designing the UI around them.
