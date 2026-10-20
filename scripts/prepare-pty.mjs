import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// node-pty 1.1.0 ships its macOS helper without the executable bit in npm.
if (process.platform === 'darwin') {
  const require = createRequire(import.meta.url);
  const root = path.dirname(require.resolve('node-pty/package.json'));
  const helper = path.join(root, 'prebuilds', `darwin-${process.arch}`, 'spawn-helper');
  if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
}
