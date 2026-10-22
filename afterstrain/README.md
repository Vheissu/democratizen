# Afterstrain

An original offline outbreak strategy game for Android, Android TV, iPhone, iPad, and browsers. Build a fictional strain, spread influence through a changing world, and adapt before global research contains it. This is a playable first release, not a copy of Plague Inc's assets, interface, or biological model.

## Play locally

```sh
cd afterstrain
npm ci
npm run dev
```

Open the local address printed by Vite. The complete simulation runs on the device. There is no backend, account, analytics, advertising, or runtime AI dependency.

## What's in the game

- 176 mapped countries and territories. Natural Earth supplies outlines; populations, health capacity, climate variation, and travel connections are generated game data.
- Eight strain archetypes, five genome biases with tradeoffs, five scenarios, and configurable response strength, volatility, climate, mobility, health capacity, and population density.
- 48 traits across eight branches, three ranks per trait, prerequisite chains, suppression, six cross-branch synergies, and spontaneous mutations.
- 20 timed event templates, regional effects, global research shocks, border restrictions, a bounded news history, and influence history.
- Cumulative infections, active infections, recovery, and deaths. Disruptive traits increase mortality and awareness; only active infections spread. Research improves recovery. Losing every active infection ends a standard run.
- Seeded runs, a UTC daily seed, automatic saving, validated save imports, browser downloads, and native share-sheet exports.
- Pause, single-day advance, 1×/3×/8× simulation speeds, optional interface tones, and an in-game field guide.

The combinations are large but finite. Events come from authored templates; there is no claim of infinite content. Outcomes depend on both the seed and the exact timing of decisions.

## Controls

| Device | Controls |
| --- | --- |
| Touch / mouse | Tap controls and countries; region arrows reach small islands |
| Keyboard | Arrow keys move focus, Enter selects, Escape returns, Space pauses |
| Browser gamepad | D-pad / left stick, A select, B back, Start pause, shoulders change region |
| Android TV remote | D-pad, OK, Back, Play/Pause |
| Native Android controller | D-pad / left stick, A/B, Start, shoulders |
| Native iOS controller | Extended Game Controller D-pad / left stick, A/B, Menu, shoulders |

All gameplay and setup selections work without typing. Names and seeds have generated defaults. The lab, dispatches, and record screens pause time. Backgrounding the app pauses and saves it. Only one local save slot is provided; export before starting a run you want to keep separately.

## Native builds

The checked-in Capacitor projects use Android SDK 36 / Java 21 and iOS 15 or later. Build tools and a matching Xcode installation are required. Capacitor's [environment setup](https://capacitorjs.com/docs/getting-started/environment-setup) covers the host requirements.

```sh
npm run sync
npm run android
npm run ios
```

For an Android debug APK:

```sh
cd android
ANDROID_HOME="$HOME/Library/Android/sdk" ./gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`. The manifest supports Android TV launchers and does not require a touchscreen. Android TV is supported; this repository does not contain an Apple TV / tvOS target.

For an iOS simulator build with local ad-hoc signing:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -configuration Debug -derivedDataPath build/ios CODE_SIGN_IDENTITY=- build
```

Device distribution still needs your Apple signing team or Android release keystore. Store listings, store submission, signed release builds, and physical controller certification are not included.

## Verification and performance

```sh
npm test
npm run test:controls
npm run build
npm audit
```

Controller regression checks use Playwright Chromium (`npx playwright install chromium` on a new machine). They exercise phone and TV layouts, every directional focus destination, held input, reconnects, purchases, and simulation controls. The CI workflow runs these checks.

For native Android checks, install and launch the debug APK on an emulator, then run `node tests/controller.android.mjs`. Set `ANDROID_SERIAL` and `ADB` if needed. The test sends Android key events through the activity and uses the debug WebView only for setup and assertions. Analog hold/release, hat axes, dead zones, disconnects, and background cleanup are covered by `cd android && ./gradlew :app:connectedDebugAndroidTest`.

For iOS, use a scratch simulator and run `AFTERSTRAIN_SIMULATOR=<booted-simulator-uuid> bash scripts/test-ios-controller.sh`. This builds, installs, launches, and checks native GameController snapshot inputs against the running WKWebView. The harness is compiled only in Debug and runs only with `--controller-smoke`. It creates a test run in that simulator's save slot. The script returns nonzero on failure and prints the individual checks. Native simulator builds use local ad-hoc signing; no Apple distribution credentials are required.

Tests cover deterministic runs, save/resume equivalence, trait prerequisites and costs, synergies, corrupt saves, custom world settings, victory and defeat, population bounds across seeds/scenarios, and a complete winning strategy. The benchmark reports CPU time per simulated day on the host; it is not a mobile-device performance guarantee.

The simulation uses aggregate regional values instead of individual agents. Travel checks only a small precomputed graph. News, active events, and history have fixed bounds. Canvas paths are cached; the map redraws on simulation steps or interaction rather than continuously. Gamepad polling checks at 20 Hz and suspends while hidden. The generated title art is served as a 124 KB WebP; the original PNG lives outside the application bundle.

## Source map

`src/engine.mjs` contains deterministic state transitions and save validation. `src/catalog.mjs` defines strains, traits, synergies, and events. `src/main.mjs` owns screens, input, sound, saves, and map drawing. `scripts/world.mjs` generates country geometry from the pinned world-atlas package. Native controller handlers live in Android's `MainActivity.java` and iOS's `AppDelegate.swift`.

`xcode`'s transitive `uuid` is overridden to the compatible CommonJS 11.x release to avoid the older buffer-bounds advisory. Recheck this override when upgrading Capacitor.

See `ARTWORK.md` for image prompts and `THIRD_PARTY.md` for map and dependency attribution.
