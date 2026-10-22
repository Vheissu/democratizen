# Verification record

Follow-up checks on 23 October 2026:

- The iOS app builds with local ad-hoc signing, installs, launches, and renders on a clean iPhone 17 Pro simulator running iOS 26.5. The scene now creates `AfterstrainViewController`; the original generic bridge bypassed native controller bindings.
- All 13 native iOS GameController checks pass: A opens setup and starts a run; Menu starts/pauses time; shoulders change regions; evolution can be purchased; B returns; rapid D-pad taps register; held sticks repeat; disconnect stops movement; reconnect restores input. These checks use real GameController snapshot objects and the app's running WKWebView, without physical Bluetooth hardware.
- All 58 browser controller checks pass at phone and 1920 × 1080 TV sizes. Direction-only graph traversal reaches every enabled setup, world, and lab control. Tests also cover navigation, purchases, all four D-pad directions, stick hold, disconnect/reconnect, native-event/browser-input coexistence, visible focus, and overflow.
- All 19 native Android key-event checks pass through the activity: D-pad, OK, A/B, Back, Start, Play/Pause, shoulders, purchases, and section navigation. The debug WebView supplies test setup and assertions; inputs enter through Android key dispatch.
- Both Android instrumentation tests pass, covering analog dead zones, held-stick repeat without fresh motion events, neutral release, hat axes, disconnect cleanup, pause cleanup, and application identity. Kotlin test dependencies use the 2.2.20 BOM to resolve the template's duplicate standard-library classes. The final `:app:connectedDebugAndroidTest` run completed successfully with zero failures.
- All 11 engine tests still pass. Production web and native builds succeed. `npm audit` reports zero vulnerabilities.

Repeatable commands are in `README.md`. Browser checks also run in CI. Native iOS tests require a scratch simulator because they create a test run in its local save slot. The iOS harness is Debug-only and opt-in. Native build output and local screenshots/results live under ignored `build/` directories.

Physical Bluetooth pairing, physical Android TV hardware, native share-sheet round trips, accessibility screen-reader flows, battery measurements, and store distribution remain unverified. There is no tvOS target.

Initial checks on 22 October 2026 (historical):

- All 11 engine tests pass. The multi-seed test exercises 30 scenario/seed combinations for up to 800 simulated days each.
- Production web build succeeds. The complete web output is approximately 376 KB on disk, including map geometry, runtime artwork, and favicon.
- `npm audit` reports zero vulnerabilities, including development dependencies.
- Browser checks at 320 × 740, 390 × 844, and 1920 × 1080 pass horizontal-overflow checks. Creation, evolution purchases, local save/resume, save download, dispatches, field guide, world settings, keyboard navigation, and native control-event routing were exercised.
- Android debug build succeeds. The APK installs and launches on the local Android emulator; the rendered title screen was visually checked. D-pad centre input opens setup through the native bridge.
- iOS simulator build succeeds, including GameController bindings, filesystem/share plugins, privacy manifest, and custom assets. Installation succeeds. Launch stalled during a host load spike, so iOS runtime behavior is **not verified**.

The Android emulator briefly showed a System UI unresponsive dialog before rendering the game. This was a system dialog, not a game crash. During simulator checks the host reported a load average above 290; screenshots and startup timings from that session should not be used as performance measurements.

The engine benchmark ranged from roughly 0.035 to 0.086 ms per simulated day on this Mac. That is an engine-only host measurement, not a native-device frame-time claim.

No App Store or Play Store submission has been made.
