# Verification record

Local checks on 22 October 2026:

- All 11 engine tests pass. The multi-seed test exercises 30 scenario/seed combinations for up to 800 simulated days each.
- Production web build succeeds. The complete web output is approximately 376 KB on disk, including map geometry, runtime artwork, and favicon.
- `npm audit` reports zero vulnerabilities, including development dependencies.
- Browser checks at 320 × 740, 390 × 844, and 1920 × 1080 pass horizontal-overflow checks. Creation, evolution purchases, local save/resume, save download, dispatches, field guide, world settings, keyboard navigation, and native control-event routing were exercised.
- Android debug build succeeds. The APK installs and launches on the local Android emulator; the rendered title screen was visually checked. D-pad centre input opens setup through the native bridge.
- iOS simulator build succeeds, including GameController bindings, filesystem/share plugins, privacy manifest, and custom assets. Installation succeeds. Launch stalled during a host load spike, so iOS runtime behavior is **not verified**.

The Android emulator briefly showed a System UI unresponsive dialog before rendering the game. This was a system dialog, not a game crash. During simulator checks the host reported a load average above 290; screenshots and startup timings from that session should not be used as performance measurements.

The engine benchmark ranged from roughly 0.035 to 0.086 ms per simulated day on this Mac. That is an engine-only host measurement, not a native-device frame-time claim.

Not yet verified: physical Bluetooth controllers, a physical Android TV, native share-sheet round trips, iOS device gameplay, accessibility screen-reader flows, long-session battery use, or signed release distribution. No App Store or Play Store submission has been made.
