#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
task_simulator="${AFTERSTRAIN_SIMULATOR:?Set AFTERSTRAIN_SIMULATOR to a booted scratch iOS simulator UUID}"
mkdir -p build
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug -derivedDataPath build/ios CODE_SIGN_IDENTITY=- build > build/ios-controller-build.log 2>&1
xcrun simctl terminate "$task_simulator" com.rangefront.afterstrain 2>/dev/null || true
xcrun simctl install "$task_simulator" build/ios/Build/Products/Debug-iphonesimulator/App.app
task_container="$(xcrun simctl get_app_container "$task_simulator" com.rangefront.afterstrain data)"
task_result="$task_container/Library/Caches/controller-smoke.json"
rm -f "$task_result"
xcrun simctl launch "$task_simulator" com.rangefront.afterstrain --controller-smoke
for task_attempt in {1..90}; do
  if [[ -f "$task_result" ]]; then
    node --input-type=module - "$task_result" <<'NODE'
import fs from 'node:fs';
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exit(1);
NODE
    exit $?
  fi
  sleep 1
done
echo 'iOS controller smoke test timed out.' >&2
exit 1
